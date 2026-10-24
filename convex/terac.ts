"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env } from "./_generated/server";

// Terac External API v2 (https://terac.com/docs/developers/reference).
// Auth: `Authorization: Bearer <key>`. Flow: create draft opportunity →
// launch → poll GET /opportunities/{id}/submissions → approve/reject each.
// Payment happens only on approve (review_type: manual_review), so labor is
// gated behind our verdict collection.
const DEFAULT_TERAC_API = "https://terac.com/api/external/v2";
const PANEL_SIZE = 3; // 3 verified humans per finding (PRD FR-6)
const MAX_REPRO_PANELS = 3; // spend cap: top-3 criticals per audit
const MAX_PATCH_PANELS = 1; // spend cap: one patch-merge panel per audit
const TASK_DURATION_MINUTES = 20; // drives expert pricing — keep honest
const VERDICT_KEY = "repro_verdict"; // screener key whose answer returns via REST

/**
 * The "did it reproduce?" verdict is collected as a screening question where
 * BOTH answers qualify ("may"): recruitment never stalls on a "No" verdict,
 * and the answer text (Yes/No) comes back on
 * GET /opportunities/{id}/submissions — the REST API cannot read task file
 * contents, so the screener answer is the structured signal that keeps the
 * 2-of-3 panel verdict honest.
 */
function buildScreeningQuestions(targetUrl: string, reproductionSteps: string) {
  return [
    {
      key: VERDICT_KEY,
      pick: "boolean" as const,
      text: `Do the verification FIRST, then answer. Open ${targetUrl} in a normal browser session and follow these steps: ${reproductionSteps} Did the issue occur as described?`,
      // Every answer qualifies ("may") so recruitment never posts a prerequisite
      // verdict; the Yes/No text is the structured repro signal harvested via
      // GET /opportunities/{id}/submissions.
      answers: [
        { text: "Yes", qualify_logic: "may" as const },
        { text: "No", qualify_logic: "may" as const },
      ],
    },
  ];
}

type TeracTaskKind = "FINDING_REPRO" | "PATCH_MERGE_GRADE";

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/**
 * PRD FR-6: assertContext — verifies Terac organization access, balance, projects.
 */
export const assertContext = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    orgName: v.string(),
    creditBalanceCents: v.number(),
    projectsCount: v.number(),
    message: v.optional(v.string()),
  }),
  handler: async () => {
    const apiKey = env.TERAC_API_KEY;
    const baseUrl = env.TERAC_BASE_URL || DEFAULT_TERAC_API;

    if (!apiKey) {
      return {
        configured: false,
        orgName: "BreakMyApp (Unconfigured / Sandbox Simulation)",
        creditBalanceCents: 5000,
        projectsCount: 1,
        message: "TERAC_API_KEY not configured. Running in deterministic simulation mode.",
      };
    }

    try {
      const res = await teracFetch(apiKey, baseUrl, "/organizations/current/context");
      if (!res.ok) {
        return {
          configured: false,
          orgName: "Terac API Auth Error",
          creditBalanceCents: 0,
          projectsCount: 0,
          message: `Terac API returned ${res.status}: ${res.statusText}`,
        };
      }
      const data = await res.json();
      const dollars = Number(data?.balanceDollars);
      let projectsCount = 0;
      try {
        const projectsRes = await teracFetch(apiKey, baseUrl, "/projects");
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          const list = Array.isArray(projectsData?.data)
            ? projectsData.data
            : Array.isArray(projectsData)
              ? projectsData
              : [];
          projectsCount = list.length;
        }
      } catch {
        // context still valid without the project list
      }
      return {
        configured: true,
        orgName: data?.organizationName ?? "BreakMyApp Org",
        creditBalanceCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : 0,
        projectsCount,
      };
    } catch (err: unknown) {
      return {
        configured: false,
        orgName: "Terac Unreachable",
        creditBalanceCents: 0,
        projectsCount: 0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

/**
 * FR-6: createVerificationProject — ensures the "BreakMyApp Human Verification"
 * project exists on Terac and returns its real id.
 */
export const createVerificationProject = action({
  args: {},
  returns: v.object({
    projectId: v.string(),
    projectName: v.string(),
  }),
  handler: async () => {
    const apiKey = env.TERAC_API_KEY;
    const baseUrl = env.TERAC_BASE_URL || DEFAULT_TERAC_API;
    const fallbackId = "proj_breakmyapp_verification";

    if (!apiKey) {
      return { projectId: fallbackId, projectName: "BreakMyApp Human Verification" };
    }

    try {
      // Reuse an existing project with our name if one is already on the org.
      const listRes = await teracFetch(apiKey, baseUrl, "/projects");
      if (listRes.ok) {
        const listData = await listRes.json();
        const list = Array.isArray(listData?.data)
          ? listData.data
          : Array.isArray(listData)
            ? listData
            : [];
        const existing = list.find((p: { name?: string }) => p.name === "BreakMyApp Human Verification");
        if (existing?.id) {
          return { projectId: String(existing.id), projectName: existing.name ?? "BreakMyApp Human Verification" };
        }
      }

      const res = await teracFetch(apiKey, baseUrl, "/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "BreakMyApp Human Verification",
          description: "Autonomous deterministic audit verification panels",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const id = data?.id ?? data?.data?.id;
        if (id) {
          return { projectId: String(id), projectName: data?.name ?? "BreakMyApp Human Verification" };
        }
      }
      return { projectId: fallbackId, projectName: "BreakMyApp Human Verification" };
    } catch {
      return { projectId: fallbackId, projectName: "BreakMyApp Human Verification" };
    }
  },
});

/**
 * FR-6: dispatchAuditPanels — creates + launches one Terac opportunity
 * (3-expert panel) per finding under the spend caps, then records the panels
 * in the DB so the verdict cron can collect results.
 *
 * Normal path (no `force`): only unlocked audits (a verified Whop payment
 * scheduled this call). Study path (`force: true`, via `launchStudy`): a
 * completed, still-NOT_DISPATCHED audit with critical findings, launched
 * deliberately with the spend caps below.
 */
export const dispatchAuditPanels = internalAction({
  args: {
    auditId: v.id("audits"),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    status: v.union(v.literal("dispatched"), v.literal("skipped")),
    message: v.optional(v.string()),
    opportunityIds: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<{
    status: "dispatched" | "skipped";
    message?: string;
    opportunityIds?: string[];
  }> => {
    const data = await ctx.runQuery(internal.teracBridge.getAuditForDispatch, {
      auditId: args.auditId,
    });
    if (!data || !data.audit) {
      return { status: "skipped" as const, message: "Audit not found." };
    }
    const { audit, findings } = data;

    if (audit.teracPanelStatus !== "NOT_DISPATCHED") {
      return { status: "skipped" as const, message: `Panel already dispatched (${audit.teracPanelStatus}).` };
    }
    if (audit.status !== "COMPLETED") {
      return { status: "skipped" as const, message: "Run is not completed yet." };
    }
    if (!args.force && !audit.isUnlocked) {
      return { status: "skipped" as const, message: "Audit is not unlocked — panels dispatch after a verified payment." };
    }

    const apiKey = env.TERAC_API_KEY;
    const baseUrl = env.TERAC_BASE_URL || DEFAULT_TERAC_API;

    // Spend policy (supersedes the legacy cents margin guard, whose 40¢-per-task
    // assumption does not hold at real Terac pricing): bounded panels per audit.
    const criticals = findings.filter((f) => f.severity === "CRITICAL");
    const patchCandidates = args.force
      ? [] // studies verify reproductions only
      : findings.filter((f) => typeof f.aiSuggestedPatch === "string" && f.aiSuggestedPatch.trim().length > 0);

    if (criticals.length === 0 && patchCandidates.length === 0) {
      return { status: "skipped" as const, message: "No critical findings or patch candidates to verify." };
    }

    const panels: Array<{
      kind: TeracTaskKind;
      findingId: typeof findings[number]["_id"];
      title: string;
      description: string;
    }> = [];
    for (const c of criticals.slice(0, MAX_REPRO_PANELS)) {
      panels.push({
        kind: "FINDING_REPRO",
        findingId: c._id,
        title: `Verify crash: ${truncate(c.title, 180)}`,
        description: truncate(
          [
            `You are independently verifying a QA finding on the live site ${audit.targetUrl}.`,
            ``,
            `Reported finding: ${c.title}`,
            `Severity: CRITICAL`,
            ``,
            `Reproduction steps to follow: ${c.reproductionSteps}`,
            ``,
            `Do the steps yourself in a normal browser session, answer the verification question truthfully, and upload screenshot proof in the task. Payment is released after review.`,
          ].join("\n"),
          8000,
        ),
      });
    }
    for (const p of patchCandidates.slice(0, MAX_PATCH_PANELS)) {
      panels.push({
        kind: "PATCH_MERGE_GRADE",
        findingId: p._id,
        title: `Review fix patch: ${truncate(p.title, 180)}`,
        description: truncate(
          [
            `Review this proposed code fix for a bug on ${audit.targetUrl}.`,
            ``,
            `Finding: ${p.title}`,
            ``,
            `Proposed patch:`,
            `${p.aiSuggestedPatch}`,
            ``,
            `Grade whether it cleanly fixes the problem without breaking anything else, and upload your reasoning.`,
          ].join("\n"),
          8000,
        ),
      });
    }
    if (panels.length === 0) {
      return { status: "skipped" as const, message: "Spend caps left nothing to dispatch." };
    }

    const projectId: string = await (async () => {
      if (!apiKey) return "proj_breakmyapp_verification"; // simulation mode
      try {
        const listRes = await teracFetch(apiKey, baseUrl, "/projects");
        if (listRes.ok) {
          const listData = await listRes.json();
          const list = Array.isArray(listData?.data) ? listData.data : Array.isArray(listData) ? listData : [];
          const existing = list.find(
            (p: { name?: string }) => p.name === "BreakMyApp Human Verification"
          );
          if (existing?.id) return String(existing.id);
          if (list[0]?.id) return String(list[0].id);
        }
        const createRes = await teracFetch(apiKey, baseUrl, "/projects", {
          method: "POST",
          body: JSON.stringify({
            name: "BreakMyApp Human Verification",
            description: "Autonomous deterministic audit verification panels",
          }),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          const id = created?.id ?? created?.data?.id;
          if (id) return String(id);
        }
      } catch {
        // fall through
      }
      return "";
    })();
    if (apiKey && !projectId) {
      return { status: "skipped" as const, message: "Could not resolve a Terac project for the panel." };
    }

    const dispatchedRecords: Array<{
      findingId: typeof findings[number]["_id"];
      opportunityId: string;
      taskKind: TeracTaskKind;
      panelSize: number;
      laborCostCents: number;
    }> = [];

    for (const panel of panels) {
      const title = truncate(panel.title, 200);
      const description = panel.description;

      if (apiKey) {
        // Draft first (costs nothing, starts no recruitment), then launch.
        let opportunityId = "";
        let createError = "";
        try {
          const createRes = await teracFetch(apiKey, baseUrl, "/opportunities", {
            method: "POST",
            body: JSON.stringify({
              title,
              internal_title: `BreakMyApp ${args.auditId} ${panel.kind}`,
              description,
              project_id: projectId,
              num_participants: PANEL_SIZE,
              business_type: "b2b",
              // Deliberate base audience (US 18+, any language): finding-repro
              // verification needs no demographic filter — anyone who can use
              // a browser qualifies. Recorded via the documented opt-in flag.
              unrestricted_audience: true,
              customer_screening_review: "auto_invite",
              expected_days_to_complete: 5, // Terac minimum
              screening_questions: buildScreeningQuestions(
                audit.targetUrl,
                panel.kind === "FINDING_REPRO"
                  ? (findings.find((f) => f._id === panel.findingId)?.reproductionSteps ?? "")
                  : "Review the proposed patch in the task description.",
              ),
              tasks: [
                {
                  sequence: 1,
                  task_type: "file_upload",
                  review_type: "manual_review",
                  title: "Upload proof of your verification result",
                  description:
                    "Upload the evidence for the verdict you gave during screening: a screenshot of the crashing page/console error, or the page working correctly if you answered NO.",
                  duration_minutes: TASK_DURATION_MINUTES,
                  instructions:
                    "Upload 1-3 files: PNG/JPG/WEBP screenshots showing the result you observed (crash evidence, or a clean screenshot if it did not reproduce).",
                  accepted_mime_types: ["image/png", "image/jpeg", "image/webp"],
                  min_files: 1,
                  max_files: 3,
                },
              ],
            }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            opportunityId = created?.id ?? created?.data?.id ?? "";
          } else {
            createError = `Terac rejected the draft (${createRes.status}): ${truncate(
              await createRes.text(),
              600
            )}`;
          }
        } catch (e) {
          createError = `Terac draft request failed: ${e instanceof Error ? e.message : String(e)}`;
        }

        if (!opportunityId) {
          return {
            status: "skipped" as const,
            message: `Terac draft creation failed for "${title}" — nothing dispatched. ${createError}`.trim(),
          };
        }

        try {
          const launchRes = await teracFetch(apiKey, baseUrl, `/opportunities/${opportunityId}/launch`, {
            method: "POST",
            body: "{}",
          });
          if (!launchRes.ok) {
            const text = await launchRes.text();
            return {
              status: "skipped" as const,
              message: `Draft ${opportunityId} created but launch failed (${launchRes.status}): ${truncate(text, 240)}`,
            };
          }
        } catch (e) {
          return {
            status: "skipped" as const,
            message: `Draft ${opportunityId} created but launch request failed: ${e instanceof Error ? e.message : String(e)}`,
          };
        }

        dispatchedRecords.push({
          findingId: panel.findingId,
          opportunityId,
          taskKind: panel.kind,
          panelSize: PANEL_SIZE,
          // Billed at close: applies actual balance delta after approve (see pollPendingVerdicts).
          laborCostCents: 0,
        });
      } else {
        // Simulation mode (no key): deterministic fake opportunities so demos/tests run.
        const i = dispatchedRecords.length;
        dispatchedRecords.push({
          findingId: panel.findingId,
          opportunityId: `opp_${args.auditId.slice(-6)}_${panel.kind.toLowerCase()}_${i}`,
          taskKind: panel.kind,
          panelSize: PANEL_SIZE,
          laborCostCents: panel.kind === "FINDING_REPRO" ? 120 : 90,
        });
      }
    }

    await ctx.runMutation(internal.teracBridge.recordDispatchedPanels, {
      auditId: args.auditId,
      projectId: projectId || "proj_breakmyapp_verification",
      dispatched: dispatchedRecords,
    });

    return {
      status: "dispatched" as const,
      opportunityIds: dispatchedRecords.map((d) => d.opportunityId),
      message: `Dispatched ${dispatchedRecords.length} Terac panel(s) on project ${projectId}.`,
    };
  },
});

/**
 * Manual, token-gated study launcher for completed audits (the normal path is
 * payment-triggered). The token lives in TERMINAL env on the deployment
 * (TERAC_STUDY_LAUNCH_TOKEN); it is set, used once, then removed/rotated.
 */
export const launchStudy = action({
  args: {
    auditId: v.id("audits"),
    token: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    message: v.string(),
    opportunityIds: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<{
    ok: boolean;
    message: string;
    opportunityIds?: string[];
  }> => {
    const token = env.TERAC_STUDY_LAUNCH_TOKEN;
    if (!token || !token.trim() || token !== args.token) {
      return { ok: false, message: "Manual launch refused — TERAC_STUDY_LAUNCH_TOKEN is not set or the token does not match." };
    }
    const result = await ctx.runAction(internal.terac.dispatchAuditPanels, {
      auditId: args.auditId,
      force: true,
    });
    return {
      ok: result.status === "dispatched",
      message: result.message ?? "",
      ...(result.opportunityIds ? { opportunityIds: result.opportunityIds } : {}),
    };
  },
});

// ---------------------------------------------------------------------------
// Verdict collection (cron, every 60s)
// ---------------------------------------------------------------------------

type TeracSubmission = {
  id: string;
  status: string;
  participant_name: string | null;
  participant_id: string;
  screening_answers?: Array<{
    key?: string;
    question?: string;
    answer?: string[];
    outcome?: string | null;
  }>;
};

async function teracFetch(
  apiKey: string,
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      // Terac assumes latin-1 when no charset is declared — UTF-8 text in
      // descriptions garbles unless we declare it explicitly.
      "content-type": "application/json; charset=utf-8",
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function fetchBalanceCents(apiKey: string, baseUrl: string): Promise<number | null> {
  try {
    const res = await teracFetch(apiKey, baseUrl, "/organizations/current/context");
    if (!res.ok) return null;
    const data = await res.json();
    const dollars = Number(data?.balanceDollars);
    return Number.isFinite(dollars) ? Math.round(dollars * 100) : null;
  } catch {
    return null;
  }
}

function verdictText(sub: TeracSubmission): string {
  const answers = sub.screening_answers ?? [];
  const match =
    answers.find((a) => a.key === VERDICT_KEY) ??
    answers.find((a) => String(a.key ?? "").includes("repro")) ??
    answers[0];
  return (match?.answer ?? []).join(" ").trim();
}

/**
 * FR-6: pollPendingVerdicts — every 60s, harvest panel submissions from Terac.
 * A panel closes when every seat has a completed task (awaiting_review or
 * approved). We approve those submissions (releasing expert pay), measure the
 * actual spend as the org balance delta, and stamp the panel verdict:
 * ≥2/3 "Yes" reproductions ⇒ CONFIRMED, else CONTESTED.
 */
export const pollPendingVerdicts = internalAction({
  args: {},
  handler: async (ctx) => {
    const pendings = await ctx.runQuery(internal.teracBridge.getPendingVerifications, {});
    if (!pendings || pendings.length === 0) return;

    const apiKey = env.TERAC_API_KEY;
    const baseUrl = env.TERAC_BASE_URL || DEFAULT_TERAC_API;

    for (const p of pendings) {
      let completedSubmissions: TeracSubmission[] = [];

      if (apiKey) {
        try {
          const res = await teracFetch(apiKey, baseUrl, `/opportunities/${p.opportunityId}/submissions`);
          if (!res.ok) continue;
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : [];
          completedSubmissions = list.filter(
            (s: TeracSubmission) => s.status === "awaiting_review" || s.status === "approved"
          );
        } catch {
          continue;
        }
      } else {
        // Deterministic simulation mode for testing / stage demo
        completedSubmissions = [
          { id: `sub_${p.opportunityId}_1`, status: "approved", participant_name: "worker_ny_1", participant_id: "worker_ny_1", screening_answers: [] },
          { id: `sub_${p.opportunityId}_2`, status: "approved", participant_name: "worker_sf_2", participant_id: "worker_sf_2", screening_answers: [] },
          { id: `sub_${p.opportunityId}_3`, status: "approved", participant_name: "worker_ldn_3", participant_id: "worker_ldn_3", screening_answers: [] },
        ];
      }

      // All panel seats must have completed work before closing out
      if (completedSubmissions.length >= p.panelSize) {
        const reproducedCount = apiKey
          ? completedSubmissions.filter((s) => verdictText(s).toLowerCase().startsWith("yes")).length
          : 3; // simulation: all confirm
        const isConfirmed = reproducedCount >= Math.ceil((2 / 3) * p.panelSize);
        const status = isConfirmed ? "CONFIRMED" : "CONTESTED";

        // Approve (pay) completed work and bill the actual balance delta.
        let laborCostCents = apiKey ? 0 : 270;
        if (apiKey) {
          const pre = await fetchBalanceCents(apiKey, baseUrl);
          for (const sub of completedSubmissions.filter((s) => s.status === "awaiting_review")) {
            try {
              await teracFetch(apiKey, baseUrl, `/submissions/${sub.id}/approve`, {
                method: "POST",
                body: "{}",
              });
            } catch {
              // individual approval failures leave the submission for the next tick
            }
          }
          const post = await fetchBalanceCents(apiKey, baseUrl);
          if (pre !== null && post !== null && post < pre) {
            laborCostCents = pre - post;
          }
        }

        const humanNotes = completedSubmissions
          .map((s) => {
            const who = s.participant_name || s.participant_id || s.id;
            const verdict = verdictText(s) || "(no verdict recorded)";
            return `${who}: ${verdict}`;
          })
          .filter(Boolean);

        await ctx.runMutation(internal.teracBridge.applyVerificationResult, {
          verificationId: p._id,
          status,
          reproducedCount,
          laborCostCents,
          humanNotes,
        });
      }
    }
  },
});

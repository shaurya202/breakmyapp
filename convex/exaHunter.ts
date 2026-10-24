"use node";

// exaHunter.ts — BreakMyApp Exa Autonomous Prospector (FR-1).
//
// Phase 1 — POST /search: launch discovery (recency phrased in the query,
//           startPublishedDate as the 24h dedupe hard filter, type "auto",
//           contents highlights, objective + keep/drop systemPrompt + bounded
//           outputSchema — canonical shapes per scripts/exa-prospect.mjs and
//           the build-with-exa skill).
// Phase 2 — POST /agent/runs: people + company enrichment (list-building/
//           enrichment routes to the Agent API; effort "low"; known rows in
//           input.data; poll until terminal; read stopReason + costDollars).
//
// Grounding is field-level: citation URLs are stored on audits.grounding and
// rendered under the exa context on the report page.

import { env, action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeUrl } from "./deterministic";

const EXA_API = "https://api.exa.ai";
const HARVEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_HARVEST_CANDIDATES = 10;
const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_TRIES = 24; // 2 minutes
const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/i;

function isPublicHttpUrl(u: string): boolean {
  let normalized = u;
  if (!/^https?:\/\//.test(normalized)) {
    normalized = "https://" + normalized;
  }
  try {
    const url = new URL(normalized);
    if (!/^https?:$/.test(url.protocol)) return false;
    return !PRIVATE_HOST_RE.test(url.hostname.replace(/^www\./i, ""));
  } catch {
    return false;
  }
}

async function exaFetch(
  path: string,
  body: unknown,
  apiKey: string,
  timeoutMs = 60_000
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(EXA_API + path, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(t);
  }
}

function pushLine(lines: string[], text: string): void {
  if (lines.length < 24) lines.push(text);
}
void pushLine;

// ---------------------------------------------------------------------------
// Phase 1 — harvest launches
// ---------------------------------------------------------------------------

export const harvestLaunches = internalAction({
  args: {},
  returns: v.object({
    found: v.number(),
    skipped: v.optional(v.number()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const apiKey = env.EXA_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { found: 0, reason: "exa_not_configured" as const };
    }

    const allowance = await ctx.runQuery(internal.hunterBridge.autonomousAuditAllowance, {
      now: Date.now(),
    });
    if (allowance === 0) {
      return { found: 0, reason: "daily_autonomous_audit_limit" as const };
    }

    const hunted24h = await ctx.runQuery(internal.hunterBridge.listHuntedUrls24h, {
      now: Date.now(),
    });
    const huntedSet = new Set(hunted24h);

    const body = {
      query:
        "Show HN launches posted in the last day and Product Hunt launches this week: brand-new web apps that just went live with a real deployed URL",
      type: "auto",
      contents: { highlights: true, text: false },
      startPublishedDate: new Date(Date.now() - HARVEST_WINDOW_MS).toISOString(),
      objective:
        "One discovery step of an autonomous QA pipeline: collect brand-new live web apps so each can be deterministically audited and pitched a free crash check.",
      systemPrompt:
        "Keep: one entry per product that genuinely just launched and has a working public URL you can see in the results. Drop: blogs, articles, GitHub repos without a live demo, private tools, unchanged relaunches of the same product. Ignore ads and sponsored listings.",
      outputSchema: {
        type: "object",
        properties: {
          launches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                target_url: { type: "string" },
                one_liner: { type: "string" },
                founder_hint: { type: "string", nullable: true },
              },
              required: ["product_name", "target_url", "one_liner"],
            },
          },
        },
        required: ["launches"],
      },
    };

    const resp = await exaFetch("/search", body, apiKey).catch(() => undefined);
    if (!resp || !resp.ok) {
      return {
        found: 0,
        reason: resp ? `exa_search_http_${resp.status}` : "exa_search_failed",
      };
    }

    // Exa returns {output:{launches:[...]}} with outputSchema; parse defensively.
    const payload: any = await resp.json().catch(() => undefined);
    const launches: Array<{
      product_name?: string;
      target_url?: string;
      one_liner?: string;
      founder_hint?: string | null;
    }> =
      payload?.output?.launches ??
      payload?.data?.output?.launches ??
      (Array.isArray(payload?.results)
        ? payload.results.map((r: any) => ({
            product_name: r.title || r.url,
            target_url: r.url,
            one_liner: (r.highlights && r.highlights[0]) || "",
            founder_hint: null,
          }))
        : []);

    let found = 0;
    let skipped = 0;
    for (const l of launches.slice(0, MAX_HARVEST_CANDIDATES)) {
      if (found >= Math.min(1, allowance)) break;
      const name = (l.product_name ?? "").toString().trim().slice(0, 60);
      const rawUrl = (l.target_url ?? "").toString().trim();
      const oneLiner = (l.one_liner ?? "").toString().trim().slice(0, 280);
      const founder = (l.founder_hint ?? "").toString().trim().slice(0, 80);
      if (!name || !isPublicHttpUrl(rawUrl)) {
        skipped += 1;
        continue;
      }
      const normalized = (() => {
        try {
          return normalizeUrl(new URL(rawUrl).origin + new URL(rawUrl).pathname);
        } catch {
          return "";
        }
      })();
      if (!normalized || huntedSet.has(normalized)) {
        skipped += 1;
        continue;
      }
      const groundingUrl = (() => {
        try {
          return payload?.results ? (payload.results[0]?.url ?? "") : rawUrl;
        } catch {
          return "";
        }
      })();
      const auditId = await ctx.runMutation(internal.audits.createInternalRun, {
        targetUrl: normalized,
        source: "EXA_AUTONOMOUS_HUNT" as const,
        exaContextSummary: `${name}: ${oneLiner}`,
        founderHandleOrEmail: founder ? `${founder}#exa-hinted` : undefined,
        grounding: groundingUrl ? [groundingUrl] : undefined,
        bypassDedupe: false,
      });
      if (auditId) {
        found += 1;
        huntedSet.add(normalized);
        await ctx.scheduler.runAfter(0, internal.exaHunter.enrichOne, {
          auditId,
          targetUrl: normalized,
        });
      }
    }

    return { found, skipped, reason: undefined };
  },
});

// ---------------------------------------------------------------------------
// Phase 2 — people + company enrichment via the Agent API
// ---------------------------------------------------------------------------

export const enrichOne = internalAction({
  args: {
    auditId: v.id("audits"),
    targetUrl: v.string(),
  },
  returns: v.object({ enriched: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const apiKey = env.EXA_API_KEY;
    if (!apiKey || !apiKey.trim()) return { enriched: false, reason: "exa_not_configured" as const };
    if (!await ctx.runMutation(internal.hunterBridge.claimEnrichment, { auditId: args.auditId })) {
      return { enriched: false, reason: "enrichment_already_attempted" as const };
    }

    const startBody = {
      query:
        `Find the founder/first-author and company facts for ${args.targetUrl}. ` +
        "Only include a contact if it is visible in a source; never fabricate an email or name.",
      systemPrompt:
        "You are a neutral company researcher for a QA diligence report. Only state what the sources show; leave fields null when uncertain.",
      outputSchema: {
        type: "object",
        properties: {
          people: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string" },
                contact_url: { type: "string", format: "uri", nullable: true },
                contact_email: { type: "string", format: "email", nullable: true },
              },
              required: ["name", "role"],
            },
          },
          company: {
            type: "object",
            properties: {
              name: { type: "string" },
              one_liner: { type: "string" },
              competitors: { type: "array", items: { type: "string" } },
              ship_context: { type: "string", nullable: true },
            },
            required: ["name"],
          },
        },
        required: ["company"],
      },
      input: {
        data: [{ target_url: args.targetUrl }],
      },
      effort: "low",
    };

    const startResp = await exaFetch("/agent/runs", startBody, apiKey, 45_000).catch(
      () => undefined
    );
    if (!startResp || !startResp.ok) {
      return {
        enriched: false,
        reason: startResp ? `agent_run_http_${startResp.status}` : "agent_run_failed",
      };
    }
    const started: any = await startResp.json().catch(() => undefined);
    const runId: string | undefined = started?.id && String(started.id).startsWith("agent_run_")
      ? String(started.id)
      : undefined;
    if (!runId) return { enriched: false, reason: "agent_run_no_id" as const };

    // Poll GET /agent/runs/{id} until terminal.
    let output: any = null;
    let status = "running";
    try {
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 15_000);
        const pollResp = await fetch(`${EXA_API}/agent/runs/${runId}`, {
          headers: { "x-api-key": apiKey },
          signal: ctl.signal,
        }).catch(() => undefined).finally(() => clearTimeout(t));
        if (pollResp && pollResp.ok) {
          const body: any = await pollResp.json().catch(() => undefined);
          status = body?.status ?? "running";
          if (status === "completed" || status === "failed" || status === "cancelled") {
            output = body;
            break;
          }
        }
        await sleep(POLL_INTERVAL_MS);
      }
    } catch {
      return { enriched: false, reason: "agent_run_poll_failed" as const };
    }

    const stopReason = output?.stoppedReason ?? output?.stopReason ?? status;
    const cost = output?.costDollars ?? output?.usage?.costDollars;
    const structured = output?.output?.structured ?? output?.output ?? null;

    // Exa returns field-level grounding as `{ field, citations: [{ url }], confidence }`.
    // Extract every cited URL instead of reading a nonexistent `grounding.citations`.
    const groundingEntries: any[] = Array.isArray(output?.output?.grounding)
      ? output.output.grounding
      : Array.isArray(output?.grounding)
        ? output.grounding
        : [];
    const groundingUrls = groundingEntries.flatMap((entry: any) => {
      if (Array.isArray(entry?.citations)) {
        return entry.citations
          .map((citation: any) =>
            typeof citation === "string" ? citation : citation?.url
          )
          .filter((url: unknown): url is string => typeof url === "string");
      }
      if (typeof entry?.url === "string") return [entry.url];
      return [];
    });

    await ctx.runMutation(internal.hunterBridge.patchEnrichment, {
      auditId: args.auditId,
      agentRunId: runId,
      summaryText: structured?.company?.one_liner
        ? `${structured?.company?.name ?? ""} · ${structured.company.one_liner}${
            structured?.people?.[0]?.name ? ` · founder: ${structured.people[0].name}` : ""
          }`
        : undefined,
      founderContact: structured?.people?.[0]?.contact_email ?? undefined,
      groundingUrls,
    });

    return { enriched: status === "completed" && !!output?.outputReady, reason: `stop=${String(stopReason)} cost=${cost ?? "?"}` };
  },
});

/** Public wrapper so the orchestrator can trigger a hunt live on stage. */
export const huntNow = action({
  args: {},
  returns: v.object({
    found: v.number(),
    skipped: v.optional(v.number()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    found: number;
    skipped?: number;
    reason?: string;
  }> => {
    // Same-file runAction → the guideline-required explicit result annotation
    // breaks the api→module self-reference type cycle.
    const result: {
      found: number;
      skipped?: number;
      reason?: string;
    } = await ctx.runAction(internal.exaHunter.harvestLaunches, {});
    return result;
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// keep ActionCtx import used in node-runtime type surface
export type ExaActionCtx = ActionCtx;

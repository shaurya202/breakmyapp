import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  SUITE_VERSION,
  normalizeUrl,
  seedForUrl,
  projectNameFromUrl,
  computeHealthScore,
  PAYWALLS_DISABLED,
  isPublicWebUrl,
} from "./deterministic";

const UNLOCK_PRICE_CENTS = 999;
const RERUN_WINDOW_MS = 72 * 60 * 60 * 1000; // verification run valid 72h
const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // repeated pastes re-use a fresh run

export async function hasActiveShield(ctx: Pick<QueryCtx, "db">, targetUrl: string): Promise<boolean> {
  return (await ctx.db.query("shield_memberships")
    .withIndex("by_url_and_status", (q) => q.eq("enrolledUrl", targetUrl).eq("status", "ACTIVE"))
    .first()) !== null;
}

// Blocked targets: private/metadata hosts — we only probe public HTTPS URLs.
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?[0-9a-f:]+\]$/, // bare/bracketed ipv6 literal — conservatively blocked
];

function isProhibitedHost(host: string): boolean {
  const h = host.replace(/^www\./i, "");
  return BLOCKED_HOST_PATTERNS.some((p) => p.test(h));
}

/** Public entry: pasted URL on the landing page. No account, no login, no payment. */
export const startFromUrl = mutation({
  args: {
    targetUrl: v.string(),
    bypassDedupe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeUrl(args.targetUrl);
    let host = "";
    try {
      host = new URL(normalized).hostname;
    } catch {
      throw new Error("That doesn't look like a URL. Paste a full web address.");
    }
    if (!isPublicWebUrl(normalized) || isProhibitedHost(host)) {
      throw new Error(
        "Only public web URLs can be audited (no localhost / private IPs)."
      );
    }

    // Re-use a recent run for the same URL instead of hammering Solari.
    if (!args.bypassDedupe) {
      const existing = await ctx.db
        .query("audits")
        .withIndex("by_url", (q) => q.eq("targetUrl", normalized))
        .order("desc")
        .take(1);
      const prior = existing[0];
      if (
        prior &&
        Date.now() - prior._creationTime < DEDUPE_WINDOW_MS &&
        (prior.status === "QUEUED" || prior.status === "EXA_ENRICHING" || prior.status === "DETERMINISTIC_RUN_RUNNING" ||
          prior.status === "SANDBOX_ANALYZING" ||
          prior.status === "COMPLETED")
      ) {
        return { auditId: prior._id, reused: true };
      }
    }

    const runSeed = seedForUrl(normalized);
    const now = Date.now();
    const auditId: Id<"audits"> = await ctx.db.insert("audits", {
      targetUrl: normalized,
      projectName: projectNameFromUrl(normalized),
      source: "SELF_SERVE_URL",
      status: "QUEUED",
      liveStepLog: [`${new Date(now).toISOString()} · Run accepted for ${normalized}`],
      runSeed,
      suiteVersion: SUITE_VERSION,
      totalBugsFound: 0,
      criticalCount: 0,
      healthScore: 100,
      isUnlocked: false,
      payerHasShield: await hasActiveShield(ctx, normalized),
      verificationRunsRemaining: 0,
      shipReadyBadgeIssued: false,
      unlockPriceCents: UNLOCK_PRICE_CENTS,
      teracPanelStatus: "NOT_DISPATCHED",
      runStartedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.solariRunner.runDeterministicSuite,
      { auditId }
    );
    return { auditId, reused: false };
  },
});

const auditStatusValidator = v.union(
  v.literal("QUEUED"),
  v.literal("EXA_ENRICHING"),
  v.literal("DETERMINISTIC_RUN_RUNNING"),
  v.literal("SANDBOX_ANALYZING"),
  v.literal("COMPLETED"),
  v.literal("FAILED")
);

/** Live terminal feed + everything the report page needs, masked server-side. */
export const getReport = query({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return null;
    const runCompleted =
      audit.status === "COMPLETED" || audit.status === "FAILED";
    const payerHasShield = await hasActiveShield(ctx, audit.targetUrl);
    const canSeeDeliverables = PAYWALLS_DISABLED || audit.isUnlocked || payerHasShield;
    const findings = await ctx.db
      .query("findings")
      .withIndex("by_audit", (q) => q.eq("auditId", args.auditId))
      .take(200);

    const masked: any[] = [];
    for (const f of findings) {
      const revealed = canSeeDeliverables || f.isFreePreview;
      if (!revealed) {
        masked.push({
          _id: f._id,
          category: f.category,
          severity: f.severity,
          title: f.title,
          isFreePreview: f.isFreePreview,
          locked: true,
          reproductionSteps: f.reproductionSteps.slice(0, 48) + "…",
          rawErrorLog: null,
          aiSuggestedPatch: null,
          deterministicPayload: null,
          screenshotUrl: null,
          patchReviewStatus: null,
          teracVerdict: f.teracVerdict ?? null,
          teracReproducedCount: f.teracReproducedCount ?? null,
        });
        continue;
      }
      masked.push({
        _id: f._id,
        category: f.category,
        severity: f.severity,
        title: f.title,
        isFreePreview: f.isFreePreview,
        locked: false,
        deterministicPayload: f.deterministicPayload ?? null,
        reproductionSteps: f.reproductionSteps,
        rawErrorLog: f.rawErrorLog,
        aiSuggestedPatch: f.aiSuggestedPatch,
        patchReviewStatus: f.patchReviewStatus ?? null,
        teracVerdict: f.teracVerdict ?? null,
        teracReproducedCount: f.teracReproducedCount ?? null,
        screenshotUrl: f.screenshotStorageId
          ? await ctx.storage.getUrl(f.screenshotStorageId)
          : null,
      });
    }

    const rerunDeadline =
      payerHasShield || !audit.isUnlocked
        ? null
        : (audit.runFinishedAt ?? audit._creationTime) + RERUN_WINDOW_MS;

    return {
      audit: {
        id: audit._id,
        targetUrl: audit.targetUrl,
        projectName: audit.projectName,
        source: audit.source,
        status: audit.status,
        liveStepLog: audit.liveStepLog,
        runSeed: audit.runSeed,
        suiteVersion: audit.suiteVersion,
        determinismHash: audit.determinismHash ?? null,
        solariBrowserBootMs: audit.solariBrowserBootMs ?? null,
        solariSandboxBootMs: audit.solariSandboxBootMs ?? null,
        totalBugsFound: audit.totalBugsFound,
        criticalCount: audit.criticalCount,
        healthScore: audit.healthScore,
        isUnlocked: audit.isUnlocked,
        payerHasShield,
        verificationRunsRemaining: audit.verificationRunsRemaining,
        shipReadyBadgeIssued: audit.shipReadyBadgeIssued,
        unlockPriceCents: audit.unlockPriceCents,
        whopCheckoutUrl: audit.whopCheckoutUrl ?? null,
        teracPanelStatus: audit.teracPanelStatus,
        runCompleted,
        unlockEnabled:
          !PAYWALLS_DISABLED &&
          audit.status === "COMPLETED" && audit.criticalCount > 0 &&
          !audit.isUnlocked && !payerHasShield,
        rerunDeadline,
        errorMessage: audit.errorMessage ?? null,
        createdAt: audit._creationTime,
        runFinishedAt: audit.runFinishedAt ?? null,
        exaContextSummary: audit.exaContextSummary ?? null,
        grounding: audit.grounding ?? null,
      },
      findings: masked,
    };
  },
});

/** Landing page: recent runs ticker/leaderboard. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("audits")
      .order("desc")
      .take(Number.isFinite(args.limit ?? 12) ? Math.max(1, Math.min(Math.floor(args.limit ?? 12), 30)) : 12);
    return rows.map((a) => ({
      _id: a._id,
      projectName: a.projectName,
      targetUrl: a.targetUrl,
      status: a.status,
      source: a.source,
      healthScore: a.healthScore,
      totalBugsFound: a.totalBugsFound,
      criticalCount: a.criticalCount,
      shipReadyBadgeIssued: a.shipReadyBadgeIssued,
      _creationTime: a._creationTime,
    }));
  },
});

/** "Verify my fix": consume an included re-run, schedule a same-seed re-run. */
export const requestRerun = mutation({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) throw new Error("Audit not found");
    if (audit.status !== "COMPLETED") {
      throw new Error("Run not finished — wait for the deterministic suite.");
    }
    const payerHasShield = await hasActiveShield(ctx, audit.targetUrl);
    if (!PAYWALLS_DISABLED && !audit.isUnlocked && !payerHasShield) {
      throw new Error(
        "Verification re-runs require the Full Autopsy or Launch Shield."
      );
    }
    if (!PAYWALLS_DISABLED && !payerHasShield) {
      if (audit.verificationRunsRemaining <= 0) {
        throw new Error(
          "No re-runs left on this one-time unlock. Launch Shield members get unlimited."
        );
      }
      const expiresAt = (audit.runFinishedAt ?? audit._creationTime) + RERUN_WINDOW_MS;
      if (Date.now() > expiresAt) {
        throw new Error("The 72-hour verification window has expired.");
      }
      await ctx.db.patch(args.auditId, {
        verificationRunsRemaining: audit.verificationRunsRemaining - 1,
      });
    }
    await ctx.db.patch(args.auditId, {
      status: "QUEUED",
      shipReadyBadgeIssued: false,
      errorMessage: undefined,
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · FIX-VERIFICATION re-run queued (same seed ${audit.runSeed})`,
      ],
    });
    await ctx.scheduler.runAfter(0, internal.solariRunner.runRerun, {
      auditId: args.auditId,
    });
    return { ok: true };
  },
});

/** Internal entrypoint used by the Exa hunter and Launch Shield re-scans. */
export const createInternalRun = internalMutation({
  args: {
    targetUrl: v.string(),
    source: v.union(
      v.literal("EXA_AUTONOMOUS_HUNT"),
      v.literal("SELF_SERVE_URL")
    ),
    exaContextSummary: v.optional(v.string()),
    founderHandleOrEmail: v.optional(v.string()),
    grounding: v.optional(v.array(v.string())),
    exaAgentRunId: v.optional(v.string()),
    bypassDedupe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const normalized = normalizeUrl(args.targetUrl);
    if (!isPublicWebUrl(normalized)) return null;
    try {
      const host = new URL(normalized).hostname;
      if (isProhibitedHost(host)) return null;
    } catch {
      return null;
    }
    if (!args.bypassDedupe) {
      const existing = await ctx.db
        .query("audits")
        .withIndex("by_url", (q) => q.eq("targetUrl", normalized))
        .order("desc")
        .take(1);
      const prior = existing[0];
      if (
        prior &&
        Date.now() - prior._creationTime < DEDUPE_WINDOW_MS &&
        (prior.status === "QUEUED" || prior.status === "EXA_ENRICHING" || prior.status === "DETERMINISTIC_RUN_RUNNING" ||
          prior.status === "SANDBOX_ANALYZING" ||
          prior.status === "COMPLETED")
      ) {
        return prior._id;
      }
    }
    const now = Date.now();
    const auditId: Id<"audits"> = await ctx.db.insert("audits", {
      targetUrl: normalized,
      projectName: projectNameFromUrl(normalized),
      source: args.source,
      founderHandleOrEmail: args.founderHandleOrEmail,
      exaContextSummary: args.exaContextSummary,
      exaAgentRunId: args.exaAgentRunId,
      grounding: args.grounding,
      status: args.source === "EXA_AUTONOMOUS_HUNT" ? "EXA_ENRICHING" : "QUEUED",
      liveStepLog: [`${new Date(now).toISOString()} · ${args.source === "EXA_AUTONOMOUS_HUNT" ? "Hunted by Exa prospector" : "Shield re-scan"} · ${normalized}`],
      runSeed: seedForUrl(normalized),
      suiteVersion: SUITE_VERSION,
      totalBugsFound: 0,
      criticalCount: 0,
      healthScore: 100,
      isUnlocked: false,
      payerHasShield: await hasActiveShield(ctx, normalized),
      verificationRunsRemaining: 0,
      shipReadyBadgeIssued: false,
      unlockPriceCents: UNLOCK_PRICE_CENTS,
      teracPanelStatus: "NOT_DISPATCHED",
      runStartedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.solariRunner.runDeterministicSuite,
      { auditId }
    );
    return auditId;
  },
});

/** Internal entrypoint used by the Exa hunter and Launch Shield re-scans (end). */

// ---------------------------------------------------------------------------
// Internal primitives used by the runner / whop / shield modules.
// ---------------------------------------------------------------------------

export const appendSteps = internalMutation({
  args: {
    auditId: v.id("audits"),
    lines: v.array(v.string()),
    replaceLogs: v.optional(v.boolean()),
    status: v.optional(auditStatusValidator),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    const nextLogs = args.replaceLogs
      ? args.lines
      : [...audit.liveStepLog, ...args.lines].slice(-400);
    await ctx.db.patch(args.auditId, {
      liveStepLog: nextLogs,
      ...(args.status ? { status: args.status } : {}),
    });
  },
});

export const markRunning = internalMutation({
  args: {
    auditId: v.id("audits"),
    browserBootMs: v.optional(v.number()),
    sandboxBootMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.auditId, {
      status: "DETERMINISTIC_RUN_RUNNING",
      runStartedAt: Date.now(),
      ...(args.browserBootMs !== undefined
        ? { solariBrowserBootMs: args.browserBootMs }
        : {}),
      ...(args.sandboxBootMs !== undefined
        ? { solariSandboxBootMs: args.sandboxBootMs }
        : {}),
    });
  },
});

/** Completes a run: wholesale-replaces findings + medicals + treasury. */
export const completeRun = internalMutation({
  args: {
    auditId: v.id("audits"),
    findings: v.array(
      v.object({
        category: v.union(
          v.literal("CONSOLE_CRASH"),
          v.literal("NETWORK_500_ERROR"),
          v.literal("MOBILE_OVERFLOW"),
          v.literal("BROKEN_DEAD_CTA"),
          v.literal("EXPOSED_SECRET_OR_HEADER")
        ),
        severity: v.union(
          v.literal("CRITICAL"),
          v.literal("HIGH"),
          v.literal("MEDIUM")
        ),
        title: v.string(),
        deterministicPayload: v.optional(v.string()),
        reproductionSteps: v.string(),
        rawErrorLog: v.string(),
        aiSuggestedPatch: v.string(),
      })
    ),
    determinismHash: v.string(),
    screenshotDescriptors: v.array(
      v.object({
        index: v.number(),
        bytes: v.bytes(),
        mime: v.string(),
      })
    ),
    solariComputeCostCents: v.optional(v.number()),
    isRerun: v.optional(v.boolean()),
    resolvedTitles: v.optional(v.array(v.string())),
    regressedTitles: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;

    // Screenshot upload first so we can attach ids while inserting findings.
    const shotIds: (Id<"_storage"> | null)[] = [];
    for (const shot of args.screenshotDescriptors) {
      const id = await ctx.storage.store(
        new Blob([shot.bytes], { type: shot.mime })
      );
      shotIds[shot.index] = id;
    }

    // Deterministic suite owns this audit's truth: replace findings wholesale.
    for (const old of await ctx.db
      .query("findings")
      .withIndex("by_audit", (q) => q.eq("auditId", args.auditId))
      .take(200)) {
      if (old.screenshotStorageId) await ctx.storage.delete(old.screenshotStorageId);
      await ctx.db.delete(old._id);
    }

    for (let i = 0; i < args.findings.length; i++) {
      const f = args.findings[i];
      const { deterministicPayload, ...rest } = f;
      await ctx.db.insert("findings", {
        ...rest,
        deterministicPayload: deterministicPayload ?? undefined,
        auditId: args.auditId,
        isFreePreview: i === 0, // Bug #1 always the unblurred proof
        screenshotStorageId: shotIds[i] ?? undefined,
      });
    }

    const criticalCount = args.findings.filter(
      (f) => f.severity === "CRITICAL"
    ).length;
    const health = computeHealthScore(args.findings.map((f) => f.severity));
    const finish = Date.now();

    const patch: Record<string, unknown> = {
      status: "COMPLETED",
      determinismHash: args.determinismHash,
      totalBugsFound: args.findings.length,
      criticalCount,
      healthScore: health,
      runFinishedAt: finish,
      errorMessage: undefined,
      shipReadyBadgeIssued: args.isRerun === true && criticalCount === 0,
      suiteVersion: SUITE_VERSION,
    };
    if (args.isRerun === true) {
      patch.lastRerunAt = finish;
      patch.lastRerunHealthScore = health;
      patch.lastRerunResolved = args.resolvedTitles ?? [];
      patch.lastRerunRegressed = args.regressedTitles ?? [];
      // Ship-Ready flips only after an actual 0-critical passing re-run.
      if (criticalCount === 0 && !audit.shipReadyBadgeIssued) {
        patch.shipReadyBadgeIssued = true;
        await ctx.runMutation(internal.treasury.bumpTreasury, {
          shipReadyBadges: 1,
        });
      }
    }
    await ctx.db.patch(args.auditId, patch as any);

    await ctx.runMutation(internal.treasury.bumpTreasury, {
      auditsExecuted: args.isRerun ? 0 : 1,
      // Re-runs must not double-count the same catches — only the delta
      // between the previous run and this one moves the ticker.
      bugsCaught: args.isRerun
        ? Math.max(0, args.findings.length - (audit.totalBugsFound ?? 0))
        : args.findings.length,
      solariCents: args.solariComputeCostCents ?? 0,
    });
  },
});

export const failRun = internalMutation({
  args: {
    auditId: v.id("audits"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    await ctx.db.patch(args.auditId, {
      status: "FAILED",
      runFinishedAt: Date.now(),
      errorMessage: args.errorMessage.slice(0, 800),
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · RUN FAILED: ${args.errorMessage.slice(0, 160)}`,
      ],
    });
  },
});

/** Terac stays NOT_DISPATCHED until the Terac integration is turned on. */
export const noteTeracDisabled = internalMutation({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    if (audit.teracPanelStatus !== "NOT_DISPATCHED") return;
    await ctx.db.patch(args.auditId, {
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · Human verification panel: parked (Terac integration off)`,
      ],
    });
  },
});

/** Grant the included fix-verification re-run when a $9 unlock lands. */
export const grantUnlock = internalMutation({
  args: {
    auditId: v.id("audits"),
    whopSessionId: v.optional(v.string()),
    whopCheckoutUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) throw new Error("Audit already refunded / unknown");
    await ctx.db.patch(args.auditId, {
      isUnlocked: true,
      verificationRunsRemaining: Math.max(
        audit.verificationRunsRemaining,
        1
      ),
      ...(args.whopSessionId ? { whopSessionId: args.whopSessionId } : {}),
      ...(args.whopCheckoutUrl
        ? { whopCheckoutUrl: args.whopCheckoutUrl }
        : {}),
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · UNLOCKED: Full Autopsy contents released (incl. 1 fix-verification re-run)`,
      ],
    });
  },
});

/** Refund → revoke (self-policing: unlock only sold when it contains findings). */
export const revokeUnlock = internalMutation({
  args: { auditId: v.id("audits"), reason: v.string() },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    await ctx.db.patch(args.auditId, {
      isUnlocked: false,
      verificationRunsRemaining: 0,
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · LOCKED_AGAIN: ${args.reason}`,
      ],
    });
  },
});

/** Link a checkout session to the audit row (pre-payment metadata). */
export const setWhopCheckout = internalMutation({
  args: {
    auditId: v.id("audits"),
    sessionId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.sessionId) patch.whopSessionId = args.sessionId;
    if (args.checkoutUrl) patch.whopCheckoutUrl = args.checkoutUrl;
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.auditId, patch as any);
    }
  },
});

export const clearAllAudits = mutation({
  args: {},
  handler: async (ctx) => {
    const audits = await ctx.db.query("audits").collect();
    for (const a of audits) {
      await ctx.db.delete(a._id);
    }
    const findings = await ctx.db.query("findings").collect();
    for (const f of findings) {
      if (f.screenshotStorageId) {
        try {
          await ctx.storage.delete(f.screenshotStorageId);
        } catch {
          // ignore storage delete errors
        }
      }
      await ctx.db.delete(f._id);
    }
    const teracVerifs = await ctx.db.query("terac_verifications").collect();
    for (const tv of teracVerifs) {
      await ctx.db.delete(tv._id);
    }
    const treasury = await ctx.db.query("company_treasury").first();
    if (treasury) {
      await ctx.db.patch(treasury._id, {
        totalAuditsExecuted: 0,
        totalBugsCaught: 0,
        totalWhopRevenueCents: 0,
        totalWhopFeesCents: 0,
        totalTeracLaborCents: 0,
        totalShipReadyBadgesIssued: 0,
        totalSolariComputeCostCents: 0,
        netAutonomousProfitCents: 0,
      });
    }
    return { clearedAudits: audits.length, clearedFindings: findings.length };
  },
});

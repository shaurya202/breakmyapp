import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * hunterBridge.ts — non-node helper mutations/queries for the Exa prospector
 * (files with "use node" can only export actions, per Convex rules).
 */

const HUNT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DAILY_AUTONOMOUS_AUDIT_LIMIT = 5;

/** Rolling 24-hour cap, read before making any billable Exa request. */
export const autonomousAuditAllowance = internalQuery({
  args: { now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const recent = await ctx.db.query("audits")
      .withIndex("by_source", (q) => q.eq("source", "EXA_AUTONOMOUS_HUNT"))
      .order("desc")
      .take(DAILY_AUTONOMOUS_AUDIT_LIMIT);
    const used = recent.filter((row) => row._creationTime >= args.now - HUNT_WINDOW_MS).length;
    return Math.max(0, DAILY_AUTONOMOUS_AUDIT_LIMIT - used);
  },
});

/** URLs audited in the last 24h — the hunter's dedupe bound. */
export const listHuntedUrls24h = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("audits")
      .order("desc")
      .take(80);
    const cutoff = args.now - HUNT_WINDOW_MS;
    const urls = new Set<string>();
    for (const r of rows) {
      if (r._creationTime >= cutoff) urls.add(r.targetUrl);
    }
    return [...urls];
  },
});

/** Newest hunted audits that still lack enrichment metadata. */
export const listHuntedTodayFresh = internalQuery({
  args: {},
  returns: v.array(v.object({ auditId: v.id("audits"), targetUrl: v.string() })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("audits")
      .withIndex("by_status", (q) => q.eq("status", "EXA_ENRICHING"))
      .order("desc")
      .take(10);
    return rows
      .filter((r) => r.source === "EXA_AUTONOMOUS_HUNT" && !r.exaEnrichmentAttemptedAt)
      .map((r) => ({ auditId: r._id, targetUrl: r.targetUrl }));
  },
});

/** Claim at most one billable enrichment attempt per audit. */
export const claimEnrichment = internalMutation({
  args: { auditId: v.id("audits") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit || audit.source !== "EXA_AUTONOMOUS_HUNT" || audit.exaEnrichmentAttemptedAt) return false;
    await ctx.db.patch(args.auditId, { exaEnrichmentAttemptedAt: Date.now() });
    return true;
  },
});

/** Store enrichment output on the audit row + log the agent-run econ line. */
export const patchEnrichment = internalMutation({
  args: {
    auditId: v.id("audits"),
    agentRunId: v.string(),
    summaryText: v.optional(v.string()),
    founderContact: v.optional(v.string()),
    groundingUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    const patch: Record<string, unknown> = {
      exaAgentRunId: args.agentRunId,
    };
    if (args.summaryText) patch.exaContextSummary = args.summaryText;
    if (args.founderContact)
      patch.founderHandleOrEmail = `${args.founderContact}#exa`;
    if (args.groundingUrls && args.groundingUrls.length > 0) {
      patch.grounding = args.groundingUrls.slice(0, 6);
    }
    patch.liveStepLog = [
      ...audit.liveStepLog,
      `${new Date().toISOString()} · Exa agent-run ${args.agentRunId} settled (grounding attached to report)`,
    ];
    await ctx.db.patch(args.auditId, patch as any);
  },
});

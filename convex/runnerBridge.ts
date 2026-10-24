import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Read the audit row the suite will act on. Actions call this via runQuery. */
export const getAuditById = internalQuery({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return null;
    return {
      _id: audit._id,
      targetUrl: audit.targetUrl,
      runSeed: audit.runSeed,
      status: audit.status,
      source: audit.source,
    };
  },
});

/** Titles of the audit's current findings, creation order — used by re-run diffing. */
export const getFindingTitles = internalQuery({
  args: { auditId: v.id("audits") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("findings")
      .withIndex("by_audit", (q) => q.eq("auditId", args.auditId))
      .take(50);
    return rows.map((r) => r.title);
  },
});

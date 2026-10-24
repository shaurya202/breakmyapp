import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_DAY = 5;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function sourcedEmail(value: string | undefined): string | null {
  if (!value?.endsWith("#exa")) return null;
  const email = value.slice(0, -4).trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export const claimNext = internalMutation({
  args: { token: v.string(), messageId: v.string() },
  returns: v.union(v.null(), v.object({
    outreachId: v.id("outreach"), auditId: v.id("audits"),
    email: v.string(), projectName: v.string(), targetUrl: v.string(),
    criticalCount: v.number(), token: v.string(), messageId: v.string(),
  })),
  handler: async (ctx, args) => {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const daily = await ctx.db.query("outreach_daily")
      .withIndex("by_day", (q) => q.eq("day", day)).unique();
    if ((daily?.attempts ?? 0) >= MAX_ATTEMPTS_PER_DAY) return null;

    const waiting = await ctx.db.query("outreach")
      .withIndex("by_status", (q) => q.eq("status", "WAITING"))
      .take(50);
    for (const row of waiting) {
      const audit = await ctx.db.get(row.auditId);
      if (!audit || audit.status === "FAILED") {
        await ctx.db.patch(row._id, { status: "SKIPPED", lastError: "audit_failed" });
        continue;
      }
      if (audit.status !== "COMPLETED" || !audit.exaAgentRunId) {
        if (now - row._creationTime > 2 * DAY_MS) {
          await ctx.db.patch(row._id, { status: "SKIPPED", lastError: "not_ready_after_48h" });
        }
        continue;
      }
      if (audit.criticalCount === 0) {
        await ctx.db.patch(row._id, { status: "SKIPPED", lastError: "no_critical_findings" });
        continue;
      }
      const email = sourcedEmail(audit.founderHandleOrEmail);
      if (!email) {
        await ctx.db.patch(row._id, { status: "SKIPPED", lastError: "no_sourced_email" });
        continue;
      }
      const suppressed = await ctx.db.query("outreach_suppressions")
        .withIndex("by_email", (q) => q.eq("email", email)).unique();
      if (suppressed) {
        await ctx.db.patch(row._id, { status: "OPTED_OUT", email });
        continue;
      }
      const contacted = await Promise.all(
        (["SENDING", "SENT", "REPLIED", "UNKNOWN"] as const).map((status) =>
          ctx.db.query("outreach")
            .withIndex("by_email_and_status", (q) => q.eq("email", email).eq("status", status))
            .first()),
      );
      if (contacted.some((p) => p && p._id !== row._id)) {
        await ctx.db.patch(row._id, { status: "SKIPPED", email, lastError: "contact_already_attempted" });
        continue;
      }

      await ctx.db.patch(row._id, {
        status: "SENDING", email, unsubscribeToken: args.token,
        messageId: args.messageId, claimedAt: now,
      });
      if (daily) await ctx.db.patch(daily._id, { attempts: daily.attempts + 1 });
      else await ctx.db.insert("outreach_daily", { day, attempts: 1 });
      return {
        outreachId: row._id, auditId: row.auditId, email,
        projectName: audit.projectName, targetUrl: audit.targetUrl,
        criticalCount: audit.criticalCount, token: args.token,
        messageId: args.messageId,
      };
    }
    return null;
  },
});

export const markSent = internalMutation({
  args: {
    outreachId: v.id("outreach"),
    gmailMessageId: v.string(), gmailThreadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outreachId);
    if (row && (row.status === "SENDING" || row.status === "UNKNOWN")) {
      await ctx.db.patch(row._id, {
        status: "SENT", gmailMessageId: args.gmailMessageId,
        gmailThreadId: args.gmailThreadId, sentAt: Date.now(),
        lastError: undefined,
      });
    }
    return null;
  },
});

export const markUnknown = internalMutation({
  args: { outreachId: v.id("outreach"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.outreachId);
    if (row?.status === "SENDING") {
      await ctx.db.patch(row._id, { status: "UNKNOWN", lastError: args.reason.slice(0, 200) });
    }
    return null;
  },
});

export const getUnknown = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({
    outreachId: v.id("outreach"), messageId: v.string(), claimedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const unknown = await ctx.db.query("outreach")
      .withIndex("by_status", (q) => q.eq("status", "UNKNOWN"))
      .take(10);
    const sending = await ctx.db.query("outreach")
      .withIndex("by_status", (q) => q.eq("status", "SENDING"))
      .take(10);
    const rows = [...unknown, ...sending.filter((r) =>
      r.claimedAt !== undefined && args.now - r.claimedAt > 10 * 60 * 1000)];
    return rows.filter((r) => r.messageId && r.claimedAt)
      .map((r) => ({ outreachId: r._id, messageId: r.messageId!, claimedAt: r.claimedAt! }));
  },
});

export const getSyncCursor = internalQuery({
  args: { now: v.number() }, returns: v.number(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("outreach_sync")
      .withIndex("by_key", (q) => q.eq("key", "gmail")).unique();
    return row?.lastCheckedAt ?? args.now - 60 * 60 * 1000;
  },
});

export const advanceSyncCursor = internalMutation({
  args: { checkedAt: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("outreach_sync")
      .withIndex("by_key", (q) => q.eq("key", "gmail")).unique();
    if (row) await ctx.db.patch(row._id, { lastCheckedAt: Math.max(row.lastCheckedAt, args.checkedAt) });
    else await ctx.db.insert("outreach_sync", { key: "gmail", lastCheckedAt: args.checkedAt });
    return null;
  },
});

export const recipientForThread = internalQuery({
  args: { gmailThreadId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("outreach")
      .withIndex("by_gmailThreadId", (q) => q.eq("gmailThreadId", args.gmailThreadId)).unique();
    return row && (row.status === "SENT" || row.status === "REPLIED")
      ? (row.email ?? null) : null;
  },
});

export const queueStatus = internalQuery({
  args: {},
  returns: v.object({
    waiting: v.number(), sending: v.number(), unknown: v.number(),
    sent: v.number(), replied: v.number(), optedOut: v.number(),
  }),
  handler: async (ctx) => {
    const statuses = ["WAITING", "SENDING", "UNKNOWN", "SENT", "REPLIED", "OPTED_OUT"] as const;
    const counts = await Promise.all(statuses.map(async (status) => {
      const rows = await ctx.db.query("outreach")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(100);
      return rows.length;
    }));
    return {
      waiting: counts[0], sending: counts[1], unknown: counts[2],
      sent: counts[3], replied: counts[4], optedOut: counts[5],
    };
  },
});

export const recordReply = internalMutation({
  args: { gmailMessageId: v.string(), gmailThreadId: v.string(), from: v.string(), optedOut: v.boolean() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const prior = await ctx.db.query("outreach_inbound")
      .withIndex("by_gmailMessageId", (q) => q.eq("gmailMessageId", args.gmailMessageId)).unique();
    if (prior) return false;
    const row = await ctx.db.query("outreach")
      .withIndex("by_gmailThreadId", (q) => q.eq("gmailThreadId", args.gmailThreadId)).unique();
    if (!row?.email || row.email !== args.from.toLowerCase() ||
      (row.status !== "SENT" && row.status !== "REPLIED")) return false;
    await ctx.db.insert("outreach_inbound", {
      gmailMessageId: args.gmailMessageId, outreachId: row._id,
      receivedAt: Date.now(), optedOut: args.optedOut,
    });
    if (args.optedOut) {
      await suppress(ctx, row.email, "reply_opt_out");
      await ctx.db.patch(row._id, { status: "OPTED_OUT" });
    } else {
      await ctx.db.patch(row._id, { status: "REPLIED" });
    }
    return true;
  },
});

export const unsubscribe = internalMutation({
  args: { token: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.token.length < 30) return false;
    const row = await ctx.db.query("outreach")
      .withIndex("by_unsubscribeToken", (q) => q.eq("unsubscribeToken", args.token)).unique();
    if (!row?.email) return false;
    await suppress(ctx, row.email, "link_opt_out");
    await ctx.db.patch(row._id, { status: "OPTED_OUT" });
    return true;
  },
});

async function suppress(
  ctx: MutationCtx,
  email: string,
  reason: string,
) {
  const prior = await ctx.db.query("outreach_suppressions")
    .withIndex("by_email", (q) => q.eq("email", email)).unique();
  if (!prior) await ctx.db.insert("outreach_suppressions", { email, reason });
}

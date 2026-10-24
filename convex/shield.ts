import { internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeUrl, isPublicWebUrl } from "./deterministic";

/**
 * shield.ts — Launch Shield ($29/mo, Whop membership).
 * membership.went_valid  → activateOrRefreshShield
 * membership.went_invalid/expired/canceled → deactivateShield
 * crons.hourly → scanDueShields: deterministic re-scanuls every active member.
 */

const SCAN_INTERVAL_MS = 50 * 60 * 1000; // re-scan at most every ~50 min
const MAX_SCANS_PER_TICK = 5;

export const activateOrRefreshShield = internalMutation({
  args: {
    whopMembershipId: v.string(),
    enrolledUrl: v.string(),
    founderHandleOrEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url = normalizeUrl(args.enrolledUrl);
    if (!isPublicWebUrl(url)) return;

    const existing = await ctx.db
      .query("shield_memberships")
      .withIndex("by_membership", (q) => q.eq("whopMembershipId", args.whopMembershipId))
      .take(1);
    const mine = existing[0];
    if (mine) {
      await ctx.db.patch(mine._id, {
        status: "ACTIVE",
        founderHandleOrEmail: args.founderHandleOrEmail,
      });
    } else {
      await ctx.db.insert("shield_memberships", {
        whopMembershipId: args.whopMembershipId,
        enrolledUrl: url,
        founderHandleOrEmail: args.founderHandleOrEmail,
        status: "ACTIVE",
      });
    }

    // Flip shield state on the member's most recent audit.
    const latest = await ctx.db
      .query("audits")
      .withIndex("by_url", (q) => q.eq("targetUrl", url))
      .order("desc")
      .take(1);
    const target = latest[0];
    if (target) {
      await ctx.db.patch(target._id, {
        payerHasShield: true,
        liveStepLog: [
          ...target.liveStepLog,
          `${new Date().toISOString()} · LAUNCH SHIELD active — unlimited fix-verification re-runs + hourly deterministic re-scans`,
        ],
      });
    }
  },
});

export const deactivateShield = internalMutation({
  args: { whopMembershipId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("shield_memberships")
      .withIndex("by_membership", (q) => q.eq("whopMembershipId", args.whopMembershipId))
      .take(1);
    const mine = rows;
    for (const m of mine) {
      await ctx.db.patch(m._id, { status: "CANCELED" });
      const latest = await ctx.db
        .query("audits")
        .withIndex("by_url", (q) => q.eq("targetUrl", m.enrolledUrl))
        .order("desc")
        .take(1);
      const audit = latest[0];
      if (audit && audit.payerHasShield) {
        await ctx.db.patch(audit._id, {
          payerHasShield: false,
          liveStepLog: [
            ...audit.liveStepLog,
            `${new Date().toISOString()} · LAUNCH SHIELD ended — badge parked (only renews while membership is live)`,
          ],
        });
      }
    }
  },
});

/** Select eligible rows, then dispatch re-scans (actions can't touch ctx.db). */
export const scanTodo = internalMutation({
  args: {},
  returns: v.array(
    v.object({ membershipId: v.id("shield_memberships"), enrolledUrl: v.string() })
  ),
  handler: async (ctx) => {
    const active = await ctx.db
      .query("shield_memberships")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .take(50);
    const now = Date.now();
    const due = active
      .filter(
        (m) =>
          m.lastShieldScanAt === undefined ||
          now - m.lastShieldScanAt > SCAN_INTERVAL_MS
      )
      .slice(0, MAX_SCANS_PER_TICK);
    for (const m of due) {
      await ctx.db.patch(m._id, { lastShieldScanAt: now });
    }
    return due.map((m) => ({ membershipId: m._id, enrolledUrl: m.enrolledUrl }));
  },
});

export const scanDueShields = internalAction({
  args: {},
  returns: v.object({ triggered: v.number() }),
  handler: async (ctx) => {
    const due = await ctx.runMutation(internal.shield.scanTodo, {});
    let triggered = 0;
    for (const row of due) {
      const auditId = await ctx.runMutation(internal.audits.createInternalRun, {
        targetUrl: row.enrolledUrl,
        source: "SELF_SERVE_URL",
        bypassDedupe: true,
      });
      if (auditId) triggered += 1;
    }
    return { triggered };
  },
});

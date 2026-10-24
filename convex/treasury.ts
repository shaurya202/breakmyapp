import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * treasury.ts — Global Autonomous Company Treasury & Live Ticker.
 * netAutonomousProfit = Whop gross − Whop fees − Terac labor − Solari compute.
 * The Whop dashboard remains the judge-verifiable revenue source of truth;
 * this table mirrors it reactively for the on-page ticker.
 */

export const get = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("company_treasury").first();
    return (
      doc ?? {
        _id: null,
        totalAuditsExecuted: 0,
        totalBugsCaught: 0,
        totalWhopRevenueCents: 0,
        totalWhopFeesCents: 0,
        totalTeracLaborCents: 0,
        totalShipReadyBadgesIssued: 0,
        totalSolariComputeCostCents: 0,
        netAutonomousProfitCents: 0,
      }
    );
  },
});

/**
 * Single bump entrypoint — adds each delta onto the running totals and
 * recomputes netAutonomousProfit in the same transaction (Whop gross − fees −
 * human labor − compute).
 */
export const bumpTreasury = internalMutation({
  args: {
    auditsExecuted: v.optional(v.number()),
    bugsCaught: v.optional(v.number()),
    revenueCents: v.optional(v.number()),
    feeCents: v.optional(v.number()),
    teracCents: v.optional(v.number()),
    solariCents: v.optional(v.number()),
    shipReadyBadges: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("company_treasury").first();

    const totals = {
      totalAuditsExecuted:
        (existing?.totalAuditsExecuted ?? 0) + (args.auditsExecuted ?? 0),
      totalBugsCaught:
        (existing?.totalBugsCaught ?? 0) + (args.bugsCaught ?? 0),
      totalWhopRevenueCents:
        (existing?.totalWhopRevenueCents ?? 0) + (args.revenueCents ?? 0),
      totalWhopFeesCents:
        (existing?.totalWhopFeesCents ?? 0) + (args.feeCents ?? 0),
      totalTeracLaborCents:
        (existing?.totalTeracLaborCents ?? 0) + (args.teracCents ?? 0),
      totalShipReadyBadgesIssued:
        (existing?.totalShipReadyBadgesIssued ?? 0) +
        (args.shipReadyBadges ?? 0),
      totalSolariComputeCostCents:
        (existing?.totalSolariComputeCostCents ?? 0) + (args.solariCents ?? 0),
    };
    const netAutonomousProfitCents =
      totals.totalWhopRevenueCents -
      totals.totalWhopFeesCents -
      totals.totalTeracLaborCents -
      totals.totalSolariComputeCostCents;

    if (!existing) {
      await ctx.db.insert("company_treasury", {
        label: "BreakMyApp Autonomous Treasury",
        ...totals,
        netAutonomousProfitCents,
      });
      return;
    }

    await ctx.db.patch(existing._id, { ...totals, netAutonomousProfitCents });
  },
});

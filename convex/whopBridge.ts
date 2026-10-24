import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { whopFeeCents } from "./deterministic";
import { hasActiveShield } from "./audits";

/**
 * whopBridge.ts — non-Node bridge for whop.ts (files with "use node" can only
 * export actions, so all db-touching primitives live here).
 */

/** Minimal audit facts the checkout funnel guard needs. */
export const getAuditLite = internalQuery({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return null;
    return {
      exists: true as const,
      criticalCount: audit.criticalCount,
      isUnlocked: audit.isUnlocked,
      targetUrl: audit.targetUrl,
      status: audit.status,
      payerHasShield: await hasActiveShield(ctx, audit.targetUrl),
    };
  },
});

/**
 * $9 Full Autopsy paid → grant deliverables + book gross/fee revenue.
 * ONLY called from inside signature-verified webhook handling.
 */
export const applyUnlock = internalMutation({
  args: {
    auditId: v.id("audits"),
    amountCents: v.number(),
    whopPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;
    const prior = await ctx.db.query("whop_payments")
      .withIndex("by_payment", q => q.eq("whopPaymentId", args.whopPaymentId)).unique();
    if (prior) return;
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0) throw new Error("Invalid payment amount");
    await ctx.db.insert("whop_payments", {
      whopPaymentId: args.whopPaymentId, auditId: args.auditId,
      amountCents: args.amountCents, feeCents: whopFeeCents(args.amountCents), refunded: false,
    });

    if (args.whopPaymentId) {
      await ctx.db.patch(args.auditId, {
        liveStepLog: [
          ...audit.liveStepLog,
          `${new Date().toISOString()} · Whop payment ${args.whopPaymentId} confirmed ($${(
            args.amountCents / 100
          ).toFixed(2)})`,
        ],
      });
    }

    await ctx.runMutation(internal.audits.grantUnlock, {
      auditId: args.auditId,
      whopSessionId: args.whopPaymentId,
    });

    await ctx.runMutation(internal.treasury.bumpTreasury, {
      revenueCents: args.amountCents,
      feeCents: whopFeeCents(args.amountCents),
    });

    // Human verification is a separate, explicit study flow. A paid unlock
    // must not silently launch a billable Terac panel.
  },
});

/** Refund → revoke the unlock (keeps the honest funnel self-policing). */
export const applyRefund = internalMutation({
  args: {
    auditId: v.id("audits"),
    reason: v.string(),
    whopPaymentId: v.string(),
  },
  handler: async (ctx, args) => {
    const prior = await ctx.db.query("whop_payments")
      .withIndex("by_payment", q => q.eq("whopPaymentId", args.whopPaymentId)).unique();
    if (prior?.refunded) return;
    if (prior && prior.auditId !== args.auditId) throw new Error("Payment audit mismatch");
    if (prior) {
      await ctx.db.patch(prior._id, { refunded: true });
      await ctx.runMutation(internal.treasury.bumpTreasury, { revenueCents: -prior.amountCents });
    } else {
      // Persist a tombstone so an out-of-order success cannot undo a refund.
      await ctx.db.insert("whop_payments", {
        whopPaymentId: args.whopPaymentId, auditId: args.auditId,
        amountCents: 0, feeCents: 0, refunded: true,
      });
    }
    const other = await ctx.db.query("whop_payments")
      .withIndex("by_audit_and_refunded", q => q.eq("auditId", args.auditId).eq("refunded", false)).first();
    if (other) return;
    await ctx.runMutation(internal.audits.revokeUnlock, {
      auditId: args.auditId,
      reason: args.reason,
    });
  },
});

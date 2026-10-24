"use node";

// whop.ts — Whop Payments integration (FR-4).
//
// Checkout: creates a Whop checkout configuration for the $9 Full Autopsy
// (one-time plan) or the $29/mo Launch Shield (membership plan), carrying
// auditId/targetUrl in metadata. Degraded gracefully when Whop isn't linked —
// returns {configured:false} and never throws at the customer.
//
// Fulfillment: Whop posts signed Standard-Webhooks events; the Convex HTTP
// endpoint hands the raw body into handleWebhook which verify → flip state.
// Money-gating state ONLY flips inside verified webhook handling.

import { env, action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { normalizeUrl, isPublicWebUrl } from "./deterministic";

const WHOP_API = "https://api.whop.com/api/v1";

// Same private-network policy as audits.startFromUrl — public HTTPS only.
const SHIELD_BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?[0-9a-f:]+\]$/,
];

function isShieldProhibitedHost(host: string): boolean {
  const h = host.replace(/^www\./i, "");
  return SHIELD_BLOCKED_HOST_PATTERNS.some((p) => p.test(h));
}

type AuditLite = {
  exists: boolean;
  criticalCount: number;
  isUnlocked: boolean;
  targetUrl: string;
  status: string;
  payerHasShield: boolean;
};

async function whopRequest(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return await fetch(WHOP_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Shared checkout-config creation (audit-attached and standalone shield
 * checkout both land here). Retries with the alternate plan field-shape once;
 * returns whatever purchase URL / session id came back, or nothing on reject.
 */
async function createWhopCheckoutConfig(
  apiKey: string,
  planId: string,
  metadata: Record<string, string>
): Promise<{ rejectedStatus?: number; unreachable?: string; purchaseUrl?: string; sessionId?: string }> {
  try {
    let resp = await whopRequest(apiKey, "/checkout_configurations", {
      method: "POST",
      body: JSON.stringify({ plan_id: planId, metadata }),
    });
    let payload: any = resp.ok
      ? await resp.json().catch(() => undefined)
      : undefined;

    // Some Whop API versions field-shape the plan reference differently;
    // retry once with planId if the payload was rejected.
    if (!resp.ok) {
      resp = await whopRequest(apiKey, "/checkout_configurations", {
        method: "POST",
        body: JSON.stringify({ planId, metadata }),
      });
      if (resp.ok) {
        payload = await resp.json().catch(() => undefined);
      }
    }

    const purchaseUrl: string | undefined =
      payload?.purchase_url ??
      payload?.checkout_config?.purchase_url ??
      payload?.data?.purchase_url;
    const sessionId: string | undefined =
      payload?.id ?? payload?.checkout_config?.id ?? payload?.data?.id;

    if (resp.ok && (purchaseUrl || sessionId)) {
      return {
        ...(purchaseUrl ? { purchaseUrl } : {}),
        ...(sessionId ? { sessionId } : {}),
      };
    }
    return { rejectedStatus: resp.status };
  } catch (e) {
    return { unreachable: e instanceof Error ? e.message : String(e) };
  }
}

/** Public: the report page calls this when the founder clicks Unlock. */
export const createCheckoutSession = action({
  args: {
    auditId: v.id("audits"),
    tier: v.union(v.literal("FULL_AUTOPSY"), v.literal("SHIELD")),
  },
  returns: v.object({
    configured: v.boolean(),
    purchaseUrl: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    planId: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const apiKey = env.WHOP_API_KEY;
    const planId =
      args.tier === "FULL_AUTOPSY"
        ? env.WHOP_PLAN_ID_FULL_AUTOPSY
        : env.WHOP_PLAN_ID_SHIELD;

    if (!apiKey || !apiKey.trim()) {
      return {
        configured: false,
        message: "Whop not linked yet — payments disabled in this environment.",
      };
    }

    const audit: AuditLite | null = await ctx.runQuery(internal.whopBridge.getAuditLite, {
      auditId: args.auditId,
    });
    if (!audit || !audit.exists) {
      return { configured: false, message: "Audit not found." };
    }
    if (audit.status !== "COMPLETED") {
      return { configured: false, message: "Wait for the audit to finish before checkout." };
    }

    // Honest funnel: the $9 unlock is only sold when it demonstrates findings.
    if (args.tier === "FULL_AUTOPSY") {
      if (audit.criticalCount === 0) {
        return {
          configured: false,
          message:
            "Nothing to autopsy on this run — Full Autopsy is disabled for clean reports.",
        };
      }
      if (audit.isUnlocked || audit.payerHasShield) {
        return { configured: false, message: "Already unlocked." };
      }
    } else if (audit.payerHasShield) {
      return { configured: false, message: "Launch Shield already active for this URL." };
    }

    if (!planId) {
      return {
        configured: false,
        message:
          "Whop plan not linked yet (create the plan in the Whop dashboard and set WHOP_PLAN_ID_*).",
      };
    }

    const metadata = {
      auditId: String(args.auditId),
      targetUrl: audit.targetUrl,
      tier: args.tier === "FULL_AUTOPSY" ? "autopsy_9" : "shield_29",
      app: "BreakMyApp",
    };

    const cfg = await createWhopCheckoutConfig(apiKey, planId, metadata);

    if (cfg.unreachable) {
      return {
        configured: false,
        message: `Whop unreachable: ${cfg.unreachable}`,
      };
    }
    if (cfg.purchaseUrl || cfg.sessionId) {
      await ctx.runMutation(internal.audits.setWhopCheckout, {
        auditId: args.auditId,
        ...(cfg.sessionId ? { sessionId: cfg.sessionId } : {}),
        ...(cfg.purchaseUrl ? { checkoutUrl: cfg.purchaseUrl } : {}),
      });
      return {
        configured: true,
        ...(cfg.purchaseUrl ? { purchaseUrl: cfg.purchaseUrl } : {}),
        ...(cfg.sessionId ? { sessionId: cfg.sessionId } : {}),
        planId,
      };
    }
    return {
      configured: false,
      message: `Whop rejected the request (${cfg.rejectedStatus ?? "unknown"}).`,
    };
  },
});

/**
 * Public: Launch Shield checkout without an audit row. The landing page calls
 * this with the URL to protect; the Whop checkout link carries targetUrl in
 * metadata, so the signed `membership.went_valid` webhook can activate the
 * shield on exactly that URL. Same trust path as the audit-attached checkout:
 * the client only ever opens a Whop-hosted link, never posts money state.
 */
export const createShieldCheckout = action({
  args: { targetUrl: v.string() },
  returns: v.object({
    configured: v.boolean(),
    purchaseUrl: v.optional(v.string()),
    message: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const apiKey = env.WHOP_API_KEY;
    const planId = env.WHOP_PLAN_ID_SHIELD;

    if (!apiKey || !apiKey.trim()) {
      return {
        configured: false,
        message: "Whop not linked yet — payments disabled in this environment.",
      };
    }
    if (!planId) {
      return {
        configured: false,
        message:
          "Whop plan not linked yet (create the Launch Shield plan in the Whop dashboard and set WHOP_PLAN_ID_SHIELD).",
      };
    }

    const normalized = normalizeUrl(args.targetUrl);
    let host = "";
    try {
      host = new URL(normalized).hostname;
    } catch {
      return { configured: false, message: "That doesn't look like a URL. Paste a full web address." };
    }
    if (!isPublicWebUrl(normalized) || isShieldProhibitedHost(host)) {
      return {
        configured: false,
        message: "Only public web URLs can be protected (no localhost / private IPs).",
      };
    }

    const metadata = {
      targetUrl: normalized,
      tier: "shield_29",
      app: "BreakMyApp",
    };

    const cfg = await createWhopCheckoutConfig(apiKey, planId, metadata);

    if (cfg.unreachable) {
      return {
        configured: false,
        message: `Whop unreachable: ${cfg.unreachable}`,
      };
    }
    if (cfg.purchaseUrl) {
      return { configured: true, purchaseUrl: cfg.purchaseUrl };
    }
    return {
      configured: false,
      message: `Whop rejected the request (${cfg.rejectedStatus ?? "unknown"}).`,
    };
  },
});

// ---------------------------------------------------------------------------
// Webhook handling (Standard Webhooks-signed)
// ---------------------------------------------------------------------------

function pickHeader(headers: Record<string, string>, name: string): string {
  return headers[name.toLowerCase()] ?? "";
}

export const handleWebhook = internalAction({
  args: {
    body: v.bytes(),
    headers: v.record(v.string(), v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    handled: v.optional(v.string()),
    ignored: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { Webhook } = await import("standardwebhooks");
    const secret = env.WHOP_WEBHOOK_SECRET;
    if (!secret || !secret.trim()) {
      return { ok: false, ignored: "whop_webhook_secret_not_configured" };
    }

    const payloadText = Buffer.from(args.body).toString("utf8");
    const webhookId = pickHeader(args.headers, "webhook-id");
    const webhookTimestamp = pickHeader(args.headers, "webhook-timestamp");
    const webhookSignature = pickHeader(args.headers, "webhook-signature");
    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return { ok: false, ignored: "missing_webhook_headers" };
    }

    try {
      const secretB64 = Buffer.from(secret, "utf8").toString("base64");
      const wh = new Webhook(secretB64);
      wh.verify(payloadText, {
        "webhook-id": webhookId,
        "webhook-timestamp": webhookTimestamp,
        "webhook-signature": webhookSignature,
      });
    } catch {
      return { ok: false, ignored: "invalid_signature" };
    }

    // Signature is verified — the body is now trusted.
    let event: { type?: string; data?: any } = {};
    try {
      event = JSON.parse(payloadText);
    } catch {
      return { ok: false, ignored: "unparseable_payload" };
    }
    const type = String(event.type ?? "unknown");
    const data = event?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, ignored: "invalid_event_data" };
    }
    const metadata = typeof data.metadata === "object" && data.metadata ? data.metadata : {};
    const rawMetaAuditId: unknown = metadata.auditId ?? metadata.audit_id;
    const metaAuditId: string | undefined =
      typeof rawMetaAuditId === "string"
        ? rawMetaAuditId
        : typeof rawMetaAuditId === "number"
          ? String(rawMetaAuditId)
          : undefined;

    const isMembershipActivate =
      type === "membership.went_valid" ||
      type === "membership.activated" ||
      type === "membership.renewed";
    const isMembershipDeactivate =
      type === "membership.went_invalid" ||
      type === "membership.expired" ||
      type === "membership.canceled" ||
      type === "membership.cancelled" ||
      type === "membership.deactivated" ||
      type === "membership.deleted";
    const isRefund =
      type === "payment.refunded" ||
      type === "payment.refund" ||
      type === "refund.created" ||
      type === "refund.succeeded";
    const isPaymentSuccess =
      type === "payment.succeeded" || type === "payment.completed";

    switch (true) {
      case isPaymentSuccess: {
        if (!metaAuditId) return { ok: true, ignored: "payment_no_audit_metadata" };
        const planId = typeof data.plan === "string" ? data.plan : data.plan?.id;
        if (!env.WHOP_PLAN_ID_FULL_AUTOPSY || planId !== env.WHOP_PLAN_ID_FULL_AUTOPSY) {
          return { ok: true, ignored: "payment_not_autopsy_plan" };
        }
        if (typeof data.id !== "string" || !data.id) return { ok: false, ignored: "payment_missing_id" };
        const revenueCents = parseAmountCents(data);
        if (revenueCents <= 0) return { ok: false, ignored: "payment_invalid_amount" };
        await ctx.runMutation(internal.whopBridge.applyUnlock, {
          auditId: metaAuditId as any,
          amountCents: revenueCents,
          whopPaymentId: data.id,
        });
        return { ok: true, handled: `unlock ${metaAuditId} ($${(revenueCents / 100).toFixed(2)})` };
      }
      case isRefund: {
        if (!metaAuditId) return { ok: true, ignored: "refund_no_audit_metadata" };
        const paymentId = typeof data.payment === "string" ? data.payment : data.payment?.id ?? data.id;
        if (typeof paymentId !== "string" || !paymentId) return { ok: false, ignored: "refund_missing_payment_id" };
        await ctx.runMutation(internal.whopBridge.applyRefund, {
          auditId: metaAuditId as any,
          reason: "Whop refund (unlock sold to a refunded payment)",
          whopPaymentId: paymentId,
        });
        return { ok: true, handled: `refund revoke ${metaAuditId}` };
      }
      case isMembershipActivate: {
        const planId = typeof data.plan === "string" ? data.plan : data.plan?.id;
        if (!env.WHOP_PLAN_ID_SHIELD || planId !== env.WHOP_PLAN_ID_SHIELD) {
          return { ok: true, ignored: "membership_not_shield_plan" };
        }
        const enrolledUrl =
          (typeof metadata.targetUrl === "string" && metadata.targetUrl) ||
          (typeof metadata.enrolledUrl === "string" && metadata.enrolledUrl) ||
          "";
        const membershipId = typeof data?.id === "string" ? data.id : "";
        if (!membershipId || !enrolledUrl) {
          return { ok: true, ignored: "membership_missing_url_metadata" };
        }
        await ctx.runMutation(internal.shield.activateOrRefreshShield, {
          whopMembershipId: membershipId,
          enrolledUrl,
          founderHandleOrEmail:
            typeof data?.user?.email === "string" ? data.user.email : undefined,
        });
        return { ok: true, handled: `shield active ${enrolledUrl}` };
      }
      case isMembershipDeactivate: {
        const membershipId = typeof data?.id === "string" ? data.id : "";
        if (!membershipId) return { ok: true, ignored: "membership_no_id" };
        await ctx.runMutation(internal.shield.deactivateShield, {
          whopMembershipId: membershipId,
        });
        return { ok: true, handled: `shield inactive ${membershipId}` };
      }
      default:
        return { ok: true, ignored: `unhandled ${type}` };
    }
  },
});

/** Whop total is a major-unit amount, including the versioned {amount} shape. */
export function parseAmountCents(data: any): number {
  const explicitCents = data?.amount_cents;
  if (typeof explicitCents === "number") return Number.isSafeInteger(explicitCents) && explicitCents > 0 ? explicitCents : 0;
  const raw = data?.total?.amount ?? data?.total ?? data?.final_amount ?? data?.amount;
  if (typeof raw !== "number" && typeof raw !== "string") return 0;
  const cents = Math.round(Number(raw) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
}

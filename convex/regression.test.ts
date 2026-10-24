/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import { Webhook } from "standardwebhooks";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { sha256Hex, normalizeUrl, isPublicWebUrl, SUITE_VERSION } from "./deterministic";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const finding = { category: "CONSOLE_CRASH" as const, severity: "CRITICAL" as const,
  title: "Checkout crashes", reproductionSteps: "Click checkout", rawErrorLog: "secret trace",
  aiSuggestedPatch: "private patch" };
const setup = () => convexTest(schema, modules);
type Test = ReturnType<typeof setup>;
async function create(t: Test, url = "https://example.com") {
  return (await t.mutation(api.audits.startFromUrl, { targetUrl: url })).auditId;
}
async function complete(t: Test, auditId: Id<"audits">, findings = [finding], isRerun = false) {
  await t.mutation(internal.audits.completeRun, { auditId, findings,
    determinismHash: "hash", screenshotDescriptors: [], isRerun });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("deterministic identity and URL validation", () => {
  it.each([0, 3, 54, 55, 56, 63, 64, 119, 120, 128, 500])("matches SHA-256 for %i bytes", n => {
    const value = "x".repeat(n);
    expect(sha256Hex(value)).toBe(createHash("sha256").update(value).digest("hex"));
  });
  it("normalizes tracking and rejects credentials and non-web schemes", () => {
    expect(normalizeUrl("HTTP://Example.com/?utm_source=abc#hash")).toBe("https://example.com");
    expect(normalizeUrl("https://user:pass@example.com")).toBe("");
    expect(normalizeUrl("javascript:alert(1)")).toBe("");
  });
  it.each(["http://127.1", "https://2130706433", "https://10.0.0.1", "https://100.64.0.1",
    "https://169.254.169.254", "https://localhost.", "https://foo.local", "https://[::1]", "https://224.0.0.1"])("blocks %s", url => {
    expect(isPublicWebUrl(normalizeUrl(url))).toBe(false);
  });
});

describe("audit and report lifecycle", () => {
  it("only claims completed, sourced, unsuppressed prospects and honors opt-outs", async () => {
    const t = setup();
    const auditId = await t.mutation(internal.audits.createInternalRun, {
      targetUrl: "https://launch.example.com",
      source: "EXA_AUTONOMOUS_HUNT",
    });
    expect(auditId).not.toBeNull();
    const claim = () => t.mutation(internal.outreachBridge.claimNext, {
      token: "a".repeat(32), messageId: "<outreach-test@example.com>",
    });
    expect(await claim()).toBeNull();
    await complete(t, auditId!);
    expect(await claim()).toBeNull();
    await t.mutation(internal.hunterBridge.patchEnrichment, {
      auditId: auditId!, agentRunId: "agent_run_test",
      founderContact: "Founder@Example.com",
    });
    const selected = await claim();
    expect(selected).toMatchObject({ auditId, email: "founder@example.com" });
    expect(await claim()).toBeNull();
    await t.mutation(internal.outreachBridge.markSent, {
      outreachId: selected!.outreachId,
      gmailMessageId: "gmail_sent_1", gmailThreadId: "gmail_thread_1",
    });
    expect(await t.mutation(internal.outreachBridge.recordReply, {
      gmailMessageId: "gmail_reply_1", gmailThreadId: "gmail_thread_1",
      from: "founder@example.com", optedOut: true,
    })).toBe(true);
    expect(await t.mutation(internal.outreachBridge.recordReply, {
      gmailMessageId: "gmail_reply_1", gmailThreadId: "gmail_thread_1",
      from: "founder@example.com", optedOut: true,
    })).toBe(false);
  });
  it("requires POST to unsubscribe and rejects an invalid token", async () => {
    const t = setup();
    expect((await t.fetch("/outreach/unsubscribe?token=" + "b".repeat(32))).status).toBe(200);
    expect((await t.fetch("/outreach/unsubscribe", {
      method: "POST", body: "token=short",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })).status).toBe(400);
    expect((await t.fetch("/outreach/unsubscribe", {
      method: "POST", body: `token=${"b".repeat(32)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })).status).toBe(404);
  });
  it("suppresses future prospect contact after a valid unsubscribe", async () => {
    const t = setup();
    const prepare = async (url: string) => {
      const auditId = await t.mutation(internal.audits.createInternalRun, {
        targetUrl: url, source: "EXA_AUTONOMOUS_HUNT",
      });
      await complete(t, auditId!);
      await t.mutation(internal.hunterBridge.patchEnrichment, {
        auditId: auditId!, agentRunId: `agent_run_${url.length}`,
        founderContact: "founder@example.com",
      });
    };
    await prepare("https://first.example.com");
    const token = "c".repeat(32);
    expect(await t.mutation(internal.outreachBridge.claimNext, {
      token, messageId: "<first@example.com>",
    })).not.toBeNull();
    expect((await t.fetch("/outreach/unsubscribe", {
      method: "POST", body: `token=${token}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })).status).toBe(200);
    await prepare("https://second.example.com");
    expect(await t.mutation(internal.outreachBridge.claimNext, {
      token: "d".repeat(32), messageId: "<second@example.com>",
    })).toBeNull();
  });
  it("sends one Gmail message for a qualified audit and records its receipt", async () => {
    vi.stubEnv("OUTREACH_ENABLED", "true");
    vi.stubEnv("GMAIL_CLIENT_ID", "client_test");
    vi.stubEnv("GMAIL_CLIENT_SECRET", "secret_test");
    vi.stubEnv("GMAIL_REFRESH_TOKEN", "refresh_test");
    vi.stubEnv("GMAIL_SENDER_EMAIL", "shauryasites@gmail.com");
    vi.stubEnv("APP_BASE_URL", "https://breakmyapp.example.com");
    vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
    const calls: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      calls.push({ url: input, body: String(init.body ?? "") });
      if (input.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "access_test" }), { status: 200 });
      }
      if (input.endsWith("/messages/send")) {
        return new Response(JSON.stringify({ id: "gmail_sent", threadId: "gmail_thread" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${input}`);
    }));
    const t = setup();
    const auditId = await t.mutation(internal.audits.createInternalRun, {
      targetUrl: "https://launch.example.com", source: "EXA_AUTONOMOUS_HUNT",
    });
    await complete(t, auditId!);
    await t.mutation(internal.hunterBridge.patchEnrichment, {
      auditId: auditId!, agentRunId: "agent_run_test", founderContact: "founder@example.com",
    });
    expect(await t.action(internal.outreachSender.sendNext, {})).toMatchObject({ sent: true, auditId });
    const sent = calls.find((call) => call.url.endsWith("/messages/send"));
    expect(sent).toBeDefined();
    const mime = Buffer.from(JSON.parse(sent!.body).raw, "base64url").toString("utf8");
    expect(mime).toContain("To: founder@example.com");
    expect(mime).toContain(`https://breakmyapp.example.com/report/${auditId}`);
    expect(mime).toContain("https://test.convex.site/outreach/unsubscribe?token=");
    expect(await t.action(internal.outreachSender.sendNext, {})).toMatchObject({ sent: false });
    expect(calls.filter((call) => call.url.endsWith("/messages/send"))).toHaveLength(1);
  });
  it("caps autonomous audits at five in a rolling 24-hour window", async () => {
    const t = setup();
    for (let n = 0; n < 5; n++) {
      expect(await t.mutation(internal.audits.createInternalRun, {
        targetUrl: `https://launch${n}.example.com`,
        source: "EXA_AUTONOMOUS_HUNT",
      })).not.toBeNull();
    }
    expect(await t.query(internal.hunterBridge.autonomousAuditAllowance, { now: Date.now() })).toBe(0);
    expect(await t.mutation(internal.audits.createInternalRun, {
      targetUrl: "https://launch5.example.com",
      source: "EXA_AUTONOMOUS_HUNT",
    })).toBeNull();
  });
  it("claims Exa enrichment only once per audit", async () => {
    const t = setup();
    const auditId = await t.mutation(internal.audits.createInternalRun, {
      targetUrl: "https://launch.example.com",
      source: "EXA_AUTONOMOUS_HUNT",
    });
    expect(auditId).not.toBeNull();
    expect(await t.mutation(internal.hunterBridge.claimEnrichment, { auditId: auditId! })).toBe(true);
    expect(await t.mutation(internal.hunterBridge.claimEnrichment, { auditId: auditId! })).toBe(false);
  });
  it("reuses queued runs and bounds invalid recent limits", async () => {
    const t = setup();
    const id = await create(t);
    expect(await t.mutation(api.audits.startFromUrl, { targetUrl: "example.com/" })).toEqual({ auditId: id, reused: true });
    expect(await t.query(api.audits.listRecent, { limit: -5 })).toHaveLength(1);
  });
  it("masks paid deliverables and refuses unpaid reruns", async () => {
    const t = setup(); const id = await create(t);
    await complete(t, id, [finding, { ...finding, title: "Second finding" }]);
    const report = await t.query(api.audits.getReport, { auditId: id });
    expect(report!.findings[0].locked).toBe(false);
    expect(report!.findings[1]).toMatchObject({ locked: true, rawErrorLog: null, aiSuggestedPatch: null });
    await expect(t.mutation(api.audits.requestRerun, { auditId: id })).rejects.toThrow("require");
  });
  it("books a payment once, queues one rerun, and revokes a regressed badge", async () => {
    const t = setup(); const id = await create(t); await complete(t, id);
    const payment = { auditId: id, amountCents: 999, whopPaymentId: "pay_once" };
    await t.mutation(internal.whopBridge.applyUnlock, payment);
    await t.mutation(internal.whopBridge.applyUnlock, payment);
    expect((await t.query(api.treasury.get, {})).totalWhopRevenueCents).toBe(999);
    await t.mutation(api.audits.requestRerun, { auditId: id });
    await expect(t.mutation(api.audits.requestRerun, { auditId: id })).rejects.toThrow("not finished");
    await complete(t, id, [], true);
    expect((await t.query(api.audits.getReport, { auditId: id }))!.audit.shipReadyBadgeIssued).toBe(true);
    await complete(t, id, [finding], true);
    expect((await t.query(api.audits.getReport, { auditId: id }))!.audit.shipReadyBadgeIssued).toBe(false);
  });
  it("refunds once and prevents delayed payment success from restoring access", async () => {
    const t = setup(); const id = await create(t); await complete(t, id);
    await t.mutation(internal.whopBridge.applyUnlock, { auditId: id, amountCents: 999, whopPaymentId: "pay_refund" });
    const refund = { auditId: id, reason: "refund", whopPaymentId: "pay_refund" };
    await t.mutation(internal.whopBridge.applyRefund, refund);
    await t.mutation(internal.whopBridge.applyRefund, refund);
    await t.mutation(internal.whopBridge.applyUnlock, { auditId: id, amountCents: 999, whopPaymentId: "pay_refund" });
    expect((await t.query(api.treasury.get, {})).totalWhopRevenueCents).toBe(0);
    expect((await t.query(api.audits.getReport, { auditId: id }))!.audit.isUnlocked).toBe(false);
    await t.mutation(internal.whopBridge.applyRefund, { ...refund, whopPaymentId: "pay_late" });
    await t.mutation(internal.whopBridge.applyUnlock, { auditId: id, amountCents: 999, whopPaymentId: "pay_late" });
    expect((await t.query(api.audits.getReport, { auditId: id }))!.audit.isUnlocked).toBe(false);
  });
  it("applies Shield access to old and new audits and revokes all after cancellation", async () => {
    const t = setup(); const oldId = await create(t); await complete(t, oldId);
    await t.mutation(internal.shield.activateOrRefreshShield, { whopMembershipId: "mem_test", enrolledUrl: "example.com" });
    const newId = (await t.mutation(api.audits.startFromUrl, { targetUrl: "example.com", bypassDedupe: true })).auditId;
    await complete(t, newId);
    for (const auditId of [oldId, newId]) {
      expect((await t.query(api.audits.getReport, { auditId }))!.audit.payerHasShield).toBe(true);
    }
    await t.mutation(internal.shield.deactivateShield, { whopMembershipId: "mem_test" });
    for (const auditId of [oldId, newId]) {
      expect((await t.query(api.audits.getReport, { auditId }))!.audit.payerHasShield).toBe(false);
      await expect(t.mutation(api.audits.requestRerun, { auditId })).rejects.toThrow("require");
    }
  });
  it("does not issue Ship-Ready or sell an autopsy on a first clean run", async () => {
    const t = setup(); const id = await create(t); await complete(t, id, []);
    expect((await t.query(api.audits.getReport, { auditId: id }))!.audit).toMatchObject({
      unlockEnabled: false, shipReadyBadgeIssued: false, suiteVersion: SUITE_VERSION });
  });
});

describe("HTTP and signed payment fulfillment", () => {
  it("serves health and refuses unsigned webhooks", async () => {
    const t = setup();
    expect((await (await t.fetch("/health")).json()).suite).toBe(SUITE_VERSION);
    expect((await t.fetch("/whop/webhook", { method: "POST", body: "{}" })).status).toBe(401);
  });
  it("verifies the raw Whop secret, handles signed retries once, rejects forged signatures", async () => {
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "ws_test_secret_for_qa");
    vi.stubEnv("WHOP_PLAN_ID_FULL_AUTOPSY", "plan_autopsy");
    const t = setup(); const id = await create(t); await complete(t, id);
    const body = JSON.stringify({ type: "payment.succeeded", data: { id: "pay_signed", total: "9.99",
      plan: { id: "plan_autopsy" }, metadata: { auditId: id } } });
    const date = new Date(); const msgId = "msg_test";
    const signature = new Webhook("ws_test_secret_for_qa", { format: "raw" }).sign(msgId, date, body);
    const headers = { "Webhook-Id": msgId, "Webhook-Timestamp": String(Math.floor(date.getTime() / 1000)), "Webhook-Signature": signature };
    for (let i = 0; i < 2; i++) expect((await t.fetch("/whop/webhook", { method: "POST", headers, body })).status).toBe(200);
    expect((await t.query(api.treasury.get, {})).totalWhopRevenueCents).toBe(999);
    expect((await t.fetch("/whop/webhook", { method: "POST", headers, body: body + " " })).status).toBe(401);
  });
});

describe("Terac verified human verification (FR-6)", () => {
  it("records dispatched panels, enforces status flow, and updates treasury with human labor", async () => {
    const t = setup();
    const id = await create(t);
    await complete(t, id, [finding]);

    const reportBefore = await t.query(api.audits.getReport, { auditId: id });
    const findingId = reportBefore!.findings[0]._id as Id<"findings">;

    // Dispatch panel
    await t.mutation(internal.teracBridge.recordDispatchedPanels, {
      auditId: id,
      projectId: "proj_breakmyapp_verification",
      dispatched: [
        {
          findingId,
          opportunityId: "opp_repro_1",
          taskKind: "FINDING_REPRO",
          panelSize: 3,
          laborCostCents: 120,
        },
      ],
    });

    const reportDispatched = await t.query(api.audits.getReport, { auditId: id });
    expect(reportDispatched!.audit.teracPanelStatus).toBe("DISPATCHED");
    expect(reportDispatched!.findings[0].teracVerdict).toBe("PENDING");

    // Pending verifications
    const pendings = await t.query(internal.teracBridge.getPendingVerifications, {});
    expect(pendings).toHaveLength(1);
    expect(pendings[0].opportunityId).toBe("opp_repro_1");

    // Complete verification with 3/3 reproductions (CONFIRMED)
    await t.mutation(internal.teracBridge.applyVerificationResult, {
      verificationId: pendings[0]._id,
      status: "CONFIRMED",
      reproducedCount: 3,
      laborCostCents: 120,
      humanNotes: ["Reproduced on mobile", "Reproduced on desktop", "Confirmed"],
    });

    const reportConfirmed = await t.query(api.audits.getReport, { auditId: id });
    expect(reportConfirmed!.audit.teracPanelStatus).toBe("CONFIRMED");
    expect(reportConfirmed!.findings[0].teracVerdict).toBe("TERAC_VERIFIED");
    expect(reportConfirmed!.findings[0].teracReproducedCount).toBe(3);

    // Treasury booked labor cost
    const treasury = await t.query(api.treasury.get, {});
    expect(treasury.totalTeracLaborCents).toBe(120);
    expect(treasury.netAutonomousProfitCents).toBe(-120);
  });

  it("marks finding and audit as CONTESTED when reproduction fails (<2/3)", async () => {
    const t = setup();
    const id = await create(t);
    await complete(t, id, [finding]);

    const reportBefore = await t.query(api.audits.getReport, { auditId: id });
    const findingId = reportBefore!.findings[0]._id as Id<"findings">;

    await t.mutation(internal.teracBridge.recordDispatchedPanels, {
      auditId: id,
      projectId: "proj_breakmyapp_verification",
      dispatched: [
        {
          findingId,
          opportunityId: "opp_repro_contested",
          taskKind: "FINDING_REPRO",
          panelSize: 3,
          laborCostCents: 120,
        },
      ],
    });

    const pendings = await t.query(internal.teracBridge.getPendingVerifications, {});
    const target = pendings.find((p) => p.opportunityId === "opp_repro_contested")!;

    await t.mutation(internal.teracBridge.applyVerificationResult, {
      verificationId: target._id,
      status: "CONTESTED",
      reproducedCount: 1,
      laborCostCents: 120,
      humanNotes: ["Could not reproduce"],
    });

    const reportContested = await t.query(api.audits.getReport, { auditId: id });
    expect(reportContested!.audit.teracPanelStatus).toBe("CONTESTED");
    expect(reportContested!.findings[0].teracVerdict).toBe("TERAC_CONTESTED");
    expect(reportContested!.findings[0].teracReproducedCount).toBe(1);
  });
});

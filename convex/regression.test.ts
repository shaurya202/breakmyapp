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
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

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

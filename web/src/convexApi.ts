/**
 * convexApi — single bridge from every src file into the Convex backend.
 * Lives FLAT in src/ so its `../../convex/*` relative imports resolve at the
 * repo-root depth (two levels up from a flat src file); nested component dirs
 * reach it via `../convexApi` / `../../convexApi`.
 *
 * Decoupling note: the generated `_generated/api.d.ts` currently transitively
 * imports in-flight sibling modules being written by other agents
 * (solariRunner.ts / exaHunter.ts), whose own compile diagnostics bleed into
 * any program that loads it. Per the committed API contract this file instead
 * wraps `anyApi` from "convex/server" — the same runtime proxy objects the
 * generated `api.js` produces — with declared signatures pinned exactly to the
 * contract (audits.startFromUrl / getReport / listRecent / requestRerun,
 * treasury.get, whop.createCheckoutSession). `hexSeed`/deterministic helpers
 * DO import the real pure file. When _generated regenerates clean, the
 * acceptance-used real import can be restored from this one file alone.
 */
// @ts-ignore -- runtime shim is @ts-nocheck; only its value matters here.
import { api as generatedApi } from "./convexRuntime";
import type { FunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";

import "../../convex/deterministic";
export { hexSeed } from "../../convex/deterministic";
export type { Id };

// ---- Contract shapes --------------------------------------------------------

export type AuditStatus =
  | "QUEUED"
  | "EXA_ENRICHING"
  | "DETERMINISTIC_RUN_RUNNING"
  | "SANDBOX_ANALYZING"
  | "COMPLETED"
  | "FAILED";

export type FindingCategory =
  | "CONSOLE_CRASH"
  | "NETWORK_500_ERROR"
  | "MOBILE_OVERFLOW"
  | "BROKEN_DEAD_CTA"
  | "EXPOSED_SECRET_OR_HEADER";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM";

export type TeracPanelStatus =
  | "NOT_DISPATCHED"
  | "DISPATCHED"
  | "CONFIRMED"
  | "CONTESTED";

export type DeliverableCounts = {
  reproSequences: number;
  screenshots: number;
  patchDiffs: number;
  errorLogs: number;
};

export type AuditReport = {
  id: Id<"audits">;
  targetUrl: string;
  projectName: string;
  source: "EXA_AUTONOMOUS_HUNT" | "SELF_SERVE_URL";
  status: AuditStatus;
  liveStepLog: string[];
  runSeed: number;
  suiteVersion: string;
  determinismHash: string | null;
  solariBrowserBootMs: number | null;
  solariSandboxBootMs: number | null;
  totalBugsFound: number;
  criticalCount: number;
  healthScore: number;
  isUnlocked: boolean;
  payerHasShield: boolean;
  verificationRunsRemaining: number;
  shipReadyBadgeIssued: boolean;
  unlockPriceCents: number;
  whopCheckoutUrl: string | null;
  teracPanelStatus: TeracPanelStatus;
  runCompleted: boolean;
  unlockEnabled: boolean;
  deliverableCounts: DeliverableCounts;
  rerunDeadline: number | null;
  errorMessage: string | null;
  createdAt: number;
  runFinishedAt: number | null;
  exaContextSummary: string | null;
  grounding: string[] | null;
};

export type FindingRow = {
  _id: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  isFreePreview: boolean;
  locked: boolean;
  reproductionSteps: string;
  rawErrorLog: string | null;
  aiSuggestedPatch: string | null;
  deterministicPayload: string | null;
  screenshotUrl: string | null;
  patchReviewStatus: string | null;
};

export type GetReportResult =
  | { audit: AuditReport; findings: FindingRow[] }
  | null;

export type RecentRun = {
  _id: Id<"audits">;
  projectName: string;
  targetUrl: string;
  status: AuditStatus;
  source: "EXA_AUTONOMOUS_HUNT" | "SELF_SERVE_URL";
  healthScore: number;
  totalBugsFound: number;
  criticalCount: number;
  shipReadyBadgeIssued: boolean;
  _creationTime: number;
};

export type TreasuryStats = {
  _id?: Id<"company_treasury"> | null;
  totalAuditsExecuted: number;
  totalBugsCaught: number;
  totalWhopRevenueCents: number;
  totalWhopFeesCents: number;
  totalTeracLaborCents: number;
  totalShipReadyBadgesIssued: number;
  totalSolariComputeCostCents: number;
  netAutonomousProfitCents: number;
};

export type WhopSessionResult = {
  configured: boolean;
  purchaseUrl?: string;
  sessionId?: string;
  planId?: string;
  message?: string;
};


// `generatedApi` is the real, deployed-contract-typed reference the Convex
// codegen produced against the now-clean backend. Using it (instead of the
// `anyApi` proxy) is what makes the client's function paths resolve to the
// server's actual convention -- the proxy produced `treasury/get:get`, which
// the server rejected with "Could not find public function".
type AuditFn = {
  startFromUrl: FunctionReference<
    "mutation",
    "public",
    { targetUrl: string; bypassDedupe?: boolean },
    { auditId: Id<"audits">; reused: boolean }
  >;
  getReport: FunctionReference<
    "query",
    "public",
    { auditId: Id<"audits"> },
    GetReportResult
  >;
  listRecent: FunctionReference<
    "query",
    "public",
    { limit?: number },
    RecentRun[]
  >;
  requestRerun: FunctionReference<
    "mutation",
    "public",
    { auditId: Id<"audits"> },
    { ok: boolean }
  >;
};

type TreasuryFn = {
  get: FunctionReference<"query", "public", {}, TreasuryStats>;
};

type WhopFn = {
  createCheckoutSession: FunctionReference<
    "action",
    "public",
    { auditId: Id<"audits">; tier: "FULL_AUTOPSY" | "SHIELD" },
    WhopSessionResult
  >;
  createShieldCheckout: FunctionReference<
    "action",
    "public",
    { targetUrl: string },
    WhopSessionResult
  >;
};

export const api = generatedApi as unknown as {
  audits: AuditFn;
  treasury: TreasuryFn;
  whop: WhopFn;
};

export const WHOP_CREATE_CHECKOUT_SESSION = generatedApi.whop
  .createCheckoutSession;

export const WHOP_CREATE_SHIELD_CHECKOUT = generatedApi.whop
  .createShieldCheckout;

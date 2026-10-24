import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 1. Master table for every autonomous or self-serve site audit
  audits: defineTable({
    targetUrl: v.string(),
    projectName: v.string(),
    source: v.union(
      v.literal("EXA_AUTONOMOUS_HUNT"),
      v.literal("SELF_SERVE_URL")
    ),
    founderHandleOrEmail: v.optional(v.string()),
    exaContextSummary: v.optional(v.string()),
    exaAgentRunId: v.optional(v.string()),
    grounding: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("QUEUED"),
      v.literal("EXA_ENRICHING"),
      v.literal("DETERMINISTIC_RUN_RUNNING"),
      v.literal("SANDBOX_ANALYZING"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    liveStepLog: v.array(v.string()),

    // Determinism core
    runSeed: v.number(),
    suiteVersion: v.string(),
    determinismHash: v.optional(v.string()),
    solariBrowserBootMs: v.optional(v.number()),
    solariSandboxBootMs: v.optional(v.number()),

    totalBugsFound: v.number(),
    criticalCount: v.number(),
    healthScore: v.number(),

    // Whop paywall state
    isUnlocked: v.boolean(),
    payerHasShield: v.boolean(),
    verificationRunsRemaining: v.number(),
    shipReadyBadgeIssued: v.boolean(),

    whopCheckoutUrl: v.optional(v.string()),
    whopSessionId: v.optional(v.string()),
    unlockPriceCents: v.number(),

    // Verification re-run state (FR-5)
    lastRerunAt: v.optional(v.number()),
    lastRerunHealthScore: v.optional(v.number()),
    lastRerunResolved: v.optional(v.array(v.string())), // finding titles fixed
    lastRerunRegressed: v.optional(v.array(v.string())), // finding titles regressed

    // Terac human verification panel (stays NOT_DISPATCHED until Terac is wired)
    teracPanelStatus: v.union(
      v.literal("NOT_DISPATCHED"),
      v.literal("DISPATCHED"),
      v.literal("CONFIRMED"),
      v.literal("CONTESTED")
    ),
    teracProjectId: v.optional(v.string()),
    teracOpportunityIds: v.optional(v.array(v.string())),

    runStartedAt: v.optional(v.number()),
    runFinishedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_url", ["targetUrl"])
    .index("by_status", ["status"])
    .index("by_unlock", ["isUnlocked"]),

  // 2. Individual bugs, security leaks, and UI breaks found by the deterministic run
  findings: defineTable({
    auditId: v.id("audits"),
    isFreePreview: v.boolean(),
    category: v.union(
      v.literal("CONSOLE_CRASH"),
      v.literal("NETWORK_500_ERROR"),
      v.literal("MOBILE_OVERFLOW"),
      v.literal("BROKEN_DEAD_CTA"),
      v.literal("EXPOSED_SECRET_OR_HEADER")
    ),
    severity: v.union(
      v.literal("CRITICAL"),
      v.literal("HIGH"),
      v.literal("MEDIUM")
    ),
    title: v.string(),
    deterministicPayload: v.optional(v.string()),
    reproductionSteps: v.string(),
    rawErrorLog: v.string(),
    aiSuggestedPatch: v.string(),
    screenshotStorageId: v.optional(v.id("_storage")),

    // Terac human verification stamps (unused until Terac is wired)
    teracVerdict: v.optional(
      v.union(
        v.literal("PENDING"),
        v.literal("TERAC_VERIFIED"),
        v.literal("TERAC_CONTESTED")
      )
    ),
    teracReproducedCount: v.optional(v.number()),
    patchReviewStatus: v.optional(
      v.union(v.literal("PENDING"), v.literal("HUMAN_MERGE_GRADED"))
    ),
  }).index("by_audit", ["auditId"]),

  // 3. Launch Shield membership state (mirrors Whop `membership.*` events)
  shield_memberships: defineTable({
    whopMembershipId: v.string(),
    founderHandleOrEmail: v.optional(v.string()),
    enrolledUrl: v.string(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("LAPSED"),
      v.literal("CANCELED")
    ),
    lastShieldScanAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_url", ["enrolledUrl"])
    .index("by_url_and_status", ["enrolledUrl", "status"])
    .index("by_membership", ["whopMembershipId"]),

  whop_payments: defineTable({
    whopPaymentId: v.string(),
    auditId: v.id("audits"),
    amountCents: v.number(),
    feeCents: v.number(),
    refunded: v.boolean(),
  }).index("by_payment", ["whopPaymentId"])
    .index("by_audit_and_refunded", ["auditId", "refunded"]),

  // 5. Human verification panel results (schema kept per PRD; Terac wiring later)
  terac_verifications: defineTable({
    auditId: v.id("audits"),
    findingId: v.id("findings"),
    opportunityId: v.string(),
    taskKind: v.union(
      v.literal("FINDING_REPRO"),
      v.literal("PATCH_MERGE_GRADE")
    ),
    status: v.union(
      v.literal("DISPATCHED"),
      v.literal("CONFIRMED"),
      v.literal("CONTESTED"),
      v.literal("EXPIRED")
    ),
    panelSize: v.number(),
    reproducedCount: v.number(),
    laborCostCents: v.number(),
    humanNotes: v.optional(v.array(v.string())),
  })
    .index("by_finding", ["findingId"])
    .index("by_audit", ["auditId"])
    .index("by_status", ["status"]),

  // 6. Global Autonomous Company Treasury & Telemetry
  company_treasury: defineTable({
    label: v.optional(v.string()),
    totalAuditsExecuted: v.number(),
    totalBugsCaught: v.number(),
    totalWhopRevenueCents: v.number(),
    totalWhopFeesCents: v.number(),
    totalTeracLaborCents: v.number(),
    totalShipReadyBadgesIssued: v.number(),
    totalSolariComputeCostCents: v.number(),
    netAutonomousProfitCents: v.number(),
  }),
});

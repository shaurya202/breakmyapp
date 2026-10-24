import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * teracBridge.ts — Non-Node database bridge for Terac actions (PRD FR-6).
 * Actions in terac.ts execute external API/MCP requests and delegate database
 * mutations and queries to this file.
 */

export const getAuditForDispatch = internalQuery({
  args: { auditId: v.id("audits") },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return null;

    const findings = await ctx.db
      .query("findings")
      .withIndex("by_audit", (q) => q.eq("auditId", args.auditId))
      .collect();

    return {
      audit,
      findings,
    };
  },
});

export const recordDispatchedPanels = internalMutation({
  args: {
    auditId: v.id("audits"),
    projectId: v.string(),
    dispatched: v.array(
      v.object({
        findingId: v.id("findings"),
        opportunityId: v.string(),
        taskKind: v.union(
          v.literal("FINDING_REPRO"),
          v.literal("PATCH_MERGE_GRADE")
        ),
        panelSize: v.number(),
        laborCostCents: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditId);
    if (!audit) return;

    const opportunityIds = args.dispatched.map((d) => d.opportunityId);

    await ctx.db.patch(args.auditId, {
      teracPanelStatus: "DISPATCHED",
      teracProjectId: args.projectId,
      teracOpportunityIds: opportunityIds,
      liveStepLog: [
        ...audit.liveStepLog,
        `${new Date().toISOString()} · Terac verified human panel dispatched: ${args.dispatched.length} task(s) (${args.dispatched.length * 3} human evaluations queued)`,
      ],
    });

    for (const item of args.dispatched) {
      if (item.taskKind === "FINDING_REPRO") {
        await ctx.db.patch(item.findingId, {
          teracVerdict: "PENDING",
        });
      } else if (item.taskKind === "PATCH_MERGE_GRADE") {
        await ctx.db.patch(item.findingId, {
          patchReviewStatus: "PENDING",
        });
      }

      await ctx.db.insert("terac_verifications", {
        auditId: args.auditId,
        findingId: item.findingId,
        opportunityId: item.opportunityId,
        taskKind: item.taskKind,
        status: "DISPATCHED",
        panelSize: item.panelSize,
        reproducedCount: 0,
        laborCostCents: item.laborCostCents,
        humanNotes: [],
      });
    }
  },
});

export const getPendingVerifications = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("terac_verifications")
      .withIndex("by_status", (q) => q.eq("status", "DISPATCHED"))
      .take(50);
  },
});

export const applyVerificationResult = internalMutation({
  args: {
    verificationId: v.id("terac_verifications"),
    status: v.union(
      v.literal("CONFIRMED"),
      v.literal("CONTESTED"),
      v.literal("EXPIRED")
    ),
    reproducedCount: v.number(),
    laborCostCents: v.number(),
    humanNotes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.verificationId);
    if (!record || record.status !== "DISPATCHED") return;

    await ctx.db.patch(args.verificationId, {
      status: args.status,
      reproducedCount: args.reproducedCount,
      laborCostCents: args.laborCostCents,
      humanNotes: args.humanNotes,
    });

    const finding = await ctx.db.get(record.findingId);
    if (finding) {
      if (record.taskKind === "FINDING_REPRO") {
        await ctx.db.patch(record.findingId, {
          teracVerdict:
            args.status === "CONFIRMED" ? "TERAC_VERIFIED" : "TERAC_CONTESTED",
          teracReproducedCount: args.reproducedCount,
        });
      } else if (record.taskKind === "PATCH_MERGE_GRADE") {
        await ctx.db.patch(record.findingId, {
          patchReviewStatus:
            args.status === "CONFIRMED" ? "HUMAN_MERGE_GRADED" : "PENDING",
        });
      }
    }

    // Book labor cost in treasury
    if (args.laborCostCents > 0) {
      await ctx.runMutation(internal.treasury.bumpTreasury, {
        teracCents: args.laborCostCents,
      });
    }

    // Check if all verifications for this audit are completed
    const auditVerifications = await ctx.db
      .query("terac_verifications")
      .withIndex("by_audit", (q) => q.eq("auditId", record.auditId))
      .collect();

    const anyPending = auditVerifications.some((v) => v.status === "DISPATCHED");
    if (!anyPending) {
      const anyContested = auditVerifications.some(
        (v) => v.taskKind === "FINDING_REPRO" && v.status === "CONTESTED"
      );
      const overallStatus = anyContested ? "CONTESTED" : "CONFIRMED";

      const audit = await ctx.db.get(record.auditId);
      if (audit) {
        await ctx.db.patch(record.auditId, {
          teracPanelStatus: overallStatus,
          liveStepLog: [
            ...audit.liveStepLog,
            `${new Date().toISOString()} · Terac human verification panel finished: all verdicts collected (Overall: ${overallStatus})`,
          ],
        });
      }
    }
  },
});

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Exa autonomous prospector — hourly, with a five-audit rolling daily cap.
crons.interval(
  "exa-hunt",
  { minutes: 60 },
  internal.exaHunter.harvestLaunches,
  {}
);

// Launch Shield deterministic re-scans — hourly for active members.
crons.interval("shield-rescan", { minutes: 60 }, internal.shield.scanDueShields, {});

// One prospect email per tick, with a separate daily attempt cap.
crons.interval("outreach-send", { minutes: 60 }, internal.outreachSender.sendNext, {});
crons.interval("outreach-replies", { minutes: 15 }, internal.outreachSender.scanReplies, {});
crons.interval("outreach-reconcile", { minutes: 60 }, internal.outreachSender.reconcileUnknown, {});

// Terac human verification verdict collection — every 60s (PRD FR-6).
crons.interval("terac-poll-verdicts", { minutes: 1 }, internal.terac.pollPendingVerdicts, {});

export default crons;

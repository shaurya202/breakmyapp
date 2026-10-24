import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Exa autonomous prospector — every 15 minutes (FR-1).
crons.interval(
  "exa-hunt",
  { minutes: 15 },
  internal.exaHunter.harvestLaunches,
  {}
);

// Launch Shield deterministic re-scans — hourly for active members.
crons.interval("shield-rescan", { minutes: 60 }, internal.shield.scanDueShields, {});

// Terac human verification verdict collection — every 60s (PRD FR-6).
crons.interval("terac-poll-verdicts", { minutes: 1 }, internal.terac.pollPendingVerdicts, {});

export default crons;

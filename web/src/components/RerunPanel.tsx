import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convexApi";
import { PAYWALLS_DISABLED } from "../../../convex/deterministic";
import type { Id } from "../convexApi";

/**
 * "Verify my fix" — paid post-fix deterministic re-run with the SAME stored
 * seed (FR-5). Panel is only rendered when the run is COMPLETED and the
 * payer holds the Full Autopsy or Launch Shield — server enforces the same.
 * If rerun diff fields aren't surfaced by getReport, degrade to a
 * "Re-run complete" summary line (documented in web/README/report).
 */
export default function RerunPanel({
  auditId,
  verificationRunsRemaining,
  payerHasShield,
  rerunDeadline,
}: {
  auditId: Id<"audits">;
  verificationRunsRemaining: number;
  payerHasShield: boolean;
  rerunDeadline: number | null;
}) {
  const requestRerun = useMutation(api.audits.requestRerun);
  const [phase, setPhase] = useState<"idle" | "running" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const deadlineText = rerunDeadline
    ? new Date(rerunDeadline).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const onClick = async () => {
    setPhase("running");
    setError(null);
    try {
      await requestRerun({ auditId });
      setPhase("sent");
    } catch (e) {
      // Server throws clear messages (no unlock, none left, window expired).
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  const remainingText = PAYWALLS_DISABLED || payerHasShield
    ? "unlimited fix-verification re-runs"
    : `${Math.max(verificationRunsRemaining, 0)} fix-verification re-run${
        verificationRunsRemaining === 1 ? "" : "s"
      } left (72h window${deadlineText ? ` — until ${deadlineText}` : ""})`;

  return (
    <div className="rounded border border-acid/30 bg-acid/5 px-3 py-2 font-mono text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-neutral-400">{remainingText}</span>
        {phase === "idle" && (PAYWALLS_DISABLED || payerHasShield || verificationRunsRemaining > 0) && (!rerunDeadline || Date.now() <= rerunDeadline) ? (
          <button
            type="button"
            onClick={onClick}
            className="rounded border border-acid/50 bg-acid/10 px-2.5 py-1 text-[11px] font-bold text-acid hover:bg-acid/20 focus:outline-none"
          >
            Verify my fix — re-run the same seed
          </button>
        ) : null}
        {phase === "running" ? (
          <span className="flex items-center gap-2 text-[11px] text-acid">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-acid/30 border-t-acid" />
            same seed, same suite — count the errors again
          </span>
        ) : null}
        {phase === "sent" ? (
          <span className="text-[11px] text-emerald-300">
            Re-run queued — the terminal will show progress.
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-2 text-[11px] text-red-400">⚠ {error}</div>
      ) : null}
    </div>
  );
}

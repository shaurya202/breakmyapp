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
    ? "unlimited re-tests included with your plan"
    : `${Math.max(verificationRunsRemaining, 0)} re-test${
        verificationRunsRemaining === 1 ? "" : "s"
      } left to verify fixes (valid for 72h${deadlineText ? ` — until ${deadlineText}` : ""})`;

  return (
    <div className="border-y border-ink/20 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-xs text-mut">{remainingText}</span>
        {phase === "idle" && (PAYWALLS_DISABLED || payerHasShield || verificationRunsRemaining > 0) && (!rerunDeadline || Date.now() <= rerunDeadline) ? (
          <button
            type="button"
            onClick={onClick}
            className="inline-flex min-h-11 items-center border border-ink bg-paper px-3.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-sink"
          >
            Verify my fixes — test again
          </button>
        ) : null}
        {phase === "running" ? (
          <span role="status" className="flex items-center gap-2 font-mono text-xs">
            <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border border-line-strong border-t-ink" />
            re-running the exact same test to check if bugs are fixed…
          </span>
        ) : null}
        {phase === "sent" ? (
          <span role="status" className="font-mono text-xs text-pass">
            Re-test started — watch the execution log.
          </span>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="mt-2 font-mono text-xs text-stamp">
          {error}
        </div>
      ) : null}
    </div>
  );
}

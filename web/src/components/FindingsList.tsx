import { useEffect } from "react";
import FindingCard, { type Finding } from "./FindingCard";

/**
 * Findings table (FR-3 free layer): every bug title + severity visible;
 * Bug #1 rendered in full unblurred detail; locked deliverables stay
 * locked — never fake-unlocked client-side. First card carries the heavy
 * top rule; the header is a ruled ledger heading, not a chip stack.
 */
export default function FindingsList({
  findings,
  unlockable,
  totalBugs,
}: {
  findings: Finding[];
  unlockable: boolean;
  totalBugs: number;
}) {
  useEffect(() => {
    document.title = findings.length
      ? `(${findings.length} bugs) BreakMyApp`
      : "BreakMyApp";
    return () => {
      document.title = "BreakMyApp — we break your app for free";
    };
  }, [findings.length]);

  if (totalBugs > 0 && findings.length === 0) {
    return (
      <p className="font-mono text-sm text-mut" role="status">
        {totalBugs} bugs caught. Loading bug list…
      </p>
    );
  }

  return (
    <section aria-label="Findings">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink pb-3">
        <h2 className="text-section font-bold tracking-tight">
          Findings{" "}
          <span className="font-mono text-base font-semibold tabular-nums text-mut">
            {findings.length}
          </span>
        </h2>
        <span className="font-mono text-xs text-mut">
          Tested across desktop and mobile screens
        </span>
      </div>
      <div>
        {findings.map((f) => (
          <FindingCard key={f._id} finding={f} unlockable={unlockable} />
        ))}
      </div>
    </section>
  );
}

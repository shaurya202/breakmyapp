import { useEffect } from "react";
import FindingCard, { type Finding } from "./FindingCard";

/**
 * Findings table (FR-3 free layer): every bug title + severity visible;
 * Bug #1 rendered in full unblurred detail; locked deliverables stay
 * blurred — never fake-unlocked client-side.
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
      <p className="text-sm text-neutral-500" role="status">
        {totalBugs} bugs recorded. Findings are still loading…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Findings <span className="font-mono text-base font-normal text-neutral-500">{findings.length}</span>
        </h2>
        <span className="font-mono text-xs text-neutral-500">Same seed · same suite · same order</span>
      </div>
      {findings.map((f) => (
        <FindingCard key={f._id} finding={f} unlockable={unlockable} />
      ))}
    </div>
  );
}

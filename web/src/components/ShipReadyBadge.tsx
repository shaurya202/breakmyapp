import { hexSeed } from "../lib/format";

/**
 * Ship-Ready badge — only flips true in Convex after an actual passing
 * zero-critical deterministic re-run (FR-5). Impossible to forge; the badge
 * links to the run's manifest (seed + hash). Rendered as an official stamp:
 * double rule, spaced caps, one reserved pass-green word.
 */
export default function ShipReadyBadge({
  runSeed,
  determinismHash,
}: {
  runSeed: number;
  determinismHash: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-2 border-ink px-5 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="border border-ink px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em]">
          Ship-ready
        </span>
        <span className="text-sm text-mut">
          Zero critical bugs — passed re-run on record
        </span>
      </div>
      <a
        href="#run-manifest"
        className="font-mono text-xs text-pass underline decoration-dotted underline-offset-4 hover:decoration-solid"
      >
        Proof: ID {hexSeed(runSeed)}
        {determinismHash ? ` · ${determinismHash.slice(0, 8)}` : ""}
      </a>
    </div>
  );
}

import { hexSeed } from "../lib/format";

/**
 * Ship-Ready badge — only flips true in Convex after an actual passing
 * zero-critical deterministic re-run (FR-5). Impossible to forge; the badge
 * links to the run's manifest (seed + hash).
 */
export default function ShipReadyBadge({
  runSeed,
  determinismHash,
}: {
  runSeed: number;
  determinismHash: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-emerald-400/50 bg-emerald-400/10 px-3 py-2">
      <span className="text-emerald-300">&#10003;</span>
      <span className="font-mono text-xs font-bold tracking-[0.18em] text-emerald-300">
        SHIP-READY
      </span>
      <span className="font-mono text-[10px] text-emerald-200/70">
        — verified by deterministic re-run
      </span>
      <a
        href="#run-manifest"
        className="ml-auto font-mono text-[10px] text-emerald-200/80 underline decoration-dotted underline-offset-2 hover:text-emerald-200"
      >
        manifest: seed {hexSeed(runSeed)}
        {determinismHash ? ` · hash ${determinismHash.slice(0, 8)}…` : ""}
      </a>
    </div>
  );
}

import { useState } from "react";
import { hexSeed, truncateMiddle } from "../lib/format";

/**
 * The anti-fraud seal (FR-3): seed, suite version, determinismHash on-page.
 * Reads as lab-calibration data — a hairline strip, tabular figures, copy
 * affordance preserved. Click the hash to copy the full value.
 */
export default function RunManifest({
  runSeed,
  suiteVersion,
  determinismHash,
  solariBrowserBootMs,
  solariSandboxBootMs,
}: {
  runSeed: number;
  suiteVersion: string;
  determinismHash: string | null;
  solariBrowserBootMs: number | null;
  solariSandboxBootMs: number | null;
}) {
  const [copied, setCopied] = useState(false);

  const copyHash = async (h: string) => {
    try {
      await navigator.clipboard.writeText(h);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable (e.g. insecure context) — ignore
    }
  };

  return (
    <div
      role="group"
      aria-label="Run details"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-ink/20 py-2.5"
    >
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs">
        <div className="inline-flex items-baseline gap-2">
          <dt className="kicker">Test ID</dt>
          <dd className="tabular-nums">{hexSeed(runSeed)}</dd>
        </div>
        <div className="inline-flex items-baseline gap-2">
          <dt className="kicker">Suite</dt>
          <dd>{suiteVersion}</dd>
        </div>
        {solariBrowserBootMs != null ? (
          <div className="inline-flex items-baseline gap-2">
            <dt className="kicker">Browser boot</dt>
            <dd className="tabular-nums">{solariBrowserBootMs}ms</dd>
          </div>
        ) : null}
        {solariSandboxBootMs != null ? (
          <div className="inline-flex items-baseline gap-2">
            <dt className="kicker">Setup</dt>
            <dd className="tabular-nums">{solariSandboxBootMs}ms</dd>
          </div>
        ) : null}
      </dl>
      {determinismHash ? (
        <button
          type="button"
          title={`${determinismHash} — click to copy`}
          aria-label={`Copy run fingerprint ${determinismHash}`}
          onClick={() => copyHash(determinismHash)}
          className="inline-flex min-h-11 items-baseline gap-2 font-mono text-xs text-mut underline decoration-dotted underline-offset-4 hover:text-ink"
        >
          <span className="kicker">Fingerprint</span>
          <span className="tabular-nums">{truncateMiddle(determinismHash)}</span>
          <span aria-hidden="true" className="no-underline">{copied ? "copied" : "copy"}</span>
        </button>
      ) : null}
      <span role="status" className="sr-only">
        {copied ? "Run fingerprint copied to clipboard" : ""}
      </span>
    </div>
  );
}

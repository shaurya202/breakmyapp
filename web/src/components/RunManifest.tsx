import { useState } from "react";
import { hexSeed, truncateMiddle } from "../lib/format";

/**
 * The anti-fraud seal (FR-3): seed, suite version, determinismHash on-page.
 * Click the hash to copy the full value.
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-4 py-3 font-mono text-xs text-neutral-300" aria-label="Run manifest">
      <span>
        <span className="text-neutral-500">Seed </span>
        <span className="text-acid">{hexSeed(runSeed)}</span>
      </span>
      <span className="text-neutral-500" aria-hidden="true">/</span>
      <span>
        <span className="text-neutral-500">Suite </span>
        <span className="text-neutral-200">{suiteVersion}</span>
      </span>
      {determinismHash ? (
        <>
          <span className="text-neutral-500" aria-hidden="true">/</span>
          <button
            type="button"
            title={`${determinismHash} — click to copy`}
            onClick={() => copyHash(determinismHash)}
            className="underline decoration-dotted decoration-neutral-600 underline-offset-2 hover:text-acid focus:outline-none"
          >
            <span className="text-neutral-500">Hash </span>
            <span className="text-neutral-200">{truncateMiddle(determinismHash)}</span>
            {copied ? (
              <span className="ml-1.5 text-acid">copied</span>
            ) : (
              <span className="ml-1.5 text-neutral-500">⧉</span>
            )}
          </button>
        </>
      ) : null}
      {solariBrowserBootMs != null ? (
        <>
          <span className="text-neutral-500" aria-hidden="true">/</span>
          <span>
            <span className="text-neutral-500">Browser boot </span>
            <span className="text-neutral-200">{solariBrowserBootMs}ms</span>
          </span>
        </>
      ) : null}
      {solariSandboxBootMs != null ? (
        <>
          <span className="text-neutral-500" aria-hidden="true">/</span>
          <span>
            <span className="text-neutral-500">Sandbox boot </span>
            <span className="text-neutral-200">{solariSandboxBootMs}ms</span>
          </span>
        </>
      ) : null}
    </div>
  );
}

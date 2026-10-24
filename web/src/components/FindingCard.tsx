import { useState } from "react";

export type Finding = {
  _id: string;
  category:
    | "CONSOLE_CRASH"
    | "NETWORK_500_ERROR"
    | "MOBILE_OVERFLOW"
    | "BROKEN_DEAD_CTA"
    | "EXPOSED_SECRET_OR_HEADER";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  isFreePreview: boolean;
  locked: boolean;
  reproductionSteps: string;
  rawErrorLog: string | null;
  aiSuggestedPatch: string | null;
  deterministicPayload: string | null;
  screenshotUrl: string | null;
  patchReviewStatus: string | null;
};

const SEV: Record<Finding["severity"], { label: string; cls: string }> = {
  CRITICAL: { label: "critical", cls: "bg-red-500/20 text-red-400 border-red-500/60" },
  HIGH: { label: "high", cls: "bg-amber-500/15 text-amber-400 border-amber-500/50" },
  MEDIUM: { label: "medium", cls: "bg-neutral-700/40 text-neutral-400 border-neutral-600/50" },
};

const CAT: Record<Finding["category"], string> = {
  CONSOLE_CRASH: "console crash",
  NETWORK_500_ERROR: "network 500",
  MOBILE_OVERFLOW: "mobile overflow",
  BROKEN_DEAD_CTA: "dead CTA",
  EXPOSED_SECRET_OR_HEADER: "leaked secret / header",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // clipboard unavailable — ignore
        }
      }}
      className="rounded border border-line bg-panel px-2 py-0.5 text-[10px] font-mono text-neutral-400 hover:border-acid/50 hover:text-acid focus:outline-none"
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}

/** Bug #1 free proof: full unblurred detail (FR-3 free layer). */
function DetailFinding({ f }: { f: Finding }) {
  const [shotLoaded, setShotLoaded] = useState(false);
  return (
    <article className="rounded-lg border border-line bg-panel p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${SEV[f.severity].cls}`}>
          {SEV[f.severity].label}
        </span>
        <span className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
          {CAT[f.category] ?? f.category}
        </span>
        <span className="rounded-full bg-acid/10 px-2 py-0.5 font-mono text-[10px] text-acid">
          Full proof
        </span>
      </div>
      <h3 className="text-lg font-bold leading-snug text-white">{f.title}</h3>

      {f.deterministicPayload != null ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] text-neutral-600">seeded payload</span>
          <span className="max-w-full truncate rounded border border-line bg-black px-2 py-0.5 font-mono text-[11px] text-acid">
            {f.deterministicPayload.slice(0, 120)}
          </span>
        </div>
      ) : null}

      <div className="mt-5 text-sm font-bold text-white">How to reproduce</div>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-line bg-[#0a1418] p-4 font-mono text-xs leading-6 text-neutral-300">
        {f.reproductionSteps}
      </pre>

      {f.rawErrorLog ? (
        <>
          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-bold text-white">Error log</span>
            <CopyButton text={f.rawErrorLog} label="copy error" />
          </div>
          <pre className="terminal-scroll mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-500/30 bg-red-500/5 p-4 font-mono text-xs leading-6 text-red-200">
            {f.rawErrorLog}
          </pre>
        </>
      ) : null}

      {f.screenshotUrl ? (
        <div className="mt-2">
          {shotLoaded ? null : (
            <div className="h-64 w-full animate-pulse rounded bg-neutral-800/60" />
          )}
          <img
            src={f.screenshotUrl}
            alt={`Screenshot showing ${f.title}`}
            onLoad={() => setShotLoaded(true)}
            onError={() => setShotLoaded(true)}
            className={
              "max-h-64 w-full rounded border border-line object-cover " +
              (shotLoaded ? "" : "hidden")
            }
          />
        </div>
      ) : null}

      {f.aiSuggestedPatch ? (
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm font-bold text-white">Suggested patch</span>
          <CopyButton text={f.aiSuggestedPatch} label="copy patch" />
        </div>
      ) : null}
      {f.aiSuggestedPatch ? (
        <pre className="terminal-scroll mt-2 max-h-64 overflow-auto whitespace-pre rounded-md border border-line bg-[#0a1418] p-4 font-mono text-xs leading-6 text-acid">
          {f.aiSuggestedPatch}
        </pre>
      ) : null}
      {f.patchReviewStatus ? (
        <div className="mt-2 font-mono text-[9px] text-neutral-600">
          patch review: {f.patchReviewStatus === "HUMAN_MERGE_GRADED" ? "human merge-graded" : f.patchReviewStatus}
        </div>
      ) : null}
    </article>
  );
}

/** Findings #2..N while locked: redacted vault card, deliverables gated server-side. */
function VaultFinding({ f, unlockable }: { f: Finding; unlockable: boolean }) {
  return (
    <article className="rounded-lg border border-line bg-panel p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${SEV[f.severity].cls}`}>
            {SEV[f.severity].label}
          </span>
          <span className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
            {CAT[f.category] ?? f.category}
          </span>
          <span className="ml-auto font-mono text-xs text-neutral-500">Locked detail</span>
        </div>
        <h3 className="text-lg font-bold leading-snug text-white">{f.title}</h3>
        <p className="mt-3 text-sm leading-6 text-neutral-500">Reproduction steps, logs, screenshots, and suggested fixes are available in the full report.</p>
        <div className="mt-5">
          {unlockable ? (
            <a
              href="#unlock"
              className="inline-flex rounded-md border border-acid/70 px-4 py-2 text-center text-sm font-bold text-acid hover:bg-acid hover:text-ink"
            >
              View unlock options
            </a>
          ) : (
            <div className="text-xs text-neutral-500">
              Full detail is unavailable for this run.
            </div>
          )}
        </div>
    </article>
  );
}

/** Revealed (unlocked / shield) previously-locked card. */
function RevealedFinding({ f }: { f: Finding }) {
  return <DetailFinding f={{ ...f, isFreePreview: false }} />;
}

export default function FindingCard({ finding, unlockable }: { finding: Finding; unlockable: boolean }) {
  if (finding.locked) {
    return <VaultFinding f={finding} unlockable={unlockable} />;
  }
  return <RevealedFinding f={finding} />;
}

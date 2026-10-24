import { useRef, useState } from "react";

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
  teracVerdict?: "PENDING" | "TERAC_VERIFIED" | "TERAC_CONTESTED" | null;
  teracReproducedCount?: number | null;
};

/** One exclusive accent: criticality lives in stamp red and nowhere else. */
const SEV: Record<Finding["severity"], { label: string; cls: string }> = {
  CRITICAL: { label: "Critical", cls: "text-stamp" },
  HIGH: { label: "High", cls: "text-ink" },
  MEDIUM: { label: "Notice", cls: "text-mut" },
};

const CAT: Record<Finding["category"], string> = {
  CONSOLE_CRASH: "page crash (code error)",
  NETWORK_500_ERROR: "server error (500)",
  MOBILE_OVERFLOW: "mobile layout cutoff",
  BROKEN_DEAD_CTA: "broken button (nothing happens)",
  EXPOSED_SECRET_OR_HEADER: "exposed key or security header",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const reset = useRef<number | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // Clipboard can be blocked (insecure context / permissions).
      setStatus("failed");
    }
    if (reset.current) window.clearTimeout(reset.current);
    reset.current = window.setTimeout(() => setStatus("idle"), 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-[0.08em] text-mut underline decoration-dotted underline-offset-4 hover:text-ink hover:decoration-solid"
      >
        {status === "copied" ? "copied" : status === "failed" ? "copy failed" : label}
      </button>
      <span role="status" className="sr-only">
        {status === "copied"
          ? "Copied to clipboard"
          : status === "failed"
            ? "Copy failed — select the text to copy it manually"
            : ""}
      </span>
    </>
  );
}

/** Human verification verdict: one ruled seal-line, not a colored chip. */
function VerdictLine({ f }: { f: Finding }) {
  if (f.teracVerdict === "TERAC_VERIFIED") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-pass">
        Reproduced ×{f.teracReproducedCount ?? 3} by independent testers
      </span>
    );
  }
  if (f.teracVerdict === "TERAC_CONTESTED") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-stamp">
        Contest — flagged by testers
      </span>
    );
  }
  if (f.teracVerdict === "PENDING") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-mut">
        Human verification pending
      </span>
    );
  }
  return null;
}

/** Bug #1 free proof: full unblurred detail (FR-3 free layer). */
function DetailFinding({ f }: { f: Finding }) {
  const [shotLoaded, setShotLoaded] = useState(false);
  return (
    <article className="border-t-2 border-ink py-6">
      <div className="kicker">
        Bug {SEV[f.severity].label} · {CAT[f.category] ?? f.category}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-xl font-bold tracking-tight">{f.title}</h3>
        <VerdictLine f={f} />
        {f.isFreePreview ? (
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-mut">
            Free sample — full details
          </span>
        ) : null}
      </div>

      {f.deterministicPayload != null ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="kicker">Test input</span>
          <span className="min-w-0 max-w-full truncate font-mono text-xs text-mut">
            {f.deterministicPayload.slice(0, 120)}
          </span>
        </div>
      ) : null}

      <div className="mt-5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-mut">
        How to recreate this bug
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words border border-line bg-paper px-4 py-3.5 font-mono text-xs leading-relaxed">
        {f.reproductionSteps}
      </pre>

      {f.rawErrorLog ? (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-mut">
              Raw error log
            </span>
            <CopyButton text={f.rawErrorLog} label="copy error" />
          </div>
          <pre className="scroll-hair mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words bg-ink px-4 py-3.5 font-mono text-xs leading-relaxed text-paper/70">
            {f.rawErrorLog}
          </pre>
        </div>
      ) : null}

      {f.screenshotUrl ? (
        <figure className="mt-5">
          {shotLoaded ? null : (
            <div aria-hidden="true" className="h-64 w-full animate-pulse bg-sink" />
          )}
          <img
            src={f.screenshotUrl}
            alt={`Screenshot showing ${f.title}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setShotLoaded(true)}
            onError={() => setShotLoaded(true)}
            className={
              "max-h-64 w-full border border-line object-cover " +
              (shotLoaded ? "" : "hidden")
            }
          />
          <figcaption className="kicker mt-1.5">Evidence screenshot</figcaption>
        </figure>
      ) : null}

      {f.aiSuggestedPatch ? (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-mut">
              Suggested code fix
            </span>
            <CopyButton text={f.aiSuggestedPatch} label="copy fix" />
          </div>
          <pre className="scroll-hair mt-2 max-h-64 overflow-auto whitespace-pre bg-ink px-4 py-3.5 font-mono text-xs leading-relaxed text-phosphor">
            {f.aiSuggestedPatch}
          </pre>
        </div>
      ) : null}
      {f.patchReviewStatus ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-xs uppercase tracking-[0.1em] text-pass">
            {f.patchReviewStatus === "HUMAN_MERGE_GRADED"
              ? "Approved by human reviewers"
              : "Review in progress"}
          </span>
          <span className="text-xs text-mut">
            {f.patchReviewStatus === "HUMAN_MERGE_GRADED"
              ? "3 human engineers reviewed and approved this fix"
              : "review in progress"}
          </span>
        </div>
      ) : null}
    </article>
  );
}

/** Findings #2..N while locked: the rest of the ledger with redacted body. */
function VaultFinding({ f, unlockable }: { f: Finding; unlockable: boolean }) {
  return (
    <article className="border-t border-line py-5">
      <div className="kicker">
        Bug {SEV[f.severity].label} · {CAT[f.category] ?? f.category}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold tracking-tight text-ink/90">{f.title}</h3>
        <VerdictLine f={f} />
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mut">
        Step-by-step instructions, error logs, screenshots, and ready-to-use code fixes are included in the full report.
      </p>
      <div className="mt-3">
        {unlockable ? (
          <a
            href="#unlock"
            className="inline-flex min-h-11 items-center border border-ink bg-paper px-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-sink"
          >
            Unlock full report
          </a>
        ) : (
          <div className="font-mono text-xs text-mut">
            Details are not available for this run.
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

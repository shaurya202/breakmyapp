import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convexApi";
import type { Id } from "../convexApi";
import TreasuryHeader from "../components/TreasuryHeader";
import TerminalFeed from "../components/TerminalFeed";
import FindingsList from "../components/FindingsList";
import RunManifest from "../components/RunManifest";
import CheckoutPanel, { ShieldOnlyCta } from "../components/CheckoutPanel";
import ShipReadyBadge from "../components/ShipReadyBadge";
import RerunPanel from "../components/RerunPanel";
import StatusPill, { type AuditStatus } from "../components/StatusPill";
import { navigate } from "../router";
import { PAYWALLS_DISABLED } from "../../../convex/deterministic";
import type { Finding } from "../components/FindingCard";

/** Hunted-by-Exa context: summary + grounding links (PRD field-level grounding). */
function ExaSourcePanel({
  summary,
  grounding,
}: {
  summary: string;
  grounding: string[] | null;
}) {
  return (
    <div className="border border-line bg-paper px-5 py-4">
      <h2 className="text-sm font-bold">How we found this website</h2>
      <p className="mt-2 text-sm leading-6 text-mut">{summary}</p>
      {grounding && grounding.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs leading-5 text-mut">
          <span>Found on:</span>
          {grounding.slice(0, 6).map((u, i) => (
            <span key={i} className="min-w-0">
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="break-all underline decoration-dotted underline-offset-2 hover:text-ink hover:decoration-solid"
              >
                {(() => {
                  try {
                    return new URL(u).hostname || u;
                  } catch {
                    return u;
                  }
                })()}
              </a>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One Terac verdict rendered as a ruled seal-line, never a colored chip. */
function TeracStatus({ status }: { status: string }) {
  if (status === "CONFIRMED") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-pass">
        Verified by 3 independent testers
      </span>
    );
  }
  if (status === "DISPATCHED") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-mut">
        Human verification in progress
      </span>
    );
  }
  if (status === "CONTESTED") {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.1em] text-stamp">
        Flagged by testers
      </span>
    );
  }
  return null;
}

function ReportBody({ auditId, refetch }: { auditId: string; refetch: () => void }) {
  const startFromUrl = useMutation(api.audits.startFromUrl);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Reactive subscription; `refetch` additionally remounts this subtree for a
  // forced fresh fetch (wired to the Whop embed's onComplete).
  const report = useQuery(api.audits.getReport, {
    auditId: auditId as Id<"audits">,
  });

  const relaunch = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const { auditId: nextId } = await startFromUrl({
        targetUrl: report?.audit.targetUrl ?? "",
        bypassDedupe: true,
      });
      navigate(`/audit/${nextId}`);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  if (report === undefined) {
    // Skeleton mirrors the report layout, so content lands without a jump.
    return (
      <div
        className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Loading test report…</span>
        <div aria-hidden="true" className="animate-pulse space-y-4">
          <div className="h-4 w-24 bg-sink" />
          <div className="h-8 w-2/3 max-w-md bg-sink" />
          <div className="h-4 w-1/2 max-w-sm bg-sink" />
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.58fr)]">
            <div className="h-72 bg-sink" />
            <div className="space-y-4">
              <div className="h-24 bg-sink" />
              <div className="h-40 bg-sink" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (report === null) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <h1 className="text-2xl font-bold">Report not found</h1>
        <p className="mt-2 text-sm text-mut">This report link might be incorrect or expired.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-3 inline-flex min-h-11 items-center border border-ink bg-paper px-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-sink"
        >
          Back to home
        </button>
      </div>
    );
  }

  const a = report.audit;
  const findings: Finding[] = report.findings;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <div className="mb-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-mut hover:text-ink"
        >
          ← Back to home
        </button>
      </div>

      {/* Dossier header: title + ruled tabular verdicts, no stat cards */}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-b-2 border-ink pb-7">
        <div className="min-w-0 flex-1">
          <p className="kicker">Website test report</p>
          <h1 className="mt-2 break-words text-title font-extrabold">
            {a.projectName}
          </h1>
          <a
            href={a.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block max-w-2xl truncate font-mono text-sm text-mut hover:text-ink hover:underline"
          >
            {a.targetUrl}
          </a>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <StatusPill status={a.status as AuditStatus} size="md" />
            <span className="font-mono text-xs text-mut">
              {a.source === "EXA_AUTONOMOUS_HUNT"
                ? "Found online"
                : "Tested by visitor"}
            </span>
            <TeracStatus status={a.teracPanelStatus ?? ""} />
          </div>
        </div>
        <dl className="flex gap-8 font-mono">
          <div>
            <dt className="kicker">Health score</dt>
            <dd className="mt-1">
              <span className="text-3xl font-semibold tabular-nums">
                {a.runCompleted ? a.healthScore : "—"}
              </span>
              {a.runCompleted ? <span className="text-sm text-mut">/100</span> : null}
            </dd>
          </div>
          <div className="border-l border-line pl-8">
            <dt className="kicker">Findings</dt>
            <dd className="mt-1">
              <span className="text-3xl font-semibold tabular-nums">{a.totalBugsFound}</span>
              {a.criticalCount > 0 ? (
                <span className="ml-2 text-xs font-semibold text-stamp">{a.criticalCount} critical</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      {/* Run manifest — anti-fraud seal, printed once the run has finished */}
      {a.runFinishedAt != null ? (
        <div id="run-manifest" className="mt-5 scroll-mt-4">
          <RunManifest
            runSeed={a.runSeed}
            suiteVersion={a.suiteVersion}
            determinismHash={a.determinismHash}
            solariBrowserBootMs={a.solariBrowserBootMs}
            solariSandboxBootMs={a.solariSandboxBootMs}
          />
        </div>
      ) : null}

      {a.source === "EXA_AUTONOMOUS_HUNT" && a.exaContextSummary ? (
        <div className="mt-5">
          <ExaSourcePanel summary={a.exaContextSummary} grounding={a.grounding} />
        </div>
      ) : null}

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.58fr)]">
        <div className="min-w-0 lg:sticky lg:top-5 lg:h-[min(68vh,640px)]">
          <TerminalFeed lines={a.liveStepLog} status={a.status} />
        </div>

        <div className="min-w-0">
          {!a.runCompleted && a.status !== "FAILED" ? (
            <div role="status" className="border-y border-line py-12 text-center">
              <strong>Testing your website right now</strong>
              <p className="mt-2 text-sm leading-6 text-mut">
                We are clicking buttons, testing forms, and checking mobile layouts. Results will appear here in about 15 seconds.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {a.shipReadyBadgeIssued ? (
                <ShipReadyBadge runSeed={a.runSeed} determinismHash={a.determinismHash} />
              ) : null}

              {a.status === "FAILED" ? (
                <div className="border-l-2 border-stamp bg-sink p-5">
                  <h2 className="text-lg font-bold text-stamp">Test could not finish</h2>
                  <p className="mt-2 break-words font-mono text-xs leading-5">
                    {a.errorMessage ?? "Something went wrong during the test. Check the execution log for details."}
                  </p>
                  <button
                    type="button"
                    onClick={relaunch}
                    disabled={starting}
                    className="mt-4 inline-flex min-h-11 items-center border border-ink bg-ink px-4 text-sm font-bold uppercase tracking-[0.04em] text-paper hover:bg-ink-2 disabled:opacity-50"
                  >
                    {starting ? "Retrying…" : "Try testing again"}
                  </button>
                  {startError ? (
                    <p role="alert" className="mt-2 text-sm text-stamp">{startError}</p>
                  ) : null}
                </div>
              ) : null}

              {/* Clean report state — honest funnel (PRD FR-5/pricing rule) */}
              {a.status === "COMPLETED" && a.totalBugsFound === 0 ? (
                <div className="border-l-2 border-pass bg-sink p-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-pass">
                      Zero findings
                    </span>
                    <span className="text-lg font-bold">Your site passed clean.</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-mut">
                    We tested for crashes, broken buttons, and mobile screen issues and found zero problems. Keep your site safe as you make updates with continuous monitoring.
                  </p>
                  <ShieldOnlyCta auditId={a.id} />
                </div>
              ) : null}

              {findings.length > 0 ? (
                <FindingsList
                  findings={findings}
                  unlockable={a.unlockEnabled}
                  totalBugs={a.totalBugsFound}
                />
              ) : null}

              {/* Paywall only after the run completed + criticals exist + not unlocked */}
              {a.unlockEnabled ? (
                <div id="unlock" className="scroll-mt-4">
                  <CheckoutPanel
                    auditId={a.id}
                    unlockPriceCents={a.unlockPriceCents}
                    onUnlocked={refetch}
                  />
                </div>
              ) : null}

              {/* Fix verification re-runs — hidden unless unlocked (server enforces too) */}
              {a.status === "COMPLETED" &&
              (PAYWALLS_DISABLED || a.isUnlocked || a.payerHasShield) ? (
                <RerunPanel
                  auditId={a.id}
                  verificationRunsRemaining={a.verificationRunsRemaining}
                  payerHasShield={a.payerHasShield}
                  rerunDeadline={a.rerunDeadline}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Report page: reactive dashboard for one autonomous audit run. `reloadKey`
 * remounts the query subtree — the app's "refetch" (Convex is already reactive;
 * this forces a fresh initial fetch, used by the checkout embed's onComplete).
 */
export default function ReportPage({ auditId }: { auditId: string }) {
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    document.title = "BreakMyApp — audit report";
  }, []);
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <TreasuryHeader />
      <main key={reloadKey} id="main-content">
        <ReportBody auditId={auditId} refetch={() => setReloadKey((k) => k + 1)} />
      </main>
    </div>
  );
}

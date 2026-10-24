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
    <div className="rounded-lg border border-line bg-panel px-5 py-4">
      <h2 className="text-sm font-bold text-white">How this app was discovered</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-300">{summary}</p>
      {grounding && grounding.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs leading-5 text-neutral-500">
          <span>Sources:</span>
          {grounding.slice(0, 6).map((u, i) => (
            <span key={i} className="min-w-0">
              <a
                href={u}
                target="_blank"
                rel="noreferrer"
                className="break-all text-acid underline decoration-dotted underline-offset-2 hover:text-white"
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
    return (
      <div className="mx-auto max-w-7xl px-5 py-16 text-base text-neutral-300" role="status">
        Opening audit report…
      </div>
    );
  }
  if (report === null) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16">
        <h1 className="text-2xl font-bold text-white">Audit not found</h1>
        <p className="mt-2 text-sm text-neutral-400">This report link may be invalid or no longer available.</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-3 rounded border border-line px-3 py-1.5 text-neutral-300 hover:border-acid/50 hover:text-acid"
        >
          Return to home
        </button>
      </div>
    );
  }

  const a = report.audit;
  const findings: Finding[] = report.findings;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
      <div className="mb-5"><button type="button" onClick={() => navigate("/")} className="text-sm text-neutral-500 hover:text-acid">← All audits</button></div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-xs text-acid">Audit report</div>
          <h1 className="break-words text-3xl font-black tracking-[-0.045em] text-white sm:text-5xl">
            {a.projectName}
          </h1>
          <a
            href={a.targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block max-w-2xl truncate font-mono text-sm text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-acid"
          >
            {a.targetUrl}
          </a>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusPill status={a.status as AuditStatus} size="md" />
            <span className="text-xs text-neutral-500">
              {a.source === "EXA_AUTONOMOUS_HUNT"
                ? "Discovered by Exa"
                : "Submitted audit"}</span>
          </div>
        </div>
        <div className="flex items-end gap-6 rounded-lg border border-line bg-panel px-5 py-4">
          <div><span className="block text-xs text-neutral-500">Health score</span><strong className={`text-4xl font-black tabular-nums ${a.healthScore >= 90 ? "text-acid" : a.healthScore >= 70 ? "text-amber-300" : "text-red-300"}`}>{a.healthScore}<span className="text-base font-normal text-neutral-500">/100</span></strong></div>
          <div className="border-l border-line pl-6"><span className="block text-xs text-neutral-500">Findings</span><strong className="text-4xl font-black tabular-nums text-white">{a.totalBugsFound}</strong><span className="ml-2 text-xs text-red-300">{a.criticalCount} critical</span></div>
        </div>
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

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.58fr)]">
        <div className="min-w-0 lg:sticky lg:top-5 lg:h-[min(68vh,640px)]">
          <TerminalFeed lines={a.liveStepLog} status={a.status} />
        </div>

        <div className="min-w-0">
          {!a.runCompleted ? (
            <div className="rounded-lg border border-line bg-panel px-6 py-12 text-center">
              <span className="text-acid">●</span> <strong className="text-white">Audit in progress</strong>
              <p className="mt-2 text-sm leading-6 text-neutral-500">Findings will appear here when the run finishes. You can follow each step in the live log.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {a.shipReadyBadgeIssued ? (
                <ShipReadyBadge runSeed={a.runSeed} determinismHash={a.determinismHash} />
              ) : null}

              {a.status === "FAILED" ? (
                <div className="rounded border border-red-500/40 bg-red-500/5 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-red-400">
                    run failed
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-red-300">
                    {a.errorMessage ?? "Unknown failure — see terminal log."}
                  </p>
                  <button
                    type="button"
                    onClick={relaunch}
                    disabled={starting}
                    className="mt-2 rounded bg-red-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-red-400 focus:outline-none disabled:opacity-50"
                  >
                    {starting ? "re-launching…" : "Re-run it"}
                  </button>
                  {startError ? (
                    <p className="mt-1 font-mono text-[11px] text-red-400">⚠ {startError}</p>
                  ) : null}
                </div>
              ) : null}

              {/* Clean report state — honest funnel (PRD FR-5/pricing rule) */}
              {a.status === "COMPLETED" && a.totalBugsFound === 0 ? (
                <div className="rounded border border-emerald-400/50 bg-emerald-400/10 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-300">✓</span>
                    <span className="text-sm font-bold text-emerald-300">
                      No findings in this run
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] leading-4 text-emerald-100/70">
                    Nothing to autopsy — we don't sell empty reports. Keep it that
                    way after the demo reboot.
                  </p>
                  <div className="mt-2">
                    <ShieldOnlyCta auditId={a.id} />
                  </div>
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
    <div className="flex min-h-screen flex-col bg-ink">
      <TreasuryHeader />
      <main key={reloadKey}>
        <ReportBody auditId={auditId} refetch={() => setReloadKey((k) => k + 1)} />
      </main>
    </div>
  );
}

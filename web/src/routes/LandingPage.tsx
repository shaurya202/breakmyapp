import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convexApi";
import { navigate } from "../router";
import TreasuryHeader from "../components/TreasuryHeader";
import StatusPill, { type AuditStatus } from "../components/StatusPill";
import { hostOf, timeAgo } from "../lib/format";
import { normalizeUrl, isPublicWebUrl, SUITE_VERSION } from "../../../convex/deterministic";

const PIPELINE = [
  { step: "01", name: "Submit a URL", desc: "No account or payment needed." },
  { step: "02", name: "Watch the run", desc: "A fixed suite tests desktop and mobile." },
  { step: "03", name: "Inspect the proof", desc: "See findings, seed, and run hash." },
];

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
];

function validateTargetUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Paste a URL to audit.";
  if (!isPublicWebUrl(normalizeUrl(trimmed))) return "Only public web URLs can be audited (no localhost / private IPs).";

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return "That doesn't look like a URL. Paste a full web address.";
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    return "That doesn't look like a URL. Paste a full web address.";
  }

  const host = parsed.hostname.replace(/^www\./i, "");
  if (!host || !host.includes(".")) {
    return "That doesn't look like a URL. Paste a full web address.";
  }

  if (BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    return "Only public web URLs can be audited (no localhost / private IPs).";
  }

  return null;
}

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const known = [
    "That doesn't look like a URL. Paste a full web address.",
    "Only public web URLs can be audited (no localhost / private IPs).",
  ];

  for (const message of known) {
    if (raw.includes(message)) return message;
  }

  const serverErrorIndex = raw.indexOf("Server Error");
  if (serverErrorIndex >= 0) {
    const afterServerError = raw.slice(serverErrorIndex + "Server Error".length);
    const match = afterServerError.match(/Uncaught Error:\s*(.+)/);
    if (match) return match[1].trim().split("\n")[0];
  }

  return "Could not start the run — check the URL.";
}

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const startFromUrl = useMutation(api.audits.startFromUrl);
  const recent = useQuery(api.audits.listRecent, { limit: 12 });

  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const trimmed = url.trim();
    const validationError = validateTargetUrl(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    setPending(true);
    try {
      const { auditId } = await startFromUrl({ targetUrl: trimmed });
      navigate(`/audit/${auditId}`);
    } catch (err) {
      setError(friendlyError(err));
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <TreasuryHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 sm:px-8">
        <section className="grid gap-8 border-b border-line py-14 md:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] md:items-center md:gap-12 md:py-24">
          <div>
            <div className="mb-7 flex items-center gap-2 font-mono text-xs font-semibold text-acid"><span className="h-2 w-2 rounded-full bg-acid" /> Free deterministic app audits</div>
            <h1 className="max-w-3xl text-[clamp(3.4rem,7vw,6.5rem)] font-black leading-[0.96] tracking-[-0.075em] text-white">
              Break it now.<br />Ship it sure.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-neutral-300 sm:text-lg">
              Put your live app through a repeatable browser test. We show you what broke, how to reproduce it, and the exact run that found it.
            </p>
            <form onSubmit={launch} className="mt-9 max-w-2xl">
              <label htmlFor="audit-url" className="mb-2 block text-sm font-bold text-white">Your app URL</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="audit-url"
                  type="text"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-app.com"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "audit-url-error" : "audit-url-hint"}
                  className="min-w-0 flex-1 rounded-md border border-[#587077] bg-[#0a1216] px-4 py-3.5 font-mono text-sm text-white placeholder:text-[#9eb1b5] focus:border-acid focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="shrink-0 rounded-md bg-acid px-6 py-3.5 text-sm font-bold text-ink hover:bg-white disabled:opacity-60"
                >
                  {pending ? "Starting audit…" : "Run free audit"}
                </button>
              </div>
              {error ? <p id="audit-url-error" role="alert" className="mt-2 text-sm text-red-300">{error}</p> : <p id="audit-url-hint" className="mt-2 text-xs text-neutral-500">No sign-up. No payment. Your report opens when the run starts.</p>}
            </form>
          </div>
          <div className="grid-bg relative overflow-hidden rounded-xl border border-line bg-panel p-4 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-6" aria-label="What the audit checks">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-acid/10 blur-3xl" />
            <div className="relative rounded-lg border border-line bg-[#0a1216] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4 font-mono text-xs"><span className="text-white">Run protocol</span><span className="text-acid">{SUITE_VERSION}</span></div>
              <div className="space-y-5 py-6">
                <div className="flex gap-4"><span className="font-mono text-acid">01</span><div><strong className="text-sm text-white">Two viewports</strong><p className="mt-1 text-sm text-neutral-500">Desktop 1440 × 900 and mobile 390 × 844</p></div></div>
                <div className="flex gap-4"><span className="font-mono text-acid">02</span><div><strong className="text-sm text-white">Seeded interactions</strong><p className="mt-1 text-sm text-neutral-500">Same URL, same input sequence on every run</p></div></div>
                <div className="flex gap-4"><span className="font-mono text-acid">03</span><div><strong className="text-sm text-white">Verifiable evidence</strong><p className="mt-1 text-sm text-neutral-500">Findings arrive with a seed and run hash</p></div></div>
              </div>
              <div className="border-t border-line pt-4 font-mono text-[11px] leading-5 text-neutral-500">The free report includes every finding title and one complete proof.</div>
            </div>
          </div>
        </section>

        <section aria-label="How it works" className="grid gap-4 border-b border-line py-8 sm:grid-cols-3">
          {PIPELINE.map((p) => <div key={p.step} className="flex gap-4"><span className="font-mono text-sm text-acid">{p.step}</span><div><h2 className="font-bold text-white">{p.name}</h2><p className="mt-1 text-sm text-neutral-500">{p.desc}</p></div></div>)}
        </section>

        {/* Recent runs */}
        <section className="mt-12 flex-1 pb-16">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-2xl font-bold tracking-tight text-white">Recent audits</h2><p className="mt-1 text-sm text-neutral-500">Live runs from discovered launches and submitted URLs.</p></div>
          </div>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
            {!recent ? (
              <div className="px-5 py-8 text-sm text-neutral-500" role="status">
                Loading audits…
              </div>
            ) : recent.length === 0 ? (
              <div className="px-5 py-8 text-sm text-neutral-500">
                No audits yet. Enter a URL above to run the first one.
              </div>
            ) : (
              recent.map((r) => (
                <button
                  key={r._id}
                  type="button"
                  onClick={() => navigate(`/audit/${r._id}`)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 basis-48 truncate text-sm font-bold text-white">
                    {r.projectName}
                    <span className="mt-0.5 block truncate font-mono text-xs font-normal text-neutral-500">{hostOf(r.targetUrl)}</span>
                  </span>
                  <StatusPill status={r.status as AuditStatus} />
                  {r.shipReadyBadgeIssued ? (
                    <span className="rounded border border-emerald-400/50 bg-emerald-400/10 px-2 py-1 text-xs font-bold text-emerald-300">
                      Ship-ready
                    </span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-4 whitespace-nowrap font-mono text-xs">
                    <span className="text-neutral-500" aria-label={`Health score ${r.healthScore} out of 100`}>
                      Health{" "}
                      <span
                        className={
                          r.healthScore >= 90
                            ? "text-acid"
                            : r.healthScore >= 70
                              ? "text-amber-400"
                              : "text-red-400"
                        }
                      >
                        {r.healthScore}
                      </span>
                    </span>
                    <span className={r.totalBugsFound > 0 ? "text-red-300" : "text-neutral-500"}>
                      {r.totalBugsFound} bug{r.totalBugsFound === 1 ? "" : "s"}
                    </span>
                    <span className="hidden text-neutral-500 md:inline">
                      {timeAgo(r._creationTime)}
                    </span>
                    <span aria-hidden="true" className="text-acid">↗</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-line py-5 text-sm text-neutral-500">
          BreakMyApp · Repeatable evidence for every run
        </footer>
      </main>
    </div>
  );
}

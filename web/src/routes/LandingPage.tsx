import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api, WHOP_CREATE_SHIELD_CHECKOUT } from "../convexApi";
import { navigate } from "../router";
import TreasuryHeader from "../components/TreasuryHeader";
import { normalizeUrl, isPublicWebUrl } from "../../../convex/deterministic";

const PIPELINE = [
  { step: "01", name: "File the target", desc: "Paste any public web address. No account needed — the run starts immediately." },
  { step: "02", name: "Watch execution", desc: "A real browser session clicks, submits, and resizes your app while the log ticks." },
  { step: "03", name: "Read the findings", desc: "Every bug ships with severity, reproduction steps, a screenshot, and a code fix." },
  { step: "04", name: "Pay only for depth", desc: "Titles and the first bug are free. The full report costs $9. A passing re-run earns the seal." },
];

const COVERAGE = [
  { name: "Console crashes", desc: "Uncaught errors and render failures, captured with the raw stack trace." },
  { name: "Server 500s", desc: "Routes and requests returning broken responses during the session." },
  { name: "Mobile overflow", desc: "Layout cutoffs at 390×844 — elements escaping the viewport." },
  { name: "Dead controls", desc: "Buttons and links that fire handlers but change nothing." },
  { name: "Exposed keys", desc: "Leaked secrets and missing security headers on the public surface." },
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

/** Sample findings ledger — the artifact, not a fake browser window. */
function SampleLedger() {
  return (
    <aside className="border border-ink bg-paper" aria-label="Sample test inspection">
      <div className="flex items-baseline justify-between border-b border-ink px-4 py-2.5">
        <span className="kicker">Excerpt · audit 9F3A-C21B</span>
        <span className="font-mono text-xs text-mut">site:your-app.com</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {[
            ["Mobile layout, 390×844", "no cutoffs"],
            ["Buttons & links", "14 exercised"],
            ["Checkout button", "hydration error"],
          ].map(([item, result], i) => {
            const failed = i === 2;
            return (
              <tr key={item} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5">{item}</td>
                <td className={"px-4 py-2.5 text-right font-mono text-xs " + (failed ? "font-semibold text-stamp" : "text-mut")}>
                  {result}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-ink px-4 py-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-stamp">
          1 finding — critical
        </span>
        <pre className="mt-2 whitespace-pre-wrap bg-ink px-3.5 py-2.5 font-mono text-xs leading-relaxed text-phosphor">
          {`// Suggested fix in checkout.tsx
- onClick={handleClick()}
+ onClick={() => handleClick()}`}
        </pre>
      </div>
    </aside>
  );
}

/**
 * Launch Shield checkout with no audit row: takes the URL to protect, gets a
 * Whop-hosted purchase link (metadata carries targetUrl for the webhook), and
 * sends the browser to it. Payments happen on Whop — never in-app card forms.
 */
function ShieldCheckoutCard() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [purchaseUrl, setPurchaseUrl] = useState<string | null>(null);
  const createShieldCheckout = useAction(WHOP_CREATE_SHIELD_CHECKOUT);

  const start = async (e: React.FormEvent) => {
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
      const res = await createShieldCheckout({ targetUrl: normalizeUrl(trimmed) });
      if (res?.configured && res.purchaseUrl) {
        setPurchaseUrl(res.purchaseUrl);
        // The Whop link *is* the payment surface.
        window.location.assign(res.purchaseUrl);
        return;
      }
      setError(res?.message ?? "Checkout unavailable — Whop not linked in this environment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="border-t-2 border-ink pt-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-bold">Launch Shield</h2>
        <span className="font-mono text-sm font-semibold tabular-nums">$29<span className="ml-1 text-xs font-normal text-mut">/mo</span></span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-mut">
        Continuous monitoring for your live site: automatic hourly re-scans, unlock included on every re-run, instant alerts when a new bug appears after a deploy.
      </p>
      <form onSubmit={start} aria-busy={pending} className="mt-4">
        <label htmlFor="shield-url" className="mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.14em] text-mut">
          Site to protect
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="shield-url"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-website.com"
            autoComplete="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "shield-url-error" : "shield-url-hint"}
            className="min-w-0 flex-1 border border-ink bg-paper px-4 py-3 font-mono text-sm text-ink placeholder:text-mut/70 focus:bg-sink focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 border border-ink bg-ink px-6 py-3 font-mono text-sm font-semibold uppercase tracking-[0.06em] text-paper transition-transform duration-150 hover:bg-ink-2 active:translate-y-px disabled:opacity-60"
          >
            {pending ? "Opening Whop…" : "Protect — via Whop ↗"}
          </button>
        </div>
        {error ? (
          <p id="shield-url-error" role="alert" className="mt-2 text-sm text-stamp">{error}</p>
        ) : (
          <p id="shield-url-hint" className="mt-2 font-mono text-xs text-mut">Payment happens on Whop's secure checkout. Cancel anytime.</p>
        )}
      </form>
      {purchaseUrl ? (
        <a href={purchaseUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center border border-ink bg-paper px-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-sink">
          Not redirected? Open the Whop checkout ↗
        </a>
      ) : null}
    </div>
  );
}

/**
 * Visible place to pay (FR-4): the free funnel stays account-less, and the
 * two paid surfaces are laid out here — Full Autopsy unlock on the report
 * page, Launch Shield straight from the landing page, both via Whop links.
 */
function PricingSection() {
  return (
    <section aria-label="Pricing" className="border-b border-line py-10 md:py-14">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="kicker">Pricing · payments via Whop checkout</p>
        <p className="font-mono text-xs text-mut">Free audit first. Pay only for depth.</p>
      </div>
      <div className="mt-6 grid gap-x-10 gap-y-10 md:grid-cols-2">
        <div className="border-t-2 border-ink pt-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-base font-bold">Full Autopsy</h2>
            <span className="font-mono text-sm font-semibold tabular-nums">$9<span className="ml-1 text-xs font-normal text-mut">one-time</span></span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-mut">
            <li>· Step-by-step reproduction for every finding</li>
            <li>· Raw error logs, screenshots, and payloads</li>
            <li>· Ready-to-copy suggested code fixes</li>
            <li>· 1 fix-verification re-run within 72 h</li>
          </ul>
          <button
            type="button"
            onClick={() => document.getElementById("audit-url")?.focus()}
            className="mt-4 inline-flex min-h-11 items-center border border-ink bg-paper px-4 text-sm font-bold uppercase tracking-[0.04em] hover:bg-sink active:translate-y-px"
          >
            Unlock after your run — on the report page
          </button>
          <p className="mt-2 font-mono text-xs text-mut">Whop checkout opens on the report page, right next to your findings.</p>
        </div>
        <ShieldCheckoutCard />
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const startFromUrl = useMutation(api.audits.startFromUrl);

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
    <div className="flex min-h-screen flex-col bg-paper">
      <TreasuryHeader />

      <main id="main-content" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 sm:px-8">
        {/* Hero: typed like a filing header, not a glow reel */}
        <section className="grid gap-10 border-b border-line py-12 md:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] md:items-center md:gap-14 md:py-20">
          <div>
            <p className="kicker">Independent QA bureau · deterministic runs</p>
            <h1 className="mt-4 max-w-2xl text-display font-extrabold">
              Break it now.<br />Ship it sure.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-mut sm:text-lg">
              We crash-test your website before your customers do — same seed, same suite, every run — then hand you the findings with exact fixes.
            </p>
            <form onSubmit={launch} aria-busy={pending} className="mt-8 max-w-xl">
              <label htmlFor="audit-url" className="mb-2 block font-mono text-xs font-semibold uppercase tracking-[0.14em] text-mut">
                Your app URL
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="audit-url"
                  type="text"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-website.com"
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "audit-url-error" : "audit-url-hint"}
                  className="min-w-0 flex-1 border border-ink bg-paper px-4 py-3 font-mono text-sm text-ink placeholder:text-mut/70 focus:bg-sink focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="shrink-0 border border-ink bg-ink px-6 py-3 font-mono text-sm font-semibold uppercase tracking-[0.06em] text-paper transition-transform duration-150 hover:bg-ink-2 active:translate-y-px disabled:opacity-60"
                >
                  {pending ? "Filing run…" : "Run free audit"}
                </button>
              </div>
              {error ? (
                <p id="audit-url-error" role="alert" className="mt-2 text-sm text-stamp">{error}</p>
              ) : (
                <p id="audit-url-hint" className="mt-2 font-mono text-xs text-mut">Free test. No account required. Results in seconds.</p>
              )}
            </form>
          </div>

          <SampleLedger />
        </section>

        {/* Method: numbered ledger, no icons, no cards */}
        <section aria-label="How it works" className="border-b border-line py-10 md:py-14">
          <p className="kicker">Method</p>
          <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((p) => (
              <div key={p.step} className="border-t-2 border-ink pt-3">
                <span className="font-mono text-xs font-semibold text-stamp">{p.step}</span>
                <h2 className="mt-1 text-base font-bold">{p.name}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-mut">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Coverage: printed form rows instead of feature cards */}
        <section aria-label="What gets tested" className="border-b border-line py-10 md:py-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="kicker">Coverage · suite deterministic-suite@1.1</p>
            <p className="font-mono text-xs text-mut">Desktop + mobile, every run, on the record</p>
          </div>
          <div className="mt-6 grid gap-x-14 lg:grid-cols-2">
            {COVERAGE.map((c) => (
              <div key={c.name} className="flex gap-5 border-t border-line py-4">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 border border-ink" />
                <div>
                  <h3 className="text-sm font-bold">{c.name}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-mut">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <PricingSection />
      </main>

      <footer className="bg-ink text-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-6 sm:px-8">
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">BreakMyApp</span>
          <span className="text-sm text-paper/70">Automated bug-testing with zero guesswork — every run on the record.</span>
          <div className="flex gap-6 text-sm">
            <a className="text-paper/70 underline hover:text-paper" href="/privacy">Privacy</a>
            <a className="text-paper/70 underline hover:text-paper" href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

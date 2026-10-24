import { useState } from "react";
import { useAction } from "convex/react";
import { WHOP_CREATE_CHECKOUT_SESSION } from "../convexApi";
import type { WhopSessionResult, Id } from "../convexApi";
import { WhopCheckoutEmbed } from "@whop/checkout/react";

export type Tier = "FULL_AUTOPSY" | "SHIELD";

/** Shared Whop checkout starter — one action, three answer paths. */
export function useCheckoutStart(auditId: Id<"audits">) {
  const createCheckoutSession = useAction(WHOP_CREATE_CHECKOUT_SESSION);
  const [pendingTier, setPendingTier] = useState<Tier | null>(null);
  const [session, setSession] = useState<{ sessionId: string; tier: Tier } | null>(
    null
  );
  const [fallbackUrl, setFallbackUrl] = useState<{ url: string; tier: Tier } | null>(
    null
  );
  const [degraded, setDegraded] = useState<string | null>(null);

  const start = async (tier: Tier) => {
    setPendingTier(tier);
    setDegraded(null);
    try {
      const res = (await createCheckoutSession({ auditId, tier })) as WhopSessionResult;
      if (res?.configured && res.purchaseUrl) {
        // Prefer the hosted checkout link: it carries audit metadata and reliably
        // loads, while an embedded session can be reported as unavailable.
        setFallbackUrl({ url: res.purchaseUrl, tier });
        setSession(null);
      } else if (res?.configured && res.sessionId) {
        setSession({ sessionId: res.sessionId, tier });
        setFallbackUrl(null);
        // Embedded 1-Click checkout (Apple/Google Pay, saved card) takes over.
      } else {
        setDegraded(
          res?.message ?? "Whop not linked yet (demo env: unlock disabled)"
        );
        setSession(null);
        setFallbackUrl(null);
      }
      setPendingTier(null);
    } catch (e) {
      setDegraded(e instanceof Error ? e.message : String(e));
      setPendingTier(null);
    }
  };

  return { start, pendingTier, session, fallbackUrl, degraded };
}

const EMBED_LABELS: Record<Tier, string> = {
  FULL_AUTOPSY: "Unlock Full Report",
  SHIELD: "Continuous Monitoring",
};

/**
 * The Whop embed is third-party infrastructure inside its own dark island —
 * the one neutral place dark chrome is allowed besides the execution log.
 * No forced accent color: the widget sets its own.
 */
export function CheckoutEmbed({
  sessionId,
  tier,
  onComplete,
}: {
  sessionId: string;
  tier: Tier;
  onComplete: () => void;
}) {
  return (
    <div className="border border-ink bg-ink p-4">
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-paper/70">
        Secure checkout
      </div>
      <div className="mt-3">
        <WhopCheckoutEmbed
          sessionId={sessionId}
          theme="dark"
          themeOptions={{ buttonText: EMBED_LABELS[tier] }}
          onComplete={() => onComplete()}
        />
      </div>
    </div>
  );
}

/**
 * Deep-fix paywall (FR-4). Renders after the run completes and only when the
 * deterministic suite found criticals and the audit is still locked. All
 * three Whop answer paths degrade gracefully — the report itself (titles,
 * severities, Bug #1, manifest) was already free (FR-3).
 */
export default function CheckoutPanel({
  auditId,
  unlockPriceCents,
  onUnlocked,
}: {
  auditId: Id<"audits">;
  unlockPriceCents: number;
  onUnlocked: () => void;
}) {
  const { start, pendingTier, session, fallbackUrl, degraded } =
    useCheckoutStart(auditId);

  if (session) {
    return (
      <CheckoutEmbed
        sessionId={session.sessionId}
        tier={session.tier}
        onComplete={onUnlocked}
      />
    );
  }

  return (
    <div className="border-2 border-ink bg-paper p-6 sm:p-8">
      <p className="kicker">Full report</p>
      <h2 className="mt-2 text-section font-bold">
        Unlock full bug details and code fixes
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-mut">
        Get step-by-step reproduction guides, screenshots, and ready-to-copy code fixes for every bug, or protect your app after future updates.
      </p>
      {fallbackUrl ? (
        <a
          href={fallbackUrl.url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-11 items-center bg-stamp px-5 text-sm font-bold uppercase tracking-[0.04em] text-paper hover:bg-ink"
        >
          Continue to secure {fallbackUrl.tier === "FULL_AUTOPSY" ? "Full Report" : "Continuous Monitoring"} checkout ↗
        </a>
      ) : null}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("FULL_AUTOPSY")}
          className="flex-1 border border-ink bg-ink px-4 py-3 text-sm font-bold uppercase tracking-[0.04em] text-paper transition-transform duration-150 active:translate-y-px disabled:opacity-50"
        >
          {pendingTier === "FULL_AUTOPSY"
            ? "Starting…"
            : `Unlock Full Report — $${(unlockPriceCents / 100).toFixed(2)}`}
        </button>
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("SHIELD")}
          className="flex-1 border border-ink bg-paper px-4 py-3 text-sm font-bold uppercase tracking-[0.04em] transition-transform duration-150 hover:bg-sink active:translate-y-px disabled:opacity-50"
        >
          {pendingTier === "SHIELD" ? "Starting…" : "Continuous Monitoring — $29/mo"}
        </button>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-mut">
        Full Report ($9): Step-by-step reproduction, error logs, screenshots, ready-to-use code fixes, plus 1 free re-test after you fix bugs. Continuous Monitoring ($29/mo): Re-tests your site automatically after every update.
      </p>
      {degraded ? (
        <div role="alert" className="mt-4 border-l-2 border-stamp bg-sink px-3 py-2 text-sm">
          {degraded}
        </div>
      ) : null}
    </div>
  );
}

/** Compact Shield CTA used by the honest-funnel clean state (zero criticals). */
export function ShieldOnlyCta({ auditId }: { auditId: Id<"audits"> }) {
  const { start, pendingTier, session, fallbackUrl, degraded } =
    useCheckoutStart(auditId);

  if (session) {
    return (
      <CheckoutEmbed
        sessionId={session.sessionId}
        tier="SHIELD"
        onComplete={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-pass/30 pt-4 text-left">
      {fallbackUrl ? (
        <a
          href={fallbackUrl.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center border border-ink bg-paper px-4 text-center font-mono text-xs font-semibold uppercase tracking-[0.08em] hover:bg-sink"
        >
          Open Continuous Monitoring checkout ↗
        </a>
      ) : (
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("SHIELD")}
          className="inline-flex min-h-11 items-center self-start border border-ink bg-ink px-4 text-sm font-bold uppercase tracking-[0.04em] text-paper hover:bg-ink-2 disabled:opacity-50"
        >
          {pendingTier === "SHIELD"
            ? "Starting monitoring…"
            : "Continuous Monitoring — $29/mo · keep your site clean after every update"}
        </button>
      )}
      {degraded ? (
        <span role="alert" className="border-l-2 border-stamp bg-sink px-3 py-2 text-sm">
          {degraded}
        </span>
      ) : null}
    </div>
  );
}

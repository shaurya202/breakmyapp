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
  FULL_AUTOPSY: "Unlock Full Autopsy",
  SHIELD: "Launch Shield",
};

/** Inline dark embed — theme "dark", chartreuse accent to match the terminal. */
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
    <div className="rounded-lg border border-acid/40 bg-black/50 p-4">
      <div className="mb-3 text-sm font-bold text-white">
        Secure checkout
      </div>
      <WhopCheckoutEmbed
        sessionId={sessionId}
        theme="dark"
        themeOptions={{ accentColor: "lime", buttonText: EMBED_LABELS[tier] }}
        onComplete={() => onComplete()}
      />
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
    <div className="rounded-lg border border-acid/40 bg-acid/5 p-5 sm:p-6">
      <h2 className="text-xl font-bold text-white">Go deeper on every finding</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-300">Unlock the full evidence and suggested fixes, or keep checking your app after future deploys.</p>
      {fallbackUrl ? (
        <a
          href={fallbackUrl.url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block rounded-md bg-acid px-4 py-3 text-center text-sm font-bold text-ink hover:bg-white"
        >
          Continue to secure {fallbackUrl.tier === "FULL_AUTOPSY" ? "Full Autopsy" : "Launch Shield"} checkout ↗
        </a>
      ) : null}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("FULL_AUTOPSY")}
          className="flex-1 rounded-md bg-acid px-4 py-3 text-sm font-bold text-ink hover:bg-white disabled:opacity-50"
        >
          {pendingTier === "FULL_AUTOPSY"
            ? "starting…"
            : `Unlock Full Autopsy — $${(unlockPriceCents / 100).toFixed(2)}`}
        </button>
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("SHIELD")}
          className="flex-1 rounded-md border border-acid/50 bg-acid/10 px-4 py-3 text-sm font-bold text-acid hover:bg-acid/20 disabled:opacity-50"
        >
          {pendingTier === "SHIELD" ? "starting…" : "Launch Shield — $29/mo"}
        </button>
      </div>
      <p className="mt-4 text-xs leading-5 text-neutral-500">
        Full Autopsy: all traces, screenshots + every AI fix patch, 1
        deterministic verification re-run (72h). Shield: re-scan after every
        deploy + unlimited re-runs.
      </p>
      {degraded ? (
        <div role="alert" className="mt-4 rounded border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
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
    <div className="flex flex-col gap-2">
      {fallbackUrl ? (
        <a
          href={fallbackUrl.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-acid/60 bg-acid/15 px-4 py-2.5 text-center text-sm font-bold text-acid"
        >
          Open Launch Shield checkout ↗
        </a>
      ) : (
        <button
          type="button"
          disabled={pendingTier !== null}
          onClick={() => start("SHIELD")}
          className="self-start rounded-md bg-acid px-4 py-2.5 text-sm font-bold text-ink hover:bg-white disabled:opacity-50"
        >
          {pendingTier === "SHIELD"
            ? "starting shield…"
            : "Launch Shield — $29/mo · keep it clean after every deploy"}
        </button>
      )}
      {degraded ? (
        <span role="alert" className="rounded border border-amber-500/50 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
          {degraded}
        </span>
      ) : null}
    </div>
  );
}

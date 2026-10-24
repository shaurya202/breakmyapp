import { useRef } from "react";
import { useQuery } from "convex/react";
import { useAuth } from "@workos-inc/authkit-react";
import { api } from "../convexApi";
import { authConfigured } from "../convex";

/**
 * Masthead styled as a bureau ledger strip: ink rule, tabular figures,
 * and account controls that look like printed pass-checks — no decorative
 * status dot (tell #7: a dot with no defined state is noise).
 */
export default function TreasuryHeader() {
  const t = useQuery(api.treasury.get);

  return (
    <header className="border-b-2 border-ink bg-paper">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a href="/" className="flex min-h-11 items-center gap-2.5 text-ink no-underline" aria-label="BreakMyApp home">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-ink font-mono text-xs font-semibold text-paper">&gt;</span>
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em]">BreakMyApp</span>
        </a>
        <div className="flex items-center gap-6" role="group" aria-label="Platform activity">
          <div className="hidden items-center gap-6 sm:flex">
            <div className="text-right">
              <span className="block text-[11px] text-mut">Audits executed</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{t?.totalAuditsExecuted ?? 0}</span>
            </div>
            <div className="text-right">
              <span className="block text-[11px] text-mut">Bugs caught</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{t?.totalBugsCaught ?? 0}</span>
            </div>
          </div>
          <AuthArea />
        </div>
      </div>
    </header>
  );
}

/**
 * WorkOS AuthKit account controls (header-level, both pages). Sign-in/up go
 * through the hosted AuthKit OAuth flow; the chip opens a printed pass-check
 * styled account menu. Hidden entirely until VITE_WORKOS_CLIENT_ID is set so
 * demo environments degrade instead of dead-ending.
 */
function AuthArea() {
  const { isLoading, user, signIn, signUp, signOut } = useAuth();
  const menuRef = useRef<HTMLDetailsElement | null>(null);

  // Native <details> ignores Escape; close it and return focus to the trigger.
  const closeOnEscape = (e: React.KeyboardEvent<HTMLDetailsElement>) => {
    if (e.key !== "Escape" || !menuRef.current?.open) return;
    e.preventDefault();
    menuRef.current.open = false;
    menuRef.current.querySelector("summary")?.focus();
  };

  if (isLoading) {
    // Reserve the controls' space so the masthead doesn't jitter on load.
    return <div className="h-11 w-[124px]" aria-hidden="true" />;
  }

  if (!user) {
    if (!authConfigured) return null;
    return (
      <div className="flex items-center gap-2" role="group" aria-label="Account">
        <button
          type="button"
          onClick={() => void signIn()}
          className="inline-flex min-h-11 items-center border border-ink bg-paper px-3 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-ink hover:bg-sink active:translate-y-px"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => void signUp()}
          className="inline-flex min-h-11 items-center border border-ink bg-ink px-3 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-paper hover:bg-ink-2 active:translate-y-px"
        >
          Create account
        </button>
      </div>
    );
  }

  const who = user.firstName || user.email.split("@")[0];
  return (
    <details ref={menuRef} onKeyDown={closeOnEscape} className="relative">
      <summary aria-label={`Account: ${user.email}`} className="inline-flex min-h-11 max-w-[240px] cursor-pointer list-none items-center rounded-sm border border-ink bg-paper px-3 font-mono text-xs font-semibold text-ink hover:bg-sink [&::-webkit-details-marker]:hidden">
        <span className="truncate">{who}</span>
        <span aria-hidden="true" className="ml-1.5 text-mut">▾</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 border border-ink bg-paper p-4 shadow-lg">
        <p className="kicker">Account · WorkOS</p>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between gap-4 border-b border-line pb-1.5">
            <dt className="text-mut">Name</dt>
            <dd className="font-mono truncate">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line pb-1.5">
            <dt className="text-mut">Email</dt>
            <dd className="font-mono truncate">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-mut">Session</dt>
            <dd className="font-mono">{user.emailVerified ? "verified" : "unverified"}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => signOut({ returnTo: window.location.origin })}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center border border-ink bg-paper px-3 font-mono text-xs font-semibold uppercase tracking-[0.1em] hover:bg-sink active:translate-y-px"
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

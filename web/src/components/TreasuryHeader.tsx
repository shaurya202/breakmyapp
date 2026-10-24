import { useQuery } from "convex/react";
import { api } from "../convexApi";
import { centsToUsd } from "../lib/format";

export default function TreasuryHeader() {
  const t = useQuery(api.treasury.get);
  return (
    <header className="border-b border-line bg-ink">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4 sm:px-8">
        <a href="/" className="group flex items-center gap-3 text-white no-underline" aria-label="BreakMyApp home">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-acid bg-acid font-mono text-lg font-bold tracking-tighter text-ink">/&gt;</span>
          <span className="text-lg font-black tracking-[-0.05em]">breakmyapp<span className="text-acid">.</span></span>
        </a>
        <div className="ml-auto flex items-center gap-5 sm:gap-8" aria-label="Platform activity">
          <div className="hidden sm:block">
            <span className="block font-mono text-[10px] text-neutral-500">Audits run</span>
            <span className="text-base font-bold tabular-nums text-white">{t?.totalAuditsExecuted ?? 0}</span>
          </div>
          <div className="hidden sm:block">
            <span className="block font-mono text-[10px] text-neutral-500">Bugs found</span>
            <span className="text-base font-bold tabular-nums text-white">{t?.totalBugsCaught ?? 0}</span>
          </div>
          <details className="relative text-right">
            <summary className="list-none rounded border border-line px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-acid/60 [&::-webkit-details-marker]:hidden">Company ledger <span aria-hidden="true" className="ml-1 text-acid">⌄</span></summary>
            <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-line bg-panel p-4 text-left shadow-2xl shadow-black/50">
              <p className="mb-3 text-sm font-bold text-white">Autonomous company ledger</p>
              <dl className="space-y-2 font-mono text-xs">
                {[
                  ["Whop revenue", centsToUsd(t?.totalWhopRevenueCents)],
                  ["Whop fees", centsToUsd(t?.totalWhopFeesCents)],
                  ["Terac labor", centsToUsd(t?.totalTeracLaborCents)],
                  ["Solari compute", centsToUsd(t?.totalSolariComputeCostCents)],
                ].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-neutral-500">{label}</dt><dd className="text-white">{value}</dd></div>)}
                <div className="flex justify-between gap-4 border-t border-line pt-2"><dt className="text-neutral-300">Net profit</dt><dd className="font-bold text-acid">{centsToUsd(t?.netAutonomousProfitCents)}</dd></div>
              </dl>
              <p className="mt-3 border-t border-line pt-2 text-[10px] leading-4 text-neutral-500">Whop dashboard is the revenue source of truth.</p>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

import { useEffect, useRef } from "react";
import { logLineParts } from "../lib/format";

const LIVE_STATUSES = new Set([
  "QUEUED",
  "EXA_ENRICHING",
  "DETERMINISTIC_RUN_RUNNING",
  "SANDBOX_ANALYZING",
]);

/**
 * The single dark island on the page: a machine readout, styled like one.
 * The phosphor accent appears here and nowhere else, and it only marks
 * live state — one indicator, one defined meaning (tell #7 fix).
 */
export default function TerminalFeed({
  lines,
  status,
}: {
  lines: string[];
  status: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    if (stick.current) box.scrollTop = box.scrollHeight;
  }, [lines]);

  const isLive = LIVE_STATUSES.has(status);

  return (
    <div
      aria-label="Execution log"
      className="flex h-full min-h-64 flex-col overflow-hidden bg-ink text-paper"
    >
      <div className="flex items-center justify-between border-b border-ink-2 px-4 py-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em]">
          Execution log
        </span>
        {isLive ? (
          <span className="font-mono text-xs text-phosphor">
            <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-live rounded-full bg-phosphor align-middle" />
            running
          </span>
        ) : (
          <span className="font-mono text-xs text-paper/50">complete</span>
        )}
      </div>
      <div
        ref={boxRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Test run log"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="scroll-hair flex-1 overflow-y-auto px-4 py-4 font-mono text-xs leading-6"
      >
        {lines.length === 0 ? <p className="text-paper/40">Booting test browser…</p> : null}
        {lines.map((line, i) => {
          const { stamp, text } = logLineParts(line);
          const err = /^(.*RUN FAILED|.*LOCKED_AGAIN)/.test(text);
          return (
            <div key={i} className="flex gap-2.5">
              {stamp ? (
                <span className="shrink-0 text-paper/35">{stamp}</span>
              ) : null}
              <span
                className={
                  "break-all " + (err ? "text-[#e8705f]" : "text-paper/70")
                }
              >
                {text}
              </span>
            </div>
          );
        })}
        {isLive ? (
          <span
            aria-hidden="true"
            className="ml-7 inline-block h-3.5 w-2 translate-y-0.5 bg-phosphor"
          />
        ) : null}
      </div>
    </div>
  );
}

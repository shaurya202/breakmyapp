import { useEffect, useRef } from "react";
import { logLineParts } from "../lib/format";

const LIVE_STATUSES = new Set([
  "QUEUED",
  "EXA_ENRICHING",
  "DETERMINISTIC_RUN_RUNNING",
  "SANDBOX_ANALYZING",
]);

/**
 * Live run terminal: newest lines at the bottom, autoscroll, dimmed
 * timestamps, blinking block cursor while the suite is executing.
 * Deterministic steps read like a protocol, not a magic trick (FR-3).
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
    <div className="flex h-full min-h-64 flex-col overflow-hidden rounded-lg border border-line bg-[#091216]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-bold text-white">
          Run log
        </span>
        {isLive ? (
          <span className="font-mono text-xs text-acid">● Running</span>
        ) : (
          <span className="font-mono text-xs text-neutral-500">● Idle</span>
        )}
      </div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="terminal-scroll flex-1 overflow-y-auto px-4 py-4 font-mono text-xs leading-6"
      >
        {lines.length === 0 ? <p className="text-neutral-500">Waiting for the first run event…</p> : null}
        {lines.map((line, i) => {
          const { stamp, text } = logLineParts(line);
          const err = /^(.*RUN FAILED|.*LOCKED_AGAIN)/.test(text);
          return (
            <div key={i} className="flex gap-2">
              {stamp ? (
                <span className="shrink-0 text-neutral-500">{stamp}</span>
              ) : null}
              <span
                className={
                  "break-all " + (err ? "text-red-400" : "text-neutral-300")
                }
              >
                {text}
              </span>
            </div>
          );
        })}
        {isLive ? (
          <span className="inline-block h-3.5 w-2 translate-y-0.5 bg-acid animate-cursor-blink" />
        ) : null}
      </div>
    </div>
  );
}

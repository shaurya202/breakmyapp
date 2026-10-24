/** Formats for the terminal aesthetic — money, hosts, hashes, seeds. */

export function centsToUsd(cents: number | null | undefined): string {
  const c = typeof cents === "number" && isFinite(cents) ? cents : 0;
  const sign = c < 0 ? "-" : "";
  return `${sign}$${(Math.abs(c) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Middle-truncation of a long hash: abcdef1234…9876fedcba */
export function truncateMiddle(s: string, head = 10, tail = 10): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

import { hexSeed } from "../convexApi";
export { hexSeed };

export function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "12:34:56.789" style dim timestamp extracted from a streamed log line. */
export function logLineParts(line: string): { stamp: string; text: string } {
  const i = line.indexOf("·");
  if (i === -1) return { stamp: "", text: line };
  const stamp = line.slice(0, i).trim();
  const text = line.slice(i + 2).trim();
  return { stamp, text };
}

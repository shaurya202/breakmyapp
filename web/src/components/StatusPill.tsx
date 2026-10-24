/**
 * Status tags. Each maps to exactly one defined engine state and is
 * communicated in text — no dot decoys (tell #7). Ink/common states are
 * typographic; only live runs pulse, and only once per page.
 */

export type AuditStatus =
  | "QUEUED"
  | "EXA_ENRICHING"
  | "DETERMINISTIC_RUN_RUNNING"
  | "SANDBOX_ANALYZING"
  | "COMPLETED"
  | "FAILED";

const META: Record<AuditStatus, { label: string; live: boolean; cls: string }> = {
  QUEUED: { label: "Queued", live: false, cls: "text-mut" },
  EXA_ENRICHING: { label: "Checking details", live: false, cls: "text-mut" },
  DETERMINISTIC_RUN_RUNNING: {
    label: "Testing website",
    live: true,
    cls: "text-ink",
  },
  SANDBOX_ANALYZING: {
    label: "Analyzing results",
    live: true,
    cls: "text-ink",
  },
  COMPLETED: { label: "Completed", live: false, cls: "text-pass" },
  FAILED: { label: "Failed", live: false, cls: "text-stamp" },
};

export default function StatusPill({
  status,
  size = "sm",
}: {
  status: AuditStatus;
  size?: "sm" | "md";
}) {
  const meta = META[status] ?? {
    label: status.toLowerCase().replace(/_/g, " "),
    live: false,
    cls: "text-mut",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 border-y border-ink/25 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] ${meta.cls} ${
        size === "sm" ? "px-0.5" : "px-1"
      }`}
    >
      {meta.live ? (
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 animate-pulse-live rounded-full bg-ink"
        />
      ) : null}
      {meta.label}
    </span>
  );
}

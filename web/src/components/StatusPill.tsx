/**
 * Colored status chip. QUEUED amber / running chartreuse pulse /
 * completed green / failed red, per the PRD aesthetic.
 */

export type AuditStatus =
  | "QUEUED"
  | "EXA_ENRICHING"
  | "DETERMINISTIC_RUN_RUNNING"
  | "SANDBOX_ANALYZING"
  | "COMPLETED"
  | "FAILED";

const META: Record<AuditStatus, { label: string; cls: string }> = {
  QUEUED: { label: "queued", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  EXA_ENRICHING: {
    label: "exa enriching",
    cls: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  },
  DETERMINISTIC_RUN_RUNNING: {
    label: "deterministic run",
    cls: "bg-acid/15 text-acid border-acid/40 animate-terminal-pulse",
  },
  SANDBOX_ANALYZING: {
    label: "sandbox analyzing",
    cls: "bg-acid/15 text-acid border-acid/40 animate-terminal-pulse",
  },
  COMPLETED: {
    label: "completed",
    cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  },
  FAILED: {
    label: "failed",
    cls: "bg-red-500/15 text-red-400 border-red-500/40",
  },
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
    cls: "bg-neutral-700/30 text-neutral-400 border-neutral-600/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-mono tracking-tight ${meta.cls} ${
        size === "sm" ? "px-2 py-1 text-xs" : "px-2.5 py-1 text-xs"
      }`}
    >
      {status === "DETERMINISTIC_RUN_RUNNING" || status === "SANDBOX_ANALYZING" ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-terminal-pulse" />
      ) : null}
      {meta.label}
    </span>
  );
}

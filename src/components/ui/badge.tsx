import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import {
  COVENANT_STATUS,
  VERIFICATION,
  type CovenantStatus,
  type VerificationState,
} from "@/lib/platform/status";

type BadgeTone = "neutral" | "brand" | "pass" | "watch" | "breach" | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "text-ink-muted bg-surface-sunken border-line",
  brand: "text-brand bg-brand-subtle border-brand/20",
  pass: "text-status-pass bg-status-pass-bg border-status-pass-line",
  watch: "text-status-watch bg-status-watch-bg border-status-watch-line",
  breach: "text-status-breach bg-status-breach-bg border-status-breach-line",
  info: "text-status-info bg-status-info-bg border-status-info-line",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-1.5 py-0.5",
        "text-[11px] font-medium leading-none whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Covenant compliance status.
 *
 * Always renders icon + label together. Callers can hide the label only in
 * contexts where the meaning is carried elsewhere (e.g. a legend is on screen);
 * colour alone is never sufficient.
 */
export function StatusBadge({
  status,
  showLabel = true,
  className,
}: {
  status: CovenantStatus;
  showLabel?: boolean;
  className?: string;
}) {
  const s = COVENANT_STATUS[status];
  const Icon = s.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-1.5 py-0.5",
        "text-[11px] font-medium leading-none whitespace-nowrap",
        s.className,
        className,
      )}
      title={s.description}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {showLabel ? s.label : <span className="sr-only">{s.label}</span>}
    </span>
  );
}

/** Whether a number has been independently recalculated and approved. */
export function VerificationBadge({
  state,
  className,
}: {
  state: VerificationState;
  className?: string;
}) {
  const v = VERIFICATION[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-xs)] border px-1.5 py-0.5",
        "text-[11px] font-medium leading-none whitespace-nowrap",
        v.className,
        className,
      )}
      title={v.description}
    >
      {v.label}
    </span>
  );
}

/** Small dot for dense rows where a full badge is too heavy. */
export function StatusDot({
  status,
  className,
}: {
  status: CovenantStatus;
  className?: string;
}) {
  const s = COVENANT_STATUS[status];
  return (
    <span
      className={cn("inline-flex items-center", className)}
      title={`${s.label} — ${s.description}`}
    >
      <span className={cn("size-2 rounded-full", s.dotClassName)} aria-hidden />
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

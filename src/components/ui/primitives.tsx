import type { ComponentProps, ElementType, ReactNode } from "react";

import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------
   Surface
   ------------------------------------------------------------------------- */

export function Panel({
  children,
  className,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border border-line bg-surface",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-line px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Buttons
   ------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink hover:bg-brand-hover border-transparent",
  secondary:
    "bg-surface text-ink hover:bg-surface-sunken border-line-strong",
  ghost:
    "bg-transparent text-ink-muted hover:text-ink hover:bg-surface-sunken border-transparent",
  danger:
    "bg-status-breach text-white hover:opacity-90 border-transparent",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5",
  md: "h-8.5 px-3 text-[13px] gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-sm)] border font-medium",
        "transition-colors disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------
   Page header
   ------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Metric tile
   ------------------------------------------------------------------------- */

export function Metric({
  label,
  value,
  sublabel,
  tone,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  tone?: "default" | "pass" | "watch" | "breach";
  icon?: ElementType;
}) {
  const toneClass =
    tone === "breach"
      ? "text-status-breach"
      : tone === "watch"
        ? "text-status-watch"
        : tone === "pass"
          ? "text-status-pass"
          : "text-ink";

  return (
    <div className="rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em]",
          toneClass,
        )}
        data-numeric
      >
        {value}
      </div>
      {sublabel ? (
        <div className="mt-1.5 text-[12px] leading-snug text-ink-muted">
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ElementType;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-line bg-surface-sunken">
          <Icon className="size-5 text-ink-subtle" aria-hidden />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Dense data table
   ------------------------------------------------------------------------- */

export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto scrollbar-thin">
      <table
        className={cn("w-full border-collapse text-[13px]", className)}
        {...rest}
      />
    </div>
  );
}

export function Th({
  className,
  numeric,
  ...rest
}: ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "border-b border-line bg-surface-sunken px-3 py-2",
        "text-[11px] font-semibold uppercase tracking-wider text-ink-subtle",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({
  className,
  numeric,
  ...rest
}: ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "border-b border-line px-3 py-2 align-middle text-ink",
        // Numbers right-align so decimal points line up down the column.
        numeric ? "text-right" : "text-left",
        className,
      )}
      data-numeric={numeric ? "" : undefined}
      {...rest}
    />
  );
}

export function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return (
    <tr
      className={cn("transition-colors hover:bg-surface-sunken/60", className)}
      {...rest}
    />
  );
}

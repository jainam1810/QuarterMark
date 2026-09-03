"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeft, PanelLeftClose } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";
import {
  MODULE_GROUPS,
  isNavItemActive,
  moduleForPath,
  modulesInGroup,
  type PlatformModule,
} from "@/lib/platform/modules";
import { hasPermission, type Permission } from "@/lib/platform/permissions";
import type { FundContext } from "@/lib/platform/session";

export function Sidebar({
  permissions,
  funds,
  activeFundId,
  organisationName,
}: {
  permissions: readonly Permission[];
  funds: FundContext[];
  activeFundId: string;
  organisationName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const activeModule = moduleForPath(pathname);
  const activeFund = funds.find((f) => f.id === activeFundId) ?? funds[0];

  return (
    <nav
      data-shell-nav
      aria-label="Platform navigation"
      className={cn(
        "flex shrink-0 flex-col border-r border-line bg-surface",
        "transition-[width] duration-150",
        collapsed ? "w-[60px]" : "w-[248px]",
      )}
    >
      {/* Wordmark */}
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-3">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="QuarterMark home"
        >
          <Logomark />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Quarter<span className="text-brand">Mark</span>
            </span>
          )}
        </Link>
      </div>

      {/* Fund context */}
      {!collapsed && (
        <div className="border-b border-line px-3 py-2.5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
            {organisationName}
          </div>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)]",
              "border border-line bg-surface-sunken px-2 py-1.5 text-left",
              "transition-colors hover:border-line-strong",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">
                {activeFund?.shortName}
              </span>
              <span className="block truncate text-[11px] text-ink-subtle">
                {funds.length} fund{funds.length === 1 ? "" : "s"} ·{" "}
                {activeFund?.currency}
              </span>
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
          </button>
        </div>
      )}

      {/* Modules */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-3">
        {MODULE_GROUPS.map((group) => {
          const modules = modulesInGroup(group.id).filter((m) =>
            hasPermission(permissions, m.permission),
          );
          if (modules.length === 0) return null;

          return (
            <div key={group.id} className="mb-4 last:mb-0">
              {!collapsed && (
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {modules.map((mod) => (
                  <ModuleLink
                    key={mod.id}
                    module={mod}
                    collapsed={collapsed}
                    isActive={activeModule?.id === mod.id}
                    pathname={pathname}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 border-t border-line px-3.5",
          "text-[12px] text-ink-subtle transition-colors hover:text-ink",
        )}
      >
        {collapsed ? (
          <PanelLeft className="size-4" aria-hidden />
        ) : (
          <>
            <PanelLeftClose className="size-4" aria-hidden />
            <span>Collapse</span>
          </>
        )}
      </button>
    </nav>
  );
}

function ModuleLink({
  module: mod,
  collapsed,
  isActive,
  pathname,
}: {
  module: PlatformModule;
  collapsed: boolean;
  isActive: boolean;
  pathname: string;
}) {
  const Icon = mod.icon;
  const isPlanned = mod.status === "planned";

  return (
    <li>
      <Link
        href={mod.href}
        title={collapsed ? mod.name : undefined}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5",
          "text-[13px] transition-colors",
          isActive
            ? "bg-brand-subtle font-medium text-brand"
            : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
          isPlanned && !isActive && "text-ink-subtle",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{mod.name}</span>
            {isPlanned && (
              <span
                className="shrink-0 rounded-[3px] border border-line px-1 py-px text-[9px] font-medium uppercase tracking-wide text-ink-subtle"
                title="Architected and routed — not yet built"
              >
                Soon
              </span>
            )}
          </>
        )}
      </Link>

      {/* Sub-navigation, only for the active module */}
      {!collapsed && isActive && mod.nav && mod.nav.length > 0 && (
        <ul className="mt-0.5 mb-1 ml-[15px] space-y-0.5 border-l border-line pl-3">
          {mod.nav.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-[var(--radius-xs)] px-2 py-1 text-[12.5px] transition-colors",
                    active
                      ? "font-medium text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Logomark: a quarter-filled square.
 *
 * The name refers both to the quarterly covenant test cycle and to marking a
 * position, so the mark reads as one quarter of a grid filled in.
 */
function Logomark() {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-brand"
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none">
        <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.5" className="text-brand-ink/45" />
        <rect x="1.5" y="8" width="6.5" height="6.5" className="fill-brand-ink" />
      </svg>
    </span>
  );
}

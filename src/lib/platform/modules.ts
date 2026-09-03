import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Building2,
  Calculator,
  ClipboardList,
  FileSearch,
  FileText,
  Landmark,
  LayoutDashboard,
  Radar,
  ShieldCheck,
} from "lucide-react";

import type { Permission } from "./permissions";

/**
 * The module registry.
 *
 * QuarterMark enters the market through covenant monitoring but is architected
 * as the full platform a private credit fund runs on. Every module — including
 * ones not yet built — is declared here with its route, permission, and place
 * in the fund lifecycle. Navigation, access control, and the module directory
 * are all derived from this one list, so adding a module is a matter of adding
 * an entry rather than editing the shell.
 *
 * `status` is deliberately part of the contract:
 *   - "live"    the module is built and usable
 *   - "preview" partially built; usable but incomplete
 *   - "planned" architected, routed, and visible, but not yet implemented
 *
 * Planned modules are shown rather than hidden. A fund evaluating QuarterMark
 * against an incumbent suite is buying a roadmap as much as a product, and
 * hiding the roadmap would misrepresent what they are choosing.
 */

export type ModuleId =
  | "dashboard"
  | "portfolio"
  | "covenants"
  | "documents"
  | "monitoring"
  | "reporting"
  | "valuation"
  | "servicing"
  | "underwriting"
  | "accounting";

export type ModuleStatus = "live" | "preview" | "planned";

export type ModuleGroupId = "monitor" | "report" | "lifecycle";

export interface ModuleGroup {
  id: ModuleGroupId;
  label: string;
}

export const MODULE_GROUPS: ModuleGroup[] = [
  { id: "monitor", label: "Monitor" },
  { id: "report", label: "Report" },
  { id: "lifecycle", label: "Loan lifecycle" },
];

export interface ModuleNavItem {
  label: string;
  href: string;
  /** Match the route exactly rather than by prefix. */
  exact?: boolean;
}

export interface PlatformModule {
  id: ModuleId;
  name: string;
  /** Shown in the module directory and as page subtitles. */
  description: string;
  icon: LucideIcon;
  href: string;
  status: ModuleStatus;
  group: ModuleGroupId;
  /** Permission required to see the module at all. */
  permission: Permission;
  /** Sub-navigation rendered when the module is active. */
  nav?: ModuleNavItem[];
  /** Displayed on planned modules so the roadmap is explicit. */
  plannedNote?: string;
}

export const MODULES: PlatformModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description:
      "Loan book at a glance — compliance status, upcoming test dates, and what needs attention today.",
    icon: LayoutDashboard,
    href: "/dashboard",
    status: "live",
    group: "monitor",
    permission: "portfolio:read",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description:
      "Borrowers, facilities, and the structure of every loan in the book.",
    icon: Building2,
    href: "/portfolio",
    status: "live",
    group: "monitor",
    permission: "portfolio:read",
    nav: [
      { label: "Borrowers", href: "/portfolio", exact: true },
      { label: "Facilities", href: "/portfolio/facilities" },
      { label: "Funds", href: "/portfolio/funds" },
    ],
  },
  {
    id: "covenants",
    name: "Covenants",
    description:
      "Covenant terms, independent recalculation, headroom trends, and breach forecasting.",
    icon: ShieldCheck,
    href: "/covenants",
    status: "live",
    group: "monitor",
    permission: "covenants:read",
    nav: [
      { label: "Compliance", href: "/covenants", exact: true },
      { label: "Test schedule", href: "/covenants/schedule" },
      { label: "Definitions", href: "/covenants/definitions" },
      { label: "Amendments", href: "/covenants/amendments" },
    ],
  },
  {
    id: "documents",
    name: "Documents",
    description:
      "Credit agreements, compliance certificates, and financial packs — filed automatically, extracted with page-level provenance.",
    icon: FileText,
    href: "/documents",
    status: "live",
    group: "monitor",
    permission: "documents:read",
    nav: [
      { label: "Library", href: "/documents", exact: true },
      { label: "Review queue", href: "/documents/review" },
      { label: "Inbox sources", href: "/documents/sources" },
    ],
  },
  {
    id: "monitoring",
    name: "Early warning",
    description:
      "Daily public-record monitoring between reporting dates — charges, director changes, filings, and insolvency notices.",
    icon: Radar,
    href: "/monitoring",
    status: "live",
    group: "monitor",
    permission: "monitoring:read",
    nav: [
      { label: "Signals", href: "/monitoring", exact: true },
      { label: "Watchlist", href: "/monitoring/watchlist" },
      { label: "Alert rules", href: "/monitoring/rules" },
    ],
  },
  {
    id: "reporting",
    name: "Reporting",
    description:
      "Regulatory and investor reporting assembled from verified data, with the full approval history attached.",
    icon: ClipboardList,
    href: "/reporting",
    status: "live",
    group: "report",
    permission: "reports:read",
    nav: [
      { label: "Report runs", href: "/reporting", exact: true },
      { label: "Regulatory", href: "/reporting/regulatory" },
      { label: "Investor", href: "/reporting/investor" },
    ],
  },
  {
    id: "valuation",
    name: "Valuation",
    description:
      "Mark each position, evidence the mark, and carry it through to investor reporting.",
    icon: Calculator,
    href: "/valuation",
    status: "planned",
    group: "lifecycle",
    permission: "valuation:read",
    plannedNote:
      "Builds directly on covenant and financial data already captured, so most inputs are in place before the module exists.",
  },
  {
    id: "servicing",
    name: "Servicing",
    description:
      "Payment schedules, interest accruals, drawdowns, and borrower invoicing.",
    icon: Banknote,
    href: "/servicing",
    status: "planned",
    group: "lifecycle",
    permission: "servicing:read",
    plannedNote:
      "The deepest source of stickiness — once cash flows run through QuarterMark, the platform becomes operational infrastructure.",
  },
  {
    id: "underwriting",
    name: "Underwriting",
    description:
      "Assess prospective loans using the same document-reading engine that monitors existing ones.",
    icon: FileSearch,
    href: "/underwriting",
    status: "planned",
    group: "lifecycle",
    permission: "underwriting:read",
    plannedNote:
      "Reuses the extraction pipeline: the engine that reads a signed credit agreement also reads a draft one.",
  },
  {
    id: "accounting",
    name: "Fund accounting",
    description:
      "The fund's own books — capital accounts, allocations, and NAV.",
    icon: Landmark,
    href: "/accounting",
    status: "planned",
    group: "lifecycle",
    permission: "accounting:read",
    plannedNote:
      "Candidate for partnership rather than building in-house; the integration surface is designed for either.",
  },
];

const MODULES_BY_ID = new Map<ModuleId, PlatformModule>(
  MODULES.map((m) => [m.id, m]),
);

export function getModule(id: ModuleId): PlatformModule {
  const found = MODULES_BY_ID.get(id);
  if (!found) throw new Error(`Unknown module: ${id}`);
  return found;
}

export function modulesInGroup(group: ModuleGroupId): PlatformModule[] {
  return MODULES.filter((m) => m.group === group);
}

/**
 * Resolve a pathname to the module that owns it.
 *
 * Longest-prefix wins so that a module at "/portfolio" does not shadow a
 * future module at "/portfolio-analytics".
 */
export function moduleForPath(pathname: string): PlatformModule | undefined {
  let best: PlatformModule | undefined;
  for (const m of MODULES) {
    if (pathname === m.href || pathname.startsWith(`${m.href}/`)) {
      if (!best || m.href.length > best.href.length) best = m;
    }
  }
  return best;
}

export function isNavItemActive(item: ModuleNavItem, pathname: string): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const MODULE_STATUS_LABELS: Record<ModuleStatus, string> = {
  live: "Live",
  preview: "Preview",
  planned: "Planned",
};

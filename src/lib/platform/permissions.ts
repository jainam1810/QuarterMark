/**
 * Permission model.
 *
 * Permissions are `resource:action` strings. Roles are bundles of permissions.
 * Modules declare the permission required to see them at all; individual
 * actions inside a module check finer-grained permissions.
 *
 * Two rules this model exists to enforce:
 *
 *  1. Approval is a distinct permission from editing. The product's core
 *     promise is "we automate most, track everything, and a human approves" —
 *     so the person who can approve a covenant result is a deliberate choice,
 *     not a side effect of being able to open the page.
 *
 *  2. An auditor can read everything and change nothing. Fund due-diligence
 *     and regulatory review both require handing someone read-only access to
 *     the full record without risking mutation.
 */

export const PERMISSIONS = [
  // Portfolio
  "portfolio:read",
  "portfolio:write",

  // Covenants — note approve is separate from write
  "covenants:read",
  "covenants:write",
  "covenants:approve",

  // Documents and extraction
  "documents:read",
  "documents:upload",
  "documents:review",

  // Monitoring and alerts
  "monitoring:read",
  "monitoring:configure",

  // Reporting
  "reports:read",
  "reports:generate",
  "reports:publish",

  // Forward-looking modules
  "valuation:read",
  "valuation:write",
  "servicing:read",
  "servicing:write",
  "underwriting:read",
  "underwriting:write",
  "accounting:read",
  "accounting:write",

  // Platform administration
  "audit:read",
  "settings:read",
  "settings:write",
  "users:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role =
  | "admin"
  | "portfolio_manager"
  | "analyst"
  | "auditor";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  portfolio_manager: "Portfolio Manager",
  analyst: "Analyst",
  auditor: "Auditor (read-only)",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:
    "Full access including user management, settings, and the audit log. Typically the COO or finance head.",
  portfolio_manager:
    "Approves covenant results, publishes reports, and configures monitoring. Cannot manage users.",
  analyst:
    "Does the work: uploads documents, reviews extractions, prepares covenant tests. Cannot approve their own results.",
  auditor:
    "Reads everything, including the full audit trail. Cannot change anything. For due diligence and regulatory review.",
};

const ANALYST_PERMISSIONS: Permission[] = [
  "portfolio:read",
  "portfolio:write",
  "covenants:read",
  "covenants:write",
  "documents:read",
  "documents:upload",
  "documents:review",
  "monitoring:read",
  "reports:read",
  "reports:generate",
  "valuation:read",
  "servicing:read",
  "underwriting:read",
  "accounting:read",
  "settings:read",
];

const PORTFOLIO_MANAGER_PERMISSIONS: Permission[] = [
  ...ANALYST_PERMISSIONS,
  "covenants:approve",
  "monitoring:configure",
  "reports:publish",
  "valuation:write",
  "servicing:write",
  "underwriting:write",
  "audit:read",
];

/** Every permission, for the admin role. */
const ALL_PERMISSIONS: Permission[] = [...PERMISSIONS];

/** Read-only view of everything, for auditors and due diligence. */
const AUDITOR_PERMISSIONS: Permission[] = PERMISSIONS.filter((p) =>
  p.endsWith(":read"),
);

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  portfolio_manager: PORTFOLIO_MANAGER_PERMISSIONS,
  analyst: ANALYST_PERMISSIONS,
  auditor: AUDITOR_PERMISSIONS,
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check a permission against an explicit permission set.
 *
 * This is the UI-layer check — it decides what to render. It is deliberately
 * NOT the security boundary: every server action and query must re-check
 * authorisation and tenant scope independently, because anything decided in
 * the browser can be bypassed by the browser.
 */
export function hasPermission(
  granted: readonly Permission[],
  required: Permission | readonly Permission[],
): boolean {
  const needed = Array.isArray(required) ? required : [required as Permission];
  return needed.every((p) => granted.includes(p));
}

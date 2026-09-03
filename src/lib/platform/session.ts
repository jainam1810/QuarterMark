import { permissionsForRole, type Permission, type Role } from "./permissions";

/**
 * PLACEHOLDER SESSION.
 *
 * Chunk 3 replaces this with real authentication and server-side tenant
 * scoping. It exists now so the shell can render role-aware navigation
 * without pretending authentication is done.
 *
 * Nothing here is a security boundary. When real auth lands, every server
 * action and query must derive the tenant from the verified session — never
 * from a client-supplied value, and never from this module.
 */

export interface FundContext {
  id: string;
  name: string;
  shortName: string;
  /** ISO 4217 code of the fund's reporting currency. */
  currency: "GBP" | "EUR" | "USD";
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organisationName: string;
}

export interface PlatformSession {
  user: SessionUser;
  permissions: readonly Permission[];
  funds: FundContext[];
  activeFundId: string;
}

const DEMO_FUNDS: FundContext[] = [
  {
    id: "fund-meridian-ii",
    name: "Meridian Direct Lending Fund II",
    shortName: "Meridian II",
    currency: "GBP",
  },
  {
    id: "fund-meridian-i",
    name: "Meridian Direct Lending Fund I",
    shortName: "Meridian I",
    currency: "GBP",
  },
];

const DEMO_USER: SessionUser = {
  id: "user-demo",
  name: "Jainam Varia",
  email: "jainam@quartermark.io",
  role: "portfolio_manager",
  organisationName: "Meridian Credit Partners",
};

export function getSession(): PlatformSession {
  return {
    user: DEMO_USER,
    permissions: permissionsForRole(DEMO_USER.role),
    funds: DEMO_FUNDS,
    activeFundId: DEMO_FUNDS[0].id,
  };
}

export function getActiveFund(session: PlatformSession): FundContext {
  return (
    session.funds.find((f) => f.id === session.activeFundId) ?? session.funds[0]
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

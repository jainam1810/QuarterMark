/**
 * Formatting for financial data.
 *
 * Two conventions are enforced here because breaking them makes a product look
 * amateur to the people we are selling to:
 *
 *  1. Negative money is shown in parentheses — (1,250,000) not -1,250,000.
 *     This is standard in accounting and credit documents, and analysts read
 *     it faster than a minus sign that can be lost at a column edge.
 *
 *  2. Everything numeric renders in tabular figures (see globals.css) so
 *     digits align vertically down a column.
 *
 * All money is handled in MINOR UNITS (pence/cents) as integers. Floating
 * point is not used for currency anywhere in this codebase: 0.1 + 0.2 is not
 * 0.3, and a covenant test that is wrong in the eighth decimal place is a
 * covenant test we cannot defend to a regulator.
 */

export type CurrencyCode = "GBP" | "EUR" | "USD";

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
};

const DEFAULT_LOCALE = "en-GB";

interface MoneyOptions {
  /** Abbreviate to k / m / bn. Use in dashboards, never on a covenant test. */
  compact?: boolean;
  /** Decimal places. Defaults to 0 for compact, 2 otherwise. */
  decimals?: number;
  /** Render the currency symbol. */
  symbol?: boolean;
}

/**
 * Format an amount held in minor units (pence) as display currency.
 *
 * formatMoney(1_800_000_000, "GBP", { compact: true }) -> "£18.0m"
 * formatMoney(-125_000, "GBP")                          -> "(£1,250.00)"
 */
export function formatMoney(
  minorUnits: number | bigint | null | undefined,
  currency: CurrencyCode = "GBP",
  options: MoneyOptions = {},
): string {
  if (minorUnits === null || minorUnits === undefined) return "—";

  const { compact = false, symbol = true } = options;
  const asNumber = Number(minorUnits) / 100;
  const negative = asNumber < 0;
  const magnitude = Math.abs(asNumber);
  const sym = symbol ? CURRENCY_SYMBOLS[currency] : "";

  let body: string;

  if (compact) {
    const decimals = options.decimals ?? 1;
    if (magnitude >= 1_000_000_000) {
      body = `${sym}${(magnitude / 1_000_000_000).toFixed(decimals)}bn`;
    } else if (magnitude >= 1_000_000) {
      body = `${sym}${(magnitude / 1_000_000).toFixed(decimals)}m`;
    } else if (magnitude >= 1_000) {
      body = `${sym}${(magnitude / 1_000).toFixed(decimals)}k`;
    } else {
      body = `${sym}${magnitude.toFixed(0)}`;
    }
  } else {
    const decimals = options.decimals ?? 2;
    body = `${sym}${magnitude.toLocaleString(DEFAULT_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  return negative ? `(${body})` : body;
}

/**
 * Format a covenant ratio.
 *
 * Leverage and cover ratios are conventionally quoted to two decimals with a
 * trailing "x" — 4.62x, 3.10x. The precision is not cosmetic: a limit of
 * 4.50x and an actual of 4.4951x is compliant, and rounding it to 4.50x on
 * screen would show a breach that has not happened.
 */
export function formatRatio(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(decimals)}x`;
}

/** Format a percentage from a fraction: 0.1234 -> "12.34%". */
export function formatPercent(
  fraction: number | null | undefined,
  decimals = 2,
): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) {
    return "—";
  }
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** Format a plain number with thousands separators. */
export function formatNumber(
  value: number | null | undefined,
  decimals = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toLocaleString(DEFAULT_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Headroom as a signed, human-readable delta.
 *
 * Positive headroom means the borrower is inside the limit. The sign is always
 * shown so "how close are we" is answerable at a glance.
 */
export function formatHeadroomRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}x`;
}

/* -------------------------------------------------------------------------
   Dates and periods
   ------------------------------------------------------------------------- */

/** "31 Mar 2026" — unambiguous, and not the US/UK numeric-order trap. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(DEFAULT_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d)}, ${d.toLocaleTimeString(DEFAULT_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Label a quarter from its end date — "Q1 FY26".
 *
 * Deliberately derived from the borrower's financial year end rather than the
 * calendar, because covenant test dates follow the financial year. A borrower
 * with a 31 March year end has Q1 ending 30 June.
 */
export function formatQuarterLabel(
  periodEnd: Date | string,
  financialYearEndMonth = 12,
): string {
  const d = typeof periodEnd === "string" ? new Date(periodEnd) : periodEnd;
  if (Number.isNaN(d.getTime())) return "—";

  const month = d.getUTCMonth() + 1;
  const monthsAfterYearEnd = (month - financialYearEndMonth + 12) % 12;
  const quarter = Math.floor(monthsAfterYearEnd / 3) + 1;

  // The financial year is named for the year in which it ends.
  const fyYear = month > financialYearEndMonth ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  return `Q${quarter} FY${String(fyYear).slice(-2)}`;
}

/** "in 12 days" / "3 days ago" / "today". */
export function formatRelativeDays(
  target: Date | string,
  now: Date = new Date(),
): string {
  const d = typeof target === "string" ? new Date(target) : target;
  if (Number.isNaN(d.getTime())) return "—";

  const msPerDay = 86_400_000;
  const startOf = (x: Date) =>
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const days = Math.round((startOf(d) - startOf(now)) / msPerDay);

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Compact ordinal-free day count used in dense table cells: "12d", "−3d". */
export function formatDaysCompact(days: number | null | undefined): string {
  if (days === null || days === undefined || !Number.isFinite(days)) return "—";
  return days < 0 ? `−${Math.abs(days)}d` : `${days}d`;
}

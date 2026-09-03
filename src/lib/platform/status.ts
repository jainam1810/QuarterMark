import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleMinus,
  TriangleAlert,
} from "lucide-react";

/**
 * Covenant compliance status.
 *
 * Defined once and shared by every surface so the dashboard, the covenant
 * detail page, an exported report and an email alert can never disagree about
 * what amber means.
 *
 * Accessibility note: each status carries an icon with a distinct SHAPE and a
 * text label, not just a colour. Roughly 1 in 12 men has a colour vision
 * deficiency, red/green being the most common — and these reports get printed
 * in monochrome for investment committees. Colour is reinforcement here, never
 * the sole carrier of meaning.
 */

export type CovenantStatus =
  | "compliant"
  | "watch"
  | "breach"
  | "waived"
  | "not_tested";

export interface StatusPresentation {
  label: string;
  /** Longer form used in tooltips and legends. */
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for text, background and border. */
  className: string;
  /** Solid colour for chart marks and the indicator dot. */
  dotClassName: string;
  /** Sort weight — worst first, so the dashboard surfaces problems at the top. */
  severity: number;
}

export const COVENANT_STATUS: Record<CovenantStatus, StatusPresentation> = {
  breach: {
    label: "Breach",
    description: "The tested value is outside the covenant limit.",
    icon: CircleAlert,
    className:
      "text-status-breach bg-status-breach-bg border-status-breach-line",
    dotClassName: "bg-status-breach",
    severity: 0,
  },
  watch: {
    label: "Watch",
    description:
      "Inside the limit, but headroom is thin or deteriorating toward a breach.",
    icon: TriangleAlert,
    className:
      "text-status-watch bg-status-watch-bg border-status-watch-line",
    dotClassName: "bg-status-watch",
    severity: 1,
  },
  waived: {
    label: "Waived",
    description:
      "A breach occurred and the fund has formally waived it. Recorded, not erased.",
    icon: CircleDot,
    className: "text-status-info bg-status-info-bg border-status-info-line",
    dotClassName: "bg-status-info",
    severity: 2,
  },
  compliant: {
    label: "Compliant",
    description: "The tested value is within the covenant limit.",
    icon: CircleCheck,
    className: "text-status-pass bg-status-pass-bg border-status-pass-line",
    dotClassName: "bg-status-pass",
    severity: 3,
  },
  not_tested: {
    label: "Not tested",
    description:
      "No test has been run for this period — typically awaiting the borrower's financial information.",
    icon: CircleMinus,
    className: "text-status-none bg-status-none-bg border-status-none-line",
    dotClassName: "bg-status-none",
    severity: 4,
  },
};

export const COVENANT_STATUS_ORDER: CovenantStatus[] = (
  Object.keys(COVENANT_STATUS) as CovenantStatus[]
).sort((a, b) => COVENANT_STATUS[a].severity - COVENANT_STATUS[b].severity);

/** Sort comparator putting the most severe status first. */
export function bySeverity(a: CovenantStatus, b: CovenantStatus): number {
  return COVENANT_STATUS[a].severity - COVENANT_STATUS[b].severity;
}

/**
 * Verification state of an extracted or calculated value.
 *
 * This is orthogonal to compliance status and central to the product's
 * promise. A covenant can be compliant on numbers nobody has checked, and the
 * UI must never let those two facts blur together.
 */
export type VerificationState =
  | "verified"       // recalculated by QuarterMark and approved by a human
  | "recalculated"   // recalculated, awaiting human approval
  | "as_reported"    // taken from the borrower's own certificate, not recalculated
  | "mismatch";      // our recalculation disagrees with what the borrower reported

export interface VerificationPresentation {
  label: string;
  description: string;
  className: string;
}

export const VERIFICATION: Record<VerificationState, VerificationPresentation> =
  {
    verified: {
      label: "Verified",
      description:
        "Independently recalculated from source financials and approved by a named user.",
      className:
        "text-status-pass bg-status-pass-bg border-status-pass-line",
    },
    recalculated: {
      label: "Awaiting approval",
      description:
        "Independently recalculated. Not yet approved by a human, so not yet final.",
      className:
        "text-status-info bg-status-info-bg border-status-info-line",
    },
    as_reported: {
      label: "As reported",
      description:
        "Taken from the borrower's compliance certificate. Not independently recalculated.",
      className:
        "text-status-none bg-status-none-bg border-status-none-line",
    },
    mismatch: {
      label: "Mismatch",
      description:
        "Our recalculation does not agree with the figure the borrower reported.",
      className:
        "text-status-breach bg-status-breach-bg border-status-breach-line",
    },
  };

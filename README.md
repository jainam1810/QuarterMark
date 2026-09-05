# QuarterMark

**Covenant intelligence for private credit funds.**

QuarterMark reads a fund's loan agreements, recalculates every covenant from the
borrower's own financial statements, and warns the fund before a borrower breaches.

---

## The problem

A private credit fund lends, say, £300m across 50 companies. Every loan carries
rules — *"debt must stay under 4× profit"*, *"interest cover must exceed 3×"* —
buried inside 200-page legal agreements.

Every quarter the fund has to check all of them. At smaller funds this is done by
hand, in Excel:

| What goes wrong | Why it matters |
|---|---|
| **It eats time.** Chasing documents, finding numbers, retyping, recalculating. | Roughly two analyst-weeks per quarter. |
| **There's a blind spot.** Between quarterly reports, nobody knows the current position. | Companies don't fail on reporting dates. |
| **Excel shows a state, not a direction.** It answers *"have they breached?"*, never *"how fast are they heading there?"* | A borrower can drift toward the limit for three quarters while the sheet says "fine". |
| **Borrowers mark their own homework.** Tired analysts accept the borrower's reported ratio instead of recalculating it. | The party who benefits from "all good" is the one being trusted. |

A missed breach is expensive. Waiving one typically costs the borrower a fee of a
quarter to a half percent of the loan, plus legal costs — and an awkward
conversation with the fund's own investors.

---

## How the platform works

The division of responsibility never changes:
**the fund owns the rules, the borrower owns the numbers, QuarterMark checks one against the other.**

### 1. Set up the loan — once

The fund uploads the credit agreement. AI extracts every covenant, every limit,
every test date, and — critically — the agreement's own **definitions** (what
exactly counts as "EBITDA" in *this* contract). An analyst reviews and approves.

Most small funds have never had their covenants organised in one structured
place. Building that record is part of onboarding.

### 2. Documents arrive and file themselves

The fund connects the mailbox or drive where borrowers send their reporting packs.
QuarterMark reads each document, recognises what it is and who it belongs to, and
files it against the right facility.

### 3. Extract the numbers — with provenance

QuarterMark pulls the raw figures out of the borrower's accounts — debt, cash,
operating profit, depreciation, adjustments — and shows **the page each number
came from**. Every figure is traceable back to the source document.

### 4. Recalculate independently — the core of the product

QuarterMark does not accept the ratio the borrower reported. It recalculates it
from the raw financials, applying that contract's exact definition, including
caps and carve-outs.

> **Worked example.** A borrower reports net leverage of **3.90×** against a
> 4.50× limit — comfortably compliant. Recalculating from the audited accounts
> gives **4.62×** — a breach.
>
> The gap is £2.44m of EBITDA add-backs the agreement doesn't permit:
> £1.35m of exceptional items above the contract's £500k annual cap, and £1.09m
> of run-rate synergies allowed only in connection with a Permitted Acquisition
> that never happened.

**What this catches:** misapplication of the contract's own definitions.
**What it does not catch:** falsified underlying figures. The raw numbers still
come from the borrower — audited accounts remain the defence against outright
fraud. This is a smoke alarm, not a lie detector.

### 5. Show the trend, not just the state

Every covenant carries its headroom history. The dashboard sorts worst-first and
shows direction — a borrower moving +0.80× over four quarters is a different
conversation from one sitting flat, even when both are technically compliant.

### 6. Watch between reporting dates

Company filings are monitored daily. Not for fresh financials — private companies
file accounts annually, often abridged and late — but for **events**: a new charge
registered, a director resignation, accounts overdue, insolvency notices.
These surface within days instead of at the next quarterly pack.

### 7. Report

Regulatory and investor reports assemble from data already verified, with the
full approval history attached — who approved which figure, when, against which
version of the definition.

---

## Nothing is final until a human approves it

The standing promise is **"we automate most, track everything, and a human
approves"** — never *"100% automated"*.

Approval is a distinct permission from editing. Approving a covenant test
permanently records the approver's name, the exact figures, the definition
version in force, and every source page cited.

---

## Modules

QuarterMark enters through covenant monitoring and is architected as the full
platform a credit fund runs on. Every module is declared in one registry, so
adding one is additive rather than invasive.

| Module | Status | What it does |
|---|---|---|
| **Dashboard** | Live | Loan book at a glance; what needs attention today |
| **Portfolio** | Live | Borrowers, facilities, loan structure |
| **Covenants** | Live | Terms, recalculation, headroom trends, breach forecasting |
| **Documents** | Live | Auto-filing, AI extraction with page-level provenance |
| **Early warning** | Live | Daily public-record monitoring between reporting dates |
| **Reporting** | Live | Regulatory and investor reporting |
| **Valuation** | Planned | Mark each position and evidence the mark |
| **Servicing** | Planned | Payment schedules, interest, drawdowns |
| **Underwriting** | Planned | Assess new loans with the same extraction engine |
| **Fund accounting** | Planned | Capital accounts, allocations, NAV |

Planned modules are shown rather than hidden — a fund choosing a platform is
buying a roadmap as well as a product.

---

## Who it's for

Small and mid-sized private credit funds — roughly £50m to £500m, 15 to 80 loans
— in the UK and Europe. Large enough to have a real covenant problem, too small
for the enterprise suites built for billion-pound managers.

Three people inside the fund feel three different pains:

- **The analyst** — the two-week manual grind each quarter
- **The portfolio manager** — being blindsided by a borrower in trouble
- **The COO** — proving to investors and the regulator that the fund monitors properly

---

## Technology

Chosen so the platform can move between clouds without a rewrite.

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Framework | Next.js (React) |
| Database | PostgreSQL |
| Document AI | Claude (Anthropic API; also available via AWS Bedrock and Microsoft Foundry) |
| Storage | S3-compatible, behind a single interface |
| Hosting | UK region; portable to AWS or Azure |

Every component is an open standard. Postgres is Postgres anywhere, Node.js runs
anywhere, and file storage sits behind one adapter — so moving to a client's
preferred cloud is a deployment change, not a rebuild.

**Design.** White and black with a restrained purple accent, in light and dark.
Two typefaces: Newsreader for display, Schibsted Grotesk for interface and
figures. Colour is reserved for meaning — compliance status is always carried by
an icon and a label as well, so it survives colour-blindness and monochrome
printing.

---

## Status

Early development. The design system, module registry, permission model and
formatting layer are in place; the covenant engine and document pipeline are
being built.

---

© Jainam Varia. All rights reserved.

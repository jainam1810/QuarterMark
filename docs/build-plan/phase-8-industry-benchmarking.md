# Phase 8 — Industry benchmarking (replaces cross-fund benchmarking)

**Verdict: 🟢 Buildable today from free public data. One urgent action: start
harvesting Companies House monthly bulk files now, because the archive is only
12 months deep and cannot be recovered retroactively.**
Checked 2026-10-25.

## What this is, and what it replaced

**Jainam's framing, which is the correct one:**

> "If I gave a loan to grocery retail, then how is the grocery retail industry
> across the UK performing, and how is that particular company performing —
> compare them, that's it."

**One borrower vs its UK sector, using public data.** This is *industry*
benchmarking.

It replaces **cross-fund benchmarking** — pooling borrower data across rival
lenders — which is dead. See `phase-8-benchmarking.md` for why (legal
permission, then critical mass; it failed on both). Jainam's objection was the
decisive one:

> "Why the hell would some other funds share their data with any other funds —
> no one wants to."

Correct. Funds would share with an anonymising vendor, not each other, and that
model requires Allvue's 500 clients and 20 years of trust. Not available to us.

**Industry benchmarking needs no permission from anyone.** That is the whole
point.

## It also answers the documented customer need

`../positioning/customer-discovery.md:40`:

> "A single fund holds only a few borrowers per sector, so it cannot tell
> whether *one borrower* is struggling or *the whole sector* is."

Public sector data answers this. You do not need rival loan books to know UK
grocery retail had a bad year.

## The finding that makes it work: borrower size

This was nearly a blocker and turns out to be the opposite.

`[VERIFIED 2026-10-25]` UK company size thresholds, for financial years
beginning on or after **6 April 2025** (uprated by SI 2024/1303 — figures rose
~50%, employee counts unchanged):

| Size | Turnover | Balance sheet | Employees | Files a P&L? |
|---|---|---|---|---|
| Micro | ≤ £1m | ≤ £500k | ≤ 10 | ❌ |
| Small | ≤ £15m | ≤ £7.5m | ≤ 50 | ❌ **not until 2028** |
| Medium | ≤ £54m | ≤ £27m | ≤ 250 | ✅ **yes, today** |
| Large | above | above | above | ✅ **yes, today** |

A company qualifies by meeting **two of three**.

**Why this rescues the feature.** A £50m–£500m fund writing £3m–£30m loans lends
to borrowers with roughly £2m–£15m EBITDA — which implies turnover well above
the £15m small-company ceiling. **Most of our borrowers, and most of their
sector peers, are medium or large companies that file a full profit and loss
account today.**

⚠️ The genuine gap: borrowers under ~£15m turnover. Those have **no public P&L
until 1 April 2028**, and even then there is an **opt-out keeping it off the
public register**. So the smallest borrowers may never be comparable from free
data. Be honest about this in the product — show coverage, never a silent gap.

## Data sources, verified

### 1. Filed accounts — free, machine-readable `[VERIFIED]`

Companies House publishes **electronically filed accounts as iXBRL** in free
bulk files:

- **Daily files** — last 60 days
- **Monthly files** — last 12 months
- ZIP archives of iXBRL (`.html`) plus a few plain XBRL (`.xml`)
- Open Government Licence v3.0 — commercial use permitted, attribution required

### 2. Insolvency rates by sector — free, monthly `[VERIFIED]`

The Insolvency Service publishes company insolvencies **split by SIC 2007**,
monthly, roughly 2–3 weeks after month end, **back to 2015**:

- **Table 1C** — England & Wales
- **Table 4b** — Scotland

⚠️ Where a company has multiple SIC codes, **only the first is counted**.

This is a sector *distress* benchmark rather than a financial one, and it pairs
directly with Phase 6 early warning.

### 3. SIC 2007 granularity — sufficient `[VERIFIED]`

Five-digit codes. "Grocery retail" is a real bucket (e.g. `47110`, retail sale
in non-specialised stores with food predominating). Granular enough for a
meaningful peer set.

### 4. ONS profitability — ❌ rejected `[VERIFIED]`

ONS *Profitability of UK companies* splits private non-financial corporations
into only four groups: UK continental shelf, manufacturing, non-financial
services, and other. **Far too coarse** — there is no "grocery retail". Latest
release found was April–June 2025, published 28 Nov 2025, and the quarterly
figures are published only once a year. Not usable for this.

## The constraints that shape the build

**1. The REST API does not return parsed financials.** `[VERIFIED]` It returns
filing metadata and document links only. Balance sheet and P&L figures require
downloading the filing and parsing the iXBRL ourselves. The Document API is
rate-limited and does not scale for bulk work. **So the bulk files are the only
viable route, not the API.**

**2. 🔴 The bulk archive is only 12 months deep — start harvesting now.**
Monthly files cover the last 12 months. **Multi-year sector history cannot be
bought or back-filled later from this source; it has to be accumulated.** Every
month we do not harvest is a permanent hole in the sector trend.

This is the one action in this document with a deadline attached, and it is
cheap: a scheduled job writing ZIPs to object storage. **Do it in Phase 0, not
Phase 8.**

**3. Coverage is partial.** `[ESTIMATE, third-party]` Bulk XBRL is estimated at
**60–75%** of filings. Paper filings are excluded entirely. One older source put
iXBRL at ~97% of *electronically* filed accounts. Treat all of these as
estimates and **measure actual coverage per sector** before showing a benchmark.

**4. Staleness is 9–21 months.** Accounts are annual and filed up to 9 months
after year end. **Acceptable for a sector trend; useless for "how is the sector
doing this quarter".** Never imply the latter. Insolvency data, by contrast, is
monthly — so sector *distress* is near-current even when sector *financials* are
not.

**5. iXBRL tagging is inconsistent.** Companies tag the same concept
differently. A normalisation layer is required — the same lesson as the Phase 2
parser coordinate systems. Open-source extractors exist (e.g. `mrbrianevans/ch-xbrl`
produces long-format facts) and should be evaluated before writing our own, per
the standing rule on using a safe existing library.

## What Phase 8 delivers

A sector cohort built from SIC code plus size band, computed from harvested
iXBRL accounts, with **measured coverage shown alongside every comparison**, and
a monthly sector insolvency-rate series from the Insolvency Service.

The honest product statement: **"your borrower vs its UK sector, from public
filings, with the coverage and the lag shown."**

## Risk rating: 🟢 Low — but with one dated action

No legal blocker, no permission needed, no critical mass required, free data,
commercial use licensed. It is an ordinary data-pipeline project.

🔴 **The only real risk is inaction:** the 12-month bulk window means delay
destroys history permanently.

| Action | When |
|---|---|
| **Start harvesting monthly bulk files to object storage** | **Phase 0 — now** |
| Harvest Insolvency Service SIC tables (back to 2015, available any time) | Phase 6 |
| Evaluate open-source iXBRL extractors before building one | Phase 8 |
| Measure real coverage per sector before shipping any comparison | Phase 8 |

## Sources

- [Accounts bulk files](https://chguide.co.uk/bulk-data/accounts/) and [Bulk Data products from Companies House](https://chguide.co.uk/bulk-data/) — daily/monthly windows, iXBRL formats, coverage estimates
- [Companies House makes XBRL accounts data available free of charge](https://www.xbrleurope.org/?p=347) — XBRL Europe
- [mrbrianevans/ch-xbrl](https://github.com/mrbrianevans/ch-xbrl) — open-source iXBRL fact extractor
- [Number of insolvencies by Standard Industrial Classification (FOI174)](https://assets.publishing.service.gov.uk/media/684fe6df77c424182b0c4e4e/FOI174_Response_-_Number_of_insolvencies_by_Standard_Industrial_Classification.pdf) — Insolvency Service: Table 1C / 4b, back to 2015, first-SIC-only caveat
- [Guide to insolvency statistics](https://gov.uk/government/publications/insolvency-statistics-policy-and-procedures/guide-to-insolvency-statistics) — publication lag and sourcing
- [Confirmed changes to company size thresholds from 6 April 2025](https://www.menzies.co.uk/expected-change-to-company-size-thresholds/) — size thresholds ⚠️ accountancy commentary; **verify against SI 2024/1303** before relying on it
- [UK Government confirms Companies House accounts and filing reforms will go ahead](https://icas.com/news-insights-events/news/practice/uk-government-confirms-companies-house-accounts-and-filing-reforms-will-go-ahead/) — ICAS: 1 April 2028 confirmed 9 June 2026, delayed from 1 April 2027
- [Important changes to how your company files accounts from April 2028](https://www.crowe.com/uk/insights/companies-house-reforms-2028-digital-filing-changes) — small-company P&L requirement, public-register opt-out, iXBRL mandate
- [Profitability of UK companies](https://www.ons.gov.uk/economy/nationalaccounts/uksectoraccounts/bulletins/profitabilityofukcompanies/apriltojune2025/pdf) — ONS, rejected as too coarse
- `phase-8-benchmarking.md` — why cross-fund pooling was killed
- `phase-6-early-warning.md` — Companies House streaming, pairs with sector insolvency rates

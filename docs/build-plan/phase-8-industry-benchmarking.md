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

### 4. Stock market / live market data APIs — ❌ rejected, three reasons

`[Jainam's suggestion 2026-10-25: "any active API which provides live market
data... maybe stock market data?"]` Good instinct, and it fails on three
independent grounds — any one of which is enough.

**Reason 1 — the licensing cost is prohibitive, and it is an ongoing liability.**
`[VERIFIED 2026-10-25]`

| Provider | Finding |
|---|---|
| Financial Modeling Prep | Displaying or redistributing data requires a separate **Data Display and Licensing Agreement**; self-serve plans sit under a **personal-use** tab |
| Alpha Vantage | Standard terms grant a **personal, non-commercial licence** unless agreed otherwise in writing |
| FTSE Russell | **Redistribution is its own licence tier.** One wealth manager was quoted **~£40,000** merely to quote FTSE index values in client material; fees scale with AUM and user count |

⚠️ These are third-party summaries, not the primary terms — but they agree, and
they all point the same way: **no standard plan permits showing this data inside
a product we sell.** Contrast Companies House: Open Government Licence v3.0,
free, commercial use explicitly permitted, no negotiation.

For a bootstrapped product, a per-seat market-data licence is not a cost line —
it is a structural dependency on a counterparty who can reprice us at renewal.

**Reason 2 — listed companies are not comparable to our borrowers.**
UK listed grocery retail is Tesco and Sainsbury's: £20bn+ turnover. Our
borrower is a £30m regional chain. Different margins, different cost of capital,
different capital structure. Comparing their *levels* is misleading, and a
misleading benchmark is the Phase 2 failure mode — confidently wrong.

**Reason 3 — and this is the decisive one: share prices are the wrong metric.**

A covenant measures **leverage, interest cover and cash flow**. None of those is
market data. They come from **accounting** data.

Share prices measure equity sentiment, which no covenant tests. So the live feed
would buy us a number we do not compare against anything.

**And listed companies file at Companies House too.** We already get their full
accounts free under OGL. We get the data that matters without paying for the
data that does not.

### 5. Where market data *would* be legitimate

Not for levels — for **trend direction**. "UK listed food retail revenue is down
8% year on year" is a real sector signal even though Tesco is not our borrower's
peer. If that is ever wanted, the licensed-free route is UK government data
(ONS, Bank of England statistical database), not a commercial equity feed.

`[DEFERRED]` Not needed for v1. Accounts give us the trend too, just later.

### 6. ONS profitability — ❌ rejected `[VERIFIED]`

ONS *Profitability of UK companies* splits private non-financial corporations
into only four groups: UK continental shelf, manufacturing, non-financial
services, and other. **Far too coarse** — there is no "grocery retail". Latest
release found was April–June 2025, published 28 Nov 2025, and the quarterly
figures are published only once a year. Not usable for this.

## How often does the comparison run?

`[Jainam's question 2026-10-25: "daily basis, weekly basis, monthly, quarterly?"]`

**The governing rule: you cannot compare more often than your borrower reports.**

A borrower's EBITDA arrives in a quarterly compliance certificate, for a quarter
that ended maybe 45 days ago. Running that against today's sector figure every
morning produces a number that *looks* live and is not. That is false precision,
and it is the same failure mode Phase 2 identified as fatal to trust.

So the answer is not one frequency — it is **four layers moving at different
speeds**, and only one of them is the benchmark itself.

| Layer | Frequency | Needs new borrower data? | Source |
|---|---|---|---|
| **Company events** — new charges, director exits, overdue accounts | **Daily** | No | Companies House stream (Phase 6) |
| **Sector distress rate** — insolvencies in the borrower's SIC code | **Monthly** | No | Insolvency Service |
| **The benchmark comparison** — borrower vs sector | **Quarterly** | **Yes** | Harvested accounts |
| **Sector medians refresh** — as peers file | Rolling / annual | No | Harvested accounts |

**The two middle layers are the commercially interesting ones**, because they
move *without waiting for the borrower*. An alert reading *"insolvencies in your
borrower's sector are up 40% this quarter"* is actionable on a Tuesday in month
two, with no new borrower numbers at all. That is the "save analyst time"
promise working between reporting dates.

### 🔴 The design constraint this creates: snapshot the sector, do not recompute it

The sector median **drifts continuously** as peer companies file their accounts.
So if Q1's comparison is recomputed from today's sector data, **the same
historical comparison changes every time anyone opens it.** An analyst who
showed the Q1 chart to an investment committee could not reproduce it a month
later.

**Therefore: the sector benchmark must be stored as at the borrower's test
date**, not recalculated live. The comparison is a recorded fact, not a query.

This is the **same bitemporal requirement already committed to for covenant
definitions** in Phase 1 — "what did we believe, and as at when". The sector
benchmark is a second consumer of that machinery, which is an argument for
getting it right in Phase 3 rather than bolting it on.

⚠️ It also means a re-stated or late-filed peer account must not silently
rewrite history. Corrections create a **new** version; the old one stays
readable.

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
| Store sector medians bitemporally, as at the borrower's test date | **Phase 3 schema** |
| Do **not** licence commercial market data | — rejected, see above |

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
- [Financial Modeling Prep alternatives](https://developer.stockfit.io/blog/financial-modeling-prep-alternatives) and [Alpha Vantage review](https://www.findmymoat.com/tools/alpha-vantage) — commercial display/redistribution requires a separate negotiated agreement ⚠️ third-party summaries, confirm with each vendor before relying on it
- [FTSE licence charges leave wealth managers seething](https://citywire.com/wealth-manager/news/ftse-license-charges-leave-wealth-managers-seething/a582836) — Citywire: ~£40,000 quoted to quote index values; fees scale with AUM and headcount
- [FTSE information provider additional terms](https://www.lseg.com/content/dam/ftse-russell/en_us/documents/other/information-provider-additional-terms-march.pdf) — LSEG: index values are proprietary, no further distribution without written consent
- `phase-1-covenant-engine.md` — bitemporal versioning, which the sector snapshot reuses
- `phase-8-benchmarking.md` — why cross-fund pooling was killed
- `phase-6-early-warning.md` — Companies House streaming, pairs with sector insolvency rates

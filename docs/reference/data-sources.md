# Data sources — the actual links

Every external data source, with the real URL. **All links checked HTTP 200 on
2026-10-25.**

## Companies House — bulk accounts (the harvest)

| What | URL |
|---|---|
| **Daily accounts files** — last 60 days | https://download.companieshouse.gov.uk/en_accountsdata.html |
| **Monthly accounts files** — last 12 months | https://download.companieshouse.gov.uk/en_monthlyaccountsdata.html |
| **Historic monthly archive** — back to 2008 | https://download.companieshouse.gov.uk/historicmonthlyaccountsdata.html |
| **Basic company data** — all companies + SIC codes | https://download.companieshouse.gov.uk/en_output.html |

**Format:** ZIP archives containing iXBRL (`.html`) and a few XBRL (`.xml`).
Electronically filed accounts only.

**Size** `[VERIFIED 2026-10-25]`: typical weekday 60–110 MiB, month-end
150–380 MiB, 1 Oct 2026 peak **597.6 MiB**. September 2026 totalled ~2.7 GiB.
So ~2–3 GB/month, ~30 GB/year.

**Licence:** Open Government Licence v3.0 — commercial use permitted,
attribution required.

🔴 **The historic archive is real and it removes a deadline.**
`[VERIFIED 2026-10-25]` `historicmonthlyaccountsdata.html` lists downloadable
monthly ZIPs from **2008 to 2025** — full-year archives for 2008–2009, monthly
from 2010. Sizes grow sharply: Jan 2010 at 130 MB, Dec 2016 at 1,989 MB,
**Dec 2023 and Dec 2025 at 4.1 GB each**.

So a five-year back-fill is roughly **150–250 GB downloaded once**, not a
trickle that must start today. Earlier build-plan documents claimed the opposite
and have been corrected.

### Basic company data — needed to map a borrower to a sector

The accounts files do **not** reliably carry the SIC code. `en_output.html`
publishes the full company register including SIC codes, as one ~471 MB ZIP
(Oct 2026) or seven parts of ~50–70 MB. **Both products are needed: one for the
financials, one for the sector tag.**

## Companies House — live API (Phase 6)

| What | URL |
|---|---|
| Developer hub | https://developer.company-information.service.gov.uk/ |
| Public Data API | `api.company-information.service.gov.uk` |
| Streaming API | `stream.companieshouse.gov.uk` |

**Limits** `[VERIFIED]`: 600 requests / 5 min; **two concurrent stream
connections per account**, oldest silently killed. See
`../build-plan/phase-6-early-warning.md`.

## Insolvency Service — sector distress

| What | URL |
|---|---|
| Official statistics collection | https://www.gov.uk/government/collections/insolvency-service-official-statistics |

Monthly, ~2–3 weeks after month end. **Table 1C** (England & Wales) and
**Table 4b** (Scotland) split insolvencies by SIC 2007, back to **2015**.

⚠️ Where a company has several SIC codes, **only the first is counted**.

## The Gazette — official public notices

| What | URL |
|---|---|
| Re-using our data | https://www.thegazette.co.uk/data |

The UK's official public record: winding-up petitions, administrator and
liquidator appointments, bankruptcy orders. **Free for developers**, Crown
Copyright under OGL.

⚠️ **Two caveats, both real:**
1. **The OGL does not cover re-use of personal data.** Individual and
   partnership insolvencies contain personal data. Corporate notices are fine;
   personal insolvency needs care. Same principle as the director-names point in
   `../build-plan/phase-8-benchmarking.md`.
2. A **fair use policy** governs access volume — read it before building
   anything high-frequency.

A separate **paid** data service exists for bulk/filtered delivery. Not needed
initially.

## Rejected sources, and why

| Source | Why rejected |
|---|---|
| ONS *Profitability of UK companies* | Only four sector buckets. No "grocery retail". |
| Stock market APIs (Alpha Vantage, FMP) | Standard plans are personal use; commercial display needs a negotiated agreement |
| FTSE Russell indices | Redistribution is a separate licence tier; ~£40k quoted to a wealth manager |
| Google News | No official API; scraping breaches terms |

Detail in `../build-plan/phase-8-industry-benchmarking.md`.

## Rule

**Prefer Open Government Licence sources.** Free, commercial use explicit, no
negotiation, no counterparty who can reprice us. Everything above except the
rejected list is OGL.

# Phase 7 — Reporting

**Verdict: 🟢 Buildable, and it was never defined — the original plan contained
nothing but the heading. Defining it is most of the work, and our own research
had already done it.**
Checked 2026-10-25.

## The plan said nothing

> `## Phase 7 — Reporting`

That is the entire entry. So this document first **defines the scope**, then
assesses it. The source is `../research/technical-research.md:1555`, written
2026-08-04 and not referenced since.

## The four deliverables — and we should build two of them

| # | Deliverable | Build? |
|---|---|---|
| 1 | **IC packs** (internal investment-committee papers) | ✅ **Yes — first** |
| 2 | **LP report, credit section** | ✅ **Yes** |
| 3 | **UK regulatory return (FCA FRAME)** | 🟡 Later — data is a byproduct |
| 4 | ILPA capital accounts / fund accounting | ❌ **No — see below** |

### ❌ Why ILPA capital accounts are out of scope

`[VERIFIED 2026-10-25]` ILPA's updated Reporting Template (released Jan 2025)
applies to funds still in their investment period during **Q1 2026** and to
funds starting on or after 1 Jan 2026. The companion **Performance Template**
captures from Q1 2026 with first delivery **Q1 2027**.

Its content is an **enhanced Capital Account Statement** — NAV roll-forward,
partnership expense lines, offsets, commitment reconciliation, carried-interest
reconciliation — plus a Schedule of Fees.

**That is fund accounting.** It needs a general ledger. We have none, and
`../decisions/0001-tech-stack.md` addendum 1 records exactly why Allvue has one
and we do not. **Standardised content is also commoditised content** — there is
no differentiation available in rendering a template everyone renders.

⚠️ **Two caveats worth recording:**
- **Mandatory or not is contested.** BDO says the templates are not mandatory;
  other commentary says institutional LPs require them as a condition of
  investment. The practical answer: **the LPA and side letters govern.**
- **Private-credit scope is ambiguous.** One source says the template was
  designed for closed-end *private equity* and that ILPA notes it was not
  designed to fully meet other closed-end funds' needs; another lists private
  credit as covered. **Check current ILPA guidance before claiming support.**

### ✅ Why the LP report's credit section *is* the opportunity

From our own research, verbatim:

> "unlike the ILPA capital-account content, which is now fully standardised and
> therefore commoditised, the credit content of an LP report is
> **unstandardised** — which means it is both a differentiation opportunity and
> something you must **design** rather than implement from a spec."

Practitioner sources converge on a loan-level table — each active loan with
outstanding balance, LTV, sector, geography, maturity, status (current /
watchlist / default) — plus portfolio aggregates: weighted average leverage,
interest coverage, fixed charge coverage, minimum liquidity, weighted average
spread, average life, non-accrual rate, PIK share, first/second lien split,
risk-rating migration.

⚠️ `[MEDIUM CONFIDENCE]` — practitioner and vendor sources, not a standards
body. Cambridge Associates cites roughly **4.9x debt/TTM EBITDA** and **~2.3x
interest coverage** as typical. **Verify before printing any figure.**

### 🟢 The finding that makes the regulatory module nearly free

`[VERIFIED 2026-08-04]` **FCA CP26/26 (FRAME, July 2026, closed 22 Sep 2026)**
removes AIF001, replaces AIF002, and introduces a two-tier Essential/Enhanced
framework split at **£500m fund NAV**, with a dedicated **Loan Origination Fund
classification and a loan-origination reporting module**.

**Its proposed definitions are covenant-monitoring primitives:**

> non-accrual at 90 days past due · **covenant defaults** · significant
> amendments to loan documentation · LTV · lien seniority · weighted average
> spread · average life · unrecoverable

**We will be computing almost all of these anyway.** The regulatory return is
then a view over data the covenant engine already holds — not a separate
subsystem. That is the argument for capturing these fields in the Phase 3
schema even though Phase 7 is far off.

⚠️ **And the regulatory ask is lighter than instinct suggests.** CP26/26
§6.5–6.6 proposes collecting valuation data **at portfolio level** based on the
manager's methodology, "rather than on an asset-by-asset basis". So **the
differentiated depth belongs in the LP report and the IC pack, not the
regulatory return.**

⚠️ **Timing is unresolved.** CP26/26 closed 22 September 2026; the policy
statement and final templates were not published at the time of checking.
Companion CP26/28 envisages implementation **2028**. **Do not build to proposed
field definitions** — they will move. Capture the underlying data; defer the
return itself.

### EU, for completeness

AIFMD Annex IV is XML validated against ESMA XSDs, applicable since 22 Nov
2023. **AIFMD II's amended Article 24 reporting applies from 16 April 2027**,
with RTS/ITS due by then — **so the loan-origination regulatory fields do not
yet exist in public form.** Nothing to build against.

See `../positioning/regulatory-position.md` — the UK and EU pitches stay
separate.

## Export formats are load-bearing, not an afterthought

`[VERIFIED]` Allvue ships **PDF and Excel** exports explicitly framed for
portfolio reviews, investment committees and LP reporting.

> "IC-pack and LP-report generation must be first-class output, not an
> afterthought." — our own research conclusion, `technical-research.md:964`

**Excel matters more than it looks.** An analyst who cannot get the numbers into
a spreadsheet will re-key them, and re-keying is the workflow change the
discovery calls said funds will not accept
(`../positioning/customer-discovery.md`).

⚠️ This connects to **open question Q3** — if borrowers submit Excel, we both
read and write it.

## Valuation — explicitly out of scope

`[VERIFIED]` The 2025 IPEV Valuation Guidelines apply to quarterly periods
beginning on or after **1 April 2026**; §II 5.6 (Debt Investments) and 5.7
(Rolled up Loan Interest) are the private-debt provisions: fair value
standalone, DCF typical, **par is not automatically fair value**.

**We do not value assets.** Recording this so the boundary is explicit — a
covenant monitor that drifts into valuation acquires professional-indemnity
exposure it has not priced. See `../positioning/corrections-register.md` §8.

## What Phase 7 delivers

An IC pack generator (per-borrower trace, headroom trend, sector comparison,
registry events) and an LP report credit section (loan-level table plus
portfolio aggregates), both exporting to **PDF and Excel**. Regulatory fields
captured in the schema from Phase 3; the FRAME return built when final
templates exist.

## Risk rating: 🟢 Low — but it depends on Phase 3 getting the fields right

No technical blocker. The real risk is **schema omission**: if non-accrual
status, lien seniority, spread, average life and amendment history are not
captured from the start, Phase 7 becomes a migration rather than a view.

**→ Add these fields to the Phase 3 schema review.**

## Sources

- [ILPA releases updated Reporting Template and new Performance Template](https://ilpa.org/news/ilpa-releases-updated-reporting-template-and-new-performance-template-for-industry-adoption/) — ILPA
- [Preparing for Q1 2026: the new era of ILPA reporting](https://www.bdo.com/insights/industries/asset-management/preparing-for-q1-2026-the-new-era-of-ilpa-reporting-and-performance-templates) — BDO: not mandatory
- [ILPA reporting and new performance template](https://www.citco.com/insights/ilpa-reporting-and-new-performance-template) — Citco: lists private credit in scope ⚠️ conflicts with other sources
- [ILPA Reporting Template v2.0 suggested guidance](https://ilpa.org/wp-content/uploads/2025/01/ILPA-Reporting-Template-v.-2.0-Suggested-Guidance.pdf) — primary PDF
- FCA CP26/26 *Fund Reporting for Asset Management Entities* (FRAME) — §6.4–6.7, loan-origination module, £500m NAV split
- FCA CP26/28 — firm tiers, implementation envisaged 2028
- 2025 IPEV Valuation Guidelines §II 5.6–5.7
- `../research/technical-research.md:1555, :964, :1753` — **the pre-existing analysis this document is built on**
- `phase-3-data-layer.md` · `../positioning/regulatory-position.md`

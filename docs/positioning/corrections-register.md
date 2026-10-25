# Corrections register

**Claims about QuarterMark that were believed, then disproven.**

This is the most important file in `docs/`. Each entry is a claim that appeared in the
founding business document or in earlier AI-generated analysis, was repeated as fact, and
was later shown to be false against a primary source.

They are recorded because the failure mode is *regression*: without this file the pitch
drifts back to the original wording, and a prospect who spends ten minutes on Google
punctures it in the meeting.

**Provenance tags used throughout `docs/`:**

| Tag | Meaning |
|---|---|
| `[VERIFIED]` | Checked against a primary source. Source and date given. |
| `[ESTIMATE]` | Modelled or inferred. Not measured. Do not quote externally. |
| `[ASSERTED]` | Claimed somewhere, never checked. Treat as a hypothesis. |
| `[FALSE]` | Disproven. Listed below. |

---

## 1. "Nobody else recalculates — everyone just stores what the borrower reports"

**Status: `[FALSE]`** — verified 2026-08-21.

Independent recalculation from source financials, with citations back to the agreement PDF,
is an established feature of the category rather than a differentiator.

| Product | What it does |
|---|---|
| **Aloan** | "Calculates each covenant from the source financials on every cycle, reconciles the bank-calculated value against the borrower compliance certificate, and surfaces exceptions with the math and source pages already attached." |
| **ExactCov** | Codifies "the exact EBITDA definition — add-backs, run-rate adjustments, caps" from the credit agreement; Citations Logic traces every threshold back to the original PDF. |
| **Lumonic** (PitchBook / Morningstar) | Ingests agreements and certificates, extracts covenant definitions with AI, tests ratios each period. |
| **CovenantIQ** | Parses the credit agreement, extracts covenant definitions, builds the monitoring schedule. Holds SOC 2 Type II. |
| Also in this space | Cardo AI, Moody's Lending Suite, Oxane Partners |

Note this was *already* found by our own research on 2026-08-04 — which reported that AI
covenant extraction with source traceability was "the single clearest technical trend across
2025–2026" — and was then contradicted in a later summary. The research was right; the
summary was wrong.

**Say instead:** segment and price. UK and European funds under ~£500m at £400–1,500/month,
where the existing tools are US-built or enterprise-priced.

---

## 2. "AIFMD II forces UK funds to buy this"

**Status: `[FALSE]` for UK funds** — verified 2026-08-21.

- AIFMD II (Directive (EU) 2024/927) **does not apply to UK-authorised AIFMs.** Transposition
  deadline 16 April 2026; the enhanced Article 24 reporting applies only from **16 April 2027**.
- The UK is moving in the **opposite** direction. FCA **CP26/26 (FRAME)**, published
  **14 July 2026**, replaces Annex IV reporting and targets a **~75% reduction** in reporting
  burden. Final rules 2027, effective 2028.
- FRAME's **£500m NAV threshold** splits "essential" from "enhanced" reporting — **the entire
  QuarterMark target segment sits in the lighter tier**. "Small AIFM" is defined as NAV below
  £750m, which is all of them.
- AIFMD II changes also do not apply to sub-threshold AIFMs, capturing the smaller end of the range.

**Say instead:** LP / investor operational due diligence. Institutional LPs ask how a manager
monitors covenants; spreadsheet tracking signals operational risk. That applies in every
jurisdiction. Keep regulatory framing for EU funds only, and never merge the two pitches.

---

## 3. "DORA makes AWS the safe answer"

**Status: `[FALSE]` for UK-only funds** — verified 2026-08-21.

The underlying fact is true: the ESAs published the first list of critical ICT third-party
providers on **18 November 2025**, naming 19 providers including AWS, Microsoft, Google Cloud,
Oracle and SAP, now under direct ESA oversight.

But **DORA is EU regulation.** For a UK AIFM the relevant regime is the FCA / Bank of England
critical third parties rules. Good line for an EU fund; largely irrelevant to a UK one.

This was the **second** argument built on EU rules for a GBP-priced UK product. The UK/EU
conflation is the recurring failure mode — check jurisdiction before using any regulatory argument.

---

## 4. "We are one-tenth the price of the competition"

**Status: `[FALSE]` as a general claim** — verified 2026-08-21. True only against Allvue/eFront.

ExactCov publishes **$1,050/month** (~£830) billed annually, in GBP, EUR or USD. That is level
with the planned £900 tier, not ten times it. See `competitive-landscape.md`.

---

## 5. "Everyone hides pricing behind a sales call"

**Status: `[FALSE]`** — verified 2026-08-21. ExactCov publishes list pricing and runs a 7-day
free trial. Published pricing is no longer unusual in this category.

---

## 6. "Watch public filings daily" (as implying fresh financials)

**Status: overstated.** UK private companies file accounts **annually**, often abridged and up
to nine months late. Daily monitoring delivers **events** — new charges registered, director
resignations, accounts overdue, insolvency notices — not current numbers. Still valuable;
describe it accurately. The README already states this correctly.

---

## 7. "Recalculation catches borrowers massaging their numbers"

**Status: needs precision.** It catches **misapplication of the contract's own definitions**
(the add-back example). It does **not** catch misstated underlying figures — the raw financials
still come from the borrower. Say the first; never imply the second. A fund CFO will puncture it.

The README already frames this correctly: *"a smoke alarm, not a lie detector."*

---

## 8. "£15/month to serve, break-even at 2 customers"

**Status: `[ESTIMATE]`, infrastructure only.** Excludes professional indemnity insurance
(essential for a product making breach determinations), SOC 2 (becoming table stakes —
CovenantIQ already holds Type II), and human onboarding time per fund. Break-even at two
customers holds only if the founder's time is free.

---

## 9. "Cross-fund benchmarking is a defensible moat nobody has built"

**Status: `[FALSE]`** — verified 2026-10-25. Jainam caught this one.

Allvue launched **Portfolio Intelligence / Nexius Intelligence** on **20 July 2026**:
genuine cross-fund pooling, anonymised data "generated from the operational workflows
of contributing firms", 50,000+ borrowers, 500+ customers.

Two things I got wrong, in the same document:

1. Called the feature **legally unresolved** while simultaneously citing Allvue's peer
   percentiles. Self-contradictory. It is not unresolved — it is **conditional on
   contractual rights**, and Allvue's own page publishes the condition: **~70% of their
   data carries "contractual rights for anonymized use."** They track rights per record
   and pool only the cleared slice.
2. Listed it as a **moat**. The incumbent shipped it first with ~200x the data.

**Then I got the scale wrong too.** The "~30 contributing funds" gate and the
"~13 borrowers per sector" figure were arithmetic on three unlabelled assumptions, one of
which (12 sectors) I invented. A real peer cohort is **sector x geography x EBITDA range x
inception year** - verified from Allvue, and already recorded in
`../research/technical-research.md:786` on 2026-08-04. That gives **~4 borrowers per
bucket at 5 funds**, against roughly 40 wanted for a p75.

**Say instead:** cross-fund benchmarking is legal where permission exists, but the data
requirement is ~10x beyond a bootstrapped product's reach. **It is off the roadmap.** The
early-warning value lives at n=1 instead - trend breaks, add-back inflation,
forecast-vs-actual variance - which is what `../research/technical-research.md:958`
concluded in August. Keep only the cheap Phase 3 schema hooks. See
`../build-plan/phase-8-benchmarking.md`.

**Process lesson:** this entry was written wrong twice. Both times the correct answer was
already in `../research/`. **Check the research file before asserting a conclusion.**

---

## 10. "Start harvesting Companies House now or the history is lost forever"

**Status: `[FALSE]`** — self-caught 2026-10-25, a few hours after asserting it repeatedly.

I told Jainam three times that the Companies House accounts archive is only 12 months
deep, that every missed month is a permanent hole, and that the harvester therefore had a
deadline and belonged in Phase 0.

**Companies House publishes a historic monthly archive back to 2008**, freely
downloadable, at `download.companieshouse.gov.uk/historicmonthlyaccountsdata.html`. It is
one link away from the page I had already read.

**Root cause:** I took the 12-month figure from a third-party guide
(`chguide.co.uk`) which described only the current monthly page, and did not check the
official site for an archive before building an urgency argument on it. **A secondary
source described a subset; I read it as the whole.**

**What it changed:** the harvester was moved into Phase 0 on false urgency, and the
"collect everything now" argument was partly built on it.

**What survives:** the conclusion that we harvest broadly rather than per-sector still
holds — but on the *other* reason, that the bulk file cannot be filtered by sector at all.

**Say instead:** the archive goes back to 2008, a five-year back-fill is ~150–250 GB
downloaded once, and the harvester has no deadline. See
`../reference/data-sources.md` and `../build-plan/phase-8-industry-benchmarking.md`.

**Process lesson, the second this week:** when a secondary source states a limit, check
the primary site for the exception before building a recommendation on it.

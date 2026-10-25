# Open questions

Unresolved items that affect strategy. Each needs evidence before being relied on.

---

## 1. Why did the earlier competitor fail? — **highest priority**

A more advanced competitor, with a dashboard and daily email digest, entered this market and
died. **Nobody knows why.** Flagged by the founder as the single most important unresolved item.

Until answered, we cannot tell whether the gap we are entering is an *opportunity* or a
*graveyard*. Candidate explanations worth testing: funds would not pay; sales cycles outran
runway; the product solved a problem funds did not feel; data acquisition proved impossible.

**Investigate before or during the build.**

---

## 2. Is "UK/European LMA depth" actually a differentiator? — **largely answered: mostly NO**

**Answered 2026-10-24.** The core mechanics are the same in both markets: Net Debt ÷ EBITDA,
LTM testing, quarterly, EBITDA definitions with capped add-backs. **The calculation engine is
identical.** "Our parser understands LMA and theirs does not" is *not* a moat — drop it.

Four real differences exist `[VERIFIED 2026-10-24, Clifford Chance, "Across the pond and back
again", Butterworths JIBFL Nov 2015]`, two of which affect the maths:

| | Europe | US |
|---|---|---|
| **Guarantor coverage test** | Yes — 75–95% of EBITDA and/or assets | Not typical |
| **Ancillary facilities** | Common; share the guarantee/security package | Not usual |
| **Equity cure effect** | Cure **reduces debt** | Sponsors prefer cure **increases EBITDA** |
| **Representations** | Repeated each interest period | Only on new credit extensions |

- The **guarantor coverage test** is a covenant type that barely exists in US deals — a
  US-built product may not model it at all.
- **Ancillary facilities** change what counts as debt, so they change the leverage numerator.
- The **equity cure** difference is the sharpest: on identical facts, debt-reduction vs
  EBITDA-addition differs by roughly **4×**. Code it backwards and every cured quarter is wrong.

⚠️ That source is from **November 2015** and its own thesis is convergence. Treat the table as a
checklist to re-verify against current documents, not as today's settled position.

---

## 2b. THE REAL MARKET DEFINITION — borrower size, not geography

**Found 2026-10-24. This supersedes "UK funds" as the targeting rule.**

A cov-lite loan has **no maintenance covenant**, so there is nothing to test quarterly and
**nothing for QuarterMark to do**. Whether a loan has one depends on borrower size, not country.

`[VERIFIED 2026-10-24, Pemberton — "Is the Core Mid-Market the Structural Sweet Spot in
European Private Credit?"]`

| Borrower EBITDA | Maintenance covenants | Addressable? |
|---|---|---|
| **Below €50m** | **Remain the norm**; cov-lite a small minority | ✅ Yes |
| Above €50m | Roughly half are cov-lite | ⚠️ Half |
| Broadly syndicated | ~80–85% cov-lite | ❌ No |

**Target rule: funds lending to companies below ~€50m EBITDA — in any jurisdiction.**
Clearer than "UK funds", defensible, and it explains why the upper mid-market is not a customer
regardless of country. Note the source is Pemberton, already contacted during outreach.

**Testing consequence:** EDGAR is fine for exercising the engine, but filter for deals that
actually carry maintenance covenants — much of the US corpus is cov-lite and will not exercise
the code paths that matter.

---

## 2c. Residual question



Status: **`[ASSERTED]`, never verified.**

The entire positioning rests on this (`positioning/competitive-landscape.md`). The claim is
that UK/European LMA-style agreements have meaningfully different covenant mechanics from US
LSTA-style ones, such that a US-built product cannot simply add a currency toggle and compete.

**If UK and US agreements are broadly similar in practice, the moat is worth very little** and
ExactCov can serve this market trivially.

Test by reading real agreements from both markets, or by asking a credit lawyer or the funds
themselves.

---

## 3. Does a real DDQ require the SOC 2 *report*, or just the certification?

Determines whether Supabase Team ($599/mo) is needed early or much later — a material cost
difference at this stage. Many DDQs accept "our subprocessor is SOC 2 Type 2 certified" with a
link to the public trust page.

**Do not pre-pay. Wait for the first real DDQ and read what it actually asks.**

---

## 4. What does extraction really cost, measured?

`[ESTIMATE]` of ~£1 per agreement is modelled from published token pricing, not measured, and
assumes a single pass. Production extraction — multiple passes, verification, retries — runs
higher. **Measure against real documents before putting a figure in any pitch.**

---

## 5. Build vs mock data — not yet decided

Recommendation on the table: mock data shaped exactly like the real schema, so swapping in
Postgres later is a replacement rather than a rewrite. Awaiting a decision.


---

## Q3. Do borrowers submit compliance figures as PDF, Excel, or both?

**Raised 2026-10-25.** `build-plan/phase-4-document-pipeline.md` assumes PDF
throughout. A third-party blueprint flagged Excel compliance certificates as a
normal input in this market.

**Why it matters:** Excel is a **second ingestion path**, not a variation on the
first. Different parsing, different provenance model (cell reference, not page
and bounding box), different review UI. Building it late is expensive; building
it unnecessarily is waste.

⚠️ Neither discovery call covered submission format.

**Ask Dev, or a fund contact:** *"When a borrower sends their quarterly
compliance certificate, what actually arrives — a signed PDF, a spreadsheet, or
both? And which one do you work from?"*

**Do not assume either way.** See `positioning/customer-discovery.md`.


---

## Q1 — CLOSED 2026-10-25 (Jainam's call), and replaced

**Was:** *"Why did the earlier competitor — with a dashboard and a daily digest
— fail?"* I had flagged it as the most important open question.

**Jainam's decision:** drop it. His reasoning, verbatim:

> "Will funds pay — yes of course, there are plenty of competitors, means
> market is real."

**He is substantially right, and I was over-hedging.** Competitor existence is
stronger evidence than most startups ever have:

| Evidence | Source |
|---|---|
| Allvue — 500+ clients, $8.5tn tracked | `competitive-landscape.md` |
| ExactCov — publishes **$1,050/mo** pricing | `corrections-register.md` §? |
| Lumonic — acquired by Morningstar, reports tripling ARR, zero churn | `../research/technical-research.md:441` |
| CovenantIQ — holds SOC 2 Type II | `corrections-register.md` §8 |
| Cardo AI, Oxane, Ellis AI ($10m seed, July 2026) | `../research/technical-research.md:627` |

Funded entrants, published prices, an acquisition, and a new $10m seed. **The
category is real and people pay for it.** Most founders build into a void; this
is the opposite problem.

**Two further reasons the question lost its value:**

1. **The feasibility work answered it by other means.** The plausible failure
   modes are now documented independently: the extraction accuracy ceiling
   (`../build-plan/phase-2-extraction-spike.md`), funds refusing workflow change,
   and trust preceding features (`customer-discovery.md`).
2. **It may be unanswerable.** Failed-startup post-mortems are rarely published
   and founders of dead companies often do not reply.

### ⚠️ What the argument does *not* establish

"Competitors exist" proves **demand exists**. It does not prove **a new entrant
wins**, and in a crowded market the risk simply moves:

> The question is no longer *"will anyone pay?"* — it is **"why us instead of
> Lumonic?"**

## Q1b (replaces Q1) — Why would a fund choose us over Lumonic or ExactCov?

**This is answerable, actionable, and it is now the real risk.**

Current candidate answers, and their status:

| Claim | Status |
|---|---|
| UK/European document depth (LMA drafting, Companies House, GBP/EUR) | `[ASSERTED]` — load-bearing and still unproven |
| Companies House registry monitoring | `[VERIFIED]` no competitor advertises it |
| Showing what we **could not** extract | **New** — `../decisions/0005-verification-model.md` |
| Statutory-vs-covenant EBITDA gap as an add-back signal | **New** — `../build-plan/phase-8-industry-benchmarking.md` |
| Founder-level support | Structural, not defensible long-term |
| Price | `[FALSE]` against ExactCov — `corrections-register.md` |

**Ask on the next fund call:** *"You already look at X. What would make you
switch, and what would stop you?"*

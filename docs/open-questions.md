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

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

## 2. Is "UK/European LMA depth" actually a differentiator? — **load-bearing**

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

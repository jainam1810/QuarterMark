# Customer discovery

What people with private credit experience actually said, and what it changed.

## Where we are

`[VERIFIED — stated in the Acceler8 application submitted 23 October 2026]`

- **2 calls** with people who have private credit experience
- **Outreach to Ares Management and Pemberton**
- No paying customers, no letters of intent, no revenue
- Stage declared honestly as **Idea**

## The finding that shaped the product

> **Funds care about trust and security first, and they hate changing how they work.**

This is the most valuable thing learned so far, because it reframes the competition. The
obstacle is not a rival product — it is **migration risk and inertia**. A fund that believes
the tool is excellent will still decline if adopting it means changing how the team works.

Two consequences, both now load-bearing:

**1. Sit alongside Excel. Do not replace it.**
The pitch is addition, not migration. Anything requiring a fund to abandon its spreadsheets
loses to the thing they already trust.

**2. A human approves every number — and that is a sales feature, not just a safety one.**
The approval gate is what makes the product trustworthy to a buyer whose first question is
about trust. Never pitch "fully automated"; the automation is not the reassuring part.

This also validates a design decision already in the code: in
`src/lib/platform/permissions.ts`, approving a covenant test is a **separate permission** from
editing one. That was built before the calls; the calls confirmed it matters commercially.

## ~~Cross-fund sector comparison~~ — replaced 2026-10-25

The application's problem statement promoted *cross-fund* comparison as "structurally
uncopyable". **That claim is dead.** Pooling borrower data across rival funds needs every
borrower's written permission and ~60–100 contributing funds before the numbers mean anything
(`../build-plan/phase-8-benchmarking.md`).

**The underlying need survives, and is now met from public data:**

> A single fund holds only a few borrowers per sector, so it cannot tell whether *one borrower*
> is struggling or *the whole sector* is.

Industry comparison from Companies House and Insolvency Service data answers that with nobody's
permission (`../build-plan/phase-8-industry-benchmarking.md`).
⚠️ **Do not repeat "structurally uncopyable" in any future pitch** — see
`corrections-register.md` §9.

## ⚠️ The gap in what we know (2026-10-26)

**The two calls gave us design feedback, not evidence of pain.** They told us *how* to build —
trust first, sit alongside Excel. Neither, as recorded, says *"this costs me X hours a quarter
and I would pay to fix it."*

**The category is proven** — Allvue 500+ clients, ExactCov published pricing, Morningstar
acquired Lumonic, Ellis AI $10m seed July 2026. **What is unproven is whether small UK funds will
buy this from us.** No amount of desk research can answer that.

⚠️ **Targeting:** Ares Management and Pemberton are among the largest credit managers in the
market — **not** the £50m–£500m buyer. Useful for industry insight; wrong for buying signal.
Future conversations must be with small funds.

## What to test next — the 10-conversation test

**Before writing feature code.** 2–3 weeks.

**Who:** credit analysts or portfolio managers at **£50m–£500m UK funds**.

**Ask about the past, never the future** (the *Mom Test* approach — opinions about hypotheticals
are worthless; facts about recent behaviour are not):

1. *"Walk me through the last covenant test you did. Start to finish."*
2. *"How long did it take? Who did it?"*
3. *"What went wrong, or nearly went wrong?"*
4. *"What do you use now? What do you hate about it?"*
5. *"When a borrower sends their compliance certificate, what arrives — PDF, Excel, or
   both?"* — answers `../open-questions.md` Q3
6. *"Have you looked at Lumonic or ExactCov? Why didn't you buy?"* — answers Q1b

**Never ask "would you use this?"** Everyone says yes to be polite.

**The real signal is commitment:** will one of them become a **design partner** — a few redacted
agreements and 30 minutes every two weeks?

### Pass mark — set now, before any conversation

| After 10 conversations | Decision |
|---|---|
| 3+ describe real hours lost **and 1 agrees to be a design partner** | **Build** |
| Interest, but nobody commits time or documents | Rethink the angle before writing code |
| Nobody describes real pain | **Stop.** Months saved |
| **Cannot get 10 conversations** | ⚠️ **That is the answer.** Reaching buyers is the real risk for a solo founder in institutional finance |

**Friends and family are not part of this test.** Covenant monitoring is invisible outside the
job that does it; their unfamiliarity is expected and is not evidence either way.

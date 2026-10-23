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

## New positioning element: cross-fund sector comparison

Promoted into the application's problem statement:

> A single fund holds only a few borrowers per sector, so it cannot tell whether *one borrower*
> is struggling or *the whole sector* is — or how sectors compare.

This is a genuinely strong angle because it is **structurally uncopyable without multi-fund
data**. A competitor with better code still cannot produce it.

⚠️ **But it requires many funds first.** It is a roadmap claim, not a day-one capability. Keep
that distinction explicit in any pitch — see `corrections-register.md` for what happens when
roadmap and present tense get merged.

## What to test next

The open questions in `../open-questions.md` remain unanswered — particularly **why the earlier
competitor with a dashboard and daily digest failed**. Two calls is not yet enough to know
whether the inertia finding above is the same force that killed them.

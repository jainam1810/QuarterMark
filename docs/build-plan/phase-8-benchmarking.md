# Phase 8 — Cross-fund benchmarking

**Verdict: ⚠️ Technically easy. Legally unresolved. The blocker is a
confidentiality clause, not code.**
Checked 2026-10-25.

**This is the phase most likely to be killed late** — the CrossBorderX pattern:
a legal constraint discovered after the code is written. So it gets resolved
*before* anything is built, and the architecture is chosen to survive a "no".

## The legal problem

`[VERIFIED 2026-10-25]` The LMA Leveraged Facilities Agreement contains an
**express confidentiality undertaking given by the Finance Parties** — the
lenders — introduced in 2008 (Clause 42 in that form).

**It exists precisely because of lenders like our customers.** English law
recognises a banker–customer duty of confidentiality, but there was doubt
whether it extends to *a lender that is not a bank*. A private credit fund is
exactly that. So the LMA wrote the duty in explicitly.

**Consequence:** a fund's ability to pass borrower information to us — and our
ability to pool it — is governed by a contract term in every facility agreement,
not by the fund's preference.

### What is encouraging

The LMA Transparency Guidelines distinguish information available to the whole
syndicate from "borrower confidential information". **Financial reports,
projections and covenant compliance reports are listed in the first category** —
the syndicate-wide one.

### What is unresolved

⚠️ **No source I could find addresses whether anonymised or aggregated figures
fall outside the undertaking.** That is the precise question Phase 8 depends on,
and it is unanswered in public commentary.

**This needs a lawyer, not a developer.** `[ASSERTED, not verified]` — do not
proceed on an assumption either way.

## The proof the model can work

**Credit Benchmark** `[VERIFIED 2026-10-25]` runs exactly this model in credit:
40+ financial institutions contributing, ~20,000 credit analysts, 125,000+
obligors, 90%+ of them unrated by the agencies. Anonymised and aggregated into a
consensus.

**But note *what* they pool.** They collect each bank's **own internal credit
view** — the institution's opinion — not the borrower's raw financial statements.

That distinction is the likely legal key: **a lender's own assessment is the
lender's data; the borrower's financials are the borrower's.** Pooling the
former is a far smaller ask than pooling the latter.

## Architecture that de-risks the legal question

Design so that a restrictive legal answer narrows the feature rather than
deleting it.

**1. Pool derived metrics, never raw financials.**
Not "Castle Components had £13.29m EBITDA" but "an industrials borrower moved
+0.3x leverage this quarter". The input to the benchmark is a *number the fund
computed*, closer to Credit Benchmark's model.

**2. Enforce k-anonymity at query time.**
No bucket returns a result unless it contains at least **N borrowers from at
least M distinct funds** (N and M set with legal advice). Below threshold, the
answer is "insufficient data" — never an approximation.

**3. Opt-in per fund, revocable, with an audit trail.**
A fund must affirmatively enable contribution, and withdrawal must purge their
contribution from future aggregates. Record who consented and when.

**4. Strip individuals.**
Company financials are not personal data under UK GDPR — a company is not a
natural person. **Director names are.** Anonymisation must remove individuals
regardless of the contractual answer.

**5. Build the hooks in Phase 3, switch the feature on later.**
Anonymised sector and size-band tags on every borrower record cost nothing now
and are a schema migration later. See `../decisions/0001-tech-stack.md`.

## The statistical blocker, independent of law

Even with full legal clearance, the numbers do not work early:

| Funds | Borrowers | Per sector (≈12 sectors) |
|---|---|---|
| 5 | ~225 | **~18** |
| 30 | ~1,350 | ~110 |

**A benchmark built on 18 borrowers is worse than none** — it will produce
confident, wrong percentiles. Contrast Credit Benchmark's 125,000 obligors.

`[VERIFIED 2026-10-25]` Of the direct competitors, **none offers cross-fund
pooled benchmarking**: ExactCov and Lumonic benchmark within a firm's own
portfolio. Allvue does offer real peer percentiles — and has 500+ clients and
$8.5tn tracked, which is the point.

## Decision

**Do not promise this to a customer.** It is a Year-3 capability gated on two
things that are both outside engineering control: a legal answer, and roughly
30 contributing funds.

| Action | When |
|---|---|
| Ask a credit lawyer the anonymisation question | **Before Phase 3 schema design** |
| Build anonymised sector/size tags into the schema | Phase 3 |
| Build consent capture and audit | Phase 3 |
| Build the benchmark itself | **At ~30 funds, not before** |

## Risk rating: 🔴 High — but contained

The legal question is cheap to answer and expensive to get wrong. One
conversation with a lawyer, before the schema is designed, converts this from a
late-stage kill risk into a known constraint.

## Sources

- LMA Leveraged Facilities Agreement — express confidentiality undertaking by
  Finance Parties (Clause 42, 2008 form)
- LMA Transparency Guidelines — syndicate information vs borrower confidential
  information
- Credit Benchmark — contributor model, scale and anonymisation approach
- `../positioning/competitive-landscape.md`

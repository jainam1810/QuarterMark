# Phase 8 — Cross-fund benchmarking

**Verdict: ⚪ Off the roadmap. Legal where permission exists, but the data
requirement is ~10× beyond what a bootstrapped product can reach. The value we
wanted from it is available at n=1 — move it to Phase 6.**
Checked 2026-10-25. **Revised twice on 2026-10-25**, both times after Jainam
challenged the verdict and both times because the correct answer was already in
our research file. See the process note at the end.

## Correction to the first version of this document

The first version said *"Stop. Talk to a lawyer first."* Jainam challenged it:
**Allvue already shipped this — didn't they?** He was right, and the original
verdict was wrong in a specific way.

I had cited Allvue's peer benchmarking in the same document where I called the
feature legally unresolved, without reconciling the two. The feature is not
legally unresolved. It is legally **conditional**, and Allvue's own published
numbers show exactly what the condition is.

## What Allvue actually built

`[VERIFIED 2026-10-25]` Allvue launched **Portfolio Intelligence** and **Deal
Analytics** on OneVue, announced **20 July 2026** — three months ago. Powered by
**Nexius Intelligence**, their proprietary dataset.

**It is genuine cross-fund pooling, not portfolio-internal benchmarking.** In
Allvue's own words, reported by Alternative Credit Investor:

> "The anonymised data is generated from the operational workflows of
> contributing firms"

— explicitly **not** "estimated from public filings or voluntary submissions".
Dmitri Sedov, their chief data and analytics officer:

> "Private credit has never had a benchmark built from real deal data."

Scale: 150,000+ assets and securities, 50,000+ borrowers, 500+ customers.
⚠️ Currently **"available to a select group of Allvue credit GP clients"** —
not general availability.

## The number that answers the legal question

This is the single most useful fact found. Allvue's own product page, under
"Data by the Numbers":

> **~70%** — "contractual rights for anonymized use"

And: *"Rights-cleared and anonymized **where required**, governed by strict
entitlements and licensing."*

**Read what that admits.** Allvue does not have the right to pool ~30% of the
data it holds. They did not get a legal opinion saying confidentiality
undertakings don't bite. They built **per-record rights tracking** and pool only
the cleared portion.

So the confidentiality constraint from the first version of this document is
real — Allvue's own figure confirms it rather than refuting it. What was wrong
was the conclusion. The answer is not "ask a lawyer whether this is allowed".
It is **"track, per contribution, whether it is allowed"** — and that is an
engineering task.

### Why the ~30% exists

A fund can only grant us a right it actually holds. `[VERIFIED 2026-10-25]` The
LMA Leveraged Facilities Agreement contains an **express confidentiality
undertaking given by the Finance Parties** — the lenders — introduced in 2008
(Clause 42 in that form). It exists precisely because English law's
banker–customer duty may not reach **a lender that is not a bank**, which is
exactly what a private credit fund is.

Facility agreements are individually negotiated, so the permission varies
**agreement by agreement, not fund by fund**. That is why no vendor reaches
100%, and why the rights flag belongs on the *contribution*, not on the account.

The LMA Transparency Guidelines help: financial reports, projections and
covenant compliance reports are classed as syndicate-wide information rather
than "borrower confidential information".

## Still genuinely unresolved

⚠️ **Whether anonymisation alone discharges the undertaking** is not addressed
in public commentary either way. Allvue's approach sidesteps this — they rely on
express contractual rights, not on anonymisation as a defence.

**Take the same route: rely on permission, never on anonymisation as the
argument.** That removes the need for a legal opinion before Phase 3 and turns
it into a lawyer-reviewed consent clause later. Worth one conversation, no
longer a gate.

## Architecture

**1. A rights flag per contribution, not per fund.** `[revised]` The original
plan had opt-in at fund level. Allvue's ~70% proves that is the wrong grain —
a fund will be permitted on some facilities and not others. Each borrower
record carries its own pooling permission, captured at onboarding, and
unflagged records are excluded from aggregates by default.

**2. Pool derived metrics, never raw financials.**
Not "Castle Components had £13.29m EBITDA" but "an industrials borrower moved
+0.3x leverage this quarter". The input is a number the fund computed.

**3. Enforce k-anonymity at query time.**
No bucket returns a result unless it contains at least **N borrowers from at
least M distinct funds**. Below threshold the answer is "insufficient data" —
never an approximation.

**4. Revocable, with an audit trail.** Withdrawal purges that contribution from
future aggregates. Record who consented, to what, and when.

**5. Strip individuals.** Company financials are not personal data under UK GDPR
— a company is not a natural person. **Director names are.** Strip individuals
regardless of the contractual answer.

**6. Build the hooks in Phase 3.** Sector tag, size band, and the per-record
rights flag cost nothing now and are a painful migration later.
See `../decisions/0001-tech-stack.md`.

## The real blocker: scale

### Second correction — the "~13 per sector" figure was wrong

`[Challenged by Jainam 2026-10-25, and he was right again.]`

The first revision of this document asserted *"~13 borrowers per sector"* with no
provenance tag. It was arithmetic on **three unlabelled assumptions**:

| Input | Value used | Actual provenance |
|---|---|---|
| Borrowers per fund | ~45 | `[ASSERTED]` — midpoint of "15 to 80 loans" in `README.md:196`, our own business plan, not market data |
| Sector count | ~12 | **`[INVENTED]`** — no source. GICS has 11, ICB 11, SIC 21 sections |
| Early customer count | 5 | `[ESTIMATE]` — arbitrary |

**And the error ran in the optimistic direction.** Dividing by sector alone is not
how a peer cohort is built. `[VERIFIED 2026-10-25]` Allvue's cohorts are
definable by **sector, geography, EBITDA range and inception year** — four
dimensions, not one. Our own `docs/research/technical-research.md:786` and `:958`
recorded this on 2026-08-04 and this document failed to use it.

Redone honestly, at 5 funds (~225 borrowers, ~158 poolable after the ~70% rights
filter):

| Cohort definition | Buckets | Borrowers per bucket |
|---|---|---|
| Sector only (the generous slice) | ~12 | ~13 |
| Sector × EBITDA band | ~36 | **~4** |
| Allvue's full cohort (sector × geo × EBITDA × vintage) | ~500+ | **<1** |

### How many are actually needed

`[ESTIMATE — practitioner convention, not a theorem]` The common heuristic is
**10 observations in the tail**, so estimating the *p*th percentile wants
roughly `10/(1−p)` samples. AWS CloudWatch uses exactly this as its low-sample
gate.

| Percentile | Samples wanted |
|---|---|
| Median | ~20 |
| **p75** | **~40** |
| p90 | ~100 |

⚠️ I could not find a peer-reviewed source establishing this as a precise cutoff.
Treat it as an order-of-magnitude guide, which is all the decision needs.

**The gap is not marginal.** A realistic cohort gives us ~4 where ~40 is wanted —
a factor of ten. And at 30 funds it is still only ~26 per sector × EBITDA bucket.
**So the "~30 contributing funds" gate in the first revision was also too
optimistic.** A defensible p75 on realistic cohorts needs closer to **60–100
contributing funds**, which is more than the entire realistic customer base of a
bootstrapped product.

⚠️ **Allvue's own numbers do not reconcile either.** Our August research recorded
*"1,933 issuances since 2022"*; their current marketing page claims *"50,000+
borrowers, 150,000+ credit assets"*. Both are vendor claims. Do not quote either
as fact.

`[VERIFIED 2026-10-25]` **ExactCov, Lumonic and CovenantIQ benchmark within a
firm's own portfolio.** Cross-fund pooling among the direct competitors is
Allvue alone — and Allvue is the top-end incumbent, not a peer.

⚠️ **Correction:** the first version of this document said *"none of the direct
competitors offers cross-fund pooled benchmarking"* two lines after citing
Allvue's peer percentiles. That was self-contradictory. Allvue does.

## Decision

**Changed. Do not plan this feature.**

The first version said "Year 3, at ~30 funds". That gate was built on the broken
arithmetic above. On a realistic cohort definition the requirement is 60–100
contributing funds — beyond the plausible reach of a bootstrapped product, and
not a thing to hold roadmap space for.

**This is what our own research concluded on 2026-08-04 and this document twice
failed to apply** — `docs/research/technical-research.md:958`, verbatim:

> "QuarterMark cannot replicate this at launch. Do not compete on peer
> percentiles initially; compete on single-borrower forensic depth and on
> trajectory/early-warning logic **that works with n=1** — trend breaks,
> quality-of-earnings drift, add-back inflation, forecast-vs-actual variance."

**That is the answer.** Every one of those four signals works on a single
borrower's own history. No pooling, no consent, no critical mass, no legal
question. And they are the things an analyst actually acts on.

| Action | When | Changed |
|---|---|---|
| Build the **n=1 trajectory signals** (trend break, add-back inflation, forecast-vs-actual drift) | **Phase 6, alongside early warning** | **new — this replaces the feature** |
| Build per-record rights flag into the schema | Phase 3 | cheap insurance, keep it |
| Build sector/size-band tags | Phase 3 | cheap insurance, keep it |
| Have a lawyer review consent wording | Only if a customer asks to contribute | downgraded further |
| Build the benchmark itself | **Not planned** | **was: at ~30 funds** |

## Risk rating: ⚪ Not a risk — it is off the roadmap

Nothing to de-risk once the feature is not being built. The two Phase 3 schema
hooks cost nothing and preserve the option if we ever reach that scale.

**The genuine finding of Phase 8 is not about benchmarking at all:** it is that
the early-warning value we wanted from peer comparison is available at n=1, and
Phase 6 is where it belongs.

## Process note

This document was wrong twice, in opposite directions, and both times Jainam
caught it and both times the correct answer was already in
`docs/research/technical-research.md`.

**The research file is more reliable than any summary built from it.** Check
`docs/research/` before asserting a conclusion about competitors, scale or
market structure.

## Sources

- [Allvue launches private credit benchmarks based on deal data](https://alternativecreditinvestor.com/2026/07/20/allvue-systems-launches-private-credit-benchmarks-based-on-deal-data/) — Alternative Credit Investor, 20 July 2026 — "operational workflows of contributing firms"
- [Nexius Intelligence — Private Credit Data, Analytics, and Benchmarks](https://www.allvuesystems.com/solutions/private-credit-intelligence/) — Allvue — the **~70% contractual rights** figure
- [Private Credit Portfolio Analytics & Deal Intelligence](https://www.allvuesystems.com/solutions/portfolio-intelligence/) — Allvue
- [Benchmarking Transforms Covenant Monitoring in Private Credit](https://www.allvuesystems.com/resources/allvue-alpha-systematic-covenant-monitoring/) — Allvue, percentile approach
- LMA Leveraged Facilities Agreement — express confidentiality undertaking by Finance Parties (Clause 42, 2008 form)
- LMA Transparency Guidelines — syndicate information vs borrower confidential information
- `../positioning/competitive-landscape.md`, `../positioning/corrections-register.md`

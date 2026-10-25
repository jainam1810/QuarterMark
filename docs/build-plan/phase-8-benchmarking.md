# Phase 8 — Cross-fund benchmarking

**Verdict: 🟡 Legal and already proven in production — but only on the slice of
data you hold contractual rights to. The real blocker is scale, not law.**
Checked 2026-10-25. **Revised 2026-10-25** after a challenge from Jainam.

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

With the legal question reduced to a tracked flag, **the statistics become the
binding constraint** — and they are unforgiving:

| | Borrowers | Per sector (≈12) | After ~70% rights |
|---|---|---|---|
| Us at 5 funds | ~225 | ~18 | **~13** |
| Us at 30 funds | ~1,350 | ~110 | ~79 |
| **Allvue** | **50,000+** | — | — |

**A benchmark built on 13 borrowers is worse than none** — it produces
confident, wrong percentiles, which is the exact failure mode Phase 2 identified
as fatal to trust. Allvue reached this feature with 500+ customers. That gap
does not close with a legal opinion; it closes with customers.

`[VERIFIED 2026-10-25]` **ExactCov, Lumonic and CovenantIQ benchmark within a
firm's own portfolio.** Cross-fund pooling among the direct competitors is
Allvue alone — and Allvue is the top-end incumbent, not a peer.

⚠️ **Correction:** the first version of this document said *"none of the direct
competitors offers cross-fund pooled benchmarking"* two lines after citing
Allvue's peer percentiles. That was self-contradictory. Allvue does.

## Decision

**Unchanged, for a different reason.** Still a Year-3 capability — not because
it may be illegal, but because ~13 borrowers per sector cannot produce an
honest percentile.

**Do not promise this to a customer, and stop treating it as a moat.** The
competitive landscape doc lists cross-fund benchmarking as a defensible
position. Allvue got there first, in July 2026, with 200× the data. Keep the
hooks; drop it from the pitch.

| Action | When | Changed |
|---|---|---|
| Build per-record rights flag into the schema | Phase 3 | **was fund-level opt-in** |
| Build sector/size-band tags | Phase 3 | — |
| Build consent capture and audit | Phase 3 | — |
| Have a lawyer review the consent clause wording | Before first contribution | **was: before Phase 3 schema design, as a gate** |
| Build the benchmark itself | **At ~30 contributing funds** | — |

## Risk rating: 🟡 Medium — was 🔴

The legal question is answered by a competitor's production system and their own
published rights percentage. What remains is a schema decision made correctly
once, and a scale problem that only customers solve.

## Sources

- [Allvue launches private credit benchmarks based on deal data](https://alternativecreditinvestor.com/2026/07/20/allvue-systems-launches-private-credit-benchmarks-based-on-deal-data/) — Alternative Credit Investor, 20 July 2026 — "operational workflows of contributing firms"
- [Nexius Intelligence — Private Credit Data, Analytics, and Benchmarks](https://www.allvuesystems.com/solutions/private-credit-intelligence/) — Allvue — the **~70% contractual rights** figure
- [Private Credit Portfolio Analytics & Deal Intelligence](https://www.allvuesystems.com/solutions/portfolio-intelligence/) — Allvue
- [Benchmarking Transforms Covenant Monitoring in Private Credit](https://www.allvuesystems.com/resources/allvue-alpha-systematic-covenant-monitoring/) — Allvue, percentile approach
- LMA Leveraged Facilities Agreement — express confidentiality undertaking by Finance Parties (Clause 42, 2008 form)
- LMA Transparency Guidelines — syndicate information vs borrower confidential information
- `../positioning/competitive-landscape.md`, `../positioning/corrections-register.md`

# Competitive landscape

Verified 2026-08-21 from vendor sites. Prices change — re-check before quoting externally.

## Who actually competes

| Product | Price | Market | Recalculates? |
|---|---|---|---|
| **ExactCov** | **$1,050/mo** (~£830) published, annual. GBP/EUR/USD. 7-day free trial. | UK & Europe | Yes, with PDF citations |
| **Aloan** | Custom quote. Anchored "below the fully loaded cost of one analyst" ($65–90k/yr). | **US banks, credit unions, CDFIs** | Yes, reconciles vs certificate |
| **Lumonic** (PitchBook/Morningstar) | Contact sales | Private credit | Yes |
| **CovenantIQ** | Contact sales. Holds SOC 2 Type II. | Banks + private credit funds | Yes |
| **Allvue / eFront** | Six figures ($50k–$300k+/yr) | Large funds | Covenants are one module |
| **73 Strings** | Enterprise | Largest funds | Valuation-led; covenant capability thin |

`[VERIFIED]` ExactCov and Aloan pricing from their own pricing pages. Allvue range from Aloan's
published competitive anchor. Lumonic and CovenantIQ do not publish.

## Reading of the field

**ExactCov is the direct competitor.** Same price band, same geography, publishes pricing, runs
a free trial. Founded ~July 2026 — the market is forming, not closed. Assume more entrants.

**Aloan is not a competitor.** It sells to US commercial lenders — community banks, credit
unions, CUSOs. Different buyer, different jurisdiction, different document style.

**Allvue remains the honest 10× comparison.** The "priced out of the small-fund segment"
argument holds against Allvue and eFront, and only against them.

**73 Strings' covenant capability is genuinely thin** `[VERIFIED 2026-08-04]`. Their public
surface is three modules — Value, Monitor, Extract — with valuation as the centre of gravity.
The strongest covenant claim found was one marketing line; no documented breach engine,
headroom model or forecasting.

## Strategy

**Do not compete on price.** Decided 2026-08-21. A newer entrant will always undercut; cutting
each time is a spiral. Compete on service depth.

What "better service" means concretely — each of these must stay provable:

1. **UK/European document depth.** LMA-style agreements, Companies House, GBP/EUR. A US product
   adds a currency in a week; it does not learn UK facility drafting in a week.
   ⚠️ **This is the load-bearing assumption and it is still `[ASSERTED]`.** See `open-questions.md`.
2. **We build the covenant record during onboarding.** Most small funds have never had one
   structured. Absorbing that week of work is also what makes them dependent.
3. **Founder-level support.** An analyst emails and the person who built it replies the same
   hour. No enterprise vendor can match that, and small funds value it.
4. **Verifiable accuracy.** Every figure traces to a page. Not "trust the AI" — check the working.

## Technology is not the moat

Independent recalculation with citations is now table stakes (see `corrections-register.md` §1).
The defensible positions are the ones requiring data or time rather than code:
the covenant pattern library, and distribution into UK/European funds
before the US players arrive. This is a distribution race, not a technology race.

⚠️ **Cross-fund benchmarking was listed here as a moat and has been removed.**
Verified 2026-10-25: Allvue shipped it on 20 July 2026 with 50,000+ borrowers and
500+ contributing customers. On a realistic peer cohort (sector x EBITDA band)
we would reach **~4 borrowers per bucket** at 5 funds, where ~40 is wanted for a
p75. **It is off the roadmap, not a Year-3 item.** The early-warning value we
wanted from peer comparison is available at n=1 - trend breaks, add-back
inflation, forecast-vs-actual drift - and moves to Phase 6.

**What replaced it:** *industry* benchmarking - one borrower against its UK sector,
built from public Companies House filings and Insolvency Service sector data. No
permission needed from anyone, free, and buildable now. This is what Jainam meant by
benchmarking all along. See `../build-plan/phase-8-industry-benchmarking.md`. Also see
`../build-plan/phase-8-benchmarking.md` and `corrections-register.md` §9.

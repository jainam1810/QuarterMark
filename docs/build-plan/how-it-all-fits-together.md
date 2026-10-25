# How it all fits together — the end-to-end flow

Plain-English walkthrough of how QuarterMark actually runs, written because the
phase documents each describe a piece and none of them showed the whole.
Written 2026-10-25.

**Four things run on four different clocks.** That is the part that is confusing
until you see it laid out.

| Track | Clock | Needs a customer? |
|---|---|---|
| **A** — Build the sector picture | Monthly, ongoing | ❌ Independent of customers |
| **B** — Set up a borrower | Once per loan | ✅ |
| **C** — The quarterly check | Every quarter | ✅ |
| **D** — The watch | Daily + monthly | ✅ |

---

## Track A — Building the sector picture

**Runs whether or not we have a single customer.** `[corrected 2026-10-25]` An
earlier version said this had to start immediately. It does not — Companies
House keeps a downloadable archive back to 2008, so the history can be
back-filled whenever the feature is built.

```
  every month
      │
      ▼
  server downloads the Companies House file   (~2.5 GB)
      │
      ▼
  opens it, reads out for every UK company:
  sales · profit · debt · industry code · year end
      │
      ▼
  saves those numbers to the database          (tiny)
      │
      ▼
  moves the big file to cold storage, deletes after 12-24 months
      │
      ▼
  ┌──────────────────────────────────────────┐
  │  "UK grocery retail, FY2024:             │
  │   typical leverage 3.8x, margin 4.1%"    │
  │                                          │
  │   gets richer every single month         │
  └──────────────────────────────────────────┘
```

**Two sources are needed:** the accounts files for the financials, and the
basic company data product for the **SIC code** that maps a borrower to a
sector. See `../reference/data-sources.md` for every link.

---

## Track B — Setting up a borrower

**Once, when a fund onboards a loan.**

```
  fund uploads the loan agreement             (~200 pages)
      │
      ▼
  AI reads out the covenants:
  what is measured · the limit · test dates · the EBITDA definition
  and every add-back
      │
      ▼
  🔴 analyst checks each one against the page it came from
      │   (this is the approval gate, not a formality -
      │    extraction is 65-85% accurate on definitions)
      ▼
  we also record: company number, industry code
      │
      ▼
  covenant is live, and we know which sector bucket to compare against
```

---

## Track C — The quarterly check

**The main event. Every quarter, when the borrower reports.**

```
  borrower sends their numbers
      │
      ├──────────────────────────────┐
      ▼                              ▼
  COVENANT leverage              STATUTORY leverage
  (their definition,             (plain, no add-backs)
   with add-backs)                      │
      │                                 │
      ▼                                 ▼
  compare to the limit            compare to the sector
  in the agreement                (from Track A)
      │                                 │
      └──────────────┬──────────────────┘
                     ▼
          show both, side by side
                     │
                     ▼
          🔒 FREEZE the sector figure as at this date
             (otherwise the Q1 report changes every
              time someone opens it, and the analyst
              cannot reproduce what they showed the IC)
```

**Why two figures:** the covenant EBITDA has add-backs; the sector figure does
not. Mixing them understates leverage by ~2.3 turns — enough to turn a breach
into a pass. See `phase-8-industry-benchmarking.md`.

---

## Track D — The watch, between quarters

**This is the part that earns its keep when nothing is being reported.**

```
  DAILY    Companies House live feed
           new charge registered · director resigns · accounts overdue
               │
               ▼
           alert the analyst

  MONTHLY  insolvencies in the borrower's sector
               │
               ▼
           "grocery insolvencies up 40% this quarter"
```

Neither needs the borrower to send anything. See `phase-6-early-warning.md`.

---

## Worked example, with dates

| When | What happens |
|---|---|
| **Oct 2026** | Harvester back-fills five years of the historic archive, then runs monthly. |
| **Jan 2027** | A fund signs up. Uploads the Castle Grocers facility agreement. AI extracts 4 covenants; analyst verifies each against its source page. |
| **Jan 2027** | Castle Grocers tagged as SIC `47110` — retail sale in non-specialised stores, food predominating. |
| **Feb 2027** | Castle Grocers submits Q4-2026 compliance certificate. |
| **Feb 2027** | Engine runs: covenant leverage **3.4x** against a 4.00x limit → **pass**. Statutory leverage **4.9x** against sector **3.8x** → worse than sector. Add-backs **48%** of adjusted EBITDA vs S&P median ~30%. Comparison frozen. |
| **Mar 2027** | No borrower report due. But grocery insolvencies jump 40% → alert sent anyway. |
| **Apr 2027** | New charge registered against Castle Grocers at Companies House → same-day alert. |
| **May 2027** | Q1-2027 certificate arrives. Cycle repeats. February's frozen figures still show exactly what they showed in February. |

**The February row is the product.** A borrower that passes its covenant while
being more leveraged than its sector *and* leaning harder on add-backs than
normal — S&P found that pattern predicts credit deterioration. No spreadsheet
produces it.

---

## What has to be true for this to work

| | Status |
|---|---|
| Companies House data free and licensed for commercial use | ✅ verified |
| Borrowers large enough to publish full accounts | ✅ verified |
| Industry codes granular enough | ✅ verified |
| Storage affordable | ✅ verified — pennies |
| **Enough companies per sector with clean figures** | ❓ **unmeasured** |
| **Add-back extraction accurate enough** | ❓ **Phase 2 measures it** |

Both unknowns are cheap to settle and both are measured before anything is
promised to a customer.

## Related

- `phase-8-industry-benchmarking.md` — the detail behind Tracks A and C
- `phase-6-early-warning.md` — Track D
- `phase-2-extraction-spike.md` — the accuracy ceiling Track B inherits
- `phase-1-covenant-engine.md` — the calculation in Track C

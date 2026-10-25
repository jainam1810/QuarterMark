# ADR 0005 — The verification model: how a fund gets to 100%

**Status: accepted 2026-10-25.** Supersedes the loose "human approval gate"
language in `../build-plan/phase-2-extraction-spike.md` with a specific design.

## The question

`[Jainam 2026-10-25]`

> "Rather than blindly trusting AI, we will even give funds another approach
> for 100% confirmation? What's the approach?"

Correct instinct. Extraction will land somewhere around 65–85% on complex
EBITDA definitions. **A product that says "trust our 85%" is unsellable to a
credit fund.** This ADR says what we ship instead.

## 🔑 The reframe that makes this tractable

**Accuracy is an onboarding problem, not an ongoing one.**

| | Risk |
|---|---|
| Extracting the definition from the agreement — **once per facility** | AI, imperfect |
| Recalculating the ratio every quarter — **forever** | **Deterministic. 100% reproducible.** |

Once a definition is verified and locked, the engine is pure arithmetic over a
closed AST (`phase-1-covenant-engine.md`). It cannot drift. **You pay the
accuracy risk once per loan, not every quarter** — and an amendment creates a
*new version* requiring fresh approval, so the exposure stays bounded.

This is the honest answer to "how accurate is your AI": *"It is a drafting aid
used once. The thing running every quarter is arithmetic you approved."*

## Why a review screen alone is not enough

⚠️ **Automation bias is real and documented.** Parasuraman and Manzey (2010) is
widely cited as finding that it produces both omission and commission errors,
**cannot be prevented by training or instructions alone, and affects experts and
novices alike.** Show an analyst 40 fields all marked ✓ and they will approve
them.

**And the two error types are not equally catchable:**

| Error | Example | Visible in a review screen? |
|---|---|---|
| **Commission** — wrong value | Threshold read as 4.00x, actually 4.50x | ✅ Yes — the number sits beside the clause |
| **Omission** — missing item | 7 add-backs in the contract, we found 6 | ❌ **No — nothing on screen is wrong** |

To catch the second kind by reading the screen, the analyst would have to
already know what is missing. **So the design must make absence visible.**

⚠️ `[REASONED, not measured]` The omission/commission distinction is standard in
the automation-bias literature; the claim that omissions are *harder to detect*
is a plausibility argument from that literature, not an empirical result I
could source. It is the right way to design regardless — but do not state it to
a customer as a research finding.

## The five mechanisms

### 1. 🔑 Show what we did *not* extract — the coverage map

**The single most important one.** Mark which spans of the covenant clauses the
extraction consumed, and **display the remainder**.

```
Clause 1.1 — "EBITDA" definition                 9 sub-paragraphs
  ✅ (a) consolidated net income        → mapped
  ✅ (b) plus interest expense          → mapped
  ✅ (d)(i) exceptional items           → mapped, capped 20%
  ...
  ⚠️  (d)(vii) ................ NOT MAPPED — review this text
  ⚠️  (f) ..................... NOT MAPPED — review this text
```

This converts an invisible omission into a visible, countable gap. It is the
difference between *"here is what we found"* and *"here is what we found, and
here is what we could not place."*

**No competitor publishes this.** Everyone claims a high accuracy number;
nobody shows their misses.

### 2. Dangling-reference check — deterministic, no AI involved

Credit agreements define terms that reference other defined terms. If `EBITDA`
references `Permitted Add-Backs` and we never resolved that term, the
extraction is **provably incomplete** — and a parser can prove it without any
model judgement.

**Any unresolved cross-reference blocks approval.** Cheap, exact, and it catches
a whole class of silent failure.

### 3. 🔑 The borrower's own certificate is free ground truth — every quarter

The compliance certificate contains **the borrower's own calculation**. We
recalculate using our extracted definition.

| Result | Meaning |
|---|---|
| Our number matches theirs | Strong evidence our definition is right |
| They differ | **Either they are wrong or we are — and finding out is the product** |

**This is a continuous correctness check that costs nothing and runs forever.**
A definition that has matched the borrower's own arithmetic for six consecutive
quarters is far better evidenced than one approved once and never tested.

Track and display it: *"This definition has reconciled to the borrower's
certificate for 6 of 6 quarters."*

### 4. Second-pass disagreement

Re-run extraction with a model instructed to *disagree* with the first result.
Where the two agree, confidence rises; where they differ, flag for human
attention.

ExactCov ships this. `phase-2-extraction-spike.md` already commits to
**measuring whether it actually helps** rather than assuming it does.

### 5. Narrow the reading — do not pretend to remove it

**This is the honest 100% path, and it is achievable.**

A human must read the covenant clauses once. There is no way around that for a
legal document that will be used to declare a default. But:

| | Pages to read |
|---|---|
| Without us | ~200 |
| With us | **~8** — the clauses that contain covenant content, with our reading beside the original |

**That is still 100% coverage of the relevant text** — and roughly 25× less
reading. The promise is not "you don't have to read it". It is **"you read the
8 pages that matter, not the 200 that don't."**

That is a claim we can defend in a DDQ, and it is still a large time saving —
which is the product's actual purpose (`../positioning/`).

## The commercial layer

**Two modes, chosen per facility, recorded permanently:**

| Mode | What happens | For |
|---|---|---|
| **Assisted** | AI extracts; analyst reviews flagged items and the coverage gaps | Smaller exposures, routine facilities |
| **Verified** | Analyst confirms **every** field against its source | Large exposures, anything contentious |

**Rules:**

- **Verification status appears on every output.** An IC pack built on an
  unverified definition must say so on the page. No silent inheritance of
  false confidence.
- **Four-eyes on the largest exposures** — two approvers, standard financial
  control. Supported by `permissions.ts`, where approve is already a separate
  permission from edit.
- **Locked after approval.** Bitemporal versioning (`phase-1-covenant-engine.md`)
  means a verified definition cannot silently change. Amendments create a new
  version needing new approval.

## Why this is a competitive advantage, not a concession

Competitors publish accuracy claims — 73 Strings says 99%, which the published
literature does not support (`phase-2-extraction-spike.md`).

**We would be the only one showing what we are *not* sure about.**

The discovery calls said funds want **trust first** and **no workflow change**
(`../positioning/customer-discovery.md`). A credit analyst's actual fear is not
a tool that admits uncertainty — it is **a confidently wrong number they
repeated to their investment committee.**

> "We tell you what we couldn't read" beats "we're 99% accurate" with exactly
> the buyer we are selling to.

## Consequences

| Phase | Consequence |
|---|---|
| **2** | Spike must measure **recall** (what was missed) separately from precision. An accuracy number that averages them hides the dangerous error |
| **2** | Must produce the coverage map, not just extracted fields — this constrains the extraction request shape |
| **3** | Schema stores verification mode, approver, timestamp, and per-quarter reconciliation outcome |
| **4** | Review UI leads with **unmapped text**, not with extracted fields |
| **5** | Verification status is a first-class element on every screen and export |

## Sources

- [Automation bias glossary](https://www.thebehavioralscientist.com/glossary/automation-bias) — omission vs commission errors; cites Parasuraman & Manzey (2010) ⚠️ secondary; the original paper was not verified
- [Automation bias in AI-assisted medical decision-making](https://arxiv.org/pdf/2411.00998) — experience reduces commission errors; omission errors similar across groups
- [Exploring automation bias in human–AI collaboration](https://www.researchgate.net/publication/392771285_Exploring_automation_bias_in_human-AI_collaboration_a_review_and_implications_for_explainable_AI) — review
- `../build-plan/phase-2-extraction-spike.md` · `phase-1-covenant-engine.md` is at `../build-plan/` · `../positioning/customer-discovery.md`

---

# 🔑 Mechanism 6 — The backtest workbook (Jainam's design, 2026-10-25)

> "Can you provide something like a calculation formula Excel with specific page
> number, so the analyst can backtest whether every calculation and extraction
> is correct or not?"

**This is the strongest mechanism in this document and it supersedes mechanism 1
as the headline.** Every other mechanism asks the analyst to trust *our* screen.
This one hands them the working and invites them to check it in the tool they
already use.

## What the workbook is

One file per covenant test. Not a dump of values — **a live calculation**.

| Sheet | Contents |
|---|---|
| **Result** | Borrower, facility, covenant, test date, our result, pass/fail, verification status |
| **Inputs** | One row per figure: value · **source page** · clause reference · link back to the document |
| **Calculation** | **Live Excel formulas** — `=Inputs!D8/Inputs!D14`, never a pasted `3.4` |
| **Definition** | The covenant clause as extracted, in full, to read against the formula |
| **Unmapped** | The clause text we could **not** place (mechanism 1, carried in) |

Because the formulas are live, the analyst can **change an input and watch the
ratio move**. That is backtesting: they are not reading our answer, they are
re-deriving it.

## 🔴 The architectural rule this imposes

**One AST, two renderers. Never two implementations.**

```
                 covenant definition (JSON AST)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      engine evaluates            Excel formulas generated
      (decimal.js)                    (ExcelJS)
              │                           │
              └──────── must agree ───────┘
```

If anyone hand-writes the Excel formulas separately, the two will drift — and an
export that disagrees with the app is **worse than no export at all**. The
workbook must be a *rendering* of the same AST the engine evaluates
(`../build-plan/phase-1-covenant-engine.md`).

## 🟢 The free test that falls out of this

Generate the workbook → evaluate its formulas programmatically → compare to the
engine's result. **They must match on every fixture.**

That is a property-based test over the entire covenant engine, obtained for
nothing, and it runs in CI on every push. A divergence is a real bug in one of
the two renderers.

## ⚠️ The gotcha that would bite, and it is ironic

**Our engine uses integer minor units and `decimal.js`. Excel uses IEEE 754
doubles.** So Excel may compute `3.39999999999` where we report `3.40`.

An analyst who opens the workbook to verify our number and finds it *disagrees
in the ninth decimal* loses exactly the trust this feature exists to build.

**Required mitigations:**

1. **State the rounding policy in the workbook**, in writing, on the Result
   sheet. Not a footnote.
2. **Round both sides to the same stated precision** before display and before
   comparison.
3. **The CI comparison needs a tolerance** — exact equality will fail.
4. **Be explicit about the threshold test.** Does `4.4999` breach a `4.50x`
   covenant? That is a policy decision, it must be the same in both renderers,
   and it must be printed in the workbook.

This is the concrete form of a point already recorded in
`0001-tech-stack.md`: *the hard part of financial math is the rounding policy,
not the type.*

## Why it is commercially strong

1. **Zero workflow change.** `../positioning/customer-discovery.md` found funds
   want trust and **hate changing how they work**. This meets them inside Excel
   rather than asking them into our UI.
2. **It inverts the trust problem.** Not *"trust our number"* but *"here is our
   working — check it."*
3. **It is an audit artefact.** It goes in the IC pack, the audit file, and to
   the external auditor, unchanged.
4. **It survives us.** A fund that can re-derive every figure offline is not
   locked in — which, counter-intuitively, makes them more willing to adopt.

⚠️ **Do not claim it is unique.** Allvue exports to PDF and Excel; Lumonic
advertises *"audit trail with source-cell traceability back to the original
document"* (`../research/technical-research.md:441`). **Whether anyone ships
live formulas with page citations is `[UNVERIFIED]`** — and absence from a
marketing page is not absence from a product. Two claims of competitive
uniqueness in this repo have already turned out false
(`../positioning/corrections-register.md` §1, §9).

## Library

`[VERIFIED 2026-10-25]` **ExcelJS** — MIT licensed, actively maintained,
supports writing formulas, hyperlinks and formatting.

⚠️ **Not SheetJS.** Its community edition is Apache 2.0, but an April 2026
issue reports the maintainer moved to a paid model and that the free npm
package (`xlsx@0.18.5`) is effectively abandoned **with unfixed high-severity
vulnerabilities**. Sources conflict on its current status — **check its issue
tracker directly before reconsidering.** `xlsx-populate` shows significantly
reduced maintenance.

For the CI round-trip, a formula-evaluation library is needed. ⚠️ **Check
licensing before adopting** — HyperFormula is GPLv3-or-commercial, which does
not suit a closed commercial product.

## Consequences

| Phase | Consequence |
|---|---|
| **1** | The AST must be rich enough to render as Excel formulas, not only to evaluate. **Design this in from the start** — retrofitting it means changing the AST shape |
| **1** | Rounding policy becomes an explicit, documented, tested part of the engine |
| **2** | Page citations must be captured per input figure, not per covenant |
| **3** | Schema stores the page reference for every input value |
| **4** | Export is generated per covenant test and stored, not produced on demand only |
| **7** | The workbook is an IC-pack component, not a separate feature |

## Sources

- [ExcelJS](https://exceljs.org/) — MIT, formula support
- [SheetJS vs ExcelJS vs node-xlsx 2026](https://www.pkgpulse.com/guides/sheetjs-vs-exceljs-vs-node-xlsx-excel-files-node-2026) — licence comparison ⚠️ aggregator
- [Replace xlsx (SheetJS) with ExcelJS](https://github.com/DIGI-UW/OpenELIS-Global-2/issues/3313) — April 2026: abandoned free package, unfixed vulnerabilities ⚠️ single issue thread, verify directly

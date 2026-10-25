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

# The 8-phase build plan

Recovered from the 2026-10-25 session transcript and written down, because the
plan itself had never been saved — only the individual phase assessments.

**Order is deliberate: riskiest unknown early, prettiest thing late.**

| # | Phase | Feasibility | File |
|---|---|---|---|
| 0 | Make TDD possible | ✅ Green | `phase-0-foundations.md` |
| 1 | Covenant engine 🔴 *the moat* | ✅ Green | `phase-1-covenant-engine.md` |
| 2 | Extraction spike 🔬 *a measurement* | ✅ Green, lower ceiling | `phase-2-extraction-spike.md` |
| 3 | Data layer 🔒 | ⬜ **not checked** | — |
| 4 | Document pipeline | ⬜ **not checked** | — |
| 5 | Dashboard ✨ *first demoable* | ⬜ **not checked** | — |
| 6 | Companies House early warning 🎯 | ✅ Green | `phase-6-early-warning.md` |
| 7 | Reporting | ⬜ **not checked, and undefined** | — |
| 8 | ~~Cross-fund benchmarking~~ → **Industry benchmarking** | ⚪ killed / 🟢 replaced | `phase-8-benchmarking.md`, `phase-8-industry-benchmarking.md` |
| 9 | News monitoring *(added 2026-10-25)* | 🟡 Free sources only, no impact score | `phase-9-news-monitoring.md` |

Cross-cutting: `how-it-all-fits-together.md` — the end-to-end flow in plain
English.

---

## The phases as originally written

### Phase 0 — Make TDD possible *(before any feature)*
Can't test-first without a test runner. Vitest, CI on every push (tests + types
+ lint + `npm audit`), and pick the decimal library.
**Output:** a red test that goes green.

### Phase 1 — Covenant engine 🔴 *the moat*
Pure logic. No database, no UI, no API. Numbers and a definition in, ratio and
trace out. The five commitments, from line one:
decimal never float · units and currency in the type system · AST never
evaluated code · bitemporal versioning · provenance down to page.
**Why first:** zero dependencies, deterministic, exhaustively testable, and it
is the thing we are actually selling.

### Phase 2 — Extraction spike 🔬 *a measurement, not a feature*
10 real credit agreements from EDGAR. Extract covenants. Hand-check every one
and write down the accuracy.
**Output:** a number. If it is 60%, we have a different conversation.

### Phase 3 — Data layer 🔒
Postgres schema, schema-per-tenant isolation, append-only audit trail,
approval-gate permissions. **Security agent attacks it:** can tenant A reach
tenant B? Can a result be approved without permission?
*Benchmarking hooks go in here.*

### Phase 4 — Document pipeline
Direct-to-storage upload (bypasses the 4.5 MB limit), two-layer extraction —
deterministic parser owns page geometry, Claude owns meaning — human review
queue. **Nothing counts until a person approves.**

### Phase 5 — Dashboard ✨ *first demoable build*
Traffic lights, headroom trends, the calculation trace. Newsreader + Schibsted
Grotesk, white/black/purple, motion.
**The first thing you can show a fund.**

### Phase 6 — Companies House early warning 🎯 *the open gap*
Single-consumer fan-out (two-connection limit), nightly reconnect, charges /
director changes / insolvency notices.
**The only feature with no competitor doing it.**

### Phase 7 — Reporting
⚠️ **The original plan contains nothing beyond this heading.** Scope undefined.
Likely candidates from research: LP report credit aggregates, IC packs, FCA
FRAME loan-origination metrics. **Must be defined before it can be assessed.**

### Phase 8 — Benchmarking
Originally *"switch on at ~30 funds"*. Cross-fund pooling is now **dead**;
industry benchmarking from public data replaces it.

---

## How each phase runs

```
ADR (1 page)  →  diagram  →  slice into tickets
      ↓
   TDD: red → green → refactor
      ↓
   security agent attacks it
      ↓
   CI: tests + types + lint + npm audit
      ↓
   ship  →  watch
```

## Requirements that accumulated onto Phase 3 after the plan was written

| Requirement | From |
|---|---|
| Bitemporal versioning with `btree_gist` exclusion constraint | Phase 1 |
| Per-record pooling rights flag (**not** fund-level opt-in) | `phase-8-benchmarking.md` |
| Sector/size-band tags | `phase-8-benchmarking.md` |
| **Frozen sector medians, stored as at the borrower's test date** | `phase-8-industry-benchmarking.md` |
| Harvested company financials + SIC mapping | `phase-8-industry-benchmarking.md` |

**Phase 3 is now carrying more than the original plan gave it.** Assess with
these included.

# The 8-phase build plan

Recovered from the 2026-10-25 session transcript and written down, because the
plan itself had never been saved — only the individual phase assessments.

**Order is deliberate: riskiest unknown early, prettiest thing late.**

| # | Phase | Feasibility | File |
|---|---|---|---|
| 0 | Make TDD possible | ✅ Green | `phase-0-foundations.md` |
| 1 | Covenant engine 🔴 *the moat* | ✅ Green | `phase-1-covenant-engine.md` |
| 2 | Extraction spike 🔬 *a measurement* | ✅ Green, lower ceiling | `phase-2-extraction-spike.md` |
| 3 | Data layer 🔒 | 🟡 Green, one silent-failure trap | `phase-3-data-layer.md` |
| 4 | Document pipeline | 🟢 Green, three silent traps | `phase-4-document-pipeline.md` |
| 5 | Dashboard ✨ *first demoable* | 🟢 Green, 2 constraints | `phase-5-dashboard.md` |
| 6 | Companies House early warning 🎯 | ✅ Green | `phase-6-early-warning.md` |
| 7 | Reporting | 🟢 Green, now defined | `phase-7-reporting.md` |
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
⚠️ The original plan contained **nothing beyond this heading**. Scope has since
been defined in `phase-7-reporting.md` from `../research/technical-research.md:1555`:
**IC packs** and the **LP report credit section** are in; ILPA capital accounts
are **out** (fund accounting, needs a general ledger we do not have, and
standardised means commoditised); the FCA FRAME regulatory return waits for
final templates, since its field definitions are covenant-monitoring primitives
we compute anyway.

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


## All phases assessed as of 2026-10-25

Every phase now has a feasibility document. **No phase is blocked.** The
remaining unknowns are measurements, not questions of possibility:

| Unknown | Settled by |
|---|---|
| Extraction accuracy on EBITDA definitions | Phase 2 spike — **the one real kill risk** |
| Whether citations and structured output can be combined | Phase 2 spike |
| Companies per sector with clean iXBRL figures | One-day harvest spike |
| PDF vs Excel borrower submissions | **Ask a fund** — `../open-questions.md` Q3 |
| Why the earlier competitor failed | **Unresolved** — `../open-questions.md` Q1 |

### Requirements that landed on Phase 3 from later phases

Phase 3 is the schema, and five later phases put requirements on it. Get these
in from the start or they become migrations:

| From | Requirement |
|---|---|
| Phase 1 | Bitemporal versioning, `btree_gist` exclusion constraint |
| Phase 4 | Server-generated storage keys scoped per tenant (attack #7) |
| Phase 7 | Non-accrual status, lien seniority, weighted average spread, average life, amendment history |
| Phase 8 | Sector tag, size band, per-record pooling rights flag |
| Phase 8 | **Frozen sector medians, stored as at the borrower's test date** |
| Phase 8 | Shared read-only reference schema for public harvested data |

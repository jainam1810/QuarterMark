# Phase 1 — Covenant engine

**Verdict: ✅ Buildable. Main decision was library-vs-build. Answer: build — but small.**
Checked 2026-10-25.

## The question worth asking

Engineering standards say *use a safe public library rather than hand-roll*. So:
is there an expression evaluator we can trust with a covenant formula?

**Answer: no, and the reason matters.**

## Rejected: mathjs `evaluate()`

`[VERIFIED 2026-10-25]` mathjs had **two remote-code-execution CVEs in 2026**,
both sandbox escapes in the expression parser:

| CVE | Severity | Affected | Fixed |
|---|---|---|---|
| CVE-2026-40897 | **CVSS 8.8 HIGH** | 13.1.1 – <15.2.0 | 15.2.0 |
| CVE-2026-41139 | High | 13.1.0 – <15.2.0 | 15.2.0 |

Reported mechanism: `isSafeProperty` checked property access from user
expressions but not from internal code paths, letting an attacker reach the
`Function` constructor and execute arbitrary JavaScript.

Current `mathjs` is **15.2.0, published 2026-04-07** — patched. So why still reject it?

**Because of our threat model.** Covenant formulas are not written by us. They are
derived from **borrower-supplied PDFs, through an LLM**. A malicious or merely
malformed document can influence what the model emits. That makes the expression
**untrusted input** — precisely the scenario those CVEs describe. Two escapes of
the same class in one year is a pattern, not an accident, and a library's sandbox
is the wrong place to put a trust boundary we can eliminate entirely.

## Rejected: expr-eval

`[VERIFIED]` Last published **2019-09-28**. Seven years unmaintained. Not a
candidate for financial code.

## Chosen: closed JSON AST + total interpreter

What all three architecture designs independently recommended.

**This is not over-engineering — it is less code than the library.**

We do not need a maths *language*. Covenant calculation is a narrow domain of
roughly **eight operations**:

```
literal        a fixed number from the agreement (e.g. the £500,000 cap)
reference      a named input (e.g. "operating_profit")
sum            add a list of items
subtract       a minus b
divide         a over b            <- the only precision-critical op
cap            min(value, limit)   <- exceptional items capped at £500k
floor          max(value, limit)
compare        value against threshold -> pass | breach
```

A closed enum of eight node types **cannot express "call a function."** Remote
code execution is therefore impossible *by construction*, not by filtering.
That is a stronger guarantee than any sandbox, and it is the whole argument:

> The general-purpose library is **more** code and **less** safe than the thing
> we actually need. Over-capability is the vulnerability.

`[ESTIMATE]` ~300–500 lines, auditable in one sitting, exhaustively unit-testable.

## How it gets built (TDD)

1. Types: `Expr` union, `Money` (integer minor units), `Ratio` (Decimal)
2. Failing test: a leverage ratio from fixed inputs
3. Interpreter until green
4. Then, one failing test at a time: the £500k cap · disallowed add-backs ·
   equity cure as debt-reduction vs EBITDA-addition (~4× difference, see
   `docs/open-questions.md`) · null handling (**null is never zero** — it is
   INDETERMINATE) · divide-by-zero · period mismatch
5. Every result carries a **trace**: each input, its value, its source page

Arithmetic uses **decimal.js** with pinned precision, hashed into every trace
(see `phase-0-foundations.md`).

## Forward dependency (not a Phase 1 blocker)

Bitemporal versioning needs the Postgres **`btree_gist`** extension, for an
exclusion constraint that prevents overlapping validity ranges:

```sql
create extension if not exists btree_gist;
alter table covenant_definition_version
  add constraint no_overlapping_validity
  exclude using gist (covenant_id with =, validity with &&);
```

**Checked 2026-10-25 — available on both candidate hosts**, so it does not
constrain the Phase 3 choice:

| Host | `btree_gist` | Source |
|---|---|---|
| Azure Database for PostgreSQL Flexible Server | ✅ v1.5–1.8, PG 11–18 | Microsoft Learn |
| AWS RDS / Aurora PostgreSQL | ✅ v1.8 on PG 18 | AWS RDS extension tables |

Without it, non-overlap of covenant definition versions would have to be
enforced in application code — a race condition. It was a potential
disqualifier; it is not one. See `../decisions/0002-hosting-and-costs.md`.

Phase 1 touches no database at all.

## What Phase 1 delivers

A tested, deterministic engine: covenant definition + inputs in, ratio +
pass/breach + full provenance trace out. No database, no UI, no API.

## Sources

- CVE-2026-40897 / CVE-2026-41139 advisories (mathjs expression parser RCE)
- npm registry: mathjs 15.2.0 (2026-04-07), expr-eval 2.0.2 (2019-09-28)
- PostgreSQL docs: `btree_gist` contrib extension, exclusion constraints
- `docs/research/architecture-proposals.md` — three independent designs

# QuarterMark — project documentation

Decisions, verified facts and corrections. Written so the reasoning survives independently of
any chat history.

## Read first

| Document | Why |
|---|---|
| **[positioning/corrections-register.md](positioning/corrections-register.md)** | **Claims we believed and then disproved.** Read before writing any pitch, deck or CV line. |
| [build-status.md](build-status.md) | What actually exists in this repo versus what is designed |
| [open-questions.md](open-questions.md) | Unresolved items, including the two that could invalidate the strategy |

## Positioning

- [positioning/competitive-landscape.md](positioning/competitive-landscape.md) — who competes, verified pricing, why we do not compete on price
- [positioning/regulatory-position.md](positioning/regulatory-position.md) — UK vs EU; two separate pitches that must never merge

## Decisions

- [decisions/0001-tech-stack.md](decisions/0001-tech-stack.md) — TypeScript, Next.js, Postgres, no cloud-specific code
- [decisions/0002-hosting-and-costs.md](decisions/0002-hosting-and-costs.md) — Supabase London, staged upgrades, verified prices
- [decisions/0003-typography.md](decisions/0003-typography.md) — Newsreader + Schibsted Grotesk, with licence verification
- [decisions/0004-design-direction.md](decisions/0004-design-direction.md) — white/black/purple, "The Document", what was rejected

## Research

- [research/technical-research.md](research/technical-research.md) — 159 findings across 7 agents (2026-08-04)
- [research/architecture-proposals.md](research/architecture-proposals.md) — three covenant-engine designs

⚠️ **These two are AI-generated research runs, not evidence.** Numeric claims are priors, not
measurements. Verify before quoting.

---

## How to use these documents

**Provenance tags are mandatory.** Every factual claim carries one:

| Tag | Meaning |
|---|---|
| `[VERIFIED]` | Checked against a primary source, with source and date |
| `[ESTIMATE]` | Modelled or inferred. Never quote externally. |
| `[ASSERTED]` | Claimed, never checked. A hypothesis. |
| `[FALSE]` | Disproven — see the corrections register |

**Three standing rules, learned the hard way:**

1. **No document here is a source** — including this one. They record what was checked and when.
   Re-verify before relying on anything load-bearing.
2. **Check the jurisdiction before any regulatory argument.** UK ≠ EU. This has already produced
   two wrong arguments for a GBP-priced UK product.
3. **Prefer the honest weakness to the polished claim.** Every correction in this folder was
   found by questioning something that sounded right.

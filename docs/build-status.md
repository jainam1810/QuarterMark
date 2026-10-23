# Build status

**Honest account of what exists in this repository.** Updated 2026-10-23.

## What is actually built

~1,500 lines across 12 files — the foundations, not the product.

| Area | File | State |
|---|---|---|
| Design tokens, light/dark | `src/app/globals.css` | Built |
| Module registry | `src/lib/platform/modules.ts` | Built |
| Permission model (approve ≠ edit) | `src/lib/platform/permissions.ts` | Built |
| Covenant status + verification semantics | `src/lib/platform/status.ts` | Built |
| Financial formatting (minor units, tabular) | `src/lib/format.ts` | Built |
| UI primitives, badges | `src/components/ui/` | Built |
| Sidebar shell | `src/components/shell/sidebar.tsx` | Built |
| Session | `src/lib/platform/session.ts` | **Placeholder** — not auth |

## What is not built

- **The covenant engine** — designed in `research/architecture-proposals.md` (three competing
  designs), not implemented.
- **The document pipeline** — no extraction, no provenance capture, no upload.
- **Every module page.** The registry declares ten modules; `src/app/` contains one page.
- **Database.** No schema, no migrations, no Postgres.
- **Authentication.** `session.ts` returns a hardcoded demo user and is explicitly not a
  security boundary.
- **Companies House integration.**

## ⚠️ Known inconsistency in README.md

The module table marks six modules **"Live"**. In the registry, `status: "live"` means
*declared and routed* — but a reader sees "Live" and reasonably concludes "built and working."
The README's own Status section says the opposite: *"the covenant engine and document pipeline
are being built."*

Given this project has just spent a session removing overclaims from the pitch, leaving an
overclaim in the repo's front door is the same mistake in a different place. Suggested fix:
re-label those six as **"Designed"** or **"In progress"**, reserving "Live" for modules that
actually run.

## Architecture decided but not yet implemented

From `research/architecture-proposals.md` — three independent designs for the covenant engine
converged on the same three properties, which is the strongest signal in that document:

1. A **pure, deterministic interpreter** — AI extracts, it never calculates
2. A **provenance-linked calculation trace** — every figure traceable to a source page
3. **Content-addressed versioning** — amendments cannot corrupt historical results

Plus, from `research/technical-research.md`:

- **LLMs cannot produce bounding boxes.** Anthropic's Citations API grounds to a *page number*
  only. Provenance therefore needs **two layers**: a deterministic parser owning geometry, the
  LLM owning semantics, joined by character spans. Parsers also disagree on coordinate systems,
  so a normalisation layer is required.
- **Companies House streaming allows only two concurrent connections per account**, and a third
  silently kills the oldest — forcing a single-consumer fan-out design, not one connection per worker.

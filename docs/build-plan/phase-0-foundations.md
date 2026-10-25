# Phase 0 — Foundations (test harness, CI, decimal)

**Verdict: ✅ Buildable. No blockers. Low risk.**
Checked 2026-10-25.

## Can we build it?

Yes. Nothing here is novel — it is standard setup. The only two questions worth
asking were *which test runner works with Next.js 16* and *which decimal library
to trust with money*. Both are answered below from primary sources.

## 1. Test runner — Vitest

`[VERIFIED]` Next.js **16.3.0** ships its own Vitest guide at
`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`, so it is
officially supported on the exact version installed here.

Dependencies, verbatim from that guide (TypeScript variant):

```
vitest  @vitejs/plugin-react  jsdom
@testing-library/react  @testing-library/dom  vite-tsconfig-paths
```

Config file is `vitest.config.mts` at the repo root.

⚠️ **One real caveat, quoted from the guide:**
> "Since `async` Server Components are new to the React ecosystem, Vitest
> currently does not support them. While you can still run unit tests for
> synchronous Server and Client Components, we recommend using E2E tests for
> `async` components."

**Impact on us: none for Phase 1.** The covenant engine is pure TypeScript with
no components. Async Server Components only appear later in the UI phases, and
those get Playwright E2E instead. Worth knowing now so we do not discover it
mid-Phase-5.

## 2. Decimal library — decimal.js

`[VERIFIED 2026-10-25 from the npm registry]`

| Library | Version | Last published | Weekly downloads | Licence |
|---|---|---|---|---|
| **decimal.js** | 10.6.0 | 2025-07-06 | **65,040,604** | MIT |
| bignumber.js | 11.1.5 | 2026-07-05 | 41,832,465 | MIT |
| big.js | 7.0.1 | 2025-04-21 | 20,186,705 | MIT |
| dinero.js | 2.0.2 | 2026-03-13 | **456,078** | MIT |

**Choice: `decimal.js`.**

Reasoning — and note this corrects the common advice:

- **Money is not our precision problem.** Debt components are already stored as
  **integer minor units** (see `src/lib/format.ts`), and integer addition is
  exact. We need no library to sum them.
- **Division is the precision problem.** `Net Debt ÷ EBITDA` produces a
  non-terminating decimal. That is what needs arbitrary precision.
- Therefore a *money* library is the wrong tool. **dinero.js is built for money
  operations, not ratio division** — and at 456k weekly downloads against
  decimal.js's 65m, it carries materially more maintenance risk for a product
  whose core output is a number someone relies on.
- decimal.js supports a configurable global precision, which can be **hashed
  into every calculation trace** — exactly the "decimal128 arithmetic with
  version-pinned config" that all three architecture designs called for.

**Rule for the codebase:** money stays integer minor units; `Decimal` is used
only where division or a ratio is involved. Never `number` for either.

## 3. CI

GitHub Actions on every push: `vitest run`, `tsc --noEmit`, `eslint`, and
`npm audit`. No decision needed — the repo is already on GitHub.

## What Phase 0 delivers

A failing test that then passes, plus CI that runs it automatically. That is the
precondition for test-driven development in every later phase.

## Sources

- Next.js 16.3.0 bundled docs: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- npm registry: `registry.npmjs.org/{decimal.js,big.js,bignumber.js,dinero.js}`
- npm downloads API: `api.npmjs.org/downloads/point/last-week/*`

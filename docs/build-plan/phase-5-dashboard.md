# Phase 5 — Dashboard (first demoable build)

**Verdict: 🟢 Buildable. Two real constraints — one already known and now
biting, one that would be a credibility failure in front of a fund.**
Checked 2026-10-25.

## What the plan said

> Traffic lights, headroom trends, the calculation trace. Newsreader +
> Schibsted Grotesk, white/black/purple, motion.
> **This is the first thing you can show a fund.**

## 🔴 Constraint 1 — "traffic lights" alone fail accessibility *and* credibility

Red / amber / green is the obvious design for covenant status. **On its own it
is a defect.**

**WCAG 2.2 Success Criterion 1.4.1 "Use of Color" (Level A)** requires that
colour is not the only visual means of conveying information. Roughly **1 in 12
men** has a colour-vision deficiency, and red-green is the common form —
precisely the two colours carrying the most important distinction in this
product.

**This is not only an accessibility box.** A covenant status is shown in
investment committee papers. A partner who cannot distinguish breach from pass
on a printed page, or on a projector, is a lost deal — and greyscale printing
destroys the distinction for everyone.

**Every status must carry a second channel:**

| Status | Colour | Shape / glyph | Text |
|---|---|---|---|
| Pass | green | ● filled circle | "Pass — 0.6x headroom" |
| Watch | amber | ▲ triangle | "Watch — 0.1x headroom" |
| Breach | red | ■ square / ✕ | "Breach — 0.3x over" |

**Add to the Phase 5 definition of done: the dashboard must be readable in
greyscale.** Test it by printing one.

⚠️ `src/lib/platform/status.ts` already defines covenant status semantics —
check it exposes a non-colour token, not just a colour name.

## 🔴 Constraint 2 — async Server Components cannot be unit tested

`[VERIFIED — `node_modules/next/dist/docs/.../testing/vitest.md`, Next.js
16.3.0]` Verbatim:

> "Since `async` Server Components are new to the React ecosystem, **Vitest
> currently does not support them**. While you can still run unit tests for
> synchronous Server and Client Components, we recommend using **E2E tests**
> for `async` components."

`phase-0-foundations.md` flagged this and correctly said *"no impact for
Phase 1"*. **Phase 5 is where it lands.** A dashboard page that fetches
covenant data is exactly an async Server Component.

**Consequence:** Playwright is not optional polish, it is **the only way to
test the dashboard at all**. Next.js ships a Playwright guide at
`node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` — read it
before writing the harness.

⚠️ **E2E tests are slower and flakier than unit tests.** Keep data-shaping logic
in plain synchronous functions that *can* be unit tested, and let the async
component do nothing but fetch and pass down. The less logic in the async
component, the less rides on E2E.

## The calculation trace is the product, not a feature

Phase 2's conclusion: the honest promise is *"AI drafts in minutes, you verify
in minutes"*, and the review screen is **"the hardest-worked screen in the
product"**.

So the trace is not a debug view. It is the thing that makes a determination
defensible to an investment committee:

```
Leverage covenant — Q1 2026                         3.4x  /  4.00x   ● Pass

  Net Debt                                             £47,600,000
    ├ Senior facility          £40,000,000   → p.12 cl.2.1  [view]
    ├ Mezzanine                 £10,000,000   → p.14 cl.2.4  [view]
    └ less Cash                 -£2,400,000   → certificate p.3

  LTM EBITDA                                           £14,000,000
    ├ Statutory EBITDA           £9,500,000   → certificate p.2
    ├ + Exceptional items        £2,900,000   → p.31 cl.1.1(d)(iii)  [view]
    └ + Run-rate synergies       £1,600,000   → p.31 cl.1.1(d)(vii)  [view]
                                              ⚠ capped at 20% — within cap

  Add-backs = 32% of adjusted EBITDA        S&P study median ≈30%    ● Normal
```

**Every figure one click from its source page.** That is the differentiator
nobody else ships as a first-class screen, and it is where the design effort
belongs — ahead of the portfolio overview.

## Component decisions to make here

| Need | Candidate | Note |
|---|---|---|
| Dense sortable portfolio grid | **TanStack Table** | Raised in `../decisions/0001-tech-stack.md` addendum 2. Headless, so it composes with our own styling. Evaluate before building our own, per the standing rule |
| Headroom trend charts | ⬜ **undecided** | Needs a decision. Criteria: accessible by default, works server-rendered, no licence trap, small bundle |
| Typography | Newsreader + Schibsted Grotesk | `../decisions/0003-typography.md` |
| Motion | — | Must respect `prefers-reduced-motion`; standing requirement |

⚠️ **Do not re-add** the ticker strip, sector bars, donut chart or calendar grid
— `../decisions/0004-design-direction.md` records those as explicitly rejected.

## ⚠️ A sequencing warning

The plan calls Phase 5 *"the first thing you can show a fund"*. True — but **a
dashboard is a demo of nothing until Phase 4 produces verified data.** The
temptation at Phase 5 is to build something that looks finished over mock data
and call it progress.

**Build the review/trace screen before the portfolio overview.** The overview
demos well; the trace screen is what makes them buy. And the trace screen is
the one that proves the engine works.

## What Phase 5 delivers

A calculation-trace screen where every figure links to its source page; a
portfolio overview with status indicators that survive greyscale; headroom
trend charts; a Playwright E2E harness; motion that respects
`prefers-reduced-motion`.

## Risk rating: 🟢 Low

No blockers. Both constraints have known answers and both are cheap if handled
now — a status component designed colour-only, or a dashboard with no E2E
harness, is expensive to retrofit.

## Sources

- [WCAG 2.2 SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) — Level A
- `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` — **primary**, Next.js 16.3.0: async Server Components unsupported
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` — the E2E guide to read first
- `phase-2-extraction-spike.md` · `phase-4-document-pipeline.md` · `../decisions/0003-typography.md` · `../decisions/0004-design-direction.md`

# 0004 — Design direction

**Decided** 2026-08-21 · **Status** Accepted

## Palette: white and black, with a purple touch

Purple is **an assertion, not decoration.** It appears only where QuarterMark claims something:
the recalculated figure, the active nav item, the primary action. Never as background texture,
never as a gradient.

Red is the only second colour, used sparingly — a breach genuinely is the one thing allowed to
shout. Compliant and watch states are carried by **weight and a small mark**, not by fill.

Dark-mode values in `0003-typography.md`.

## Direction: "The Document"

The product's job is reading a legal agreement and proving a number wrong. So the interface
should feel like an impeccably set financial document — **not a trading terminal**.

1. **Rules, not boxes.** Hairline rules and whitespace instead of nested cards.
2. **One question per screen.** Dashboard answers *what needs attention*; covenant page answers
   *is this number right*. Supporting context goes in a slide-over, opened deliberately.
3. **The trace is the hero, set like a schedule.** Right-aligned figures, a rule above totals,
   adjustments indented. Density is *correct* there because it mirrors a real accounting
   schedule — which is why it earns its place where a donut chart does not.
4. **Large type jumps** (~13 → 15 → 22 → 40px), so hierarchy reads with no colour at all.
5. **Motion is required, not optional** — transitions, skeleton/loading states, hover and focus
   feedback. Must respect `prefers-reduced-motion`.

## Explicitly rejected (2026-08-21)

A dense multi-panel dashboard — ticker strip, five metric tiles, sparkline table, and a right
rail of donut + sector bars + insights + calendar + quick actions — was built and **rejected by
the founder as "poor and ugly."** Roughly fourteen bordered panels competing for attention.

**Do not re-add the ticker strip, sector bars, donut chart or calendar grid without being asked.**

The lesson: those reference dashboards are *decoratively* dense. QuarterMark must be
*diagnostically* dense — every chart answers a question an analyst actually asks, or it goes.

Also rejected: purple-to-blue gradient heroes, and any promo/upgrade card in the sidebar. A COO
reviewing a breach is not being upsold mid-task.

## Accessibility (binding)

Every status carries an **icon shape and a text label**, never colour alone — roughly 1 in 12
men has a colour-vision deficiency, and these reports get printed in monochrome for investment
committees. All numeric columns use tabular figures. Visible keyboard focus everywhere.

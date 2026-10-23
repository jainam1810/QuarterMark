# 0003 — Typography

**Decided** 2026-08-21 · **Status** Accepted

## Decision: two fonts, both OFL, both self-hosted

| Role | Font | Why |
|---|---|---|
| Display — headings, hero numbers, legal clause quotes | **Newsreader** (Production Type) | Variable `wght 200–800` **plus `opsz 6–72`**; **tabular figures by default** (550/1000em) |
| UI, body, all figures | **Schibsted Grotesk** (Bakken & Bæck) | Variable `wght 400–900`; has `tnum`, `pnum`, **`zero` (slashed zero)**, `case`, `frac` |

**Third font if ever needed: Lora** (OFL, variable `wght 400–700`, x-height 500, has `tnum`).

All metrics `[VERIFIED 2026-08-21]` by inspecting the font binaries with fontTools; licences
from the `google/fonts` repo `METADATA.pb`. Not from blog listicles — those were wrong (below).

## No monospace — deliberate

Schibsted Grotesk already carries `tnum` **and** `zero`, so figures align without one. Legal
clause text belongs in a **serif**: real credit agreements are set in serif, not monospace.
Newsreader does that job and does it more authentically.

## Dark mode requirements

Light text on dark appears optically **bolder** (halation), so weight must be dialled *down* in
dark mode — which requires **variable** fonts. Both chosen fonts are variable; this ruled out
otherwise-good static faces.

Ground is **near-black tinted toward the purple accent, never navy** — navy sits ~230° against
a ~280° purple accent and the two quietly fight; navy dark themes are also the generic default.

- bg `#131118` · surface `#1B1922` · text `#E9E7EF`
- Never pure `#FFF` on `#000` — that is what causes dark-mode glare and blur.

## Rejected, with reasons

| Font | Why rejected |
|---|---|
| **Inter** | Generic; the default everyone reaches for. Reads as AI-built. |
| **Roboto** | Android's system font; reads cheap beside a £900/month product. |
| **Instrument Serif** | **Static — single weight.** Cannot dial down for dark mode, and its high-contrast hairlines shimmer on dark grounds. |
| **IBM Plex Mono / DM Mono** | Static. Same dark-mode problem. |
| **Geist Mono / JetBrains Mono** | Dev-tool aesthetic; wrong register for a financial product. |
| **Martian Mono** | Too wide and technical. |
| **Cormorant Garamond** | x-height only 386 and delicate high-contrast hairlines — fails on dark backgrounds. |
| **Proxima Nova** | **Commercial.** Self-hosting needs a paid licence by pageview (~$450/yr documented); Mark Simonson Studio actively pursues unlicensed use. Also duplicates Schibsted Grotesk's role. |
| **Fontshare** (Satoshi, Switzer, General Sans) | Self-hosting reportedly requires written ITF consent, with their CDN the intended route. `[ASSERTED — licence page is JS-rendered, could not verify]`. Disqualifying either way: external font CDNs fail security review and are blocked in artifacts. |

## Notable finding the listicles got wrong

**IBM Plex Sans has no `tnum` feature — because it does not need one.** Every digit is exactly
600/1000em, so its figures are tabular *by default*. Checking only for the feature flag would
have wrongly eliminated it. Conversely **Geist's digits are proportional** (384–663/1000em) and
*require* explicit `font-feature-settings: "tnum"` — and Vercel's own docs state the Google
Fonts build does not support `font-feature-settings` at all.

**Competitor typography** `[VERIFIED 2026-08-21, from their stylesheets]`: 73 Strings uses
**IBM Plex Sans** (primary) + Inter, self-hosted via `next/font`. Allvue loads Instrument Sans,
Inter, Manrope and Roboto from Google Fonts. Both are marketing sites, not the logged-in
products. Choosing neither of their primaries is deliberate — looking identical to the
incumbents makes us look like a cheaper copy.

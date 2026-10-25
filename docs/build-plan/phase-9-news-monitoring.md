# Phase 9 — News monitoring on the borrower page

**Verdict: 🟡 Buildable, but build it in the opposite order to the obvious one —
free official sources first, paid news API only if a customer pays for it. And
do not build the Bloomberg-style impact score.**
Checked 2026-10-25.

## What was asked

`[Jainam 2026-10-25]`

> "News API — now the borrower is from retail grocery. Any news about retail
> grocery, or news that will impact retail grocery, arrives and it will be shown
> on that borrower detail page, with impact — how heavy the impact is? Like
> Bloomberg does it."

Two separable things: **a news feed filtered to the borrower**, and **an impact
score on each item**. The first is sound. The second is the problem.

## Part 1 — the news feed

### Licensing, and it is the market-data trap again

`[VERIFIED 2026-10-25]` ⚠️ Mostly third-party comparison sites, not the
providers' own terms. **Read the actual ToS before committing.**

| Provider | Finding |
|---|---|
| **NewsAPI.org** free tier | **Development and testing only — no commercial use** |
| **NewsAPI.org** Business | **$449/month** (~£350) for production use |
| **Event Registry** (newsapi.ai) | Paid users may show *headline, short excerpt, source name, date, thumbnail, link*. May **not** redistribute raw API responses or bulk feeds. Full article text requires publisher rights |
| **GDELT** | **Free for commercial use with attribution**, no API key, tone score included, **no article body text**, ~250 articles/response, 15-minute refresh |
| Google News | No official API; scraping breaches terms |

**The shape of the law, consistently:** headline + snippet + link is fine.
Reproducing the article is not.

**£350/month is ~30× our modelled infrastructure cost.** For a bootstrapped
product that is not a feature decision, it is a pricing decision. It must not
precede a customer asking for it.

### Build order — cheapest, highest-signal first

**1. The Gazette** — free, official, OGL. `[VERIFIED]`
Winding-up petitions, administrator and liquidator appointments, bankruptcy
orders, naming the actual company. This is not "news about the sector" — it is
**a legal notice about your borrower**, and it is the highest-signal item
available anywhere. See `../reference/data-sources.md`.

**2. Companies House stream** — free, already planned in Phase 6.
New charges, director resignations, overdue accounts.

**3. GDELT** — free, commercial use permitted, attribution required.
Sector-level coverage and tone. Good enough to answer *"is UK grocery retail
being written about more negatively this month?"*

**4. A paid news API** — only when a named customer asks and the price is
covered. Not before.

### 🔴 Sector news is mostly noise; company news is signal

> *"UK grocery inflation rises"* — the analyst already knows. They read the FT.
>
> *"Castle Grocers named in supplier dispute"* — they did not know. That is the
> product.

**Rank by specificity, not recency.** A company-name match outranks a sector
match by a wide margin, and a sector feed with no company filter will train
analysts to ignore the panel within a fortnight.

⚠️ Company-name matching is harder than it looks: trading names differ from
registered names, and common names collide. **Match on company number wherever
possible**, and show the analyst what was matched.

## Part 2 — 🔴 the impact score: do not build it

The request was *"how heavy the impact is, like Bloomberg."* Recommend against,
on the product's own terms.

**The whole pitch is that every figure traces to a source.** Phase 2 settled
this: the fatal failure mode is *"a confidently wrong output that precisely and
citably contradicts the borrower while being wrong"*. The answer was the human
approval gate, and the honest promise *"AI drafts, you verify"*.

**An AI-generated impact score cannot be verified against anything.**

| Output | Can the analyst check it? |
|---|---|
| Covenant breach calculation | ✅ Against the agreement and the page it came from |
| Extracted EBITDA definition | ✅ Against clause 1.1 |
| Statutory vs sector leverage | ✅ Against filed accounts |
| **"HIGH IMPACT" on a headline** | ❌ **Against nothing** |

Three out of four trace to a document. The fourth is an opinion wearing a
number, and it sits on the same screen borrowing their credibility.

**Bloomberg can do this. We cannot, and for a structural reason** — decades of
labelled outcome data, a newsroom, and customers paying ~$24k/terminal/year who
treat it as one input among many. Copying the surface without the substance
imports the risk and none of the backing.

### What to show instead

**Why it surfaced, not how much it matters.** The analyst judges severity; that
is their job and their liability.

```
NEWS — CASTLE GROCERS (SIC 47110)
─────────────────────────────────────────────────
⚖  Winding-up petition — supplier            The Gazette · 2 Nov
   ↳ matched: company number 08123456          official notice

📄 Supplier dispute reported                  [source] · 1 Nov
   ↳ matched: company name in headline

📊 Sector coverage tone down 18% this month   GDELT · Nov
   ↳ sector match only — context, not a signal
```

Three tiers, each **labelled with why it appeared** and how strong the match is.
Sector items are explicitly marked as context. No score, no severity colour
invented by a model.

⚠️ If an impact score is ever built, it must be **retrospectively testable** —
log every score, then measure months later whether high-scored items preceded
covenant deterioration. **Until that evidence exists, the number is decoration.**

## What this phase delivers

A per-borrower feed from the three free sources, ranked by match specificity,
each item showing its match reason and linking to the original. No stored
article text. No impact score.

## Risk rating: 🟡 Medium

Low technical risk. The risks are commercial and reputational:

| Risk | Mitigation |
|---|---|
| £350/month before a customer wants it | Free sources first; paid only on request |
| Copyright on article text | Headline + snippet + link only, never the body |
| Noise trains analysts to ignore the panel | Company matches outrank sector matches |
| **An unverifiable score contaminates a verifiable product** | **Do not ship a score** |

## Open question

**Do analysts actually want this?** `../positioning/customer-discovery.md`
records two calls, and neither raised news monitoring. **Ask before building.**
It may be a feature we want more than they do — and it is the kind that demos
well and goes unused.

## Sources

- [Best News APIs in 2026: specs, limits and pricing](https://www.newscatcherapi.com/blog-posts/best-news-apis) — NewsAPI.org tiers ⚠️ competitor-authored
- [Event Registry terms of service](https://newsapi.ai/terms) — what paid users may display; no full-text republication
- [GDELT Project — about](https://www.gdeltproject.org/about.html) — free commercial use with attribution ⚠️ confirm on the official terms page
- [The Gazette — re-using our data](https://www.thegazette.co.uk/data) — OGL, free for developers, personal-data and fair-use caveats
- `phase-2-extraction-spike.md` — the confidently-wrong failure mode this inherits
- `phase-6-early-warning.md` — the registry feed this sits beside
- `../reference/data-sources.md` — every link

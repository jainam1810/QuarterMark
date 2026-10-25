# Phase 2 — Extraction spike (the kill risk)

**Verdict: ✅ Buildable — but the accuracy ceiling is lower than vendors claim,
and that changes the product rather than cancelling it.**
Checked 2026-10-25.

## Why this phase exists

All three architecture designs independently concluded that **extraction is the
ceiling, not calculation**. If covenant definitions cannot be extracted reliably
from a 200-page agreement, no amount of engine quality saves the product.

This phase produces **a number**, not a feature.

## What the evidence says about achievable accuracy

`[VERIFIED 2026-10-25]` **No credit-agreement-specific benchmark exists.** The
closest published evidence, in descending order of relevance:

| Study | Task | Best score |
|---|---|---|
| arXiv 2605.05532 | Structured field extraction, 24 contracts, 26 fields, human-annotated | **Claude Opus 4.6 ≈ 0.817 micro F1**; best specialist 0.842 |
| Frontiers in AI 2026 | Span-level clause extraction, legally-adapted models | 0.903 F1 |
| ContractEval (arXiv 2508.03080) | Clause-level *risk identification* (harder) | GPT 4.1 — 0.641 F1 |
| ContractScrub (arXiv 2608.20204) | Final contract review (hardest) | GPT-5.5 — 0.750 recall, **all F1 below 0.650** |
| ContractEval, simple fields | "Governing Law", "Parties" | ≈0.9+ |
| Sirion (vendor) | Their own agent | 94.2% F1 — **marketing, thin methodology** |

**The pattern that matters:** accuracy tracks task difficulty, not model quality.
Simple named fields reach ≈0.9. Open-ended interpretation falls to ≈0.65. The
margin between frontier models and specialist tools is small (0.817 vs 0.842).

### What this predicts for covenant extraction

Covenant extraction is **not one task** — it is two, with very different profiles:

| Field | Difficulty | Likely accuracy |
|---|---|---|
| Threshold (4.50x), test dates, frequency | Simple named field | **high, ≈0.9+** |
| Ratio name, facility amounts | Simple named field | high |
| **The EBITDA definition** — add-backs, caps, carve-outs, cross-referenced defined terms | Open-ended interpretation | **lower, ≈0.65–0.85** |

⚠️ **73 Strings publicly claims 99% extraction accuracy.** The published
literature puts frontier models at ≈0.82 on easier tasks. Either they measure
something different, or the claim does not survive scrutiny. Do not benchmark
against their number, and do not repeat it.

## The finding that reshapes the product

**An 85%-accurate covenant definition is not 85% useful. It is dangerous.**

All three architecture designs named the identical worst failure mode:

> a confidently wrong extracted definition that precisely and citably
> contradicts the borrower **while being wrong**

So the conclusion is not "extraction must be perfect before we ship". It is:

**The human approval gate is not a safety nicety — it is the core product
mechanic.** The honest promise is *"AI drafts in minutes, you verify in
minutes"*, never *"AI extracts correctly"*. Design every screen so verifying is
fast: the definition beside its source clause, every figure one click from its
page.

This also matches what the funds actually said in discovery — trust first, and
they hate changing how they work. See `../positioning/customer-discovery.md`.

## Architecture (settled by earlier research)

`[VERIFIED 2026-08-04]` **LLMs cannot produce bounding boxes.** Anthropic's
Citations API grounds to `page_location` (start/end page number) only; Gemini
returns image-space boxes, not document-parse provenance.

Therefore **two layers, joined by character spans**:

```
PDF --+--> deterministic parser --> page + bbox geometry --+
      |    (Azure DI / Textract / Docling)                 |
      |                                                    +--> joined on spans
      +--> Claude ----------------> semantics, defined ----+
                                    terms, structure
```

Parsers disagree on coordinate systems (Azure uses inches for PDFs and pixels
for images; Textract and Google use 0–1 normalised; Docling uses PDF-space
polygons), so a **normalisation layer is required**.

Practical limits `[VERIFIED, Anthropic docs]`: 32 MB per request, 600 pages
(100 on 200k-context models). A 200-page agreement fits comfortably.

## The spike protocol

**Pre-register the pass mark before looking at any result** — otherwise we will
rationalise whatever number appears.

1. **Corpus.** 10 real credit agreements from EDGAR full-text search, filtered
   for *maintenance* covenants (much of the US corpus is cov-lite and would not
   exercise the code paths that matter). The query shape is already proven
   against the live API.
2. **Ground truth.** Hand-annotate all 10 **before** running extraction: every
   covenant, threshold, test date, and the full EBITDA definition with each
   add-back, cap and carve-out.
3. **Extract.** Two-stage — layout first, then targeted extraction per section,
   with a separate defined-terms index so terms used far from their definition
   still resolve.
4. **Score separately.** Simple fields and definition components are different
   tasks; averaging them hides the problem.
5. **Second-pass check.** Re-run with a model instructed to *disagree*. ExactCov
   ships this; measure whether it actually helps.

### Pass marks (set now, before any result)

| Result | Meaning |
|---|---|
| Simple fields **≥0.95**, definitions **≥0.85** | Proceed to Phase 3 as planned |
| Definitions **0.70–0.85** | Proceed, but the review UI becomes the hardest-worked screen in the product |
| Definitions **below 0.70** | **Stop and rethink.** Either narrow to simpler covenant types, or accept that the product is a review tool rather than an extraction tool |

## What Phase 2 delivers

A measured accuracy number per field class, a decision against the pass marks
above, and ~10 annotated agreements that become permanent regression fixtures.

`[ESTIMATE]` Roughly one week. Throwaway code, permanent knowledge.

## Sources

- arXiv 2605.05532 — structured contract extraction, human-annotated
- arXiv 2508.03080 — ContractEval, clause-level risk identification
- arXiv 2608.20204 — ContractScrub, final contract review
- Frontiers in AI 2026 — span-level clause extraction
- Anthropic PDF support and Citations API documentation
- `docs/research/technical-research.md` — parser coordinate conventions

## Claude API constraints that shape the pipeline

`[VERIFIED 2026-10-25 — Anthropic claude-api reference, model table cached 2026-10-06]`
Added after Jainam raised a third-party blueprint recommending "Claude 3.5
Sonnet or GPT-4o" — two generations stale.

### Current models

| Model | ID | Context | $/1M in | $/1M out |
|---|---|---|---|---|
| **Opus 5.5** *(default)* | `claude-opus-5-5` | 1M | $4 | $20 |
| Sonnet 5.5 | `claude-sonnet-5-5` | 1M | $2 | $10 |
| Haiku 5.5 | `claude-haiku-5-5` | 1M | $0.10 | $0.50 |

**1M context.** A 200-page agreement fits with room to spare. PDF limits are
**32 MB and 600 pages** per request.

### 🔴 Citations and structured outputs are mutually exclusive

Verbatim from the API reference: citations are **"Incompatible with
`output_config.format` (returns a 400)"**.

**This matters a lot here.** The pipeline wants both at once — covenant fields
as validated JSON *and* a citation proving where each came from. One request
cannot do both.

**Three ways out, in order of preference:**

1. **Tool use with `strict: true`.** The restriction names `output_config.format`
   specifically, not tool schemas. A tool definition with `strict: true`,
   `additionalProperties: false` and `required` guarantees schema-valid
   arguments. ⚠️ **Verify this combination actually works in the spike** — it is
   inference from the documented restriction, not a documented guarantee.
2. **Two passes** — one for structure, one for citations, joined afterwards.
   Doubles cost and introduces a reconciliation problem.
3. **Citations only**, parsing the text ourselves. Loses the validation.

**Resolve this in the Phase 2 spike.** It changes the request shape of the whole
extraction pipeline, and discovering it during Phase 4 would be expensive.

### Citation granularity — confirms the earlier finding

Citations return `page_location` (`start_page_number` / `end_page_number`,
1-indexed) for PDFs and `char_location` for text. **No bounding boxes.**

This is exactly what `[VERIFIED 2026-08-04]` established above, now reconfirmed
from the current reference. **The two-layer architecture stands**: the
deterministic parser supplies geometry, Claude supplies meaning, joined on
character spans.

### Two cost levers the blueprint missed

- **Prompt caching** — cache the agreement once, then ask many extraction
  questions against it. Cached tokens read at roughly a tenth of the input
  price. For a 200-page agreement interrogated field by field, this is the
  single largest saving available.
  ⚠️ Caching is a **prefix match** — any byte change invalidates everything
  after it. Verify with `usage.cache_read_input_tokens`; if it is zero across
  repeated calls, something is silently invalidating the prefix.
- **Batch API** — **50% cost**, asynchronous. Right for the initial corpus run
  and for any bulk re-extraction. Wrong for interactive onboarding.

Both should be measured in the spike, since `0002-hosting-and-costs.md` carries
only an `[ESTIMATE]` of ~£1 per agreement.

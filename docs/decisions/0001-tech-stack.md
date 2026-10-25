# 0001 — Tech stack

**Decided** 2026-08-21 · **Status** Accepted

## Decision

| Layer | Choice | Portable to AWS? | Portable to Azure? |
|---|---|---|---|
| Language | TypeScript | ✅ | ✅ |
| App | Next.js (Node.js) | ✅ | ✅ |
| Database | **PostgreSQL** | ✅ RDS / Aurora | ✅ Azure Database for PostgreSQL |
| Queries | Plain SQL | ✅ | ✅ |
| Auth | Own tables, server-verified sessions | ✅ | ✅ |
| AI | Claude | ✅ AWS Bedrock | ✅ Microsoft Foundry |
| File storage | S3-compatible, **behind one adapter interface** | ✅ S3 | ✅ Blob (via adapter) |

## The governing rule: no cloud-specific code

Every component is a boring open standard. Postgres is Postgres anywhere; Node runs anywhere;
Claude is reachable via the Anthropic API, Bedrock **or** Foundry with the same code shape.

**Consequence:** moving clouds is a deployment change, not a rewrite. This is the insurance
policy against an enterprise client demanding Azure or a single-tenant AWS account.

**The one exception:** S3 and Azure Blob have different APIs. File storage sits behind a single
interface from day one, so switching is one file rather than a hunt through the codebase.

## Deliberately rejected

- **Writing AWS-specific code now.** Creates exactly the lock-in we are insuring against.
- **Opening an AWS account now.** `[VERIFIED 2026-08-21, aws.amazon.com/free]` The free plan
  gives $100 immediately (up to $200), and **"the account closes on its own 6 months after you
  open it or when your credits run out, whichever comes first."** Opening it during the build
  burns the window at zero customers and leaves nothing for the migration it is meant to fund.

## Serverless: evaluated, accepted with constraints

`[VERIFIED 2026-08-21, vercel.com/docs/functions/limitations]` Vercel Pro with Fluid compute:

| | Limit | Issue for us |
|---|---|---|
| Concurrency | auto-scales to 30,000 | None — traffic is tiny |
| Max duration | 300s default, **800s max**, 1800s beta | Manageable |
| **Request body** | **4.5 MB** | ⚠️ Real — a scanned agreement exceeds it |
| Memory | 4 GB / 2 vCPU | None |

**Scaling is not the constraint; job duration and upload size are.** Both have standard fixes:
PDFs upload **direct to storage**, never through a function; long extraction runs on a
background queue, not in one request.

**Serverless actively favours this workload.** Vercel's docs: *"Waiting for I/O (e.g. calling
AI models, database queries) does not count towards active CPU time."* The pipeline is mostly
waiting on Claude. On a server that idle time is billed; here it is not.

## Security requirements (non-negotiable, from the outset)

Server-side authorisation on every query and action — never trust a client-supplied tenant id.
Parameterised queries. Tenant isolation enforced at the data layer. No secrets in client code.
Approval is a distinct permission from editing. Full audit trail: approver, figures, definition
version in force, source pages cited.

⚠️ `[VERIFIED 2026-08-04]` If row-level security is ever used: session-scoped Postgres GUCs
**leak across tenants** under transaction-mode connection pooling unless every query uses
`SET LOCAL` inside an explicit transaction. This is the classic serverless-Postgres footgun.

## Addendum 2026-10-25 — "Should we copy Allvue's stack?"

Jainam raised an AI-generated summary of Allvue's technology stack. Checked it,
then asked the only question that matters: **does it change ours?** It does not,
and the reason is instructive.

### What the summary claimed, and what is actually verifiable

| Claim | Status |
|---|---|
| Fund accounting built on Microsoft Dynamics | ✅ **`[VERIFIED]`** — Allvue's own pages say the fund accounting cloud architecture is built on **Dynamics NAV** (Business Central is NAV's current name) |
| Microsoft Azure as cloud provider | 🟡 `[PLAUSIBLE]` — third-party profile, not confirmed on Allvue's own site |
| C# / .NET as core languages | ❌ **`[UNVERIFIED]`** — **no Allvue job posting found naming C#, .NET or Azure as a requirement.** Asserted confidently by the summary with nothing behind it |
| Snowflake for Nexius | ❌ `[UNVERIFIED]` |
| Python for ML pipelines | ❌ `[UNVERIFIED]` |
| RAG + vector storage for extraction | 🟡 `[PLAUSIBLE]` — consistent with their Andi assistant |

**Treat AI-generated stack summaries as hypotheses.** This one mixed one
verifiable fact with four confident assertions in identical prose.

### 🔴 The decisive point: their stack exists for a job we do not do

**Allvue is built on Dynamics because Allvue does fund accounting.** Their
product needs a general ledger, partnership accounting, multi-currency, and
automated carried-interest waterfall calculations. Building a GL from scratch
would be irrational, so they inherited one from Microsoft's ERP platform.

**QuarterMark has no general ledger, no capital accounts, no waterfalls.** We do
covenant monitoring. **The single largest driver of Allvue's architecture does
not apply to us at all.**

Their stack is also the residue of a 2019 merger, multiple acquisitions, 500+
enterprise clients, and buyers who demand Power BI and Snowflake integration.

> **Copying an incumbent's stack means inheriting their constraints without
> their resources.** Theirs is the output of decisions made for reasons we do
> not share.

### Where our approach is deliberately different — and better for this job

The summary mentions **RAG and vector storage** for document extraction.
`phase-2-extraction-spike.md` deliberately chose otherwise, and the reason is
not preference:

| | RAG retrieval | Our two-layer approach |
|---|---|---|
| Returns | Semantically similar chunks | Exact character spans joined to page geometry |
| Provenance | Chunk-level, approximate | **Page and bounding box** |

**A covenant determination must cite the clause it came from.** "Here is a
passage that resembles your question" is not a citation. RAG is the right tool
for a chat assistant like Andi; it is the wrong tool for a provenance chain an
analyst has to defend to an investment committee.

This is a genuine differentiator, not a gap.

### Does any of it influence us?

**One thing, weakly.** If the market leader is Microsoft-centric, funds' IT
departments are already comfortable with Microsoft — a marginal point in
Azure's favour. `0002-hosting-and-costs.md` keeps AWS-vs-Azure open until
Phase 3 regardless, and this does not decide it.

### Decision: no change

TypeScript, Next.js 16.3.0, PostgreSQL stand. Reasons, in order:

1. **No general ledger requirement** — the thing that forced Allvue's hand
2. **The workload is I/O-bound**, not CPU-bound: Claude API calls and Postgres
   queries. Language choice is not the performance lever
3. **`decimal.js` is already verified** against the money requirement
   (`phase-0-foundations.md`), and branded TypeScript types can carry units and
   currency — two of the five Phase 1 commitments
4. **A two-person team should not be polyglot**
5. **Phase 0 work and 12 source files already exist.** Switching now discards
   them for no capability gained

### The counter-argument, examined — Jainam pushed on it, and I was partly wrong

`[corrected 2026-10-25]` I wrote that C#/Java have "a deeper talent pool in UK
finance" as a throwaway counter-point. **Checked it. The data does not say what
I said, and the part that is true points the opposite way.**

`[VERIFIED — ITJobsWatch, 6 months to 4 Sep 2026]` ⚠️ Keyword matching on job
adverts; measures *mentions*, not hires.

| Language | UK permanent vacancies | Rank | Median salary |
|---|---|---|---|
| **C#** | **3,385** | 46 | **£60,000** |
| Java | 2,847 | 56 | £70,000 |
| JavaScript | 2,572 | 67 | £57,500 |
| **TypeScript** | **1,896** | 108 | **£70,000** |

**Two corrections to what I said:**

1. **C# genuinely has more UK demand than TypeScript** — 1.8× the vacancies. My
   implication that TypeScript is the more abundant hire was wrong.
2. **But vacancy count measures demand, not supply.** More vacancies means more
   employers competing for the same candidates. For a *hiring* employer that is
   a cost, not a benefit.

**The real finding is the salary column:** C# median **£60k against TypeScript's
£70k** — roughly 14% cheaper per hire. That is a genuine point in C#'s favour
for a bootstrapped founder, and it is the opposite of the argument I originally
made.

Also noted: TypeScript job ads frequently cite C# or Java too. These are not
separate talent pools.

### The decimal argument is also narrower than it sounds

**C#'s `decimal` does not solve the hard problem.** It is 128-bit with 28–29
significant digits — **not** arbitrary precision — and division still rounds.
`1/3` is inexact in every decimal type ever built.

So in any language we must still answer: **is 4.4999 a breach of a 4.50x
covenant?** That is a rounding *policy*, decided once in the domain, and it is
identical work in C#, Java or TypeScript.

**And money here is integer minor units** (`src/lib/format.ts`), which are exact
in JavaScript up to ~£90 trillion in pence. Decimals are needed only for the
division that produces ratios — which is exactly what `decimal.js` does, already
verified in `../build-plan/phase-0-foundations.md`.

What C# genuinely buys is **a safer default**: `decimal` is the obvious choice,
whereas TypeScript makes `number` the obvious choice and we have to resist it.
That is a real discipline risk, mitigable with branded types and a lint rule
banning raw arithmetic on money types — but it is work C# would not require.

### So does the decision change? No — and the reason is not technical

Both counter-arguments survive scrutiny better than I first allowed. They still
lose, on grounds that have nothing to do with language quality:

| | |
|---|---|
| **We are not hiring** | Two people, pre-revenue. The hiring argument concerns a future that arrives only after product-market fit |
| **Switching buys zero customer capability** | Weeks of work; not one thing a fund could see |
| **The actual risk is not shipping** | CrossBorderX died at "almost ready". A stack rewrite before the first customer is the most reliable way to repeat that |

**If we were starting from zero today, with no code written, would the answer
change?** Honestly — still no, but for a different reason than hiring:
`phase-5-dashboard` is the first demoable build and Phase 2 calls the review
screen "the hardest-worked screen in the product". A .NET backend plus a React
frontend is two ecosystems, two build chains, two skill sets — **for two
people.** One language across the whole stack is the staffing argument that
actually applies at our size.

**What would change it:** hiring 3+ engineers from a banking background, or a
requirement to integrate deeply with a Microsoft ERP. Neither is on the
horizon.

**Sources:** [Allvue fund accounting](https://www.allvuesystems.com/solutions/fund-accounting) (Dynamics NAV, on their own site) · Allvue job listings via Indeed and ZipRecruiter (no .NET/C# requirement found) · `phase-2-extraction-spike.md`


## Addendum 2026-10-25 (2) — reviewing a generic "covenant monitoring stack" blueprint

Jainam raised a second AI-generated stack, this one specific to covenant
monitoring. **Better than the Allvue summary — it independently converged on
several of our decisions — but it contains three errors that would be expensive,
and it exposed two genuine gaps.**

### Where it independently agrees with us — useful validation

| Its recommendation | Our decision |
|---|---|
| "Custom JSON-based DSL... rather than hardcoding hard-to-change math" | **Phase 1: closed JSON AST, never evaluated as code** |
| PostgreSQL for the relational core | ADR 0001 |
| Next.js + TypeScript frontend | ADR 0001 |
| S3-compatible object storage | ADR 0001 |
| SOC 2 Type II, RBAC | `../positioning/corrections-register.md` §8, `permissions.ts` |
| Zero-retention agreements / Bedrock private endpoints | ADR 0002 |

**Four independent sources have now landed on "JSON AST, not hardcoded
formulas"** — three architecture designs plus this. Strong convergence on the
Phase 1 core.

### 🔴 Three errors

**1. "Vector database for RAG & citation tracking" — wrong tool for citation.**
A vector database retrieves *semantically similar chunks*. It does not tell you
which clause a number came from. Provenance is **stored structured data** —
character span, page, bounding box — written at extraction time. Reaching for
embeddings to answer "where did this figure come from" returns a plausible
passage instead of the actual one. Same error as the Allvue RAG point above.

**2. "Pandas, NumPy" for the calculation engine — these are float64.**
Precisely what Phase 1 forbids: *decimal, never float*. Using NumPy for covenant
ratios reintroduces the error the architecture exists to exclude. Pandas is fine
for Companies House harvest analysis; it must never touch a covenant
determination.

*(`Pint` for units is a legitimate suggestion — but it enforces at runtime,
where branded TypeScript types enforce at compile time. Ours is stronger.)*

**3. "Claude 3.5 Sonnet or GPT-4o" — two generations stale.**
Current is **Claude Opus 5.5** (`claude-opus-5-5`, 1M context, $4/$20 per MTok).
See `../build-plan/phase-2-extraction-spike.md` for the table and for the
citations constraint found while checking this.

*Minor:* Cerberus is a validation library, not a rule engine. Kubernetes is
over-engineering for two people — ECS/App Runner or Azure Container Apps.

### 🟢 Two genuine gaps it exposed

**1. Excel compliance certificates — not in our plan.**
> "Openpyxl or Pandas for ingesting borrower-submitted Excel compliance
> certificates or financial models"

`../build-plan/phase-4-document-pipeline.md` assumes **PDFs throughout**. If
borrowers submit figures in Excel — and in this market many will — that is a
second ingestion path with its own parsing, its own provenance model (cell
reference rather than page and bbox), and its own review UI.

⚠️ **`[UNVERIFIED]` — ask a fund before building.** Neither discovery call
covered submission format. Recorded as Q3 in `../open-questions.md`.

**2. TanStack Table for the portfolio grid.**
Sound Phase 5 suggestion for dense sortable monitoring grids with drill-down.
Evaluate against building our own, per the standing rule on preferring a proven
library.

### Decision: no change to ADR 0001

The convergence is reassuring; the errors are the kind that look authoritative
and cost months. **The two gaps are real and are now tracked.**

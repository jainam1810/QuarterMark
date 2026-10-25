# Phase 4 — Document pipeline

**Verdict: 🟢 Buildable. No blockers. The plan's upload limit is wrong for our
stack — the real one is lower, which makes direct-to-storage more necessary, not
less. Three security traps, all with known fixes.**
Checked 2026-10-25.

## What the plan said

> Direct-to-storage upload (bypasses the 4.5 MB limit), two-layer extraction —
> deterministic parser owns page geometry, Claude owns meaning — human review
> queue. **Nothing counts until a person approves.**

## The 4.5 MB figure is wrong for us

`[VERIFIED 2026-10-25 — `node_modules/next/dist/docs`, Next.js **16.3.0**, the
exact version installed]`

**4.5 MB is a Vercel platform limit.** We are deploying to AWS or Azure
(`../decisions/0002-hosting-and-costs.md`), so it never applied. The real
numbers:

| Limit | Default | Source |
|---|---|---|
| **Server Actions `bodySizeLimit`** | **1 MB** | `serverActions.md` |
| `proxyClientMaxBodySize` *(experimental)* | 10 MB | `proxyClientMaxBodySize.md` |

Verbatim from the Server Actions config doc:

> "By default, the maximum size of the request body sent to a Server Action is
> **1MB**, to prevent the consumption of excessive server resources in parsing
> large amounts of data, as well as potential DDoS attacks."

**The ceiling is 4.5× lower than the plan assumed.** A 200-page credit
agreement is routinely 5–50 MB. So direct-to-storage is not an optimisation —
it is the only way the feature works at all.

⚠️ Also documented: the limit applies to the **raw** body including multipart
boundaries and part headers, with **10–20 KB** of overhead as a rule of thumb.
Any size check must allow for it.

### 🔴 Trap 1 — Next.js truncates silently instead of failing

From `proxyClientMaxBodySize.md`, verbatim, on exceeding the limit:

> "The request will **not** fail or return an error to the client"

It buffers the first N bytes, logs a warning to the console, and **carries on**.

For a document pipeline this is silent data corruption: a 15 MB agreement
becomes a truncated file, extraction runs on the fragment, and nothing anywhere
reports an error. The analyst reviews covenants extracted from two-thirds of a
contract.

**Mitigations:** route documents around the app entirely (direct-to-storage
already does this), and **verify the stored object's size against the
client-declared size** before queueing extraction. Never trust that a complete
upload arrived.

## Direct-to-storage: get the mechanism right

`[VERIFIED 2026-10-25]` ⚠️ Practitioner sources, consistent with each other.
Confirm against AWS documentation before implementing.

### 🔴 Trap 2 — a presigned PUT cannot enforce size or content type

- A presigned **PUT** accepts a one-byte file or a five-gigabyte one at the same
  key. `Content-Length` can be pinned to an exact value but not a range, and the
  client can declare whatever it likes.
- `ContentType` passed to `getSignedUrl` **looks** like a constraint. S3 treats
  it as a suggestion the client can silently override.

**Use a presigned POST policy instead.** It enforces, at S3, before the bytes
land:

| Condition | Effect |
|---|---|
| Key prefix | Cannot write outside its own folder |
| Content-Type prefix | `application/pdf` only |
| **Content-length range** | Rejected at the door — `EntityTooLarge` |

⚠️ **Azure uses SAS tokens, not POST policies.** The equivalent constraints must
be verified separately before the host decision closes in Phase 3. **This is a
new input to that decision** — `0002-hosting-and-costs.md` does not currently
list it.

### 🔴 Trap 3 — a client-chosen key is a cross-tenant write

A browser that picks its own object key can **overwrite another fund's
document** or write outside its prefix.

**The key must be generated server-side**, after authorisation, and scoped to
the tenant's prefix. This is the same boundary Phase 3 is defending in the
database — and it is easy to secure one and forget the other.

**→ Add to the Phase 3 security-agent attack list as #7: can a fund write an
object into another fund's prefix?**

### The rest of the checklist

- **Rate-limit the signing endpoint.** Otherwise it is a free way to fill our
  storage at our expense.
- **Short expiry** — 5–15 minutes.
- **Treat the URL as a bearer token.** Anyone holding it has the delegated
  permission until it expires, and query strings leak into logs.
- **Validate after the fact anyway** — `HeadObject` for real size and type,
  delete what fails. MIME types lie.

## Malware scanning — a requirement, not a nicety

**We receive PDFs from funds and, indirectly, from borrowers.** A pipeline that
accepts third-party documents and never scans them is a finding in any DDQ, and
a real risk when those documents are parsed by native libraries.

`[VERIFIED 2026-10-25]` **AWS GuardDuty Malware Protection for S3**: $0.09/GB
scanned (cut 85% from $0.60 in Feb 2025) plus ~$0.215 per 1,000 objects
evaluated. A 12-month free tier of 1,000 objects / 1 GB per month is reported.

**At our volume this is pennies.** 100 documents a month at ~5 MB each is
~0.5 GB — roughly **$0.07/month**.

⚠️ **Gap: no pricing found for Microsoft Defender for Storage.** Check it
directly before the host decision. Treat scanning as a required capability on
whichever host wins.

⚠️ **Parse defensively regardless.** Malformed PDFs are a known attack surface
for parsing libraries. Run extraction in an isolated worker with no credentials
beyond the one object it is reading.

## Parser choice — the architecture already saved us money

Phase 2 split the work: **the deterministic parser owns page geometry only;
Claude owns meaning.** So we need the *cheap* tier, not the expensive one.

`[ESTIMATE — third-party sources, figures conflict. Verify on vendor pages.]`
Per 1,000 pages, and for one 200-page agreement:

| Service / tier | Per 1,000 pages | One agreement |
|---|---|---|
| Azure DI — Read (OCR) | $1.50 | $0.30 |
| **Azure DI — Layout** | **$10** | **$2.00** |
| Textract — OCR only | $1.50 | $0.30 |
| Textract — Tables | $15 | $3.00 |
| Textract — Forms | $50–65 | $10–13 |

**We need Layout-class output — page and bounding-box geometry — not Forms.**
Forms extraction is the expensive tier and Claude already does that job better,
per Phase 2.

So roughly **$2–3 per agreement for geometry**, on top of Phase 2's `[ESTIMATE]`
~£1 for Claude. Call it **~£3 per agreement, one-off at onboarding**. Against a
per-fund subscription, immaterial.

⚠️ Textract bills **per feature**, so a document sent through both Forms and
Tables incurs both. Choose the single tier deliberately.

✅ Azure DI also offers container and disconnected deployment; Textract is
managed-only. Not needed now, but it is a portability point consistent with
`0001-tech-stack.md`'s no-cloud-specific-code rule.

## The human review queue

Lowest-risk part of the phase, and the most important to get right, because
**nothing counts until a person approves**.

It depends on Phase 3's permission model where **approve is a separate
permission from edit** — already decided in `src/lib/platform/permissions.ts`.

Design notes carried from Phase 2: the reviewer sees the extracted value beside
its source clause, every figure one click from its page. Verifying must be
faster than re-reading the contract, or the product fails its actual promise.

## What Phase 4 delivers

Direct-to-storage upload via presigned POST with enforced size, type and
server-generated key; post-upload verification of size and type; malware
scanning; two-layer extraction joining parser geometry to Claude semantics on
character spans; and a review queue where approval is a distinct permission.

## Risk rating: 🟢 Low

Every limit is now known from primary sources, every trap has a documented fix,
and the costs are small. The residual risk is **implementation discipline**,
not feasibility — all three traps fail silently and none would be caught by a
test that only checks the happy path.

## Sources

- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` — **primary**, Next.js 16.3.0: 1 MB default, multipart overhead
- `node_modules/next/dist/docs/.../proxyClientMaxBodySize.md` — **primary**: 10 MB default, silent truncation behaviour
- [The illustrated guide to S3 pre-signed URLs](https://fourtheorem.com/the-illustrated-guide-to-s3-pre-signed-urls/) — PUT vs POST policy
- [What an S3 presigned URL actually signs](https://blog.alexrusin.com/s3-presigned-url-actually-signs/) — Content-Type is advisory on PUT
- [S3 POST policy: the hidden S3 feature](https://dev.to/apptrail/s3-post-policy-the-hidden-s3-feature-you-havent-heard-of-k2g) — content-length-range conditions
- [GuardDuty Malware Protection for S3 price reduction](https://aws.amazon.com/about-aws/whats-new/2025/02/amazon-guardduty-malware-protection-s3-price-reduction) — AWS, 85% cut to $0.09/GB
- [AI document processing costs 2026](https://www.ud.hk/en-US/resources/ai/ai-document-processing-costs-2026-08-11) — parser rates ⚠️ third-party, conflicting
- `phase-2-extraction-spike.md` · `phase-3-data-layer.md` · `../decisions/0002-hosting-and-costs.md`

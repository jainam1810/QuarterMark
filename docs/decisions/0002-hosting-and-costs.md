# 0002 — Hosting

**Decided** 2026-08-21 · **Revised** 2026-10-25 · **Status** Accepted

> **Revision note.** The original version of this ADR committed to Supabase
> (AWS London) for the pilot. That is **superseded**: the host will be **AWS or
> Azure**, matching `README.md`, which states *"UK region; portable to AWS or
> Azure"* and names no vendor.

## Decision

**AWS or Azure, UK region.** The choice between the two is deliberately deferred
to Phase 3, when the schema exists and the trade-off is concrete rather than
theoretical.

| | AWS | Azure |
|---|---|---|
| Postgres | RDS / Aurora PostgreSQL | Azure Database for PostgreSQL Flexible Server |
| UK region | eu-west-2 (London) | UK South (London) |
| Object storage | S3 | Blob Storage |
| Claude | Bedrock | Microsoft Foundry |

Both satisfy the README's portability rule, because what we deploy is standard
Node.js, standard Postgres, and object storage behind one adapter interface.

## Selection criteria

**1. `btree_gist` — checked, and it does not discriminate.**

Bitemporal covenant versioning needs an exclusion constraint preventing
overlapping validity ranges, which requires the `btree_gist` contrib extension:

```sql
create extension if not exists btree_gist;
alter table covenant_definition_version
  add constraint no_overlapping_validity
  exclude using gist (covenant_id with =, validity with &&);
```

Without it, non-overlap has to be enforced in application code — a race
condition. So it was a potential disqualifier. It is not:

| Host | `btree_gist` | Source |
|---|---|---|
| **Azure Flexible Server** | ✅ v1.5–1.8, PG 11–18, no `shared_preload_libraries` needed | `[VERIFIED]` Microsoft Learn extensions-by-name list |
| **AWS RDS / Aurora** | ✅ v1.8 on PG 18 (v1.9 on PG 19 beta) | `[VERIFIED]` AWS RDS PostgreSQL extension version tables |

Also noted: Azure offers `temporal_tables` 1.2.2 (PG 13–18). Likely unused — we
will model bitemporality explicitly rather than depend on an extension — but
worth knowing it exists.

**2. Remaining criteria for Phase 3**

⚠️ **Two criteria added 2026-10-25 from `../build-plan/phase-4-document-pipeline.md`:**
- **Enforced-constraint direct upload.** S3 presigned POST policies enforce key
  prefix, content-type and a content-length range at the storage layer. The
  Azure SAS equivalent is **unverified** — check before deciding, because a
  presigned PUT cannot enforce size or type and the fallback is weaker.
- **Malware scanning.** AWS GuardDuty Malware Protection for S3 is $0.09/GB
  plus ~$0.215/1,000 objects. **Microsoft Defender for Storage pricing was not
  found** — confirm it exists and what it costs.

- UK data residency, and a DPA
- SOC 2 / ISO 27001 for the fund DDQ answer
- Managed backups with point-in-time recovery
- Cost at 0, 5 and 30 customers
- Which one a first enterprise client already uses — **this may decide it for us**

## Cost note

`[VERIFIED 2026-08-21, aws.amazon.com/free]` The AWS free plan gives $100
immediately, up to $200 total, and **"the account closes on its own 6 months
after you open it or when your credits run out, whichever comes first."**

So the account is deliberately **not opened during the build**. Opening it early
burns the window at zero customers and leaves nothing for the migration it is
meant to fund. Azure's equivalent terms are **not yet verified** — check before
opening either.

## Still true from the original ADR

- **No cloud-specific code.** Standard Node, standard Postgres, plain SQL, Claude
  reachable via Anthropic API / Bedrock / Foundry, storage behind one adapter.
  See `0001-tech-stack.md`.
- **Defer paid tiers.** Buy SOC 2 reports, PITR and enterprise support when a
  real DDQ asks, not before.
- `[VERIFIED]` Anthropic's standard commercial terms already state
  *"Anthropic may not train models on Customer Content from Services"* — no
  enterprise agreement needed for that guarantee.
- `[ESTIMATE]` Claude extraction ~£1 per credit agreement, 10–25p per quarterly
  pack. Modelled from published token pricing, **not measured**. Phase 2 measures it.

## Consequence

Nothing in Phases 0–2 depends on this choice. The engine is pure logic and the
extraction spike needs no database. The decision is made in Phase 3 with real
constraints in hand.

## Companies House harvest storage — where it goes and what it costs

`[Jainam 2026-10-25: "where will I store it, I don't have 30 GB?"]`

**Not on the laptop.** The harvester runs in the cloud, writes to object storage
in the cloud, and parses in the cloud. No file ever reaches a local machine.
This is `0001-tech-stack.md`'s storage adapter — the same interface already
required for borrower documents, pointed at a second bucket.

### Measured volume

`[VERIFIED 2026-10-25, download.companieshouse.gov.uk]` ~2–3 GB/month
compressed, so **~30 GB in year one, ~150 GB by year five.**

### Cost at UK list prices

⚠️ `[ESTIMATE]` Third-party rate cards, Azure UK South LRS as of Sept 2025 and
AWS us-east-1 baseline. **Confirm on the vendor pricing pages at Phase 3.**

| Tier | ~£/GB/month | 30 GB | 150 GB |
|---|---|---|---|
| Azure Hot | £0.0142 | £0.43 | £2.13 |
| Azure Cool | £0.0082 | £0.25 | £1.23 |
| **Azure Archive** | **£0.00135** | **£0.04** | **£0.20** |
| AWS S3 Standard | ~$0.023 | ~$0.69 | ~$3.45 |
| **AWS Glacier Instant Retrieval** | **~$0.004** | **~$0.12** | **~$0.60** |

**Under 50p a month in year one on any tier.** This is not a cost decision.

### The tiering that makes it near-free

Raw ZIPs are **write-once, read-almost-never** — we re-read them only if the
parser turns out to be wrong. That is the exact profile cold storage is priced
for.

- **Raw ZIPs → Archive / Glacier Instant Retrieval**, deleted after 12–24 months
- **Extracted figures → the database**, a few hundred bytes per company

⚠️ Three caveats that bite if ignored:
1. **Minimum retention periods.** Azure Archive 180 days, Cold 90, Cool 30;
   Glacier IR 90. Deleting earlier still bills the minimum. Our 12–24 month
   window clears all of them.
2. **Retrieval is charged** (~$0.03/GB on Glacier IR). A full 30 GB re-parse is
   a one-off ~$0.90. Fine, but not free — do not design a workflow that
   re-reads raw files routinely.
3. **Egress is the expensive direction.** Transfer *into* the cloud is free;
   pulling data *out* is charged per GB. **Therefore parse in the same region as
   the bucket.** Never move 30 GB out to process it.

### Consequence

Storage does not influence the AWS-vs-Azure decision — both are fractions of a
pound. It does add one requirement: **the chosen host must offer a cold
archival tier**, which both do.

**Sources:** [Azure Blob Storage pricing guide](https://www.synextra.co.uk/?p=50010) (UK South, Sept 2025) ·
[Azure storage pricing](https://azure.microsoft.com/en-gb/pricing/details/storage/) ·
[AWS S3 pricing explained 2026](https://upstash.com/blog/aws-s3-pricing-explained-2026) ·
[Companies House accounts download page](https://download.companieshouse.gov.uk/en_accountsdata.html)

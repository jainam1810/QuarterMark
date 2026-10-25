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

# Phase 3 — Data layer

**Verdict: 🟢 Buildable, and schema-per-tenant is the right call for *our* scale
— but not for the reason the plan assumed. There is one 🔴 silent-failure trap
that must be closed whichever model we pick.**
Checked 2026-10-25.

## What the plan said

> Postgres schema, **schema-per-tenant isolation**, append-only audit trail,
> approval-gate permissions. **Security agent attacks it:** can tenant A reach
> tenant B? Can a result be approved without permission?

Plus everything that accumulated onto Phase 3 afterwards — see
`README.md`. It is carrying more than it was given.

## 🔴 The trap: isolation that silently does nothing

This applies to **both** models and is the single most important finding in
this phase.

### If we use Row-Level Security

`[VERIFIED — PostgreSQL official documentation, ddl-rowsecurity]` Verbatim:

> "Superusers and roles with the `BYPASSRLS` attribute **always** bypass the row
> security system when accessing a table. **Table owners normally bypass row
> security as well**, though a table owner can choose to be subject to row
> security with `ALTER TABLE ... FORCE ROW LEVEL SECURITY`."

**Most applications connect as the role that owns the tables.** So RLS can be
enabled, policies written, tests passing — and **every policy silently does
nothing**. Tenant A reads tenant B's credit agreements and nothing errors.

`ALTER TABLE ... FORCE ROW LEVEL SECURITY` is not optional hardening. Without
it, RLS is decoration.

### If we use schema-per-tenant

`search_path` is **a convention, not a boundary**. There is no database-level
rule stopping a query from naming another tenant's schema directly. One query
writing `tenant_b.covenant` instead of relying on the path reaches straight
through.

**Enforcement has to come from grants** — the application role must have no
privileges on other tenants' schemas — not from the search path.

**Both models fail the same way:** they look isolated, test as isolated, and
are not. The security agent's first attack is therefore not "can I break the
policy" but **"is the policy doing anything at all?"**

## Which model — and why the generic advice is wrong here

`[VERIFIED 2026-10-25]` ⚠️ Mostly practitioner blogs, no authoritative
benchmarks. Treat the numbers as rough.

| | Schema-per-tenant | Row-Level Security |
|---|---|---|
| Migrations | **Linear in tenant count** — pain reported from ~500 schemas | Run once |
| Catalog load | Every schema adds `pg_class`/`pg_attribute` rows; slows planner, `pg_dump`, vacuum. Rule of thumb ~5–10k schemas | None |
| Per-tenant backup / restore / delete | **Straightforward** | Hard — rows interleaved |
| Connection pooling | Needs care | Simpler |
| Noisy neighbour | Isolated | Shared; needs `tenant_id`-prefixed indexes |

**The generic advice favours RLS because it optimises for thousands of
tenants.** We will have **tens** — the target market is small and mid-sized UK
funds, and 100 customers would be a success. At that scale every
schema-per-tenant cost listed above is negligible, and the benefits are real:

1. **Per-tenant backup, restore and deletion.** A fund offboarding wants its
   data gone. "Drop the schema" is a provable answer; "delete where tenant_id"
   is a promise.
2. **The diligence answer.** Funds handling LMA-confidential borrower data will
   ask how their data is separated. *"Each fund has its own database schema with
   no grants to any other"* survives a DDQ better than *"we filter by a column"*
   — even though, done correctly, both are sound.

**Recommendation: keep schema-per-tenant as planned, but enforce it with a
per-tenant grant model, not with `search_path`.** The plan's instinct was
right; its mechanism was unstated.

⚠️ **Connection pooling caveat.** Under PgBouncer transaction pooling, session
state does not persist between transactions. **`search_path` must be set per
transaction, never once per connection.** A pooled connection that keeps a
previous tenant's search path is a cross-tenant read. Add this to the security
agent's attack list.

### Shared data breaks the pure model — by design

The Companies House harvest is **public data shared by every tenant**. It must
not be copied per-schema.

```
  tenant_castlecapital ─┐
  tenant_pennineCredit ─┼──→  reference schema  (sector medians,
  tenant_<fund>        ─┘      read-only to all     SIC mapping,
                                                    harvested accounts)
```

- **Shared reference schema** — harvested financials, sector medians, SIC
  mapping. Read-only to every tenant role.
- **Tenant schema** — borrowers, agreements, covenants, submissions, and the
  *frozen comparison records* (which median was used, as at which date).

The median itself is public and shared. **The record of which median was shown
to which fund on which date is tenant data.** Keep that line clean.

## Append-only audit trail

`[VERIFIED 2026-10-25]` The plan says "append-only audit trail". Three findings
sharpen it.

**1. `pgaudit` is the wrong tool on its own.** Not in core PostgreSQL, writes to
the **server log**, not to a table. It *observes*; it does not *prevent*. Useful
as a second record, not as the audit trail.

**2. Revoking writes is necessary but not sufficient.** Blocking edits is not
the same as detecting them — anyone with sufficient access, or a stolen admin
credential, can still rewrite history. **Pair `REVOKE UPDATE, DELETE, TRUNCATE`
with tamper evidence**: hash-chain each audit row to its predecessor so an
alteration is detectable on review.

For a product that makes **breach determinations**, "we can prove this record
was not altered" is worth the modest extra work.

**3. Audit tables grow without bound.** Partition from the start (monthly) and
detach old partitions on a schedule. Retrofitting partitioning onto a large
audit table is painful.

⚠️ Ship the log off-host as well. An audit log a compromised host can delete has
failed its only job.

## Bitemporal versioning — already cleared

`[VERIFIED earlier]` `btree_gist` is available on **both** Azure Database for
PostgreSQL Flexible Server and AWS RDS/Aurora, so the exclusion constraint
preventing overlapping covenant-definition validity periods works on either
host. See `phase-1-covenant-engine.md`.

Phase 8 adds a second consumer: **frozen sector medians**, stored as at the
borrower's test date. Same machinery, so no new risk.

## The security agent's attack list

The plan named two attacks. The research adds four.

| # | Attack | From |
|---|---|---|
| 1 | Can tenant A reach tenant B? | original plan |
| 2 | Can a result be approved without the approve permission? | original plan |
| 3 | **Is the isolation doing anything at all?** (owner bypass / direct schema reference) | 🔴 **new** |
| 4 | **Does a pooled connection carry the previous tenant's `search_path`?** | 🔴 **new** |
| 5 | Can the audit trail be updated, deleted or truncated by any application role? | new |
| 6 | Can a foreign key or unique constraint reveal another tenant's row exists? | new |
| 7 | **Can a fund write an object into another fund's storage prefix?** | 🔴 `phase-4-document-pipeline.md` |

**On #6** — PostgreSQL docs, verbatim:

> "Referential integrity checks, such as unique or primary key constraints and
> foreign key references, **always bypass row security**... Care must be taken
> when developing schemas and row level policies to avoid 'covert channel' leaks
> of information through such referential integrity checks."

A unique constraint spanning tenants leaks existence: insert fails, therefore
the value exists somewhere. Keep uniqueness **within** a tenant.

Also documented: `TRUNCATE` and `REFERENCES` are not subject to row security,
and policies that consult other tables can race under `READ COMMITTED`.

## What Phase 3 delivers

A schema-per-tenant Postgres layout with a shared read-only reference schema,
per-tenant roles with no cross-schema grants, per-transaction `search_path`,
bitemporal covenant-definition versioning, a hash-chained partitioned audit
trail with writes revoked, approval-gate permissions where **approve is
separate from edit**, and the Phase 8 hooks (sector tag, size band, per-record
pooling rights flag).

Plus a security-agent report against all six attacks above.

## Risk rating: 🟡 Medium

No blocker. The technology is proven and the host question is already settled
as "either". The risk is **entirely that isolation is mis-built in a way that
tests cannot see** — which is why attacks #3 and #4 are written down before the
schema is.

⚠️ **Open item carried in:** the anonymisation question for a credit lawyer
(`phase-8-benchmarking.md`) is now downgraded — rely on permission, not
anonymisation. It no longer gates this phase.

## Sources

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — **primary**: owner bypass, `FORCE ROW LEVEL SECURITY`, referential-integrity covert channels, `TRUNCATE`/`REFERENCES` exemptions, `READ COMMITTED` races
- [Approaches to tenancy in Postgres](https://planetscale.com/blog/approaches-to-tenancy-in-postgres) — PlanetScale: schema-per-tenant gives no database-level enforcement via `search_path`
- [Multi-tenant PostgreSQL: RLS vs schema-per-tenant](https://dev.to/itsjayanth/multi-tenant-postgresql-row-level-security-vs-schema-per-tenant-when-to-use-which-3joe) — migration and catalog scaling ⚠️ practitioner blog
- [Tamper-evident audit trails in PostgreSQL](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql) — hash chaining; permissions alone insufficient
- [pgaudit documentation](https://www.postgresql.org/message-id/5363390F.8040704%402ndquadrant.com) — logs to server log, observes rather than prevents
- `phase-1-covenant-engine.md` · `phase-8-industry-benchmarking.md` · `README.md`

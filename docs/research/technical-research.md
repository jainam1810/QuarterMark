# QuarterMark — Technical & Competitive Research

Generated 2026-07-25 (partial run: 7 of 8 agents completed).



---

## v2:b0bf3c3d4237d7189f6a22f93bcc27a7daa2d3921ab50d78a068d9bb073e7bdd

### Summary
I researched the 2026 best-practice stack for a solo founder building institutional-grade B2B fintech SaaS on Next.js 15 + TypeScript + Postgres for FCA-regulated UK/EU buyers, prioritising primary sources (AWS Prescriptive Guidance, vendor docs and pricing pages, FCA publications, Postgres docs). On multi-tenancy, AWS's own decision matrix is the authoritative artefact: it rates the pool model (shared tables + RLS) best on cost, onboarding agility, connection-pool efficiency and cross-tenant reporting, but explicitly worst on data isolation, tenant-level backup/PITR, tenant-specific encryption keys, and blast radius of schema changes — and it names RLS as *required* for pool. The bridge model (schema- or database-per-tenant in one instance) is AWS's stated preference for "moderate number of tenants with moderate data" and is the pragmatic middle for a covenant platform with tens of funds. RLS carries real, documented footguns: table owners bypass policies unless FORCE ROW LEVEL SECURITY is set, superusers/BYPASSRLS roles always bypass, non-LEAKPROOF functions in policies defeat index pushdown, unindexed policy columns force sequential scans, and — the killer for serverless Next.js — session-scoped GUCs leak across tenants under PgBouncer transaction pooling unless you use transaction-scoped set_config(..., true) or SET LOCAL inside an explicit transaction. On managed Postgres, both Supabase and Neon offer AWS London eu-west-2; Supabase is SOC 2 Type 2 + ISO 27001 with PITR as a paid add-on (7/14/28-day tiers at roughly $100/$200/$400 per month), Neon is SOC 2 Type 1+2, SOC 3, ISO 27001 and ISO 27701 with region fixed permanently at project creation and Azure regions now deprecated; RDS/Aurora give 1–35 day retention with PITR to the last ~5 minutes and per-tenant KMS keys if you silo. On auth, WorkOS charges $125 per SSO connection and $125 per SCIM directory (audit-log streaming and retention billed separately at $125/SIEM connection and $99 per 1M events), while Clerk's Pro is $25/mo + $0.02/MRU with one enterprise connection included and additional ones at $75/mo — materially cheaper at low enterprise-customer counts. Critically, Auth.js/NextAuth is now formally part of Better Auth, so it is not a viable greenfield choice; Better Auth itself ships first-party SAML 2.0 + OIDC SSO and a SCIM server plugin, making self-hosted enterprise auth genuinely feasible in 2026 for the first time. For background work, Inngest's Hobby tier is 50k executions with 5 concurrent and 24-hour trace retention, Pro from $99/mo with 1M executions and 7-day traces, but no documented EU/UK residency on its pricing page — a real problem for an FCA-facing product, whereas Trigger.dev's Apache-2.0 core is self-hostable in a UK region. For hosting, Vercel is SOC 2 Type 2, ISO 27001:2022, EU-U.S. DPF certified and offers lhr1 (London) compute, but its own docs state functions default to US and that Vercel "may transfer data to and in the United States and anywhere else in the world" — which collides with FG16/5's requirement that firms ensure data is not stored where UK regulators' effective access is inhibited. Tamper-evident audit logging for financial buyers means more than append-only: hash-chaining each record with the prior record's digest, DB triggers blocking UPDATE/DELETE, and periodically anchoring the head hash into an external WORM medium such as an S3 Object Lock bucket.

### Findings

**AWS's official decision matrix rates the RLS 'pool' model worst on data isolation, tenant-level backup/PITR, and tenant-specific encryption keys — the exact axes FCA-regulated buyers probe in due diligence**  
_Confidence: high_

AWS Prescriptive Guidance compares four options: Silo (instance per tenant), Bridge-separate-databases, Bridge-separate-schemas, and Pool (shared tables). Verbatim ratings for Pool: Data isolation = 'Worse. (Because all tenants share the same tables, you have to implement features such as row-level security [RLS] for tenant isolation.)'; Tenant-level backup and recovery effort = 'Significant effort'; Tenant-level point-in-time recovery effort = 'Significant effort and complexity'; Tenant-specific storage encryption key = 'Not possible'; Change deployment scope of impact = 'Very large. (All tenants affected.)'; Cross-tenant resource impact = 'Heavy impact'; Tenant-level tuning = 'Not possible'. Pool wins on: onboarding agility ('Fastest option'), connection pool config ('Least effort required... Most efficient'), infrastructure cost ('Lowest'), and consolidated tenant reporting ('Minimal effort'). AWS states the use case for Bridge-with-separate-schemas is a 'Moderate number of tenants with a moderate amount of data. This is the preferred model if you have to cross-reference tenants' data', and for Pool a 'Large number of tenants with less data per tenant'. Bridge-with-separate-databases is for when 'Isolation of data is a key requirement, and limited or no cross-reference of tenants' data is required'. Note the schema-per-tenant caveat: 'Large PostgreSQL system catalog tables. (Total pg_catalog size in tens of GBs, depending on number of tenants and relations.)' and ORM catalog caching can drive 'high DB connection memory usage'.

Sources:
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/matrix.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/partitioning-models.html

**AWS states RLS is *required* for the pool model and centralises isolation at the DB layer, but concedes some SaaS customers will reject logical-only separation**  
_Confidence: high_

AWS best-practices page: 'Row-level security (RLS) is required to maintain tenant data isolation in a pool model with PostgreSQL. This is because there is no logical separation between infrastructure, PostgreSQL databases, or schemas on a per-tenant basis in a pool model. RLS centralizes the enforcement of isolation policies at the database level and removes the burden of maintaining this isolation from software developers.' The pool page adds two caveats directly relevant to QuarterMark: 'PostgreSQL by default isn't aware of which tenant is consuming resources' (so tenant-attributed observability needs app-level instrumentation), and 'some SaaS customers might not find the logical separation provided by RLS to be sufficient and might ask for additional isolation measures.' It also notes the noisy-neighbour problem 'cannot be completely eliminated in a pool model'.

Sources:
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/best-practices.html
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/pool.html

**The single most dangerous RLS pitfall for a Next.js/serverless app is session-scoped GUC leakage under PgBouncer transaction pooling — fixed by transaction-scoped set_config**  
_Confidence: high_

In transaction pooling mode one physical backend is shared across many clients over its lifetime. Anything set at session scope — SET search_path, SET ROLE, or a session-scoped SET app.current_tenant GUC read by an RLS policy — outlives the transaction that set it and leaks into the next tenant's transaction on the same backend. The result: 'The query is perfectly parameterized and the application code looks correct, but tenant B executes against tenant A's search_path or RLS GUC.' The fix is transaction-scoped: SET LOCAL app.current_tenant, or set_config('app.current_tenant', id, true) where the third argument true makes it transaction-local, with the policy reading current_setting('app.current_tenant'). Session pooling mode avoids the leak but caps tenant density at max_connections, defeating the purpose of pooling. Separately, AWS notes that SET commands 'cause session pinning when using Amazon RDS Proxy'. A second pooling footgun: behind PgBouncer all connections share one DB role, so 'current_user becomes worthless for tenant isolation' — policies must key off a GUC, not the role.

Sources:
- https://multi-tenant-saas.com/tenant-aware-data-routing-query-scoping/connection-pooling-in-multi-tenant-systems/pgbouncer-transaction-pooling-for-multi-tenant-saas/
- https://www.bytebase.com/blog/postgres-row-level-security-footguns/
- https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/matrix.html
- https://www.citusdata.com/blog/2024/04/04/pgbouncer-supports-more-session-vars/

**RLS bypass risks: table owners silently bypass all policies unless FORCE ROW LEVEL SECURITY is set, and superusers/BYPASSRLS roles always bypass**  
_Confidence: high_

Postgres documentation and analyses agree: 'Superusers and roles with the BYPASSRLS attribute always bypass the row security system when accessing a table.' Table owners also bypass policies by default — 'Adding FORCE is what makes the policies apply to everyone, owner included.' The practical failure mode: 'if your application connects as the same role that owns the tables, your RLS policies do nothing.' This is a very common misconfiguration because migrations typically run as the owner and apps often reuse that connection string. Testing as superuser masks policy failures entirely. Additional bypass vectors documented: SECURITY DEFINER views execute with elevated permissions (mitigated by security_invoker in Postgres 15+), and materialized views or exports copy data out from under row protections.

Sources:
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://www.bytebase.com/blog/postgres-row-level-security-footguns/

**RLS performance is fine if you index the policy column and keep policies LEAKPROOF-friendly; it is catastrophic otherwise**  
_Confidence: high_

RLS is a planner-level rewrite: 'Row-level security is a feature of the PostgreSQL planner that rewrites every query against an RLS-enabled table to add an extra predicate... The rewrite happens before planning, so the predicate participates in plan selection — a policy that reduces to tenant_id = 42 can use an index on tenant_id exactly like a hand-written WHERE clause.' Three documented performance footguns: (1) 'When an RLS policy calls a function that isn't marked LEAKPROOF, Postgres can't safely push it down with index scans' — forcing full table scans; (2) policies containing multi-table join subqueries 'execute repeatedly per row evaluated, multiplying query costs substantially'; (3) 'Unindexed columns used in policies guarantee sequential scans on every read operation.' Also note the cross-tenant information leak via global unique constraints: duplicate-key errors reveal that a value exists in another tenant's rows. And USING vs WITH CHECK confusion — 'Omitting WITH CHECK permits inserts users cannot subsequently read.'

Sources:
- https://www.bytebase.com/blog/postgres-row-level-security-footguns/
- https://queryplane.com/blog/postgres-row-level-security-in-practice/
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html

**Supabase and Neon both offer AWS London (eu-west-2); Supabase warns region choice is not itself proof of compliance, Neon fixes region permanently at project creation**  
_Confidence: high_

Supabase EU/UK regions: eu-west-1 (Ireland), eu-west-2 (London), eu-west-3 (Paris), eu-central-1 (Frankfurt), eu-central-2 (Zurich), eu-north-1 (Stockholm) — 16 AWS regions total. Supabase docs state 'The region you choose also determines where your primary project data is stored' and that when you create a project in an AWS region 'your Postgres database, Auth service, and Storage objects are hosted in that region', but caution that 'Region selection is a data-location control, not proof of regulatory compliance.' Neon deploys to only eight AWS regions: us-east-1, us-east-2, us-west-2, eu-central-1 (Frankfurt), eu-west-2 (London), ap-southeast-1, ap-southeast-2, sa-east-1. Critical Neon constraint: 'The region is fixed at project creation and cannot be changed afterward' — moving requires a new project plus data migration. Neon's Azure regions (azure-eastus2, azure-westus3, azure-gwc) are deprecated: 'You can no longer create new projects in Azure regions.'

Sources:
- https://supabase.com/docs/guides/platform/regions
- https://neon.com/docs/introduction/regions
- https://neon.com/docs/import/azure-regions-deprecation

**Compliance certifications: Neon holds the broadest set (SOC 2 Type 1+2, SOC 3, ISO 27001, ISO 27701); Supabase holds SOC 2 Type 2 + ISO 27001 with HIPAA as a paid add-on**  
_Confidence: high_

Neon: SOC 2 Type 1 and Type 2, SOC 3, ISO 27001, ISO 27701 (privacy extension), GDPR and CCPA adherence; 'HIPAA compliance is available on the Scale plan.' Audit reports via trust.neon.com. Neon's docs did not surface PCI-DSS status or a DPA statement in the compliance page I fetched — treat those as unverified. Supabase: 'Supabase is SOC 2 Type 2 compliant and regularly audited'; 'Supabase is ISO 27001 certified' with the certificate accessible to Enterprise and Team customers via dashboard; HIPAA offered 'through an add-on with additional security controls'; GDPR supported via 'EU-region hosting for data residency' plus an available DPA. ISO 27701 is materially useful in UK/EU procurement because it is the privacy-management extension to ISO 27001 — Neon has it, Supabase's page does not claim it.

Sources:
- https://neon.com/docs/security/compliance
- https://supabase.com/docs/guides/security
- https://supabase.com/docs/guides/security/soc-2-compliance

**Backup/PITR comparison: RDS/Aurora 1–35 days with restore to the last ~5 minutes; Azure Flexible Server 7 days default up to 35; Cloud SQL PITR capped at 7 days of transaction logs; Supabase PITR is a paid add-on with ~2-minute RPO**  
_Confidence: medium_

RDS and Aurora retain automated backups 1–35 days including transaction logs, restorable 'to any second during your retention period, up to the last 5 minutes'; Aurora Backtrack rewinds in-place 'within seconds, even for large databases' (note: Backtrack is Aurora MySQL, not PostgreSQL — treat Aurora PostgreSQL Backtrack as unverified). Azure Database for PostgreSQL Flexible Server: 'The default backup retention period is seven days, but you can extend the period to a maximum of 35 days'; PITR creates a new server in the same region as the source. Google Cloud SQL: 'By default, Cloud SQL keeps 7 days of automated backups and transaction logs', with the API allowing 1–7 days of transaction log retention — a materially shorter PITR window than AWS or Azure. Supabase: daily backups retained 7 days (Pro), 14 (Team), up to 30 (Enterprise); PITR is a separate add-on requiring at least the Small compute add-on, at roughly $100/mo for 7 days, $200 for 14 days, $400 for 28 days, achieving 'a Recovery Point Objective (RPO) of two minutes' worst case. Enabling PITR replaces daily backups rather than supplementing them.

Sources:
- https://docs.aws.amazon.com/aws-backup/latest/devguide/point-in-time-recovery.html
- https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore
- https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/pitr
- https://supabase.com/docs/guides/platform/backups

**WorkOS pricing is per-enterprise-connection and audit logs are billed separately — roughly $250/mo per enterprise customer wanting both SSO and SCIM, before audit-log costs**  
_Confidence: high_

From WorkOS's own pricing page: AuthKit user management is free for the 'First 1M MAUs'. SSO connections are tiered — $125 each for 1–15 connections, $100 each for 16–30, $80 for 31–50, $65 for 51–100, $50 for 101–200, custom above. Directory Sync (SCIM) uses an identical $125–$50 per-connection structure. Audit Logs are add-ons charged separately: log streaming at $125/month per SIEM connection and event retention at $99/month per 1M events. For QuarterMark at, say, 8 funds each wanting SAML + SCIM, that is ~$2,000/month in connection fees alone. The per-connection model does mean cost scales with enterprise customer count rather than seat count, which suits a low-seat/high-value product — but the absolute numbers are steep at £50m–£500m AUM fund pricing.

Sources:
- https://workos.com/pricing

**Clerk is materially cheaper at low enterprise-connection counts: $25/mo Pro + $0.02/MRU, with one enterprise SAML/OIDC connection included and additional ones at $75/mo**  
_Confidence: medium_

From Clerk's pricing page: Hobby tier is free with a 50,000 MRU (monthly retained user) limit per app. Pro is '$25/mo ($20/mo billed annually)' with 50,000 MRUs included and '$0.02/mo each' above that. Enterprise SSO: '1 Enterprise Connection (EASIE/SAML/OIDC) included' in Pro, then '$75/mo each' for connections 2–15, falling to '$15/mo each' at 500+. Application log retention is 1 day (Hobby), 7 days (Pro), 30 days (Business), custom (Enterprise). Two gaps to verify before committing: Clerk's pricing page does not state SCIM pricing, and it references 'Application Logs' rather than a customer-facing audit log product — so Clerk's SCIM cost and customer-facing audit-trail capability are UNVERIFIED from primary sources. Secondary reporting claims SCIM reached GA in April 2026 and is bundled free on every enterprise connection, and that Google Workspace directory sync is not natively supported — both unverified against Clerk's own docs.

Sources:
- https://clerk.com/pricing
- https://clerk.com/articles/auth-platforms-with-sso-and-scim-in-the-base-tier

**Auth.js/NextAuth is no longer an independent project — it is now part of Better Auth, which ships first-party SAML 2.0, OIDC SSO and a SCIM server**  
_Confidence: high_

Auth.js's own homepage carries the banner: 'The Auth.js project is now part of Better Auth.' This makes NextAuth a poor greenfield choice in 2026. Better Auth's SSO plugin docs state: 'This plugin supports OpenID Connect (OIDC), OAuth2 providers, and SAML 2.0', with OIDC discovery, SAML attribute mapping and signed AuthnRequests. Documented limitations: 'Better Auth does not support implicit-only OIDC flows' (authorization code only), token auth restricted to client_secret_basic and client_secret_post, domain verification tokens expire after one week, and default payload size limits of 256KB for SAML responses / 100KB for metadata. Better Auth also ships a separate SCIM plugin that 'exposes a SCIM server that allows third party identity providers to sync identities to your service', plus an organizations plugin for tenant isolation. Self-service SSO (letting fund IT teams configure their own connections without support tickets) is gated: 'Need self-service SSO where your customers can configure their own SSO connections? Contact us for enterprise' — pricing for that tier is UNVERIFIED.

Sources:
- https://authjs.dev/
- https://better-auth.com/docs/plugins/sso
- https://better-auth.com/docs/plugins/scim
- https://better-auth.com/blog/1-5

**Inngest's free tier is thin for document pipelines and its pricing page documents no EU/UK data residency — a direct problem for FCA-facing products**  
_Confidence: medium_

From Inngest's pricing page: Hobby is $0 with 50k executions/month, 5 concurrent executions, 24-hour trace history, 500MB span data, 500k events, 100k max queue depth. Pro starts at $99/month with 1M executions included (pay-as-you-go to 20M), 100+ concurrency then $25 per additional 25, 7-day trace retention, 5GB span data then $3/GB. Enterprise adds 90-day trace retention plus SAML/RBAC. Critically: the pricing page contains no information regarding EU/UK data residency options. For a covenant-document pipeline where PDFs and extracted financials transit the workflow engine, undocumented residency is a due-diligence blocker under FG16/5. Trigger.dev is the counterweight — its core is Apache 2.0 and self-hostable, and it also offers a Bring Your Own Cloud arrangement running workloads in your own cloud account. Claims that Trigger.dev's managed cloud lacks documented EU residency as of July 2026 come from secondary sources and are UNVERIFIED.

Sources:
- https://www.inngest.com/pricing
- https://trigger.dev/docs/self-hosting/overview
- https://www.buildmvpfast.com/alternatives/trigger-dev

**Temporal is the wrong shape for a solo founder on Next.js: workers need persistent processes and self-hosting carries a documented ~0.4 FTE operational tax**  
_Confidence: low_

Temporal workers 'need persistent processes — they don't work with traditional serverless functions', which is fundamentally incompatible with Vercel's function model and would force a separate always-on worker fleet. Reported deployment effort contrasts sharply: Inngest ~30 minutes, Trigger.dev ~2 hours, Temporal 2–3 days. A cited 2026 fintech engagement running self-hosted Temporal for EU-only residency reported 'roughly $3,200/month infrastructure plus 0.4 FTE for operations, against an estimated $1,400/month on Cloud Standard at their action volume.' Temporal Cloud bills consumption-based in Actions, with SAML SSO gated to higher tiers. Claims about Temporal Cloud EU West/Central region availability as of May 2026 come from secondary sources and are UNVERIFIED against Temporal's own docs. BullMQ remains viable but requires 'a Redis-compatible data store and a worker process that stays online', and its observability story is weak — 'Bull Board gives you a respectable queue UI for free, but you are still parsing log lines on the worker box to see why a job failed.'

Sources:
- https://automationatlas.io/guides/temporal-cloud-vs-self-hosted-2026/
- https://docs.temporal.io/cloud/pricing
- https://trybuildpilot.com/610-trigger-dev-vs-inngest-vs-temporal-2026
- https://www.vibereference.com/backend-and-data/background-jobs-providers

**Presigned/signed URLs are bearer tokens — serve private covenant PDFs with short expiries generated server-side after authorisation, never with long-lived links**  
_Confidence: high_

AWS's own guidance and prescriptive best-practices are explicit: 'A presigned URL is a bearer token. Anyone who gets the string can use it until it expires — no login, no session check, no second factor.' Recommended pattern: 'Generate the URL server-side with a least-privilege role, keep the expiry short, choose the object key yourself, and make the client send exactly the method and headers you signed', and 'Validate user auth & authorization before issuing the URL.' Expiry guidance: '15 minutes for a single-file download, a few hours at most for a shared report'; console-generated URLs allow 1 minute to 12 hours, SDK/CLI up to 7 days. Key trap: 'If you generate a presigned URL using temporary credentials... the URL expires when those credentials expire' — so a Lambda/Vercel function role with 30 minutes left silently truncates a 24-hour URL. For UK/EU residency, Cloudflare R2 supports a bucket-level jurisdiction setting of 'eu' (set at creation or via jurisdiction: 'eu' in the S3-compatible API) pinning the bucket to EU member-state data centres, and R2 'encrypts all objects at rest with AES-256 and in transit with TLS' with Cloudflare-managed keys; SSE-C is available if you want to hold keys. Supabase Storage private buckets are 'not accessible via a public URL' and use createSignedUrl with a dedicated per-project internal signing key separate from the Auth JWT key.

Sources:
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- https://docs.aws.amazon.com/pdfs/prescriptive-guidance/latest/presigned-url-best-practices/presigned-url-best-practices.pdf
- https://developers.cloudflare.com/r2/reference/data-location/
- https://developers.cloudflare.com/r2/reference/data-security/
- https://supabase.com/docs/guides/storage/serving/downloads

**Drizzle has first-class declarative RLS in the schema and is the strongest ORM choice for RLS-based multi-tenancy; Prisma's RLS story is weaker and Kysely has no migrations at all**  
_Confidence: high_

Drizzle exposes pgPolicy() as a table parameter with as (permissive/restrictive), to (target role), for (all/select/insert/update/delete), using (read condition) and withCheck (write condition), plus pgRole() for role creation and .existing() to mark roles drizzle-kit shouldn't manage. Tables enable RLS via pgTable.withRLS(); per Drizzle's docs echoing Postgres: 'If no policy exists for the table, a default-deny policy is used, meaning that no rows are visible or can be modified.' Policies defined in the TypeScript schema are emitted by migrations and enforced in the database. Drizzle ships provider helpers: Neon's crudPolicy() with authenticatedRole/anonymousRole and authUid(); Supabase's anonRole/authenticatedRole/serviceRole plus a documented createDrizzle() wrapper 'handling transactional RLS context via set_config() to set JWT claims and local role before executing queries' — which is exactly the transaction-scoped pattern that survives PgBouncer. By contrast, 'Prisma supports RLS via session variables but has historically been weaker here', and 'Kysely has no migrations' natively (community libraries only). Drizzle stores its migration journal as a single JSON file rather than one row per migration in the DB — worth knowing for audit/change-control evidence.

Sources:
- https://orm.drizzle.team/docs/rls
- https://neon.com/docs/guides/rls-drizzle
- https://neon.com/docs/guides/rls-query-execution
- https://scihub101.com/web-development/orms-prisma-vs-drizzle-vs-kysely-2026

**For financial audit logs, append-only is necessary but not sufficient — examiners want hash-chaining plus an external anchor**  
_Confidence: medium_

The key distinction: 'Append-only and tamper-evident are different — append-only means new records cannot overwrite old ones at the storage layer, but that is necessary but not sufficient. A database with INSERT-only permissions is append-only, but an examiner has no way to prove that a privileged user did not back-date or alter a record. Tamper-evident is stronger: any modification of a past record (even a single byte) is cryptographically detectable.' Recommended layered implementation: (1) enforce insert-only at the database — 'triggers that block UPDATE and DELETE on the audit table — so even application bugs or a direct SQL session can't quietly change history'; (2) hash-chain each record containing the SHA-256 (or HMAC-SHA256) digest of the previous record, so 'modifying any record retroactively makes every hash from that point forward invalid', serialised with a Postgres advisory lock and a canonical schema to make digests reproducible; (3) periodically anchor the head hash externally — 'Operators can anchor the head hash in an external append-only medium such as an object-locked bucket or a transparency log. The chain makes edits and deletions evident; a privileged rewrite of the entire table is detectable only against such an external anchor.' Merkle-tree consistency proofs (Certificate-Transparency style) are the stronger variant when you need proofs of inclusion and append-only-ness to third parties.

Sources:
- https://finqub.io/learn/tamper-evident-audit-trail/
- https://tracehold.ai/blog/immutable-audit-log-hmac-hash-chain/
- https://www.kilter-app.com/blog/tamper-evident-audit-log/
- https://www.designgurus.io/answers/detail/how-do-you-design-tamperevident-audit-logs-merkle-trees-hashing

**FCA FG16/5 and SYSC 8 make data location and regulator access a contractual obligation you must be able to answer in writing — cloud services supporting important business functions count as material outsourcing**  
_Confidence: high_

The FCA's finalised guidance FG16/5 covers 'risk management, due diligence, monitoring and oversight, data security, audit and effective access to data, continuity and business planning.' SYSC Chapter 8 'requires firms to take reasonable steps to avoid undue operational risk when outsourcing', and the FCA treats cloud services supporting important business functions as potentially material outsourcing. The single most stack-determining requirement: 'firms need to ensure that data are not stored in jurisdictions that may inhibit effective access for UK regulators.' Firms must identify important business services and set impact tolerances (maximum tolerable disruption), and crucially 'firms are responsible for remaining within their impact tolerances, regardless of whether third parties support their services, and cannot outsource accountability to their cloud provider.' Practically, QuarterMark will be a sub-processor in its clients' outsourcing registers and must supply a data-flow map, sub-processor list with regions, DPA, and evidence of regulator/client audit rights.

Sources:
- https://www.fca.org.uk/publication/finalised-guidance/fg16-5.pdf
- https://www.fca.org.uk/publications/finalised-guidance/fg16-5-guidance-firms-outsourcing-cloud-and-other-third-party-it
- https://www.fca.org.uk/firms/outsourcing-and-operational-resilience

**Vercel has strong certifications and a London (lhr1) compute region, but its own docs undercut a clean 'data stays in the UK' claim**  
_Confidence: high_

Vercel's compliance page confirms: SOC 2 Type 2 attestation for Security, Confidentiality and Availability; ISO 27001:2022 certified (certificate 1868222-1 via Schellman); GDPR supported with EU SCCs and the UK Addendum as transfer mechanisms; PCI DSS v4.0 SAQ-D and SAQ-A AOCs; HIPAA as a business associate with BAAs for eligible Pro and Enterprise; and 'Vercel is certified under the EU-U.S. Data Privacy Framework' covering EU, UK and Swiss transfers. lhr1 maps to eu-west-2 London, alongside dub1, cdg1, fra1, arn1. Encryption is AES-256 at rest and TLS 1.3 in transit; internal backups every 2 hours retained 30 days (but 'These backups are not available to customers'). The problem: 'The default location for Vercel functions is the U.S.' and 'Vercel may transfer data to and in the United States and anywhere else in the world where Vercel or its service providers maintain data processing operations.' Multi-region function failover and Secure Compute (private isolated environment, dedicated egress IPs, VPC peering) are Enterprise-only. Note also that all traffic enters through 126 global PoPs which terminate TCP before routing to a region. This is answerable in a security questionnaire but requires care and precision — you cannot claim UK-only processing.

Sources:
- https://vercel.com/docs/security/compliance
- https://vercel.com/docs/regions
- https://vercel.com/docs/networking/secure-compute

### Implications for QuarterMark
- RECOMMENDED STACK (justified below): Postgres = AWS RDS for PostgreSQL in eu-west-2 (London), bridge model with schema-per-tenant for fund clients + RLS as defence-in-depth inside each schema; ORM = Drizzle; Auth = Better Auth self-hosted (SSO + SCIM + organization plugins) with WorkOS held in reserve; Jobs = Trigger.dev self-hosted in your own eu-west-2 account (or Inngest only if they confirm UK/EU residency in writing); Storage = S3 eu-west-2 with SSE-KMS + Object Lock for the audit anchor; Hosting = Vercel lhr1 initially, with a documented migration path to AWS eu-west-2 (App Runner/ECS) once a fund's due diligence forces it.
- Do NOT start with pure pool/RLS. AWS's own matrix rates pool 'Worse' on data isolation, 'Not possible' for tenant-specific encryption keys, and 'Significant effort and complexity' for tenant-level PITR. For 20-60 funds with high data value per tenant, AWS names schema-per-tenant as the preferred model at 'moderate number of tenants with a moderate amount of data'. A fund's IT due diligence will ask 'can you restore just our data to last Tuesday?' — pool cannot answer that cleanly and schema-per-tenant can.
- Belt-and-braces: run RLS *inside* the per-tenant schema anyway. It costs almost nothing once tenant_id is indexed and it converts a class of application bugs from data breaches into empty result sets. But you MUST set FORCE ROW LEVEL SECURITY on every table, and the application must connect as a role that is neither the table owner nor holds BYPASSRLS — otherwise the policies are decorative. Add a CI test that asserts a cross-tenant SELECT returns zero rows while connected as the app role.
- The tenant context must be transaction-scoped, always. Wrap every request's DB work in an explicit transaction that begins with set_config('app.tenant_id', $1, true) — the trailing true is load-bearing. Session-scoped SET will leak across tenants under any transaction pooler (PgBouncer, RDS Proxy, Supabase pooler, Neon pooler). Drizzle's documented Supabase createDrizzle() wrapper is the right shape to copy. Build this as a single db.forTenant(id, fn) helper and forbid raw client access via lint rule — this is the highest-severity single failure mode in the whole product.
- Index every RLS policy column and never call a non-LEAKPROOF function inside a policy. A policy that does a subquery join will re-execute per row and will silently destroy performance on your largest fund's covenant history table. Keep policies to a bare tenant_id = current_setting(...)::uuid comparison.
- Budget for the enterprise-auth cliff before it arrives. WorkOS at $125/SSO connection + $125/SCIM directory + $99 per 1M audit events means ~$250/mo per fund that wants SAML+SCIM — real money at your ACV. Better Auth now ships SAML 2.0, OIDC and a SCIM server as first-party plugins, which makes self-hosting genuinely viable in 2026 in a way it was not in 2024. Start with Better Auth; the migration cost to WorkOS later is bounded because both speak standard SAML.
- Never build on Auth.js/NextAuth for this product — Auth.js's own homepage now says 'The Auth.js project is now part of Better Auth', and it has no SAML, SCIM or directory sync. Any tutorial recommending NextAuth for B2B SaaS is stale.
- Job-engine residency is a procurement blocker, not a nice-to-have. Inngest's pricing page documents no EU/UK residency; a covenant-document pipeline moves fund PDFs and extracted financials through the engine, so an FCA-regulated buyer's outsourcing register will flag it. Self-hosting Trigger.dev (Apache 2.0) in your own eu-west-2 account, or its Bring Your Own Cloud option, keeps the answer simple: 'the workflow engine runs in our AWS London account.' Get any residency claim from Inngest in writing before depending on it.
- Rule out Temporal at your stage. Its workers need persistent processes and therefore cannot run on Vercel functions, deployment is measured in days not minutes, and self-hosting carries a reported ~0.4 FTE operational tax — unaffordable for a solo founder. Revisit only if covenant workflows genuinely need multi-day human-in-the-loop durability that Trigger.dev's waitpoints cannot express.
- Serve covenant PDFs via server-generated presigned URLs with 5-15 minute expiries, issued only after an authorisation check, and log every issuance to the audit trail. Treat the URL as a bearer token in your threat model. Watch the temporary-credentials trap: a presigned URL cannot outlive the function's STS session, so a 1-hour expiry from a 15-minute role session silently breaks. Consider streaming through your own route handler instead for the highest-sensitivity documents, so revocation is immediate.
- Choose Drizzle over Prisma specifically for the RLS and migration story: pgPolicy() puts policies in the same TypeScript schema your migrations generate from, so policy drift becomes a code-review artefact rather than an undocumented DBA action. That traceability is itself an audit control you can show a fund. Note Drizzle's JSON journal file — mirror migration application events into your audit log so change-control evidence lives in the database too.
- Build the audit log tamper-evident from day one, not retrofitted. Concretely: an append-only table with BEFORE UPDATE/DELETE triggers that RAISE EXCEPTION; each row carrying prev_hash and hash = HMAC-SHA256(canonical_json(row) || prev_hash) with a key in KMS; insertion serialised by a Postgres advisory lock; and a nightly job writing the head hash to an S3 Object Lock (compliance mode) bucket in eu-west-2. Ship a verify endpoint that walks the chain and reports the first divergence. This is a genuine differentiator against Allvue/73 Strings in a covenant-breach dispute where 'who knew what, when' is the entire question.
- Be precise, not aspirational, about where data resides. Vercel's own docs say functions default to the US and that Vercel 'may transfer data to and in the United States and anywhere else in the world'. You can honestly say: application compute pinned to lhr1 (London), database and object storage in AWS eu-west-2, EU-U.S. DPF certified with SCCs and UK Addendum in place. You cannot say UK-only. Prepare a one-page data-flow map and sub-processor table now — every fund will ask, and having it ready is a sales accelerant.
- FG16/5's 'data are not stored in jurisdictions that may inhibit effective access for UK regulators' is the sentence that should drive vendor selection. For each of the five vendors in the stack, record: region, entity, sub-processors, DPA link, certifications, and audit-rights clause. Prefer vendors with ISO 27701 (Neon has it, Supabase does not claim it) since it is the privacy-management extension procurement teams increasingly ask for.
- If you prefer managed-Postgres speed over RDS control: Supabase eu-west-2 gets you SOC 2 Type 2 + ISO 27001 + Storage + Auth in one, but budget ~$100-400/mo extra for PITR (which replaces, not supplements, daily backups) and note the ~2-minute RPO. Neon eu-west-2 has broader certifications but only 8 regions and the region is permanently fixed at project creation — pick London deliberately and do not plan on moving. RDS remains the answer if a fund ever demands a dedicated instance with its own KMS key, which AWS's matrix shows is only achievable in the silo model.


---

## v2:d03c4a8afc7d235f70b9953841eadeb135790b6d05d5a76541d673099bc37e2a

### Summary
73 Strings is a Paris/NYC-headquartered AI-native private-markets platform (founded 2019/2020 depending on source), organised as one platform called "73 Intelligence" with exactly three modules: 73 Value (valuation), 73 Monitor (portfolio monitoring), and 73 Extract (document data extraction). Valuation is unambiguously the centre of gravity: 73 Value splits into an Equity variant ("five valuation engines and twelve diverse data sources") and a Credit variant ("multiple valuation engines and public and private data sources"), with named methods DCF, trading comps, transaction comps, benchmarking, calibration, waterfall and scenario analysis, and compliance anchored to International Valuation Standards (IVS 101/105/200) — notably NOT to ASC 820, IFRS 13 or IPEV on any page I could fetch. Their extraction technology is the most technically documented part of their surface: they publicly describe OCR + proprietary NLP + transformer models (BERT named explicitly), a template-free/dynamic-layout approach, validation against reference datasets and business rules, and headline claims of 99% extraction accuracy and 90% reduction in manual data entry. Crucially for QuarterMark, covenant capability exists but is thin and marketing-level: the strongest public statement is "AI parses critical terms – like covenant monitoring, DSCRs, and cross-default clauses – with 99% accuracy," plus a named "Compliance Parser" for compliance-certificate PDFs. There is no publicly documented covenant breach-alert engine, covenant test calculation engine, headroom tracking, EBITDA add-back adjudication, equity cure workflow, or watchlist/risk-rating system anywhere on their site. In January 2026 they launched "Insights Generator," an agentic AI natural-language query layer inside 73 Monitor, and shipped a "73 Strings MCP Connector" allowing Claude/ChatGPT/Cursor to query their data — a meaningful architectural signal. They are demonstrably enterprise-focused: clients managing nearly USD 10 trillion combined AUM, named logos including Blackstone, Investec Private Credit, Eurazeo, Sofina and Wendel Group, and one page cites "$3bn+ asset managers" as the entry point. They hold SOC 1 and SOC 2; ISO 27001 is unverified. No pricing is published anywhere, and they have no G2 or Capterra presence I could find. A competitor-authored (Lumonic/PitchBook) comparison — biased but specific — characterises their monitoring module as "the lightest of three competitors" and notes they have no borrower-facing data collection portal.

### Findings

**73 Strings' entire product surface is exactly three modules under one platform brand, '73 Intelligence': 73 Value, 73 Monitor, 73 Extract**  
_Confidence: high_

Homepage lists precisely three products: 73 Value ('Digitalizing Valuations in Equity and Credit'), 73 Monitor ('Precision Analytics for Actionable Insights'), 73 Extract ('Unleashing Insights from Unstructured Data'). The umbrella platform is called 73 Intelligence and is described as integrating 'data extraction, portfolio monitoring, and valuations.' There is no fund accounting, no fund administration, no investor portal, no CRM, no deal pipeline, and no loan servicing module. This is a narrow, deep stack — the opposite of Allvue's front-to-back suite. Asset classes served: Private Equity & Growth, Private Credit, Venture Capital, Infrastructure, Multi-strategy.

Sources:
- https://www.73strings.com/
- https://www.73strings.com/solutions/value/
- https://www.73strings.com/solutions/monitor/
- https://www.73strings.com/solutions/extract/

**73 Value is split into an Equity engine and a Credit engine; the Equity engine is described as 'five valuation engines and twelve diverse data sources'**  
_Confidence: high_

73 Value Equity: 'proprietary AI data analysis across five valuation engines and twelve diverse data sources' to deliver 'real-time, precise valuations and cash flow assessments.' Data sources referenced include 'news, reviews, and earnings call transcripts' and 'news and industry reports' — but NO specific data vendor is ever named (no Bloomberg, Refinitiv, S&P, PitchBook, Preqin). 73 Value Credit is described more vaguely as using 'multiple valuation engines and public and private data sources.' The five engines and twelve sources are never itemised publicly. Treat the specific enumeration as marketing framing, not a documented architecture.

Sources:
- https://www.73strings.com/solutions/value/
- https://www.73strings.com/investment-valuation-software/

**Named valuation methodologies are DCF, trading comps, transaction comps, benchmarking, calibration, waterfall analysis, scenario analysis, and PORI — with human-in-the-loop method selection**  
_Confidence: high_

The investment valuation software page names: Discounted Cash Flow (DCF), Transaction Comps (precedent transactions), Trading Comps (market comparables), Benchmarking, Calibration, Waterfall Analysis, and Scenario Analysis. Their product blog additionally names 'DCF Models', 'Comps, PORI & Benchmarks' and 'Waterfall & Ownership Scenario Analysis' as shipped features. Automation is explicitly partial: the platform 'automates data extraction, analysis, and initial valuation modeling while preserving human agency for critical tasks, with users selecting context-specific valuation methodologies.' NOTABLY ABSENT from all fetched pages: option pricing / Black-Scholes, OPM backsolve, Monte Carlo, PWERM, and — for credit specifically — yield analysis, credit spread build-up, recovery analysis, or PIK/OID modelling. Credit valuation methodology detail is materially thinner than equity.

Sources:
- https://www.73strings.com/investment-valuation-software/
- https://www.73strings.com/insights/blog/73-strings-unleashes-next-gen-ai-to-transform-private-market-intelligence/
- https://www.73strings.com/solutions/value/

**Their published valuation compliance anchor is International Valuation Standards (IVS 101, IVS 105, IVS 200) — NOT ASC 820, IFRS 13, IPEV or AICPA guidance**  
_Confidence: medium_

The investment valuation software page explicitly cites IVS 105, IVS 200 and IVS 101. Across every page I fetched, ASC 820, IFRS 13, IPEV Valuation Guidelines and AICPA PE/VC valuation guidance are never named — the site uses the generic phrase 'internationally accepted valuation standards.' The homepage does show an AICPA affiliation, but that appears to relate to SOC audit attestation rather than valuation guidance. This is a genuine gap for a UK/European buyer, where IPEV and IFRS 13 are the governing frameworks — QuarterMark can differentiate by naming IPEV and IFRS 13 explicitly. Marked medium because absence-of-evidence on marketing pages does not prove absence in product.

Sources:
- https://www.73strings.com/investment-valuation-software/
- https://www.73strings.com/solutions/value/
- https://www.73strings.com/

**73 Extract's AI is publicly described as OCR + proprietary NLP + transformer models, with BERT named explicitly, using a template-free dynamic-layout approach**  
_Confidence: high_

Their AI data extraction page gives unusually specific technical description: 'OCR (Optical Character Recognition): Converts scanned images and PDFs into text'; 'NLP: Breaks down sentences, identifies entities like company names, transaction amounts, dates, and clauses, and understands contextual meaning'; and 'Transformers (e.g., BERT): Advanced AI models that excel at classifying and understanding financial language in context.' The approach is explicitly template-free — it 'adapts to new layouts dynamically' rather than using rigid templates. The pipeline is three stages: document normalization, entity recognition with semantic parsing, then contextual accuracy using domain-specific language models. CEO Yann Magnan independently corroborates: they took 'OCR and overlayed that with proprietary Natural Language Processing algorithms.' NO frontier LLM (GPT, Claude, Gemini) is ever named as the extraction engine — the stack described is classical OCR+NLP+encoder-transformer, which is a generation behind a modern LLM-based extraction pipeline. This is QuarterMark's single biggest technical opening.

Sources:
- https://www.73strings.com/ai-data-extraction-tools/
- https://altgoesmainstream.substack.com/p/the-agm-q-and-a-with-73-strings-ceo
- https://www.73strings.com/solutions/extract/

**Accuracy claims: headline '99% accuracy' on extraction, with an internal 'Precision Scorer' feature explicitly targeting 'the final 1.4%' — and a separate admission of '>95% when tuned for financial docs'**  
_Confidence: high_

The 99% figure is repeated across the homepage, 73 Extract page, private credit pages and the Lumonic comparison. Critically, their own product blog names a 'Precision Scorer' feature that 'targets 100% accuracy and capture the final 1.4%' — which implies their real baseline is ~98.6%, not 99%. Separately, their technical AI-extraction explainer states accuracy levels 'often exceeding 95% when tuned for financial docs,' a materially weaker and more honest number. No document-type-specific accuracy breakdown, no F1/precision/recall split, no benchmark dataset, and no third-party validation of any accuracy figure is published anywhere. All accuracy claims are self-reported and unaudited.

Sources:
- https://www.73strings.com/insights/blog/73-strings-unleashes-next-gen-ai-to-transform-private-market-intelligence/
- https://www.73strings.com/ai-data-extraction-tools/
- https://www.73strings.com/data-extraction-for-private-markets/

**Named document types and parsers: 'Compliance Parser' for compliance certificates, 'Multilingual Parser', and 'Excel Parsing Enhancements' for multi-sheet workbooks with hidden tables**  
_Confidence: high_

Their product-release blog names three shipped parsers: 'Compliance Parser' (PDF parsing for compliance certificates, including non-standard formats), 'Multilingual Parser' (language translation), and 'Excel Parsing Enhancements' (multi-sheet, complex formatting, hidden financial tables). Document types named across pages: PDFs, scanned images, spreadsheets/Excel, emails, contracts, credit agreements, compliance certificates, compliance documents, operational reports, financial statements, loan agreements, term sheets, investor letters, cap tables. Notably NOT named anywhere: CIMs, information memoranda, board packs, management accounts, intercreditor agreements, amendment/waiver letters, or facility agreement amendment deeds. The Compliance Parser is the closest thing they have to a covenant-native ingestion product.

Sources:
- https://www.73strings.com/insights/blog/73-strings-unleashes-next-gen-ai-to-transform-private-market-intelligence/
- https://www.73strings.com/data-extraction-for-private-markets/
- https://www.73strings.com/ai-data-extraction-tools/

**Covenant capability is real but shallow: the single most specific public claim is that AI parses 'covenant monitoring, DSCRs, and cross-default clauses' — there is NO published covenant testing engine, breach alerting, headroom tracking, or cure mechanics**  
_Confidence: high_

Strongest covenant statement found, on the private credit portfolio analysis page: 'AI parses critical terms – like covenant monitoring, DSCRs, and cross-default clauses – with 99% accuracy.' Other pages offer only 'Tracking financial covenants with AI-driven analytics' and 'Extracting data from compliance certificates, credit agreements, and other complex documents.' The AI-for-private-credit page does not mention covenants at all. Absent from every page fetched: covenant test calculation engine, covenant headroom / cushion percentage, breach and near-breach alerting, notification workflows, equity cure and mulligan tracking, EBITDA add-back adjudication, ratio definition libraries per credit agreement, grace/cure period tracking, waiver and amendment history, watchlist management, and internal risk-rating scales. Their covenant story is extraction-plus-dashboard, not a covenant compliance engine. This is precisely the depth gap QuarterMark should attack.

Sources:
- https://www.73strings.com/portfolio-analysis-software/
- https://www.73strings.com/who-we-serve/private-credit/
- https://www.73strings.com/ai-for-private-credit/

**January 2026: launched 'Insights Generator', an agentic AI natural-language query layer inside 73 Monitor, plus a '73 Strings MCP Connector' exposing their data to Claude, ChatGPT and Cursor**  
_Confidence: high_

Launched 27 January 2026. Insights Generator lets teams query portfolio data in natural language and returns 'precise, fully traceable charts, tables, visuals, and narrative insights in real time' with no custom dashboard setup. Architecture described as an 'agentic AI layer' across 73 Intelligence combining 'advanced reasoning, firm-specific workflows, deterministic analytics, and enterprise-grade security.' Governance controls named: hallucination mitigation via grounding in 'validated source data and domain rules'; auditability with 'each answer clearly showing the data and reasoning behind it'; data isolation via private cloud deployment; and 'versioned logs and traceable data paths.' Separately, the 73 Strings MCP Connector enables secure integration with external AI tools (Claude, ChatGPT, Cursor) 'while maintaining full control, auditability and data integrity.' The deterministic-analytics-plus-LLM-narration split is the right architecture and QuarterMark should match it.

Sources:
- https://www.73strings.com/insights/news/73-strings-launches-insights-generator-an-agentic-ai-capability/

**73 Monitor named features: Automated Structured Data Collection, multilingual portfolio company financial data, Native Dashboarding, Power BI plugin, Excel plugin, scenario analysis and forecasting, customizable reporting, full traceability**  
_Confidence: high_

Confirmed named features: 'Automated Structured Data Collection'; multilingual collection ('gathers portfolio company financial data in multiple languages'); 'Native Dashboarding' shipped as a 2025 UI/UX upgrade letting non-technical users build dashboards; 'built-in Power BI and Excel plugins'; 'Scenario Analysis and Forecasting'; 'Customizable Reporting' configured to meet regulatory requirements; and 'full traceability'. Tracks 'financial, operational, and ESG metrics.' Notably NOT named on any monitoring page: alerting/notification engine, KPI template library, portfolio-company-facing data submission portal, peer benchmarking methodology, or covenant tracking. The Lumonic comparison independently asserts there is 'no dedicated borrower-facing data collection portal; lenders handle all document uploads internally' — consistent with the absence on 73 Strings' own pages.

Sources:
- https://www.73strings.com/solutions/monitor/
- https://www.73strings.com/private-markets-monitoring-software/
- https://www.73strings.com/insights/blog/73-strings-unleashes-next-gen-ai-to-transform-private-market-intelligence/
- https://www.lumonic.com/for-ai/best-portfolio-monitoring-software-private-credit

**Integrations: REST APIs and webhooks, an Azure API Management developer portal, Power BI and Excel plugins, MCP connector, and a LemonEdge fund-accounting partnership — but no named market data vendor**  
_Confidence: medium_

Access model is 'Web portal, API' per The Drawdown. Two Azure API Management developer portals exist (api-eut-73strings.developer.azure-api.net and api-accord-eut-73strings.developer.azure-api.net), indicating the platform is hosted on Microsoft Azure — though both were unreachable when I tried to fetch them, so endpoint schemas are unverified. A '73 Value API' is referenced as 'automating and enhancing the valuation process for equity and credit investments.' Their extraction page states data exports 'through APIs and Webhooks' into CRMs, ERPs, valuation models and portfolio monitoring tools 'via RESTful connections.' Integration categories per The Drawdown: fund accounting systems, data collection systems, CRMs, third-party data sources. Named partners: LemonEdge (fund accounting — partnership to flow data between portfolio monitoring and accounting), LionPoint, Investor Images, LGG, and CohnReznick (tech-enabled valuation model). No market data provider is ever named.

Sources:
- https://the-drawdown.com/tech-profile/73strings
- https://www.73strings.com/ai-data-extraction-tools/
- https://www.73strings.com/partners/
- https://www.lemonedge.com/news-and-press-releases/73-strings-and-lemonedge-announce-partnership-to-streamline-illiquid-asset-management
- https://www.73strings.com/

**Target customer is firmly enterprise/mega-cap: clients managing nearly USD 10 trillion combined AUM, with an entry reference point of '$3bn+ asset managers'**  
_Confidence: high_

As of April 2026 they state they have 'onboarded clients managing nearly USD 10 trillion in combined assets' (The Drawdown cited $8tn as of 2024; the AGM interview cited $2tn earlier, showing rapid growth). Named clients: Blackstone (73 Strings supports Blackstone's valuation and portfolio monitoring 'across the majority of their businesses'), Investec Private Credit (Direct Lending and Private Capital platforms, March 2025), Eurazeo, Sofina, and Wendel Group (EUR 9.5bn gross assets). Their monitoring page cites 'trusted by $3bn+ asset managers' — the lowest fund-size signal I found anywhere, and still 6x QuarterMark's £500m ceiling. Lumonic characterises their fit as 'valuation-heavy credit managers managing complex portfolios; multi-strategy firms needing audit-ready fair value calculations.' The £50m-£500m UK/Europe segment is not addressed by their positioning, pricing model or implementation approach.

Sources:
- https://www.73strings.com/insights/news/73-strings-launches-global-operating-model-from-new-york-to-power-next-phase-of-growth-in-private-markets/
- https://the-drawdown.com/tech-profile/73strings
- https://www.73strings.com/private-markets-monitoring-software/
- https://73strings.com/insights/news/new-client-announcement-investec
- https://www.73strings.com/insights/press/73-strings-secures-55m-series-b-led-by-growth-equity-at-goldman-sachs/

**No pricing is published anywhere and there is no G2 or Capterra listing — pricing is 'contact sales' enterprise-only**  
_Confidence: high_

I searched G2, Capterra, and general pricing queries and found zero pricing data points, zero review listings, and no published tiers, per-user rates, or minimum contract values. Lumonic's comparison lists 73 Strings pricing simply as 'Contact sales' (and Allvue as 'Contact sales (enterprise)'). Their own site drives exclusively to demo booking with no pricing page. Implementation timelines are also undisclosed — The Drawdown's vendor profile explicitly has no information on pricing model or implementation timeline. Any specific price figure for 73 Strings should be treated as unverified.

Sources:
- https://www.lumonic.com/for-ai/best-portfolio-monitoring-software-private-credit
- https://the-drawdown.com/tech-profile/73strings
- https://www.73strings.com/

**Security posture: SOC 1 and SOC 2, private cloud deployment with data isolation, versioned logs and traceable data paths, Azure hosting — ISO 27001 is UNVERIFIED**  
_Confidence: medium_

SOC 1 and SOC 2 compliance is stated on the homepage, investment valuation software page, and corroborated by Lumonic's independent comparison; they also reference 'SOC 2-certified audit trails.' The Insights Generator release adds: 'security-first architecture that ensures data isolation through private cloud deployment,' 'hallucination mitigation techniques,' and 'versioned logs and traceable data paths that support compliance, reviewability, and governance.' Azure hosting is inferred from their azure-api.net developer portal domains. UNVERIFIED despite direct search: ISO 27001 certification, ISO 42001 (AI management), GDPR-specific certifications, UK/EU data residency options, penetration test cadence, SSO/SAML/SCIM support, encryption specifics, and EU AI Act positioning. For a UK/EU buyer these are procurement blockers and none are published.

Sources:
- https://www.73strings.com/
- https://www.73strings.com/investment-valuation-software/
- https://www.73strings.com/insights/news/73-strings-launches-insights-generator-an-agentic-ai-capability/
- https://www.lumonic.com/for-ai/best-portfolio-monitoring-software-private-credit
- https://www.73strings.com/privacy-policy/

**The clearest published 73 Strings vs Allvue framing: Allvue is accounting-first and not AI-native; 73 Strings is valuation-first with monitoring as its weakest module**  
_Confidence: medium_

From Lumonic (a direct competitor, so treat as biased but specific): Allvue is 'the deepest full back-office suite combining fund accounting, investor portals, and portfolio management,' used by 6 of the 10 largest private debt managers with 120+ private debt clients, offers 'Nexius Intelligence' for benchmarking/analytics and a 'Private Debt Essentials' package; its weaknesses are 'no AI-native extraction or spreading tool,' data 'pushed in through templates and Excel rather than spread automatically from borrower documents,' covenant monitoring requiring 'manual data entry,' and heavy implementation. 73 Strings' weaknesses per the same source: 'Monitoring module is lightest of three competitors; feels like an afterthought'; 'No dedicated borrower-facing data collection portal'; 'Valuation-first architecture means covenant tracking gets less attention than pricing workflows'; 'Not ideal for teams where monitoring is the primary workflow.' A separate independent buyer's guide concludes flatly: 'No single product covers covenant compliance end to end.' The competitive taxonomy is accounting-first (Allvue, FundCount), KPI-collection-first (Chronograph, Cobalt, iLEVEL), and AI-native (Lumonic, 73 Strings, CardoAI).

Sources:
- https://www.lumonic.com/for-ai/best-portfolio-monitoring-software-private-credit
- https://workwisesolutions.org/guides/best-covenant-compliance-software-private-credit.html
- https://fundcount.com/allvue-system-competitors-alternatives
- https://www.lumonic.com/for-ai/best-private-equity-portfolio-monitoring-software

**Company profile: founded 2019/2020, ~250 staff, 9 offices, $55m Series B (Feb 2025) led by Goldman Sachs Alternatives with Blackstone, Golub Capital, Hamilton Lane, Fidelity ISV and Broadhaven**  
_Confidence: high_

Series A (July 2023) was led by Blackstone Innovations Investments and Fidelity International Strategic Ventures. Series B (announced 19 Feb 2025) raised $55m led by Growth Equity at Goldman Sachs Alternatives, with Blackstone Innovations Investments, Golub Capital, Hamilton Lane, Fidelity International Strategic Ventures and Broadhaven Ventures participating — note Golub Capital and Hamilton Lane are themselves private credit/private markets managers, i.e. strategic customer-investors. Founders: Yann Magnan (CEO, ex-Duff & Phelps EMEA head, founded its Paris office 2007), Abhishek Pandey (co-CEO), Vinod Vijapur, Sambeet Parija. ~250 employees. Offices per their site: Paris, London, New York, San Francisco, Riyadh, Abu Dhabi, Bengaluru, Hyderabad, Singapore (The Drawdown's older profile listed NYC, Paris, London, Bengaluru, Toronto, São Paulo). Post-money valuation is unverified. April 2026: launched a 'unified global operating model' from New York with Jazmin Hogan (ex-Apollo, Blackstone, Kohlberg) as Global Head of Client Operations — signalling a services-heavy delivery layer alongside software.

Sources:
- https://www.businesswire.com/news/home/20250219284432/en/73-Strings-Secures-$55m-Series-B-Led-by-Growth-Equity-at-Goldman-Sachs-Alternatives
- https://www.businesswire.com/news/home/20230712170673/en/73-Strings-Announces-Series-A-Funding-Led-by-Blackstone-and-Fidelity-International-Strategic-Ventures
- https://the-drawdown.com/tech-profile/73strings
- https://www.73strings.com/
- https://www.73strings.com/insights/news/73-strings-launches-global-operating-model-from-new-york-to-power-next-phase-of-growth-in-private-markets/
- https://www.hamiltonlane.com/en-us/news/hamilton-lane-73-strings-investment

**Reporting outputs are generic: LP reporting, compliance reporting, regulator-ready outputs, customizable dashboards, Power BI/Excel export — no ILPA template support is published**  
_Confidence: medium_

Named reporting capabilities: 'Generate standardized investor reports effortlessly' (LP reporting), 'Automate reporting workflows to maintain compliance', 'regulator-ready outputs', 'Custom reporting for LPs, regulators, and internal teams', 'Audit-ready reporting aligned to brand and compliance' (i.e. white-labelling), 'Customizable Reporting' configured to regulatory requirements, and export via Power BI and Excel plugins. UNVERIFIED / not found on any page: ILPA Reporting Template support, ILPA Fee Reporting, ESMA/AIFMD Annex IV, FCA reporting, SFDR templates, or Form PF. For a UK/European private credit fund, AIFMD Annex IV and SFDR are the reporting obligations that matter, and 73 Strings publishes nothing on them.

Sources:
- https://www.73strings.com/private-equity-software/
- https://www.73strings.com/ai-for-private-credit/
- https://www.73strings.com/solutions/monitor/
- https://www.73strings.com/solutions/value/

**Headline efficiency claims to benchmark against: 10x faster valuations, 50% valuation cost reduction, 90% reduction in manual data entry / routine task time, thousands of pages processed in minutes**  
_Confidence: high_

Repeated consistently across homepage and product pages: 'up to 50% reduction in valuation costs'; '10x faster valuations than traditional methods'; '90% reduction in routine task time' and separately '90% reduction in manual data entry'; 'AI processes thousands of pages in minutes'; '10x faster analytics'; 'Deliver audit-ready valuations 10x faster with AI-assisted workflows'. All are self-reported vendor claims with no published methodology, baseline definition, or customer-verified case study data behind them. They set the expectation bar QuarterMark's messaging will be measured against, but they are not independently substantiated.

Sources:
- https://www.73strings.com/
- https://www.73strings.com/portfolio-analysis-software/
- https://www.73strings.com/data-extraction-for-private-markets/
- https://www.73strings.com/private-markets-monitoring-software/

### Implications for QuarterMark
- Covenant depth is a genuine, defensible wedge. 73 Strings' entire public covenant story reduces to one sentence about parsing 'covenant monitoring, DSCRs, and cross-default clauses' plus a 'Compliance Parser' for compliance certificates. They publish nothing on covenant test calculation, headroom/cushion tracking, breach and near-breach alerting, cure and mulligan mechanics, EBITDA add-back adjudication, grace periods, or waiver/amendment history. QuarterMark should build the covenant engine they don't have — a per-agreement ratio definition library where each covenant's exact contractual definition (including add-back caps, pro-forma adjustments, and testing dates) is modelled as executable logic, not just extracted as text.
- Attack the extraction architecture, not the accuracy number. Their published stack is OCR + proprietary NLP + BERT-class encoder transformers with template-free layout adaptation — a pre-LLM architecture. QuarterMark building on a modern LLM extraction pipeline with per-field confidence scores, cited source spans (page/line/bounding box), and explicit human-in-the-loop exception queues can beat them on the dimensions they never publish: provenance, confidence, and reviewability. Note they publish NO confidence scoring mechanism anywhere — make citation-and-confidence a first-class, visible product surface.
- Do not compete on the 99% accuracy claim; compete on verifiability. Their own 'Precision Scorer' feature copy implies a ~98.6% baseline, and their technical explainer concedes '>95% when tuned for financial docs.' No accuracy claim is third-party audited and no per-document-type breakdown exists. QuarterMark should publish a covenant-specific accuracy methodology (which fields, which document types, what human review rate) — being the only vendor with a defensible number is stronger than claiming a bigger one.
- The £50m-£500m AUM segment is genuinely unserved by them. 73 Strings targets clients with nearly $10tn combined AUM, names Blackstone as an anchor, cites '$3bn+ asset managers' as its lowest fund-size signal, publishes no pricing, and has just built a New York-led global client-operations function implying high-touch enterprise delivery. QuarterMark should design for self-serve or light-touch onboarding (days not quarters), transparent published pricing, and a single-fund-manager footprint — all things they structurally cannot offer.
- Match their governance architecture, because it is the right one and it is now table stakes for institutional buyers. Insights Generator's split of deterministic analytics for numbers plus LLM for narration, with grounding in validated source data, versioned logs, traceable data paths, private-cloud data isolation, and 'each answer clearly showing the data and reasoning behind it' — QuarterMark must ship equivalent guarantees from day one. Never let an LLM compute a covenant ratio; compute deterministically and use the LLM only to explain and cite.
- Ship an MCP server. 73 Strings already exposes a '73 Strings MCP Connector' for Claude, ChatGPT and Cursor as of January 2026. This is now a competitive expectation, not a differentiator, and it is cheap for a Next.js/Postgres stack to deliver. Also expose clean REST APIs plus webhooks — webhooks matter especially for covenant breach events, which is a use case their push-free architecture doesn't obviously serve.
- Own the UK/European compliance frame they have vacated. They anchor to International Valuation Standards (IVS 101/105/200) and never mention IPEV, IFRS 13, ASC 820, AIFMD Annex IV, SFDR or FCA reporting on any public page. QuarterMark naming IPEV Guidelines and IFRS 13 explicitly in the valuation module, and AIFMD Annex IV/SFDR in reporting, is immediate credibility with the exact buyer they ignore.
- Build the borrower-facing data collection portal. Both 73 Strings' own pages and the independent comparison confirm they have no borrower/portfolio-company submission portal — lenders upload everything internally. For small private credit funds without ops headcount, a portal where borrowers submit compliance certificates and management accounts directly (with automated chasing for overdue reporting) removes the single biggest manual burden and is a structural gap in the incumbent.
- Credit valuation is their thin flank, not just covenants. 73 Value Equity has an articulated architecture (five engines, twelve sources, DCF/comps/calibration/waterfall/PORI); 73 Value Credit is described only as 'multiple valuation engines and public and private data sources.' No yield analysis, credit spread build-up, recovery analysis, or PIK/OID modelling is named anywhere. A credit-native valuation module with explicit yield/spread/recovery methodology would out-specify them on their own core product for the private credit buyer.
- Positioning line to test: QuarterMark is what you get when covenant monitoring is the product rather than a by-product of a valuation engine. The independent buyer's guide conclusion — 'No single product covers covenant compliance end to end' — is the market gap stated plainly by a third party, and it is the thesis QuarterMark should be built to disprove.


---

## v2:b2d280e9ea383cf51a9d4eab0e9b9ef99fbdf36bdc83040013aacee53fa4131e

### Summary
The private credit monitoring landscape splits into five distinct layers, and covenant monitoring sits awkwardly across all of them — which is precisely the gap QuarterMark can exploit. Layer 1 is fund-ops/accounting incumbents (Allvue, FIS Private Capital Suite/Investran, SS&C, eFront/BlackRock) where covenants are a bolt-on to an accounting core and data typically enters via templates and Excel rather than AI extraction. Layer 2 is credit-native monitoring platforms (Lumonic — now a PitchBook/Morningstar company, Cardo AI, Oxane Partners, 73 Strings, Chronograph) that treat the loan lifecycle as the primary object. Layer 3 is bank/enterprise lending cores (Finastra Loan IQ, nCino, Moody's Lending Suite, SS&C Precision LM, Solifi) that have mature covenant/exception modules but are priced and scoped for banks, not £50m–£500m funds. Layer 4 is servicing/agency and administration (Alter Domus Agency360 + CorPro, Solvas — acquired by Alter Domus from Deloitte, S&P WSO + the new WSO Compliance Insights) which owns authoritative loan-level data. Layer 5 is market data and document intelligence (9fin, Octus, Fitch's Covenant Review/CreditSights, Allvue Private Credit Monitor, Versana, Octaura) which supplies benchmarks and comparables rather than monitoring workflow. The single clearest technical trend across 2025–2026 is AI extraction of covenant definitions directly from executed credit agreements, with source-cell traceability back to the document — Lumonic, CovenantIQ, Moody's, 73 Strings and Ontra all now claim this, and it has become table stakes rather than a differentiator. The second trend is agentic architectures: Ellis AI raised a $10m seed on 31 July 2026 for AI agents doing reconciliation and exception tracing, and Resiliq claims 30+ autonomous agents for covenant tracking and spreading. The third is benchmarking as a moat — Allvue's Private Credit Monitor derives percentile leverage benchmarks from 1,933 issuances since 2022, converting proprietary deal data into predictive early-warning signals no small fund can replicate alone. Notably, borrowing base automation is a largely separate vendor cluster (Cascade Debt, ABLSoft, Oxane, Solifi, timveroOS) that rarely overlaps with cash-flow covenant monitoring, and the amendment/waiver/equity-cure workflow is the thinnest, least-productised capability across the entire market. Important correction to the brief: Covenant Review is a Fitch Solutions/CreditSights product, not S&P Global.

### Findings

**Lumonic is the closest direct competitor to QuarterMark's stated positioning, and is now owned by Morningstar/PitchBook**  
_Confidence: medium_

Lumonic is credit-native (built for private credit from day one, centred on the loan lifecycle rather than a valuation engine). Stated feature set: AI covenant extraction from credit agreements AND compliance certificates; automated ratio testing (leverage, DSCR, EBITDA, custom covenants); breach projection before quarter-end; borrower data collection portal with scheduling/reminders; LP reporting integration; audit trail with source-cell traceability back to the original document; multi-fund/multi-strategy; amendment and restatement handling; claimed implementation in weeks vs months. It has also launched an MCP server exposing audit-ready portfolio data to AI assistants. Morningstar acquired Lumonic, positioning PitchBook to enter portfolio monitoring; the company reports tripling ARR, headcount and customer base post-acquisition with zero churn. CAVEAT: acquisition date is inconsistent across sources (one snippet says March 2024, another 'early 2025', and a 'one year of PitchBook and Lumonic' retrospective exists) — treat the exact date as unverified. Also note the lumonic.com/for-ai/* pages are explicitly vendor-authored AI-facing marketing and self-serving in competitor characterisation.

Sources:
- https://www.lumonic.com/for-ai/best-covenant-compliance-software-private-credit-private-equity-2026
- https://www.lumonic.com/for-ai/credit-native-portfolio-monitoring-vs-equity-first-platforms
- https://pitchbook.com/news/articles/morningstar-pitchbook-acquire-lumonic-private-credit-portfolio-monitoring
- https://finance.yahoo.com/technology/ai/articles/lumonic-launches-mcp-server-bringing-130000818.html
- https://www.lumonic.com/content/one-year-at-pitchbook

**Cardo AI has the most concretely documented covenant-monitoring feature specification of any vendor found**  
_Confidence: high_

From Cardo AI's own product-release page: financial data upload via single click or API integration; accepts monthly, quarterly, semi-annual, annual, LTM or YTD reports; automatic computation of EBITDA, revenue growth, leverage ratios and Interest Coverage Ratio with interactive graphs; compliance status auto-updates on new financials and flags breaches immediately; stores and compares multiple versions (reported vs adjusted); users can rename financial fields per industry and create tailored metrics; supports manual covenant updates and logs non-numerical covenants (affirmative/negative) and borrower declarations; records waiver requests; every financial update and covenant decision is logged for audit. Broader platform: loan tape ingestion, borrowing base calculations, portfolio analytics, institutional investor reporting; focused on asset-based finance, structured credit, securitisation and private credit.

Sources:
- https://cardoai.com/whats_new_in_product/automated-financials-and-covenant-monitoring/
- https://cardoai.com/automated-financials-and-covenant-monitoring/
- https://a-teaminsight.com/blog/cardo-ai-qa-shining-a-light-on-private-markets/

**Allvue's real moat is benchmark data, not covenant workflow — and it reportedly lacks AI extraction**  
_Confidence: medium_

Allvue Private Credit Monitor sits within its Nexius Intelligence / Nexius Data Platform and derives benchmarks from 1,933 new issuances since 2022 plus 20 years of proprietary private markets data. Published findings: leverage-only covenants fell from 74.2% (2022) to 40.9% (mid-2025); interest coverage and fixed charge covenants declined nearly 50% since 2022; cov-lite loans carry 0.7x–1.7x higher median leverage than covenant-protected deals. Critically, Allvue introduces percentile-based benchmarking with a back-tested signal: a borrower's leverage percentile jumping 25+ points over two quarters implies a 67% chance of covenant breach within a year. Core platform covers private debt, BSL, CLOs, ABL and multi-strategy credit, with real-time exposure monitoring, covenant tracking, issuer-level risk analytics, scenario modelling, watchlist alerts and an AI assistant layer. One comparison source claims Allvue has no AI extraction and data enters via templates and Excel — plausible but from a competitor-adjacent SEO source, so unverified.

Sources:
- https://www.allvuesystems.com/allvue-private-credit-monitor/
- https://www.allvuesystems.com/resources/allvue-alpha-systematic-covenant-monitoring/
- https://www.allvuesystems.com/industries/private-debt/
- https://alternativecreditinvestor.com/2026/07/20/allvue-systems-launches-private-credit-benchmarks-based-on-deal-data/
- https://www.marketsmedia.com/allvue-debuts-first-benchmarks-built-from-private-credit-deal-data/

**Termgrid approaches covenants from the deal-origination side, with headroom and test schedules as the core primitives**  
_Confidence: high_

Termgrid is an end-to-end debt financing platform for private capital markets serving sponsors, lenders, borrowers, advisors and law firms — digitising term sheets and deal grids, centralising transaction data. Covenant capabilities: covenant headroom and test schedules with instant portfolio-health visibility; visualisation by fund, facility OR company level; monitoring of upcoming tests and expected headroom over facility life; streamlined covenant upload; elimination of manual calculation; dashboard reporting. Its differentiator is historical deal terms data for negotiation leverage. Notably, Termgrid's own covenant page does NOT describe AI extraction from credit agreements, specific alert mechanisms, or third-party integrations — a visible gap.

Sources:
- https://app.termgrid.com/covenants/
- https://app.termgrid.com/platform-overview/
- https://app.termgrid.com/portfolio-management-2/
- https://app.termgrid.com/article/historical-deal-terms-in-private-credit/

**Moody's Lending Suite is the most technically complete covenant stack but is explicitly aimed at banks, not sub-£500m funds**  
_Confidence: high_

Capabilities from Moody's own page: end-to-end covenant management from request to testing — automated document collection, validation and compliance monitoring; AI-assisted compliance testing and exception management; automated testing schedules and alerts; AI to identify and prioritise risky loans; early warning signals from performance indicators; pattern detection to uncover hidden risk; what-if analysis for stress-testing loans; sensitivity analysis across strategies; and critically, advanced machine learning that ingests unstructured financial documents WITHOUT requiring configuration or templates. Built on generative AI, ML, cloud and APIs. Target customer is explicitly banking institutions managing large loan portfolios. Moody's separately positions data/analytics across the private credit lifecycle from deal screening to portfolio monitoring.

Sources:
- https://www.moodys.com/web/en/us/solutions/lending/loan-monitoring.html
- https://www.moodys.com/web/en/us/solutions/private-credit.html
- https://www.moodys.com/web/en/us/private-credit-risk-analysis.html

**CovenantIQ is the closest architectural analogue to what QuarterMark should build, and targets non-sponsored borrowers**  
_Confidence: high_

CovenantIQ extracts the covenant set, definitions AND reporting requirements out of the executed credit agreement so the monitoring schedule builds itself rather than being keyed by hand. Documented features: AI agents map borrower chart of accounts to CovenantIQ's own taxonomy; financial normalisation across formats while preserving source-level detail; automated bespoke covenant computation; direct connectivity to borrower accounting systems; KPI and EBITDA-adjustment tracking; custom dashboards with AI-assisted credit narratives; full audit trails letting users verify every number back to source; violations surface as warnings weeks before deadline. Positioned as a secure connected lender/borrower workflow and 'source-backed system of record'. Target: private credit funds managing non-sponsored borrowers at scale who want to grow without growing headcount proportionally. Lumonic characterises CovenantIQ as best suited to emerging credit managers — i.e. direct overlap with QuarterMark's segment.

Sources:
- https://www.covenantiq.io/private-credit-funds
- https://www.covenantiq.io/
- https://www.covenantiq.io/resources/revolutionizing-loan-monitoring-with-ai-how-covenantiq-is-transforming-cash-flow-based-lending
- https://www.covenantiq.io/about

**Cascade Debt publishes the most explicit covenant test-engine architecture — a five-stage pipeline worth copying**  
_Confidence: high_

Cascade Debt's documented pipeline: (1) Data Ingestion — automatic extraction from originator systems, native connection to 20+ database types, eliminating manual file transfer via direct API/DB integration with LMS and accounting software; (2) Independent Verification — raw data cleaned, standardised and independently verified BEFORE any covenant test runs; (3) Rule-Based Calculation — applies the specific covenant rules defined in the credit agreement: thresholds, ratios, concentration limits; (4) Result Generation — each test yields pass, fail, OR cure-period result; (5) Reporting to real-time dashboards. Plus: real-time borrowing base calculations run daily instead of monthly for continuous capacity monitoring; configurable alerts for approaching/breached/overdue covenants with escalation rules routing to the right stakeholder (portfolio managers vs ops); immutable audit trail storing every covenant value obtained, test run and document submitted; SOC 2 compliance with immutable change logs carrying timestamp and user attribution. The explicit three-state result (pass/fail/cure-period) and pre-test verification gate are design details most competitors do not articulate.

Sources:
- https://www.cascadedebt.com/insights/covenant-monitoring-software-for-private-credit
- https://www.cascadedebt.com/
- https://www.cascadedebt.com/insights/private-debt-software-built-for-asset-based-finance

**Oxane Partners is the strongest UK/Europe-headquartered competitor and covers both covenants and borrowing base**  
_Confidence: high_

Oxane Panorama is an AI-powered private credit platform covering portfolio and risk management, credit facility management, analytics, valuations and facility administration. Portfolio management tracks borrower financial performance, loan terms, payment activity, covenant compliance and credit quality changes, with real-time tracking of borrowing limits, drawdowns and covenant compliance. Dedicated Borrowing Base Management solution dynamically tracks eligible collateral and calculates advance rates; the NAV-based lending module offers real-time borrowing base calculations, automated margin call triggers and direct integration with fund valuations and asset-level data. Oxane also has a fund finance software line and an asset-based lending solution, and recently secured strategic growth investment to expand the AI-powered platform.

Sources:
- https://www.oxanepartners.com/private-credit-software/oxane-panorama
- https://www.oxanepartners.com/private-credit-solutions/borrowing-base-management
- https://www.oxanepartners.com/private-credit-solutions/asset-based-lending
- https://www.oxanepartners.com/blogs/fund-finance-software-for-private-credit-managers
- https://pulse2.com/oxane-partners-secures-strategic-growth-investment-to-expand-ai-powered-private-credit-platform/

**73 Strings is valuation-first with monitoring layered on second — the inverse of QuarterMark's opportunity**  
_Confidence: medium_

73 Strings built its valuation product first (73 Value / 73 Value Credit, designed to meet internationally accepted valuation requirements) then added portfolio monitoring as a secondary capability. It offers AI-assisted data extraction for alternative assets, AI-driven analytics to monitor credit risk, track financial covenants and assess portfolio performance in real time. Vendor/comparison claims of parsing covenant terms, DSCRs and cross-default clauses at '99% accuracy' and workflows '90% faster' come from marketing and a competitor-comparison SEO page — treat the specific percentages as unverified vendor claims.

Sources:
- https://www.73strings.com/who-we-serve/private-credit/
- https://www.73strings.com/portfolio-analysis-software/
- https://www.73strings.com/ai-for-private-credit/
- https://www.73strings.com/solutions/value/
- https://www.73strings.com/data-extraction-for-private-markets/

**eFront (BlackRock) has private debt loan administration but no publicly documented covenant monitoring module**  
_Confidence: low_

eFront offers dedicated loan management software for loan/mezzanine debt automating back-end events: calculation of accrued interest and default interest on arrears, fee management, multiple amortisation methods. eFront Portfolio Monitoring automates data collection, standardisation, advanced analysis and investor reporting; eFront Insight adds private markets analytics with a Research Module. BlackRock completed the eFront acquisition. IMPORTANT: despite targeted searching, no dedicated covenant monitoring module was found on eFront's public materials — this is a genuine gap in the incumbent's coverage, though it may exist and simply not be publicly documented (efront.com returned HTTP 403 to direct fetch, so this is unverified rather than disproven).

Sources:
- https://www.efront.com/en/alternative-investment-solutions/private-debt
- https://www.efront.com/en/alternative-investment-software/efront-portfolio-monitoring
- https://www.efront.com/en/alternative-investment-software/efront-insight
- https://www.efront.com/en/news-press-releases/blackrock-completes-acquisition-of-efront-industry-leading-alternatives-investment-software-provider

**Alter Domus owns the servicing/agency data layer and acquired Solvas from Deloitte**  
_Confidence: medium_

Alter Domus is the largest loan agency service provider on the market (5,800+ employees, 39 offices), serving the biggest private debt and BSL managers. Agency360 is its proprietary platform for all loan agency services — calculations, notice preparation, payment processing, tax reporting — acting as single source of data and operations; it feeds Agency CorPro, the client-facing portal for loan agency data, fund/asset-level financial data and investor communications. It also runs a dedicated Asset Monitoring & Covenant Management service line. Solvas (developed over 20 years by Deloitte) was acquired by Alter Domus and comprises: Solvas|Portfolio (multi-asset portfolio administration for managers, trustees, fund admins, agent banks), Solvas|Compliance (rules-based, user-configurable compliance engine with hypothetical trade scenario analysis and no-code deal modelling), Solvas|PoP (configurable priority-of-payments waterfall engine), Solvas|Accounting, and Solvas|Data (bank loan data processing eliminating manual agent-notice entry). Acquisition date not confirmed from a primary source — unverified.

Sources:
- https://alterdomus.com/insight/alter-domus-acquires-leading-fintech-provider-solvas-from-deloitte/
- https://alterdomus.com/services/private-credit-solutions/agency-services/
- https://alterdomus.com/services/asset-monitoring-covenant-management/
- https://alterdomus.com/services/private-credit-solutions/loan-administration/
- https://www2.deloitte.com/us/en/pages/risk/solutions/financial-technology-software-clo-cdo.html

**S&P Global iLEVEL added covenant monitoring and financial spreading, plus a new real-time compliance engine (WSO Compliance Insights, Nov 2025)**  
_Confidence: high_

iLEVEL is used by 700+ asset managers and allocators for data collection, portfolio monitoring, analytics, valuation and reporting across PE, VC, real estate and private debt. Recent enhancements to the iLEVEL Credit solution specifically include Automated Data Ingestion, Capital Structure Analysis, Covenant Monitoring and Financial Spreading. Private Credit Monitoring is delivered via seamless integration between iLEVEL and the WSO loans administration platform. S&P also launched iLEVEL Document Search (AI over private asset documents, Aug 2025) and, on 20 Nov 2025, WSO Compliance Insights — a compliance management solution for private credit and CLO managers featuring real-time test visualisation, advanced hypothetical trade analysis, live data connectivity to WSO, cross-deal comparison of compliance issues, automated point-in-time reporting snapshots, and event-driven analysis as holdings change intraday rather than end-of-day batch processing. Available as an application or fully managed service.

Sources:
- https://press.spglobal.com/2025-11-20-S-P-Global-Launches-WSO-Compliance-Insights-to-Streamline-Credit-Risk-Management
- https://www.spglobal.com/market-intelligence/en/solutions/products/ilevel
- https://www.spglobal.com/content/dam/spglobal/mi/en/documents/general/iLEVEL%20Credit%20(final%20version)%201.pdf
- https://press.spglobal.com/2025-08-07-S-P-Global-brings-together-Artificial-Intelligence-and-Private-Asset-Portfolio-Management-with-iLEVEL-Document-Search
- https://www.spglobal.com/market-intelligence/en/solutions/private-credit-solutions

**CORRECTION TO BRIEF: Covenant Review is a Fitch Solutions/CreditSights product, not an S&P Global one**  
_Confidence: high_

Covenant Review is fully owned by Fitch Solutions (part of Fitch Group, owned by Hearst) and distributed via CreditSights — it is not an S&P Global product. Its Private Credit Product serves asset managers, law firms, CLO managers and originators, covering direct lending, club deals and private syndication. It provides per-loan analysis of key terms, standout features and material risks; benchmarking against a private credit loan dataset; standardised Documentation Scores measuring how strongly loan documents protect the lender's position, expressed as a composite score derived from sub-scores and quality factors; monthly trend tracking; and special reports from Covenant Review lawyers. This is human-lawyer-authored document scoring, a different product category from automated covenant compliance monitoring.

Sources:
- https://know.creditsights.com/covenant-review/
- https://know.creditsights.com/did-you-know-covenant-review-can-revolutionize-your-private-credit-strategy/
- https://know.creditsights.com/private-credit/
- https://know.creditsights.com/law-firm-solution/

**9fin and Octus are the AI-native credit data/covenant-intelligence layer — benchmarks, not workflow**  
_Confidence: high_

9fin positions as an AI-native platform for modern credit teams with real-time debt market intelligence across public, private and distressed credit. Covenant capabilities: AI-powered covenant analysis, earnings summaries, comps and tear sheets; ability to see 'what's market' in covenants, benchmark terms across deals and spot structural risks; filter by deal size, leverage, maturity or specific provisions; view all covenants tied to a bond or loan in one place; 20+ years of deal history, financials, bonds, loans and covenant data; dedicated private credit offering for law firms. Octus provides sub-investment-grade credit data across leveraged loans, high-yield bonds, private credit, issuer fundamentals, covenant data, plus credit market news and analysis. Both are market-intelligence/benchmark layers rather than portfolio monitoring workflow — they answer 'is this term market-standard' not 'is my borrower in compliance'.

Sources:
- https://www.9fin.com/platform
- https://www.9fin.com/insights/loan-covenant-data
- https://www.9fin.com/insights/announcing-9fins-covenant-data
- https://9fin.com/ai
- https://www.9fin.com/law-firms/private-credit
- https://octus.com/

**Finastra Loan IQ, nCino and SS&C Precision LM define the bank-grade covenant/exception feature bar**  
_Confidence: high_

Finastra Loan IQ is the market's preeminent loan servicing platform with integrated collateral AND covenant management, full agency-level servicing for complex syndicated deals with multiple lenders, full loan lifecycle accounting, risk management and compliance, real-time back-office transaction monitoring, and multi-currency/multi-branch aggregation. nCino Commercial Lending provides automatic notifications when a covenant approaches its due date, serves as a compliance record for auditing, offers ON-DEMAND covenant testing with instant results, tracks covenant requirements and document requests through a borrower-facing Customer Portal, produces complete credit and collateral exception lists for examiners on demand, and surfaces early warning indicators with intelligent alerts routed with context; nCino has also demoed a covenant monitoring AI agent. SS&C Precision LM is a single-database commercial loan management system covering origination through servicing; SS&C's private credit line notes that widely varying loan terms, rates and covenants generate substantial manual processing that automation addresses.

Sources:
- https://www.finastra.com/lending/solutions/loan-iq
- https://www.finastra.com/sites/default/files/file/2026-06/resource-loan-iq-solution-overview.pdf
- https://www.ncino.com/solutions/commercial-lending
- https://www.ncino.com/our-platform
- https://www.ssctech.com/products/precision-lm
- https://www.ssctech.com/industry/private-markets/private-credit

**Borrowing base automation is a distinct, separately-served vendor cluster that rarely overlaps cash-flow covenant monitoring**  
_Confidence: high_

Distinct players: ABLSoft (bank-grade ABL now targeting private credit — borrowing base automation, collateral monitoring at scale, risk and covenant surveillance); Solifi (formerly Stucky ABL — portfolio analysis dashboards, AR automation); timveroOS (borrowing base engine, reconciliation, field-exam building blocks); Finsoft AssetReader (ABL electronic file analysis); Decipher Credit; Cascade Debt; Oxane. Documented mechanics: apply eligibility criteria and concentration limits to current receivables data, auto-calculating available capacity as the portfolio changes; import monthly aging reports and instantly calculate ineligibles; ingest Excel, CSV and PDF agings and supporting documents; process a borrowing base in seconds; option for the LENDER to control BBC calculation on higher-risk deals or let the BORROWER initiate it. That dual-control model is a specific design decision QuarterMark will need to make.

Sources:
- https://ablsoft.com/bank-grade-abl-private-credit-structured-finance/
- https://ablsoft.com/products/abl/
- https://ablsoft.com/borrowing-base-part-2-a-path-to-borrowing-happiness/
- https://www.solifi.com/asset-based-lending-software/
- https://timvero.com/asset-based-lending-software
- https://www.finsoft.net/asset-based-lending-software/AssetReader-page.htm
- https://deciphercredit.com/loan-platform/abl-software/

**2026 startup wave: Ellis AI ($10m seed, 31 July 2026) and Resiliq are building agentic architectures for exactly this problem**  
_Confidence: medium_

Ellis AI emerged from stealth 31 July 2026 with a $10m seed led by repeat founder Ryan Williams; investors include First Round Capital, 645 Ventures, Harlem Capital, Khosla Ventures, Thrive Capital, Slow Capital and Ariel Alternatives. Its platform creates a single reconciled and source-verifiable data foundation across the systems AND documents private credit firms use, with specialist AI agents performing recurring operational work: reconciling positions and cash flows, identifying anomalies and tracing exceptions, plus support for fund closing, LP reporting, portfolio monitoring and compliance. Resiliq is described as an AI-native private credit portfolio monitoring and risk platform deploying 30+ autonomous AI agents for covenant tracking, financial spreading, credit stress testing and portfolio risk assessment — Resiliq's own site did not surface in searches, so its claims are unverified. The 'source-verifiable / reconciled data foundation' framing is now the common architectural thesis across the new entrants.

Sources:
- https://techcrunch.com/2026/07/31/repeat-founder-ryan-williams-raises-10m-seed-for-an-ai-startup-for-private-credit-managers/
- https://alternativecreditinvestor.com/2026/07/30/private-credit-ai-platform-ellis-launches-with-10m-seed-funding/
- https://mezha.net/eng/bukvy/8271e006_ellis_ai_raises/
- https://workwisesolutions.org/guides/best-covenant-compliance-software-private-credit.html

**Versana and Octaura are market infrastructure — a potential data source for QuarterMark, not a competitor**  
_Confidence: high_

Versana centralises real-time agent-bank loan data for syndicated loans and private credit; founded by Cynthia Sachs; raised $43m in April 2026 led by BNP Paribas with Fitch Ventures, MassMutual Ventures, Motive Partners and Apollo joining, $125m+ total raised; active facility coverage exceeds $4.1 trillion notional. Products include the Versana Reconciliation Module (VRM, early 2025) letting lenders electronically match positions against agents' source data in real time, a cashless roll solution (late 2025, JP Morgan lead adopter), and expansion into letters of credit. Octaura runs electronic syndicated loan trading (launched 2022) and CLO trading (Sept 2025), added the 'Live Feedback' live-auction BWIC protocol in Feb 2026, traded 7.7% of the secondary leveraged loan market in Jan 2026, and set a record $7.7bn/1,322 loans in March 2026 with $19.6bn+ in Q1 2026. Neither does covenant monitoring; Versana in particular is a candidate authoritative feed for position and facility data.

Sources:
- https://versana.io/overview/
- https://versana.io/solutions/
- https://www.prnewswire.com/news-releases/versana-closes-43-million-capital-raise-led-by-bnp-paribas-with-fitch-ventures-massmutual-ventures-motive-partners-and-apollo-joining-as-investors-302758712.html
- https://www.prnewswire.com/news-releases/versana-expands-its-digital-data-offering-into-letters-of-credit-302776145.html
- https://www.octaura.com/blog/octauras-loan-platform-turns-3-lessons-milestones-and-whats-next
- https://news.octaura.com/octaura-unveils-clo-trading-platform

**Document-extraction vendors are an unbundled layer QuarterMark could buy rather than build — and Accelex was acquired by Carta**  
_Confidence: medium_

Accelex (founded 2018) provides AI/ML data acquisition, analytics and reporting for alternative investors and asset servicers, automating extraction from difficult-to-access unstructured data. Its automated document acquisition delivers a consolidated content feed via direct API connectivity to portals including SS&C Intralinks and FIS Digital Data Exchange, plus email attachment capture and SFTP — specifically suited to messy management accounts and compliance certificates. Accelex was reportedly acquired by Carta (source is an SEO comparison page — unverified). Daloopa extracts financial data into structured model-ready form and is strongest on standardised cases. Canoe Intelligence is primarily an LP-side document ingestion tool increasingly used to feed borrower data into GP monitoring platforms. Carta itself now markets Carta Loan Operations for private credit funds with covenant compliance deadlines, automated reminders and financial ratio calculation. Legal-document AI (Kira, Luminance, Harvey, Legora, Ontra Insight for Credit) handles credit-agreement term extraction: financial covenants and levels, EBITDA definition and add-backs, negative covenants and carve-outs, MFN, and events of default.

Sources:
- https://www.prnewswire.com/news-releases/accelex-introduces-first-fully-automated-document-acquisition-solution-for-private-markets-301777907.html
- https://www.accelex.ai/resources/simplifying-data-extraction-from-complex-financial-documents
- https://www.ontra.ai/products/insight-for-credit/
- https://carta.com/learn/private-funds/private-equity/strategies/private-credit-investing/loan-covenants/
- https://carta.com/blog/unstructured-private-market-data-extraction/
- https://www.llamaindex.ai/glossary/financial-covenant-extraction

**A published technical warning: single-pass LLM parsing of credit agreements produces errors, omissions and hallucinations**  
_Confidence: medium_

Practitioner guidance found in the research explicitly states that asking an AI to parse an entire loan document in one pass invites errors, omissions and hallucinations, and that effective systems break the analysis into focused, iterative phases designed to capture nuance, preserve context and verify accuracy. Complementary vendor evidence for the same conclusion: Lumonic's emphasis on 'source-cell traceability back to the original document', CovenantIQ's 'verify every number back to the source', and Cascade Debt's independent-verification gate BEFORE any covenant test executes. Also relevant: LlamaIndex publishes a definition of 'financial covenant extraction' as a named task, and V7 Go and Anaptyss CovenAce market it as a productised workflow, indicating the pattern is well-enough established to have reference implementations.

Sources:
- https://centauri-ai.tech/blog/operationalize-credit-agreements-at-scale-and-speed
- https://www.llamaindex.ai/glossary/financial-covenant-extraction
- https://www.v7labs.com/automations/loan-and-credit-agreement-analysis
- https://www.anaptyss.com/covenace/
- https://www.private-credit.ai/knowledge/insights/ai-credit-agreement-reader.html

**Amendment, waiver and equity-cure workflow is the thinnest capability in the entire market — QuarterMark's clearest whitespace**  
_Confidence: medium_

Only a handful of vendors mention it at all, and none describe it in depth. Cardo AI 'records waiver requests'. Lumonic offers 'amendment and restatement handling'. timveroOS 'manages amendments and waivers through scenario modelling and governed approvals'. Henon lists 'amendment or waiver tracking' among its workflows. Cascade Debt uniquely produces a 'cure period' as a first-class test result state. The stated requirement is that a monitoring system should record the date of breach detection, the nature of the violation, all borrower communications, waiver or amendment negotiations, equity cure exercises, and ultimate resolution — with traceability and approval history for internal and external accountability. No vendor found documents a full covenant-amendment lifecycle (redlined definition changes, restated covenant levels effective from a date, cure-right consumption counters, EBITDA add-back re-negotiation). This is where 'far greater depth on covenant monitoring' is actually achievable.

Sources:
- https://cardoai.com/whats_new_in_product/automated-financials-and-covenant-monitoring/
- https://henon.ai/guides/private-credit-portfolio-management-software
- https://timvero.com/private-credit-software
- https://www.cascadedebt.com/insights/covenant-monitoring-software-for-private-credit
- https://www.polibit.io/blog/covenant-compliance-monitoring-private-credit

**Chronograph, Canoe and Arcesium are adjacent but are actively moving into private credit**  
_Confidence: medium_

Chronograph provides portfolio monitoring, reporting and diligence for institutional private capital investors across PE, private credit, infrastructure, VC, co-investments and GP stakes; it serves 8 of the 10 largest private capital GPs and 5 of the 10 largest LPs, monitoring over $5.9 trillion of client invested capital across 15,000 funds and 258,000 private companies. Technical stack: cloud-based analytics, automated data collection, AI synthesis, turnkey data warehousing and real-time data replication. It launched AI capabilities for PE investors and is explicitly accelerating a new private credit portfolio monitoring platform with a strategic private-credit hire. Arcesium launched Arcesium Intelligence, an AI platform for institutional investment firms. These are equity-first platforms extending into credit — the same 'equity-first vs credit-native' seam Lumonic markets against.

Sources:
- https://www.chronograph.pe/
- https://www.prnewswire.com/news-releases/chronograph-continues-private-credit-expansion-with-strategic-hire-302694999.html
- https://www.prnewswire.com/news-releases/chronograph-launches-ai-capabilities-for-private-equity-investors-302117404.html
- https://www.crunchbase.com/organization/chronograph

**Hazeltree and LoanBoss serve covenant tracking in adjacent asset classes with reusable design patterns**  
_Confidence: high_

Hazeltree Debt Manager (treasury/portfolio finance for investment managers) tracks and manages credit facilities across multiple credit products, lenders and legal entities, and includes Covenant and Limit Management to manage and track facility covenants and limits, delivering near-real-time credit data and reducing risk of breaching critical covenants. LoanBoss is institutional-grade CRE debt management combining fully abstracted loan data and document management with live interest rate and forward curve data plus PMS integrations, automating prepayment and refi calculations, covenant calculations INCLUDING LOAN-SPECIFIC DEFINITIONS, and lender compliance. LoanBoss's explicit handling of loan-specific covenant definitions and live rate/forward-curve feeds into covenant maths is a pattern directly transferable to floating-rate private credit facilities.

Sources:
- https://hazeltree.com/resource/hazeltree-debt-managertm-streamlines-credit-facilities-management/
- https://www.hedgeweek.com/2021/06/03/301310/hazeltree-debt-manager-streamlines-credit-facilities-management
- https://www.loanboss.com/solutions
- https://www.loanboss.com/blog/beyond-abstraction-how-loanboss-transforms-debt-management

**Indicative market pricing and implementation timelines for the incumbent tier**  
_Confidence: low_

One comparison source states 2026 pricing runs from roughly $60,000/year for a single-module deployment to $300,000+ for full CRM plus portfolio monitoring plus IR, with implementation typically taking 3–6 months. Lumonic markets 'weeks vs months' implementation as an explicit differentiator against that baseline. CAVEAT: the pricing figures come from an SEO comparison site (workwisesolutions.org), not a vendor price list — treat as directional only, unverified. No vendor found publishes list pricing on its own site.

Sources:
- https://workwisesolutions.org/guides/best-private-credit-portfolio-monitoring-software.html
- https://www.lumonic.com/for-ai/best-covenant-compliance-software-private-credit-private-equity-2026
- https://wifitalents.com/best/private-credit-software/

**Full roster of every player identified, grouped by layer**  
_Confidence: medium_

COVENANT-NATIVE / MONITORING SPECIALISTS: Lumonic (PitchBook/Morningstar), CovenantIQ, Cardo AI, Oxane Partners, Termgrid, Cascade Debt, Polibit, BankStride, Henon, Resiliq, Ellis AI, PrivateCredit.AI, Aloan.ai, Anaptyss CovenAce, Centauri AI, timveroOS, Built (getbuilt.com). FUND-OPS / PORTFOLIO PLATFORMS: Allvue Systems (+ Nexius, Private Credit Monitor), eFront/BlackRock, FIS Private Capital Suite (formerly Investran), SS&C (Precision LM, private credit line), 73 Strings, Chronograph, S&P Global iLEVEL / iLEVEL Credit, Cobalt, Alma, Black Mountain Systems, Dynamo, Arcesium, Carta (Loan Operations). BANK / ENTERPRISE LENDING CORES: Finastra Loan IQ (+ Loan IQ Simplified Servicing), nCino, Moody's Lending Suite, Solifi, Decipher Credit, ABLSoft, Finsoft AssetReader. SERVICING / AGENCY / ADMIN: Alter Domus (Agency360, Agency CorPro, Asset Monitoring & Covenant Management), Solvas (Portfolio, Compliance, PoP, Accounting, Data), Maples Group, S&P WSO + WSO Compliance Insights, Monarch (consulting). DATA / DOCUMENT INTELLIGENCE: 9fin, Octus, Fitch Covenant Review / CreditSights, Accelex (reportedly Carta), Daloopa, Canoe Intelligence, Kira, Luminance, Harvey, Legora, Ontra Insight for Credit, V7 Go, LlamaIndex. MARKET INFRASTRUCTURE: Versana, Octaura, Oneiro Solutions, Loan Ecosystem. ADJACENT DEBT/TREASURY: Hazeltree Debt Manager, LoanBoss. CRM ADJACENCIES: DealCloud, Affinity, 4Degrees, MadeMarket, Navatar, Meridian.

Sources:
- https://workwisesolutions.org/guides/best-covenant-compliance-software-private-credit.html
- https://workwisesolutions.org/guides/best-private-credit-portfolio-monitoring-software.html
- https://aloan.ai/guides/best-covenant-monitoring-software
- https://www.bankstride.com/investmentfirms-pe-vcs-privatelenders-covenant-monitoring
- https://www.polibit.io/blog/covenant-compliance-monitoring-private-credit
- https://henon.ai/guides/private-credit-portfolio-management-software
- https://tracxn.com/d/companies/versana/__84egtr7lCidLEigMIBY02wS2_PtuojKO27S-0qBCm64
- https://www.4degrees.ai/blog/the-best-private-credit-crm-software-for-investment-teams

### Implications for QuarterMark
- FEATURE-PARITY CHECKLIST — INGESTION: (1) borrower financial upload via UI, email, SFTP and API; (2) accept monthly/quarterly/semi-annual/annual/LTM/YTD periods natively; (3) direct connectivity to borrower accounting systems (Xero, Sage, QuickBooks, NetSuite for UK/EU mid-market); (4) PDF/Excel/CSV parsing of management accounts and compliance certificates; (5) AI mapping of borrower chart of accounts to a canonical QuarterMark taxonomy; (6) reported vs adjusted versioning with side-by-side comparison; (7) renameable/custom financial fields per industry.
- FEATURE-PARITY CHECKLIST — EXTRACTION: (8) AI extraction of covenant definitions, levels, test dates AND reporting requirements from the executed credit agreement so the monitoring calendar self-builds; (9) extraction of EBITDA definition and permitted add-backs, negative covenants and carve-outs, MFN, events of default; (10) source-cell traceability — every extracted number and every calculated ratio clicks through to the exact page/clause/cell of origin. Build this as multi-pass, phase-by-phase extraction, NOT single-pass whole-document LLM parsing, which is documented to hallucinate.
- FEATURE-PARITY CHECKLIST — CALCULATION: (11) configurable covenant rule engine supporting loan-specific definitions (LoanBoss pattern) not just generic leverage/ICR/DSCR/FCCR; (12) three-state test results — pass / fail / cure-period — not binary; (13) an independent verification gate that cleans and validates data BEFORE any test executes; (14) headroom calculation and forward-projected headroom over facility life; (15) breach projection before quarter-end reporting deadlines; (16) borrowing base engine with eligibility criteria, concentration limits, advance rates and ineligibles from aging reports, with a lender-controlled vs borrower-initiated calculation mode; (17) what-if / scenario / sensitivity analysis and equity-cure modelling.
- FEATURE-PARITY CHECKLIST — WORKFLOW & GOVERNANCE: (18) configurable alerts on approaching / breached / overdue with escalation rules routing to the right role; (19) borrower portal with scheduled reporting reminders and document request tracking; (20) non-numerical covenant logging (affirmative, negative, information covenants) and borrower declarations; (21) immutable audit trail with timestamp and user attribution on every value, test and document — target SOC 2; (22) FULL amendment/waiver/equity-cure lifecycle: breach detection date, violation nature, borrower comms, negotiation history, restated covenant levels effective-dated, cure-right consumption counters, approval history, resolution. Item 22 is the market's thinnest area and should be QuarterMark's flagship depth claim.
- FEATURE-PARITY CHECKLIST — OUTPUT: (23) covenant compliance certificate generation; (24) fund/facility/borrower-level roll-up views (Termgrid's three-axis model); (25) watchlist and risk-rating workflow; (26) credit committee pack and lender reporting; (27) LP/investor reporting fed from the SAME monitored data with no reconciliation step; (28) an API and, increasingly expected, an MCP server exposing audit-ready portfolio data to the fund's own AI assistants — Lumonic has already shipped this and it is cheap for QuarterMark to match.
- POSITIONING: the credit-native vs equity-first seam is already being marketed by Lumonic, so QuarterMark cannot win on that alone. The defensible wedge is (a) depth on the amendment/waiver/cure lifecycle nobody has productised, (b) UK/European specificity — GBP/EUR facilities, SONIA/EURIBOR floating-rate covenant maths, UK GAAP/FRS 102 and IFRS borrower accounts, Companies House filings as a corroborating feed — where the leaders are US-centric, and (c) implementation in weeks with self-serve configuration, since incumbent implementations run 3-6 months.
- DO NOT COMPETE on benchmark data at launch. Allvue's percentile-benchmarking early-warning signal (leverage percentile +25pts over two quarters implies 67% breach probability within a year) is built on 1,933 issuances and 20 years of proprietary data; 9fin, Octus and Fitch Covenant Review own the 'what's market' question. Plan instead to consume or partner for benchmarks, and accumulate QuarterMark's own anonymised cross-client covenant dataset as a year-two moat — it is the only asset that compounds.
- BUY, DON'T BUILD, the commodity extraction layer initially. Accelex (portal/API/SFTP/email document acquisition, already connected to SS&C Intralinks and FIS Digital Data Exchange), Daloopa and Canoe are unbundled and buyable. Spend scarce solo-founder engineering on the covenant rule engine, the cure/amendment state machine and the traceability graph — those are the hard, defensible parts.
- THREAT TIMING: Ellis AI is $10m-funded as of 31 July 2026 and four days old relative to today; Chronograph is actively hiring into private credit; S&P shipped WSO Compliance Insights in Nov 2025 and covenant monitoring into iLEVEL Credit. The window on 'AI covenant extraction' as a differentiator is effectively closed — it is now table stakes. Lead with workflow depth and regional fit, not with AI extraction as the headline.
- INTEGRATION TARGETS for a UK/EU fund of this size: Alter Domus (Agency360/CorPro) and Solvas hold authoritative loan-servicing data for many such funds; Versana offers real-time agent-bank facility data across $4.1tn notional. Building read-integrations to the administrator layer early makes QuarterMark additive rather than a rip-and-replace, which is the only realistic sale into a £50m-£500m fund that already outsources its middle office.


---

## v2:ae3dac4424721addd0257f77a4dbdd2c99b7b580901272405350164d627fc250

### Summary
Allvue Systems is the merged product of AltaReturn (PE/VC/family-office back office) and Black Mountain Systems (credit front office, the "Everest" lineage), combined in September 2019, HQ Miami. It publicly claims $8.5T assets tracked, ~21,000 funds and ~500 clients globally, and historically 50 of the top 100 CLO managers. The product surface is broad but modular: roughly 23 named solutions spanning front office (Portfolio Management, Research Management, Trade Order Management, Compliance, Pipeline Management), middle/back office (Investment Accounting, Fund Accounting, Corporate Accounting, Portfolio Monitoring), investor-facing (Investor Portal, Fundraising, Investor & Investment Management), carry/comp (FirmView, ex-PFA Solutions), and a newer data/AI layer (Nexius Data Platform, Nexius Intelligence, Nexius Data Sets, Portfolio Intelligence, Agentic AI Platform with "Andi" and "Document IQ", Credit Research Solutions). For private credit specifically, the covenant story is more concrete than most competitors: Allvue explicitly claims it "automatically calculates and monitors covenants" from deal-level financials rather than merely storing borrower-reported values, tracks LTM Revenue, EBITDA, Total Leverage and Interest Coverage with period-on-period deltas, monitors covenant headroom continuously, and in 2025-26 layered on percentile-based peer benchmarking (their published stat: a 25-point leverage-percentile jump over two quarters implies a 67% chance of covenant breach within a year). Document IQ is a managed-service AI spreading product powered by Claira with explicit human-in-the-loop validation — announced Jan 2025 with BC Partners as first customer, formally launched in the Oct 2025 AI/data announcement alongside Portfolio Optimizer (powered by Loan Hunter) and a Passthrough investor-onboarding integration. Infrastructure is Microsoft Azure plus Snowflake for the data platform, with Fund Accounting built on Microsoft Dynamics 365 Business Central. Compliance credentials are strong and well-publicised via a Trust Center: 2025 SOC 1 Type II and SOC 2 Type II with unqualified opinions, ISO 27001, GDPR, EU-US/UK/Swiss Data Privacy Frameworks, DORA, CCPA, 23 NYCRR 500 and EU AI Act, plus penetration test reports and BC/DR test results. The single biggest exploitable weakness is the bottom of the market: Allvue's own "Essentials" packaging targets emerging managers, pricing is enterprise-opaque (no public list price; third-party estimates of six-figure annual spend and multi-year TCO in the hundreds of thousands to millions), and public review volume is astonishingly thin — Capterra and Software Advice each carry effectively one review, so there is very little independent UI/UX evidence in either direction.

### Findings

**Allvue sells approximately 23 discretely named solutions/modules, listed publicly on their solutions index**  
_Confidence: high_

Complete list with URLs: Agentic AI Platform, Nexius Data Platform, Nexius Intelligence, Nexius Data Sets, Portfolio Intelligence, Fund Accounting, Investment Accounting, Corporate Accounting, Portfolio Monitoring, Portfolio Management, Research Management, Credit Research Solutions, Trade Order Management, Octaura (partner solution), Compliance, Fund and Project Finance (subscription-line and NAV lending), Pipeline Management, Investor Portal, Fundraising, Investor & Investment Management, FirmView (formerly PFA Solutions), Carry and Compensation Management, Compensation Planning and Recommendations. Industry-level packaging exists on top: Private Debt, Private Equity, CLO Managers, Banks, Insurance Companies, General Partners. Allvue markets a shared/unified data model so data entered at fundraising flows to LP accounting without re-entry.

Sources:
- https://www.allvuesystems.com/solutions/
- https://www.allvuesystems.com/industries/
- https://www.allvuesystems.com/industries/private-debt/

**The private debt offering bundles front office, accounting, investor portal and data layer under one platform**  
_Confidence: high_

Private-debt page names: Portfolio Management (dashboards, interactive reports), Research Management, Trade Order Management, Portfolio Monitoring (portfolio-company data collection), Investment Accounting (browser-based; loans, bonds, revolvers; dual-record accounting; PIK toggles, amendments, waterfall structures, multi-currency facilities), Fund Accounting, Corporate Accounting, Financial Tracking Automation (deal-level financials + automated covenant calculation with real-time breach flagging), Document IQ, Investor Portal, Investor & Investment Management, Fundraising, Pipeline Management, Business Intelligence, Customizable Reporting, Nexius Intelligence, Nexius Data Platform, Nexius Data Sets, Compliance, Private Debt Essentials, Octaura, FirmView. Supported strategies: direct lending, mezzanine, broadly syndicated loans, CLOs, asset-based lending, multi-strategy credit.

Sources:
- https://www.allvuesystems.com/industries/private-debt/
- https://www.allvuesystems.com/solutions/investment-accounting/

**Allvue claims covenants are AUTOMATICALLY CALCULATED by the system, not merely stored from borrower reports**  
_Confidence: high_

The private debt marketing and the 'Allvue in Action' demo both state the software lets fund managers 'track and more easily analyze deal-level financials and automatically calculate and monitor covenants,' with 'real-time breach flagging.' Portfolio Management page independently states the platform provides 'real-time exposure monitoring, covenant tracking, issuer-level risk analytics, and scenario modeling' and lets teams 'flag covenant breaches' directly in-platform. This is the key architectural claim to match: a calculation engine over spread financials, not a covenant register. Note: no public source discloses the covenant definition language, formula editor, EBITDA add-back handling, cure/equity-cure mechanics, or test-frequency configuration — that detail is behind sales/demo only.

Sources:
- https://www.allvuesystems.com/industries/private-debt/
- https://www.allvuesystems.com/solutions/portfolio-management/
- https://www.allvuesystems.com/resources/allvue-in-action-automating-financial-and-covenant-tracking/

**Portfolio Intelligence is the named covenant/KPI analytics workspace and specifies the exact metrics tracked**  
_Confidence: high_

Tracks LTM Revenue, EBITDA, Total Leverage and Interest Coverage with period-on-period deltas in a unified dashboard, auto-populated from existing Credit Front Office data with no migration or re-entry. Provides continuous monitoring of covenant headroom with borrower-level drill-down, explicitly positioned as replacing 'quarterly spreadsheet reviews' with an always-current risk view. Includes Deal Analytics (built on Nexius Intelligence) benchmarking leverage, interest coverage, loan-to-value and covenant structures against private-credit market data rather than public proxies. Custom peer cohorts definable by sector, geography, EBITDA range and inception year, which persist and auto-refresh. Andi generates borrower snapshots and quarterly commentary via guided prompts. Exports to PDF and Excel for IC packs and LP reporting.

Sources:
- https://www.allvuesystems.com/solutions/portfolio-intelligence/

**Allvue's differentiated covenant methodology is percentile-based peer benchmarking with a published back-test statistic**  
_Confidence: high_

Rather than testing only against a fixed contractual threshold, Allvue compares a borrower's metric to a peer percentile over time. Published worked example: a borrower's leverage rises 4.5x to 5.9x against a 6.0x covenant — technically compliant — but its leverage percentile moves from the 60th to the 93rd, relocating it into the highest-risk decile. Published back-test: when a borrower's leverage percentile jumps 25+ points over two quarters, there is a 67% probability of a covenant breach within a year. The platform 'continuously ingests compliance and amendment notices' and converts quarterly updates into 'dynamic heatmaps of risk.' All benchmark data is anonymised and used only with client consent. Cohort construction methodology (exact industry/size/geography definitions) is not published.

Sources:
- https://www.allvuesystems.com/resources/allvue-alpha-systematic-covenant-monitoring/
- https://www.allvuesystems.com/solutions/portfolio-intelligence/

**Allvue Private Credit Monitor is a published market-data product derived from their client base**  
_Confidence: high_

Analyses 1,933 new issuances since 2022 drawing on a proprietary database spanning ~20 years of private markets data across Nexius Intelligence and Nexius Data. Reports covenant prevalence by type (leverage-only maintenance covenants, interest coverage, fixed charge coverage, covenant-lite), median leverage by covenant type, leverage dispersion across vintages, and sponsor-backed transaction leverage. Headline finding: covenant-lite loans consistently carry 0.7x to 1.7x higher median leverage. Data extends through 1H 2025. Publication cadence not explicitly stated (unverified whether quarterly).

Sources:
- https://www.allvuesystems.com/allvue-private-credit-monitor/
- https://uktechnews.co.uk/2026/05/23/allvue-private-credit-monitor-covenant-structures-shift-as-market-matures/

**Document IQ is an AI financial-spreading product powered by Claira, sold as a managed service with human-in-the-loop QA**  
_Confidence: high_

Announced with BC Partners as first customer 27 January 2025; formally featured in the 21 October 2025 AI/data announcement. Ingests borrower credit financials (financial statements, credit agreements referenced) and extracts 'dozens of key metrics' populated directly into Allvue portfolio management templates via pre-built, tested integrations across Allvue's financial operations modules. Uses NLP interpretation. Explicitly combines AI extraction with 'human-in-the-loop validation for accuracy and auditability,' delivered as an optional fully managed service. Allvue describes Claira as the first of 'an array of best-in-class document extraction AI technology providers' in a partner ecosystem — i.e. Allvue is an orchestrator, not the model builder. NO accuracy percentage, turnaround SLA, or per-field confidence scoring is published anywhere.

Sources:
- https://www.allvuesystems.com/resources/automating-private-market-financial-operations-with-allvue-document-extraction/
- https://www.allvuesystems.com/news/allvue-announces-new-ai-and-data-innovations-to-deliver-transparency-efficiency-and-connection-to-private-markets/
- https://www.claira.io/insights/bc-partners-scales-analyst-ai-tools-with-claira-powered-allvue-document-iq
- https://finance.yahoo.com/news/bc-partners-expands-collaboration-allvue-140000506.html

**Andi is a browser-extension AI assistant, currently guidance-oriented rather than autonomous**  
_Confidence: high_

Delivered as Chrome and Edge extensions, deployed for Fund Accounting and Credit Front Office. Supports workflows in Fund Accounting (capital calls, issuer setup), Trade Order Management, Compliance (rule interpretation), and Portfolio Management (trade execution). Described as drawing on product documentation to help users 'navigate workflows, solve problems faster, and access accurate product guidance,' and in Portfolio Intelligence it generates borrower snapshots and quarterly commentary from guided prompts. It is positioned as embedded, operating on 'live, governed data' inside existing interfaces. Notably this is closer to an in-app copilot than an autonomous covenant agent.

Sources:
- https://www.allvuesystems.com/solutions/agentic-ai-platform/
- https://www.allvuesystems.com/solutions/portfolio-intelligence/

**Nexius Data Platform is built on Snowflake + Microsoft Azure with an open API and BI Hub**  
_Confidence: high_

Named components: proprietary entity matching engine harmonising investment data across systems; open API architecture connecting CRMs, fund accounting platforms and third-party data providers; streaming connectors for real-time delivery; bulk extraction and flat-file distribution; secure Snowflake share delivery; BI Hub for self-service modelling and querying; Power BI integration; role-based access with entitlements; semantic data layer with governed access and lineage tracking; standardised private-markets schema; full metadata and provenance tracking for auditability; business glossary supporting natural-language analytics. Automates investor onboarding, transaction booking, subledger reconciliation and deal-pipeline synchronisation.

Sources:
- https://www.allvuesystems.com/solutions/nexius-data-platform/

**Named integrations and partners are surprisingly few and mostly service-firm rather than technology connectors**  
_Confidence: medium_

Technology/product integrations explicitly named: Octaura (two-way API, electronic BSL loan trading, direct liquidity-pool access); Claira (document extraction AI); Loan Hunter (powers Portfolio Optimizer); Passthrough (investor onboarding, integrating Allvue Fundraising + Investor Portal, announced mid-Oct 2025); Microsoft Dynamics 365 Business Central, Microsoft Azure, Microsoft SharePoint, Snowflake, Power BI (infrastructure); Moody's (cited by a user review as integrated). Holland Mountain ATLAS publishes an Allvue connector. Services partners: KPMG, Alpha Alternatives, TenDelta. Fund administrator partners: Standish Management, RSM, Apex Group, IQ-EQ, Alter Domus, Trident Trust, 4Pines, Permian, Phoenix Fund Services Group. No public developer API documentation portal was found — API existence is asserted in marketing but not documented publicly (unverified).

Sources:
- https://www.allvuesystems.com/about/partners/
- https://www.allvuesystems.com/industries/clo-managers/
- https://www.allvuesystems.com/solutions/nexius-data-platform/
- https://hollandmountain.com/atlas-connector/allvue/
- https://www.allvuesystems.com/news/article-morningstar-allvue-systems-and-passthrough-announce-strategic-integration-to-streamline-private-markets-fundraising-and-investor-onboarding/

**Security and compliance posture is extensive and publicised via a dedicated Trust Center**  
_Confidence: high_

2025 SOC 1 Type II and SOC 2 Type II examinations, both with clean/unqualified opinions; SOC 2 Type II report downloadable from trust.allvuesystems.com; SOC bridge letter available. ISO 27001 certified. Frameworks addressed: GDPR, EU-US Data Privacy Framework plus UK Extension and Swiss-US DPF, DORA, CCPA, 23 NYCRR 500, EU AI Act. Documents published: Information Security FAQ (Credit & Equity 2026), Business Continuity & DR documentation, DR test plans and results for both Credit and Equity stacks, penetration test report, security whitepaper, financial stability letter, AML letter, cyber insurance documentation, subprocessor list, Data Privacy Addendum, AI Acceptable Use Policy, AI Terms & Conditions, Acceptable Use Policy, System Monitoring Policy, Endpoint Protection Policy, ESG in Business Practice. Continuous vulnerability scanning and annual penetration tests. DORA coverage matters directly for EU clients.

Sources:
- https://trust.allvuesystems.com/
- https://www.allvuesystems.com/cybersecurity/

**Deployment is cloud/SaaS on Microsoft Azure; Fund Accounting sits on Dynamics 365 Business Central**  
_Confidence: medium_

Fund Accounting is delivered on Microsoft Dynamics 365 Business Central hosted on Microsoft Azure with a multi-layered security stack across physical datacentres, infrastructure and operations. Investment Accounting is a browser-based .NET application 'built from the ground up to be real-time and transaction-oriented.' Nexius sits on Snowflake + Azure. Investor Portal leans on SharePoint and Azure. AltaReturn extended its SaaS cloud platform into Europe pre-merger. Allvue does NOT appear to use AWS. Whether an on-premise or private-cloud deployment option still exists for legacy Black Mountain credit clients is unverified.

Sources:
- https://www.allvuesystems.com/solutions/fund-accounting/
- https://www.allvuesystems.com/solutions/investment-accounting/
- https://www.allvuesystems.com/solutions/nexius-data-platform/
- https://www.allvuesystems.com/news/altareturn-extends-saas-cloud-platform-into-europe/

**Loan/investment accounting depth is a genuine moat: lot-level accruals, dual-record accounting, amendment tracking**  
_Confidence: high_

Tracks and accounts for all investments with accruals, cash flows, positions and P&L calculated at LOT LEVEL. Dual-record accounting provides 'natural cross-checks, preventing things like hanging receivables from going unnoticed' — errors caught at transaction entry rather than in downstream reconciliation. Handles complex loan modifications, amendment tracking and non-cash income accruals including PIK toggles. Asset coverage: broadly syndicated loans, private debt loans and bonds, corporate and muni bonds, ABS/MBS, equities, FX, derivatives, with new asset types added regularly. Loan principal activity tracking, loan transaction and notice management, full position-history transparency. Flows into Fund Accounting via a 'Consolidated Back Office' combining Investment Accounting and Fund Accounting on a single platform.

Sources:
- https://www.allvuesystems.com/solutions/investment-accounting/
- https://www.allvuesystems.com/industries/clo-managers/

**The Compliance module is a rules engine with a large pre-built test library across trade lifecycle stages**  
_Confidence: high_

Testing at hypothetical, pre-trade, trade-allocation, post-trade and ongoing-monitoring stages. Pre-built test libraries for US and Euro CLO structures (OC tests, IC tests, concentration limits, quality tests, eligibility criteria), plus 40 Act, UCITS, BDC, SMA, Leverage Facility, Borrowing Base and Muni Fund tests. Restriction capabilities settable for trades, issuers, assets and counterparties. Pre-trade checks run inside the trade blotter with results immediately visible to PMs, no external data export required. Shares a real-time security master and data warehouse with other modules. Andi assists with rule interpretation and configuration navigation. Independent fund setup and test configuration by clients (i.e. self-service rule authoring).

Sources:
- https://www.allvuesystems.com/solutions/compliance/
- https://www.allvuesystems.com/industries/clo-managers/

**Portfolio Monitoring handles portfolio-company data collection with configurable templates and ILPA support**  
_Confidence: high_

Collects financial statements, operational metrics, ESG data and custom KPIs from portfolio companies. Data collection workflows configurable by fund and strategy, supporting both standard templates and bespoke reporting frameworks. Portfolio companies submit through a portal interface. Built-in data checks and validation; users configure input screens, data checks and reports and overlay custom processes. Supports ILPA reporting templates including the updated ILPA GP-LP Reporting Framework released January 2025. Outputs: dynamic dashboards, self-service reporting, customisable reports with drill-down, and an 'IRR Hub' for performance forecasting. Direct integration with fund accounting and investor reporting modules.

Sources:
- https://www.allvuesystems.com/solutions/portfolio-monitoring/

**Credit Research Solutions provides the underwriting-side workflow that feeds covenant monitoring**  
_Confidence: high_

Centralises qualitative and quantitative credit data — analyst commentary, underwriting analysis, investment rationale, financial models. Financial spreading via Document IQ into standardised templates. Supports analyst credit and industry commentary alongside financial models and third-party data for rating/credit-quality determination. Structured approval workflows with full audit trails covering pipeline reviews, decisions and monitoring. Customised alerts giving real-time notification on key events including watchlist credits and securities. A 'deal history tracker' maintains fully audited investment records providing historical context for covenant compliance assessment. Connects to Portfolio Management, Trade Order Management and Compliance.

Sources:
- https://www.allvuesystems.com/solutions/credit-research-solutions/

**Private Debt Essentials is Allvue's down-market packaging, launched 27 June 2024, with conflicting stated AUM thresholds**  
_Confidence: medium_

Announced 27 June 2024 as a packaged suite for emerging private debt managers covering the investment lifecycle: a customisable portal, self-service dashboards, real-time visibility into management reporting, complex loan structure management and credit performance monitoring. Composition described elsewhere as Portfolio Management + Research Management + Investment Accounting. IMPORTANT CONFLICT: one Allvue source states the target is managers under $5B AUM while another states under $1B committed capital — treat the exact threshold as UNVERIFIED. No public pricing or implementation timeline for Essentials was found.

Sources:
- https://www.allvuesystems.com/news/allvue-systems-launches-dedicated-essentials-platform-for-emerging-private-debt-managers/
- https://www.businesswire.com/news/home/20240627722995/en/Allvue-Systems-Launches-Dedicated-Essentials-Platform-for-Emerging-Private-Debt-Managers
- https://www.allvuesystems.com/industries/general-partners/
- https://www.allvuesystems.com/industries/private-debt/

**Portfolio Optimizer (powered by Loan Hunter) is an AI trade-modelling tool for credit and CLO managers**  
_Confidence: high_

Announced in the 21 October 2025 AI and data innovations release. Features unified data integration, AI-powered trade modelling, automated compliance monitoring and workflow integration; simulates trades and evaluates portfolio impact 'within seconds.' Same announcement introduced Mack Santora as Head of Artificial Intelligence, Dmitri Sedov as Chief Data and Analytics Officer and Mike Dionne as Chief Commercial Officer (the latter two from London Stock Exchange Group) — signalling a serious data-product build-out.

Sources:
- https://www.allvuesystems.com/news/allvue-announces-new-ai-and-data-innovations-to-deliver-transparency-efficiency-and-connection-to-private-markets/

**Public review evidence on UI/UX is extremely thin — this is a genuine information gap, not a positive signal**  
_Confidence: low_

Capterra shows 5.0/5 from a SINGLE review (Feb 2021, banking, 5,001-10,000 employees): Ease of Use 5.0, Value for Money 5.0, Functionality 5.0, Customer Support 4.0. Software Advice mirrors the same single review. The listed price of '$1.00 flat rate per year' on Capterra/Software Advice is a directory placeholder artifact, NOT real pricing — do not treat as a fact. G2's Allvue reviews page returned HTTP 403 and could not be read. Praise themes present: smooth/easy implementation with a vendor team that listened and set clear timelines, excellent uptime, genuine integration of portfolio processes including Moody's, hours-to-minutes time savings, configurable reporting for varied investor requests, one-click data upload and aggregation, good support for distributed teams across time zones. The only recurring criticism surfaced in search snippets is that Allvue is 'expensive' and 'heavy, with some limited access on the cloud version' — this snippet is UNVERIFIED as I could not open the underlying review page. Glassdoor has 190 employee (not customer) reviews, which are not evidence about the product.

Sources:
- https://www.capterra.com/p/122634/Allvue-Systems/reviews/
- https://www.softwareadvice.com/equity-management/allvue-profile/
- https://www.g2.com/products/allvue/reviews
- https://www.glassdoor.com/Reviews/Allvue-Systems-Reviews-E3078625.htm

**Pricing is fully opaque with no public list price; third-party estimates suggest enterprise-scale spend**  
_Confidence: unverified_

Allvue publishes no standard package pricing on any product page; quotes are custom by firm size, module count, deployment type and user count. Third-party aggregators (Vendr, pricingnow.com) cite a 'redline threshold' figure around $420k and suggest three-year TCO from $500k into the millions for comparable implementations, plus one-time implementation, data migration, training, customisation and professional services fees. TREAT ALL SPECIFIC NUMBERS AS UNVERIFIED — these are aggregator estimates, not Allvue-published figures, and I could not corroborate them against a primary source.

Sources:
- https://www.vendr.com/marketplace/allvue-systems
- https://pricingnow.com/question/allvue-pricing/
- https://www.capterra.com/p/122634/Allvue-Systems/

**Company scale, provenance and current market claims**  
_Confidence: high_

Formed September 2019 by combining AltaReturn (PE, VC, family office, real estate) with Black Mountain Systems (credit investor workflow software), backed then by Vista Equity Partners; HQ Miami with offices in North America, Europe and Asia. At merger: 50 of the top 100 CLO managers, $2.5T assets, 90,000 LPs, $60bn family office assets. Current published claims: $8.5T assets tracked, 21,000 funds, 500+ clients globally. Recent proof point: Symetra Investment Management went live on Allvue's CLO solution and closed Symetra CLO 2025-1 Ltd, a $408m transaction, in April 2025.

Sources:
- https://www.allvuesystems.com/news/altareturn-and-black-mountain-systems-combine-to-form-allvue-systems-2/
- https://www.businesswire.com/news/home/20190923005618/en/AltaReturn-Black-Mountain-Systems-Combine-Form-Allvue
- https://www.allvuesystems.com/news/symetra-investment-management-goes-live-with-allvue-systems-clo-solution/
- https://www.allvuesystems.com/

### Implications for QuarterMark
- Covenant parity floor: QuarterMark must CALCULATE covenants from spread financials, not store borrower-reported ratios. Allvue's explicit claim is 'automatically calculate and monitor covenants' with real-time breach flagging. A covenant register without a calculation engine is below the parity line before you start.
- Minimum metric set to match Portfolio Intelligence on day one: LTM Revenue, EBITDA, Total Leverage, Interest Coverage, each with period-on-period deltas, plus continuous covenant headroom with borrower-level drill-down. Add Fixed Charge Coverage and LTV (both named in Private Credit Monitor and Deal Analytics) to exceed it.
- Depth opportunity where Allvue publishes nothing: EBITDA add-back schedules and adjustment audit trails, equity cure and cure-count tracking, covenant definition/formula authoring per credit agreement, test-frequency and reporting-deadline calendars, grace periods, step-down schedules, and reconciliation of borrower-certified compliance certificates against your own recomputation. None of this is publicly evidenced in Allvue — it is the most defensible depth wedge.
- Allvue's benchmarking moat is data network effects, not code: 1,933 issuances since 2022, 20 years of data, anonymised with client consent, cohorts by sector/geography/EBITDA range/inception year. QuarterMark cannot replicate this at launch. Do not compete on peer percentiles initially; compete on single-borrower forensic depth and on trajectory/early-warning logic that works with n=1 (trend breaks, quality-of-earnings drift, add-back inflation, forecast-vs-actual variance).
- Their published back-test (25-point leverage-percentile jump over two quarters implies 67% breach probability within a year) is the exact kind of quantified claim you will be measured against in sales conversations. Have a defensible early-warning statistic of your own, computed on your own data, or explicitly reframe the conversation away from percentile benchmarking.
- Document extraction parity is achievable and Allvue is beatable here: Document IQ is Claira-powered with human-in-the-loop and an optional MANAGED SERVICE, publishes no accuracy metric, and outputs 'dozens of key metrics.' A modern LLM extraction pipeline with per-field confidence scores, source-page citation back to the PDF, and an inline reviewer UI would be a demonstrably better product than a managed-service handoff.
- Compliance credentials are table stakes for UK/EU private credit buyers: budget early for SOC 2 Type II and ISO 27001, and note that Allvue publicises DORA, GDPR, UK Extension to the EU-US DPF and EU AI Act coverage via a public Trust Center. A published trust page with downloadable pen-test summary and DR test results is a cheap credibility equaliser against a $8.5T-scale incumbent.
- Infrastructure signal: Allvue runs Azure + Snowflake + Dynamics 365 Business Central, with Fund Accounting effectively an ERP overlay. That stack is heavy and slow to change. Next.js 15 + Postgres is a legitimate speed advantage — ship covenant depth quarterly where they ship annually.
- Integration surface to target for parity: an open REST API, Snowflake/warehouse share or flat-file export, Power BI/Excel outputs, and connectors toward fund administrators. Note Allvue's admin partner list (Alter Domus, Apex, IQ-EQ, RSM, Standish, Trident, 4Pines) — these are the same firms your £50m-£500m UK/EU targets outsource to, so an admin-friendly data contract is a distribution channel, not just a feature.
- Export formats are load-bearing: Allvue ships PDF and Excel exports of benchmarking and financial analysis explicitly framed for portfolio reviews, investment committees and LP reporting. IC-pack and LP-report generation must be first-class output, not an afterthought.
- Do not build breadth. Allvue's 23 modules include fund accounting, corporate accounting, trade order management, CLO compliance test libraries (OC/IC tests, 40 Act, UCITS, BDC, SMA), carry and compensation, and an investor portal. Chasing that surface is unwinnable solo. Instead be the covenant system of record that COEXISTS with an incumbent or an administrator, with clean import/export.
- Wedge is confirmed at the bottom of the market: Allvue's own answer to small managers is a packaged 'Essentials' bundle (threshold stated inconsistently as under $1B committed capital or under $5B AUM), with opaque enterprise pricing and no self-serve motion. A £50m-£500m AUM UK fund is below or at the edge of their comfortable engagement. Transparent pricing and days-not-quarters onboarding are direct counter-positioning.
- Public product evidence is thin — G2 blocked, one Capterra review, no developer API docs portal, no covenant screenshots. This cuts both ways: you cannot fully verify their depth, and prospects cannot either. Publishing real covenant screenshots, a public API reference and honest methodology docs is an asymmetric trust play against an incumbent that shows almost nothing.
- Track two Allvue capabilities that could commoditise your differentiation: Nexius Intelligence benchmarks (widening) and Andi moving from in-app copilot to autonomous covenant agent. Andi is currently documentation-and-commentary oriented, not an analysis agent — that gap is your current window.


---

## v2:1b2919a4a5465d67b6895f3a565ba3a62d1ab744e921c091e1bff7faf56f82c6

### Summary
I researched the 2025–26 state of the art for extracting structured data from long financial/legal PDFs with page-and-bbox provenance, verifying every product claim against official documentation. On parsing: Azure AI Document Intelligence, AWS Textract, Google Document AI, Reducto, LlamaParse, Unstructured, Docling and Marker all return per-element bounding boxes with 1-indexed page numbers, but their coordinate conventions differ materially — Azure uses inches for PDFs and pixels for images, Textract and Google use 0–1 normalized ratios, Reducto uses normalized left/top/width/height, Docling and Marker use PDF-space polygons. The critical negative finding is that native LLM PDF understanding does NOT give you bounding boxes: Anthropic's Citations API grounds PDF citations only to `page_location` (start/end page number), and Gemini's box output is image-space `[y0,x0,y1,x1]` scaled 0–1000 for images, not a document-parse provenance layer. That forces a two-layer architecture for QuarterMark: a deterministic parser owns geometry, and the LLM owns semantics, joined by character spans. For 300-page credit agreements the emerging best practice is two-stage layout-then-extract with clause-level (not fixed-size) chunking, a separately-built definitions index so defined terms used far from their definition can be resolved, cross-references attached as chunk metadata, and per-field citations carrying page + bbox + verbatim source text. For click-a-number-see-the-source, the standard technique is to store normalized bbox + page with each extracted field and render a positioned overlay over a PDF.js canvas, using `PageViewport.convertToViewportRectangle` to handle PDF's bottom-left origin, scale and rotation; in React the realistic library choices are react-pdf (raw pdf.js rendering, you own the overlay), react-pdf-viewer's highlight plugin, or react-pdf-highlighter-extended. On confidence and HITL the market has moved against managed services — AWS SageMaker A2I is closed to new customers and Google's Document AI HITL is deprecated — so QuarterMark must build its own review queue; Azure's guidance (confidence 0–1, target ~100% for financial records, drill table→row→cell) is the most usable published rubric. On benchmarks, Reducto's RD-TableBench (1,000 tables, Needleman-Wunsch scoring) reported Reducto 90.2 / Azure 82.7 / Textract 80.9 / GPT-4o 76.0 / LlamaParse 74.6 / Unstructured 60.2, but it is vendor-published and now dated; Marker reports 76.0% on olmocr-bench. Financial-table failure modes cluster tightly: multi-page continuation with vanished headers, merged and borderless cells, footnotes landing far from the row they modify, rotated tables, and lost negative signs. Legal-AI vendors publicly converge on "every output cites the source paragraph, one click away" — Harvey Vault claims 96% key-term extraction accuracy across up to 100,000 files per vault — and the category has consolidated (Workday bought Evisort for ~$311m, Sirion bought Eigen).

### Findings

**Azure AI Document Intelligence returns per-word polygons plus 1-indexed page numbers, but PDF coordinates are in INCHES while image coordinates are in pixels**  
_Confidence: high_

The v4.0 (2024-11-30) analyze response wraps geometry in `boundingRegions`, each with a `pageNumber` (1-indexed) and a `polygon` — a 4-vertex quadrilateral given clockwise as top-left, top-right, bottom-right, bottom-left. Docs state explicitly: "In general, unit of measure for images is pixels while PDFs use inches." Every level carries geometry: `pages[].words[].polygon`, lines, paragraphs (with `role`: pageHeader/pageFooter/title/sectionHeading/footnote), `tables[].cells[]` with row/column indices and spans, `figures[]`, and `sections[]` for hierarchical structure. Extracted document fields carry `content`, `boundingRegions`, `confidence` and `spans` (character offset+length into the top-level `content` string). Caveat for QuarterMark: bounding regions are only returned for RENDERED files — docx/xlsx/pptx/html are not rendered and get no geometry. For a Postgres schema this means you must store a per-page unit and page width/height, not assume pixels.

Sources:
- https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/analyze-document-response?view=doc-intel-4.0.0
- https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0

**AWS Textract returns geometry as 0–1 normalized ratios of page width/height, for both BoundingBox and Polygon, at WORD/LINE/TABLE/CELL/KEY_VALUE_SET/LAYOUT_* granularity**  
_Confidence: high_

`Geometry.BoundingBox` has `Width`, `Height`, `Left`, `Top`, each "a ratio of the overall document page" with values between 0 and 1; `Geometry.Polygon` is an array of `{X, Y}` Points, also normalized 0–1. AWS documents the conversion explicitly (multiply X/Width by page pixel width, Y/Height by page pixel height). Every `Block` carries `Confidence` (0–100 percentage, not 0–1 — differs from Azure) and `BlockType`. Blocks link via a `Relationships` array of type CHILD or VALUE; children do not know their parents. `DocumentMetadata.Pages` gives page count. Textract Queries is directly relevant to covenant extraction: you pass natural-language questions and get back `QUERY` blocks (with `Query.Text` and `Query.Alias`) related by an ANSWER relationship to `QUERY_RESULT` blocks carrying `Confidence` and `Text`; the docs state the response provides "a location of the answer on the page", though the abbreviated JSON sample in the docs omits the Geometry field.

Sources:
- https://docs.aws.amazon.com/textract/latest/dg/text-location.html
- https://docs.aws.amazon.com/textract/latest/dg/how-it-works-document-layout.html
- https://docs.aws.amazon.com/textract/latest/dg/queryresponse.html

**Google Document AI gives per-token bounding boxes with both raw and normalized vertices, plus textAnchor character offsets — but silently omits zero coordinates**  
_Confidence: high_

The Document object nests `pages[] > blocks[] > paragraphs[] > lines[] > tokens[]`, each with a `layout` containing `boundingPoly` (with `vertices` in original image coordinates and `normalizedVertices` in [0,1]) and a `textAnchor` with `textSegments[]` carrying `startIndex`/`endIndex` into the document-level text. `pages[].pageNumber` is 1-based. Extracted fields appear in `entities[]` with `confidence`, `textAnchor` and `pageAnchor`. Critical gotcha the docs call out: "When the API detects a coordinate value of 0, that coordinate is omitted in the JSON response" — naive deserialization will mis-place boxes touching the page edge.

Sources:
- https://docs.cloud.google.com/document-ai/docs/handle-response

**Reducto is the only vendor in this comparison whose EXTRACT endpoint (not just parse) returns per-field citations with page + bbox + source text + confidence, gated behind a single flag**  
_Confidence: high_

Setting `generate_citations: true` on `client.extract.run(...)` returns a `citations` field alongside `result`. Each citation carries `bbox` with `left`, `top`, `width`, `height` plus `page` and `original_page`; coordinates are normalized to [0,1] relative to the top-left corner for PDFs and images (for spreadsheets, `left`/`top` are 1-indexed row/column and `page` is the sheet index). Citations also carry `confidence`, `content` (the extracted text), `type`, `parentBlock` (the larger containing block, useful for showing surrounding clause context), and `image_url`. Reducto frames this explicitly as enabling "audit trails for regulated workflows". Endpoints: Classify, Parse, Extract, Split, Edit, Pipelines. This is the closest off-the-shelf match to QuarterMark's click-a-number requirement.

Sources:
- https://docs.reducto.ai/v/legacy/extraction/citations
- https://docs.reducto.ai/overview

**LlamaParse now supports word-, line- and cell-level bounding boxes explicitly for 'audit-grade citations', beyond its older block-level extract_layout**  
_Confidence: high_

Two separate features. (1) `extract_layout=True` with JSON output attaches a `layout` property per page containing BBox objects (`x`, `y`, `width`, `height`, plus optional confidence, end index in the text, a `label`, and rotation angle in degrees) for tables, figures, titles, text and lists. (2) Newer granular bounding boxes are enabled via `output_options.granular_bboxes`, an array accepting `"word"`, `"line"` and/or `"cell"`; an empty list (the default) disables them and returns only item-level boxes. LlamaIndex names the two intended use cases as audit-grade citations (highlighting extracted financial figures at word/line/cell level when a user clicks a citation) and high-precision redaction. Important limitation stated by LlamaIndex: only text explicitly present in the document gets coordinates — inferred values and AI-generated summaries do not. That directly constrains what QuarterMark can make clickable: a computed leverage ratio has no bbox, only its inputs do.

Sources:
- https://www.llamaindex.ai/blog/announcing-granular-bounding-boxes-in-llamaparse
- https://docs.cloud.llamaindex.ai/llamaparse/features/layout_extraction

**Unstructured.io attaches coordinates as `element.metadata.coordinates` with an explicit named coordinate SYSTEM, and `page_number` separately**  
_Confidence: high_

`metadata.coordinates` contains `points` — "the corners of the bounding box starting from the top left corner and proceeding counter-clockwise" — and `system`, a named coordinate system (e.g. `PixelSpace`) carrying name, orientation, `layout_width` and `layout_height`. Note the counter-clockwise ordering differs from Azure's clockwise convention. `metadata.page_number` applies to DOCX, PDF, PPT and XLSX. Elements carry a semantic `type` (NarrativeText, Title, Table, Header, Footer, ListItem, Image…), plus `parent_id` to infer document hierarchy and `category_depth` for nesting depth — the hierarchy fields are useful for reconstructing clause structure but are weaker than Azure's explicit `sections`.

Sources:
- https://docs.unstructured.io/api-reference/partition/document-elements

**Docling (IBM) exposes provenance as a first-class typed model — every item can carry page_no, bbox and charspan — making it the strongest open-source option for a self-hosted provenance pipeline**  
_Confidence: high_

DoclingDocument (a Pydantic type in `docling_core.types.doc`) organizes content into `texts`, `tables`, `pictures` and `key_value_items`, all inheriting from `DocItem`, with `body` and `furniture` trees defining reading order and `groups` for lists/chapters. Each item carries a `ProvenanceItem` with `page_no` (int), `bbox` (BoundingBox) and `charspan` (0-indexed 2-element array). Practical access pattern: `table.prov[0].page_no` and `table.prov[0].bbox`. Known rough edges reported in the project's own issue tracker: docling-serve's chunk endpoint did not inline provenance (bbox + page_no) in the response, and there are open discussions about page numbers not appearing correctly in provenance metadata and about getting full-table bounding boxes — verify these against the current release before committing.

Sources:
- https://docling-project.github.io/docling/concepts/docling_document/
- https://github.com/docling-project/docling-serve/issues/613
- https://github.com/docling-project/docling/discussions/1012
- https://github.com/docling-project/docling/discussions/2368
- https://arxiv.org/pdf/2501.17887

**Marker's JSON output gives per-block 4-corner polygons and page polygons, but its MODEL WEIGHTS are not freely commercial — a licensing trap for a funded startup**  
_Confidence: high_

Marker outputs Markdown, JSON (tree-structured, each block with `id`, `block_type`, `html`, and `polygon` as 4-corner coordinates; children carry `section_hierarchy` and `images`; pages themselves have polygons), HTML, and a flattened 'chunks' format for RAG. The code is Apache 2.0, but the model weights use a "modified AI Pubs Open Rail-M license (free for research, personal use, and startups under $5M funding/revenue)" — commercial use beyond that requires payment. Published accuracy: 76.0% overall on olmocr-bench (1,403 PDFs), 83.5% on born-digital PDFs, with balanced mode beating MinerU and Docling at ~5x the speed; fast mode 66.6%, CPU-only 43.6%.

Sources:
- https://github.com/datalab-to/marker

**Native LLM PDF understanding does NOT give you bounding boxes — Anthropic's Citations API grounds PDF citations to PAGE NUMBER only**  
_Confidence: high_

With `citations: {enabled: true}` on a `document` content block, the response splits into multiple `text` blocks, cited ones carrying a `citations` array. Each citation has `cited_text`, `document_index`, `document_title` and a location typed by kind: `char_location` (`start_char_index`/`end_char_index`) for plain text, `page_location` (`start_page_number`/`end_page_number`, 1-indexed) for PDF, and `content_block_location` for custom content. There is no bbox. PDF limits are 32MB per request and 600 pages (100 for 200k-context models). Citations are also incompatible with `output_config.format` (structured outputs) — a 400 — so you cannot get schema-enforced JSON and native citations in the same call. Practical consequence for QuarterMark: a 300-page credit agreement exceeds the single-request page limit anyway, and native citations would only ever get you to a page, not a highlight.

Sources:
- https://platform.claude.com/docs/en/build-with-claude/citations
- https://platform.claude.com/docs/en/build-with-claude/pdf-support

**Gemini's bounding-box capability is image object detection in a 0–1000 normalized [y_min, x_min, y_max, x_max] space — usable but not a document-provenance layer**  
_Confidence: high_

Gemini returns coordinates relative to image dimensions scaled to [0, 1000], in the order [y_min, x_min, y_max, x_max] (note: y first, unlike almost every other API here). To convert: divide each coordinate by 1000, multiply x by original image width and y by original image height. From Gemini 2.5 onward the models also return segmentation masks, with each item's box as `box_2d`. This can be pressed into service for page-image grounding if you rasterize pages, but it is a vision-detection feature with no page-number/reading-order/table-cell model behind it, and no confidence per extracted field.

Sources:
- https://cloud.google.com/vertex-ai/generative-ai/docs/bounding-box-detection

**The published RD-TableBench numbers are the most-cited table-extraction comparison but are vendor-authored (Reducto, Nov 2024) and now dated**  
_Confidence: medium_

Methodology: 1,000 complex table images from publicly available documents, manually annotated by PhD-level labelers, spanning varied structures, text densities and multiple languages, deliberately broader than PubTabNet and FinTabNet. Scoring is hierarchical Needleman-Wunsch: Levenshtein distance for cell-level partial matches (0–1), Needleman-Wunsch row alignment using those cell scores, normalized to 0–1. Eight systems compared at highest-quality settings. Reported table-similarity scores: Reducto 90.2, Azure 82.7, Textract 80.9, Claude Sonnet 3.5 80.7, GPT-4o 76.0, LlamaParse 74.6, Google Cloud 64.6, Unstructured 60.2. Treat as directional, not decisive — it is published by the winning vendor, the model versions tested are two generations old, and the accompanying results table is not fully reproduced on the announcement page itself.

Sources:
- https://reducto.ai/blog/rd-tablebench
- https://reducto.ai/blog/sota-table-parsing
- https://news.ycombinator.com/item?id=42054144

**OmniDocBench is now widely described as saturated, which matters for how QuarterMark should evaluate parsers**  
_Confidence: medium_

OmniDocBench covers nine document types including academic papers, financial reports and textbooks with comprehensive annotations, and became the default parsing benchmark. Recent reporting has multiple systems above 94% overall and table TEDS scores in the low 90s (e.g. LingDT-VL-OCR at 91.34 Table TEDS / 93.85 TEDS-S), with LlamaIndex publishing an explicit "OmniDocBench is Saturated, What's Next for OCR Benchmarks?" position. Implication: public benchmark leaderboards will not discriminate between the top parsers on QuarterMark's actual documents. Build a private 30–60 page gold set of real UK/European credit agreements and side letters and score parsers on that — the differences that matter (footnote binding, multi-page covenant tables, defined-term capture) are not what these benchmarks measure.

Sources:
- https://www.llamaindex.ai/blog/omnidocbench-is-saturated-what-s-next-for-ocr-benchmarks
- https://arxiv.org/pdf/2603.11044
- https://www.researchgate.net/publication/394650843_OmniDocBench_Benchmarking_Diverse_PDF_Document_Parsing_with_Comprehensive_Annotations

**Financial-table failure modes cluster into five recurring, testable categories — and header/row-boundary damage hurts more than OCR character noise**  
_Confidence: medium_

(1) Multi-page continuation: tables split across pages where headers vanish and rows resume mid-table with no visual cue; subtotals and grand totals may exist only on the final page. (2) Merged cells, borderless layouts, multi-row/multi-column headers and variable column widths. (3) Footnotes: a superscript changes the meaning of a row but the note lands far away in the flattened text, sometimes on a different page — directly relevant to covenant definitions with carve-outs in footnotes. (4) Rotated tables, which appear more often than expected in financial documents and which many tools do not attempt. (5) OCR-level errors: 0/O and 1/l confusion, missing decimal points, digit transposition, and dropped negative signs; vision models may also omit rows entirely. Multiple sources converge on the point that header loss and row-boundary damage degrade downstream answers more than character-level noise.

Sources:
- https://www.infoq.com/articles/redesign-pdf-table-extraction/
- https://optyxstack.com/rag-reliability/why-your-rag-fails-on-pdf-tables-ocr-header-loss-row-boundary-fixes
- https://www.turbolens.io/blog/2026-05-20-multi-page-table-extraction-from-pdfs-without-losing-context
- https://www.extend.ai/resources/multi-page-table-extraction-tools

**The consensus architecture for hundreds of fields from a 300-page contract is two-stage layout-then-extract with clause-level chunking, a definitions index, and cross-references resolved at chunk time**  
_Confidence: medium_

Reported best practices: (a) bounding-box metadata must TRAVEL WITH each chunk through parsing and embedding, so provenance survives to the answer; (b) chunk at clause level, not fixed size — "a clause is the unit of legal analysis, not a 500-character chunk", and fixed-size chunking splits tables across boundaries and severs clause references from the terms they modify; (c) the parser should identify section hierarchy and BUILD A DEFINITIONS INDEX so retrieval can resolve defined terms — this is the specific answer to defined terms used far from where they are defined; (d) resolve cross-references at chunk time so referenced text attaches as metadata; (e) ground every claim in a quoted span with a section number, so citations trace to a specific clause and queries can return page+paragraph citations per matching provision. Note these are practitioner/vendor write-ups rather than peer-reviewed results — the pattern is consistent across sources but the specific accuracy claims are unverified.

Sources:
- https://landing.ai/llms/contract-data-extraction-for-enterprise-legal-teams
- https://futureagi.com/blog/contract-review-rag-build-evaluate-2026/
- https://www.extend.ai/resources/building-document-qa-agent-architecture-tradeoffs-failures
- https://neo4j.com/blog/developer/agentic-graphrag-for-commercial-contracts/

**The standard click-to-source technique is a positioned overlay above a PDF.js canvas, with PageViewport.convertToViewportRectangle handling PDF's bottom-left origin, scale and rotation**  
_Confidence: high_

PDF user space has its origin at bottom-left; canvas has it at top-left. PDF.js's `PageViewport` builds a transformation matrix at `getViewport({scale, rotation})` time that accounts for scale, rotation and the y-flip. The two conversion APIs are `convertToViewportPoint(x, y)` for single points (click positions, pin markers) and `convertToViewportRectangle([x1, y1, x2, y2])` for boxes (highlights) — it converts all four corners in one call and returns a flat array. `convertToPdfPoint` goes the other way, for capturing a user-drawn selection back into storable PDF coordinates. Two implementation notes that catch people out: re-derive the viewport on scalechanging/rotationchanging events, and normalize rotated rectangles with Math.min/Math.max because corner order is not guaranteed after rotation.

Sources:
- https://www.nutrient.io/blog/pdfjs-coordinate-systems-pdf-to-screen/
- https://mozilla.github.io/pdf.js/examples/
- https://github.com/mozilla/pdf.js/blob/master/docs/contents/examples/index.md

**For React/Next.js the realistic library choices are react-pdf (render-only, you own the overlay), react-pdf-viewer's highlight plugin, or react-pdf-highlighter-extended**  
_Confidence: medium_

react-pdf is a rendering library built on pdf.js with no prebuilt UI, annotations, form filling or signatures — a good fit for a read-only viewer where you want full control of the highlight layer, which is exactly QuarterMark's case. react-pdf-viewer ships a highlight plugin that adds annotations to selected text and highlights multiple areas computed from the bounding rectangles of selected text items, and exposes a `useElementPageContext` hook whose `updateElement` function programmatically adds overlay elements to a page by page number plus a callback returning React elements positioned from bbox coordinates. react-pdf-highlighter-extended provides a customizable annotation experience supporting both text and rectangular highlights, also on pdf.js. Recommendation for QuarterMark: react-pdf plus your own absolutely-positioned overlay div per page keeps you closest to the coordinate math and avoids fighting a plugin's own selection model, since your highlights come from the parser rather than from user text selection.

Sources:
- https://www.nutrient.io/blog/how-to-build-a-reactjs-pdf-viewer-with-react-pdf/
- https://react-pdf-viewer.dev/plugins/highlight/
- https://react-pdf-viewer.dev/examples/render-the-highlight-areas/
- https://www.npmjs.com/package/react-pdf-highlighter
- https://www.react-pdf-kit.dev/docs/examples/highlight-with-bbox-coordinates-programmatically.html

**AWS SageMaker A2I is CLOSED TO NEW CUSTOMERS — the managed human-review path on AWS is gone**  
_Confidence: high_

The official SageMaker documentation carries the notice verbatim: "Amazon SageMaker A2I is no longer open to new customers. Existing customers can continue to use the service as normal. AWS continues to invest in security and availability improvements for A2I, but we do not plan to introduce new features." Its design remains the reference pattern worth copying: a flow definition with human-loop activation conditions that route only predictions falling within a confidence threshold to reviewers, with Textract distinguishing identification confidence (the score for a detected key-value pair) from qualification confidence (the score for text within that pair). QuarterMark cannot adopt A2I and must build its own review queue — but the two-tier confidence idea (did we find the covenant vs. did we read the number correctly) maps directly onto covenant extraction.

Sources:
- https://docs.aws.amazon.com/sagemaker/latest/dg/a2i-use-augmented-ai-a2i-human-review-loops.html
- https://docs.aws.amazon.com/sagemaker/latest/dg/a2i-json-humantaskactivationconditions-textract-example.html
- https://docs.aws.amazon.com/textract/latest/dg/a2i-textract-core-components.html

**Google Document AI Human-in-the-Loop is deprecated and closed to new customers — Google now refers customers to third-party partners for review UIs**  
_Confidence: medium_

Google's official Document AI deprecations page lists "Human in the Loop (HITL)" alongside "Document AI Warehouse" under major feature deprecations. Note a source discrepancy worth checking before you cite it externally: the deprecations table shows the date "January 16, 2024" while other Document AI HITL pages have stated the service would no longer be available after January 16, 2025 — the first is likely the announcement date and the second the shutdown. Either way the direction is unambiguous: new customers are not allowlisted, and Google's own recommendation is to work with a certified partner (it names Devoteam, Searce, Quantiphi) to build a human review and correction solution. Two of the three hyperscalers have exited managed HITL, which is a genuine opening for QuarterMark: the review UI is the product surface, not a commodity.

Sources:
- https://docs.cloud.google.com/document-ai/docs/deprecation
- https://cloud.google.com/document-ai/docs/hitl/concepts
- https://docs.cloud.google.com/document-ai/docs/hitl/best-practices

**Azure publishes the most usable confidence rubric for high-stakes extraction, including an explicit 'close to 100%' bar for financial records and a top-down table→row→cell drill order**  
_Confidence: high_

Field confidence is "an estimated probability between 0 and 1 that the prediction is correct" — 0.95 means the prediction is likely correct 19 times out of 20 — and Microsoft states plainly that "for scenarios where accuracy is critical, confidence can be used to determine whether to automatically accept the prediction or flag it for human review." For custom-model training accuracy: "It's best to target a score of 80% or higher. For more sensitive cases, like financial or medical records, we recommend a score of close to 100%." Four distinct confidence signals must be combined, not read individually: document-type confidence (how closely the document resembles the training set), field-level confidence (confidence in the POSITION of the extracted value), word confidence (transcription confidence), and selection-mark confidence — Microsoft explicitly says to compose field confidence with the underlying OCR confidence. Table confidence is now three-level (table/row/cell, custom models, 2024-11-30 GA) with documented guidance: drill top-down; merged cells and the NULL cell they absorb should both show lower confidence; a row split across a page boundary will show high cell confidence but lower row confidence. Also note: custom NEURAL and GENERATIVE models do not provide accuracy scores during training.

Sources:
- https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/accuracy-confidence?view=doc-intel-4.0.0

**Harvey publicly anchors on 'every draft cites the source paragraphs it relies on, with the source material a click away' and claims 96% key-term extraction accuracy**  
_Confidence: high_

Harvey Vault stores up to 100,000 files per vault, unifying files, email, queries and DMS integrations (iManage, SharePoint, Google Drive), and extracts key data points from thousands of documents at once into a structured tabular 'review table' that users can then query to summarize, compare or isolate insights, with full document traceability from extracted cell back to source. Published claims on the Vault page: "96% key-term extraction accuracy", a "95% reduction in time needed to review a large batch of trading agreements at Bridgewater", and a Fischer case study reporting more than 80% associate time reduction on M&A review. Harvey ties citation grounding to professional-responsibility framing, referencing the ABA's Formal Opinion 512 on competence with generative AI. The extract-to-table-with-traceable-citations pattern is now the category-standard UX and QuarterMark should assume buyers expect it.

Sources:
- https://www.harvey.ai/platform/vault
- https://www.harvey.ai/blog/introducing-the-next-version-of-vault
- https://help.harvey.ai/articles/knowledge-sources-overview

**Ontra is the closest direct competitor for QuarterMark's obligation-monitoring wedge and already ships Insight for Credit covenant identification for private markets**  
_Confidence: high_

Ontra states its AI "extracts critical terms, covenants, and obligations from complex legal agreements and converts them into actionable reminders and triggers without any manual setup" — firms upload credit agreements and Ontra's AI, trained on a wide variety of contracts, processes them automatically. Insight for Credit automates covenant identification, enables term comparison across facilities, and provides task workflows for lender commitments. Insight for Funds targets side letters and LPAs tracked in spreadsheets, siloed legal/compliance/IR coordination, and slow SEC exam responses. Ontra also blends AI with "an experienced global network of legal professionals" in Contract Automation — i.e. human-in-the-loop is part of the commercial offer, not just the tech. Security posture stated publicly: SOC 2 Type 2 (all five trust criteria), ISO 27001:2022, zero data retention in the platform, and a no-training-on-customer-data policy. Ontra does not publicly document bbox-level citation, which is a plausible differentiation point.

Sources:
- https://www.ontra.ai/products/insight-for-credit/
- https://www.ontra.ai/products/insight-for-funds/
- https://www.ontra.ai/products/contract-automation/
- https://venturebeat.com/ai/ontras-new-ai-updates-convert-dense-legal-docs-into-actionable-reminders-for

**Luminance publicly describes a 'Mixture of Experts' multi-model architecture with 'probabilistic consensus' rather than a single legal LLM**  
_Confidence: medium_

Luminance's own site states its "Mixture of Experts approach uses probabilistic consensus to ensure Legal-Grade accuracy" and describes a "Unique AI Architecture Powered by Multiple Models", organized into six agent capabilities: Draft, Negotiate, Analyze, Comply, Investigate, Collaborate. Analyze is framed as "manage obligations and rapidly respond to business queries with at-a-glance insight into the entire contractual landscape". Notably the current public product page does NOT name a Legal Pre-Trained Transformer, does not break out extraction/redlining/due diligence as discrete documented features, and publishes no bbox-citation or confidence-score detail — so any claim about LPT should be treated as unverified against current materials. Ensemble-with-consensus is a genuinely relevant pattern for QuarterMark: agreement across independent extractors is a cheap, defensible confidence signal.

Sources:
- https://www.luminance.com/

**The contract-intelligence category has consolidated hard — Evisort and Eigen are no longer independent, and Klarity appears to have repositioned away from contract review**  
_Confidence: medium_

Workday signed to acquire Evisort on 17 September 2024 and completed on 8 October 2024 for approximately $310–311 million in cash, folding AI document intelligence into its finance and HCM suite. Sirion acquired Eigen Technologies on 6 June 2024, with Eigen's researchers forming the core of Sirion's new AI Research Centre in London. Klarity Intelligence raised a $70m Series B led by Nat Friedman and Daniel Gross (total funding over $90m) and remains independent — but its current homepage presents process discovery and workflow transformation (AI Companion, AI Interviews, file uploads) with no discussion of contract extraction, rubric-based validation, confidence scoring, human review or source citation. Robin AI's product structure is publicly described as Reports (contract analysis and data extraction), Reviews (AI-assisted review with redlining and risk flagging), Draft, and Agent mode; its own product URLs 404'd during this research, so its citation/provenance claims remain unverified against primary sources.

Sources:
- https://newsroom.workday.com/2024-09-17-Workday-Signs-Definitive-Agreement-to-Acquire-Evisort
- https://www.sec.gov/Archives/edgar/data/1327811/000132781124000242/wday-20241031.htm
- https://www.sirion.ai/library/contract-ai/eigen-acquisition-brings-document-ai-to-contract-intelligence/
- https://www.klarity.ai/
- https://technews180.com/funding-news/klarity-intelligence-secures-70-million-to-revolutionize-document-review-with-ai/

**Published pricing: Reducto $0.015/credit after 15K free credits; LlamaParse 1,000 credits = $1.25 with a $0/10K-credit free tier; Azure Document Intelligence pricing is NOT publicly renderable beyond its free tier**  
_Confidence: medium_

Reducto's pricing page shows Standard (pay-as-you-go): free up to the first 15K credits, then "$0.015 per credit after first 15K"; Growth and Enterprise are custom pricing requiring sales contact. Reducto does not publish per-page costs — credits vary by operation (parse/extract/split/edit), configuration and page count. LlamaCloud publishes Free ($0/month, 10K credits), Starter ($50/month, 40K credits, PAYG to 400K), Pro ($500/month, 400K credits, PAYG to 4,000K) and custom Enterprise, with the stated conversion "1,000 credits = $1.25", three parse tiers (Cost Effective, Agentic, Agentic Plus) and an Auto Mode claiming up to 80% savings; basic parsing starts "as low as 1 credit" per page. Azure's Document Intelligence pricing page rendered only placeholder "$-" values with the disclaimer "Prices are estimates only and are not intended as actual price quotes" — the only concrete figure retrievable was the F0 free tier at 0–500 pages free per month. Treat Azure, Textract and Google Document AI per-page pricing as UNVERIFIED here; check each vendor's calculator directly before modelling unit economics.

Sources:
- https://reducto.ai/pricing
- https://www.llamaindex.ai/pricing
- https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/

### Implications for QuarterMark
- Build a two-layer pipeline: a deterministic parser owns geometry (page, bbox, char span), an LLM owns semantics. Join them on CHARACTER SPANS, not on text matching. Azure, Reducto, LlamaParse, Docling and Unstructured all emit a char offset/length or textAnchor into a document-level text string — feed exactly that string to the LLM, require it to return the span it used, and resolve span back to bbox deterministically. This is the only design where the highlight is guaranteed correct rather than fuzzy-matched.
- Normalize every parser's coordinates into one internal convention at ingest, and store page width, page height and unit per page. The conventions genuinely conflict: Azure PDFs are in INCHES, Textract and Google are 0–1 ratios, Reducto is normalized left/top/width/height, Unstructured points run counter-clockwise while Azure's run clockwise, and Gemini emits [y,x,y,x] scaled 0–1000. Pick normalized top-left-origin [x0,y0,x1,y1] in [0,1] as the canonical Postgres representation and write one adapter per parser.
- Do not rely on native LLM PDF citations for the click-a-number feature. Anthropic gives page_location only (no bbox), citations are incompatible with structured outputs (400 error), and the 600-page/32MB request cap rules out whole credit agreements anyway. Use the parser's bbox for the highlight and the LLM only for interpretation — this is the technical moat versus generic legal-AI tools that stop at page-level citation.
- Chunk at clause level and build a separate definitions index at ingest. Fixed-size chunking is the single most damaging default for a 300-page credit agreement: it splits covenant tables mid-row and severs defined terms from their definitions. Parse the definitions article once into a term→definition→(page,bbox) table, resolve cross-references at chunk time and attach referenced text as chunk metadata, so 'Consolidated EBITDA' in section 7.4 carries its section 1.1 definition into the extraction prompt.
- Model confidence as a composite of at least three signals rather than one number, following Azure's rubric: did we locate the right field (field/position confidence), did we read the characters correctly (OCR/word confidence), and does the document resemble what we trained/prompted for (document-type confidence). For covenant tables add row-level and cell-level confidence, and expect merged cells, NULL cells and rows split across page boundaries to legitimately score lower. Adopt Azure's stated bar for financial records — target close to 100%, not 80%.
- Own the human review queue as a core product surface, not an afterthought. AWS A2I is closed to new customers and Google's Document AI HITL is deprecated with Google directing customers to systems integrators — two of three hyperscalers have exited managed HITL. For a fund with £50m–£500m AUM the reviewer IS the analyst, so the queue should be a confidence-sorted worklist where each item opens the PDF at the right page with the box already highlighted and accepts/corrects in one keystroke.
- Front-end stack: react-pdf for rendering plus your own absolutely-positioned overlay layer per page, driven by PageViewport.convertToViewportRectangle. Your highlights come from the parser, not from user text selection, so the selection-oriented highlight plugins fight you more than they help. Re-derive the viewport on scale and rotation change and normalize rotated rects with min/max — these are the two bugs everyone ships first.
- Be explicit in the UI about which numbers are clickable. LlamaIndex documents the constraint that only text physically present in the document gets coordinates — inferred values and computed summaries do not. A leverage ratio QuarterMark calculates has no bbox; its inputs do. Design the covenant card so a derived figure expands to show its clickable source components, and never fake a highlight for a computed value.
- Do not select a parser from public leaderboards. RD-TableBench is vendor-authored, Nov 2024, and tests model versions two generations old; OmniDocBench is described as saturated with multiple systems above 94%. Build a private gold set of 30–60 pages of real UK/European credit agreements, side letters and compliance certificates and score candidates on the failure modes that actually bite: multi-page covenant table continuation, footnote-to-row binding, merged header cells, and dropped negative signs.
- Test the five known financial-table failure modes explicitly in CI, because each maps to a covenant-monitoring error with real money attached: a covenant table continuing across a page break with the header gone, a carve-out in a footnote two pages from the row it modifies, merged/borderless cells in a step-down schedule, a rotated landscape schedule, and a negative sign lost in OCR turning a breach into headroom.
- Position against Ontra directly and on provenance depth. Ontra already extracts covenants and obligations from credit agreements for private markets with SOC 2 Type 2, ISO 27001 and a no-training-on-customer-data policy — match that security posture as table stakes. It does not publicly document bounding-box-level citation, so word/cell-level click-to-source with an auditable trail from every monitored covenant back to its exact clause is a defensible wedge, especially for FCA-regulated funds facing LP and regulator scrutiny.
- Consider an ensemble-with-consensus signal, following Luminance's publicly stated 'probabilistic consensus' framing. Running two independent extractors (e.g. Azure Layout plus a VLM parse) and flagging disagreement is a cheap, explainable confidence proxy that needs no labelled training data — valuable for a solo founder with no annotation budget and far more defensible to an auditor than a single model's self-reported score.
- Watch the licensing and vendor-risk edges before committing: Marker's model weights are free only for startups under $5M funding/revenue (Apache 2.0 covers the code only), Docling has open issues around provenance in its serve API, and hosted per-credit pricing (Reducto $0.015/credit after 15K free; LlamaParse 1,000 credits = $1.25) needs modelling against a 300-page-document workload before it is designed into the unit economics. Docling self-hosted is the hedge that keeps per-document marginal cost near zero.


---

## v2:2c8b1abaaa11f62fe93d7604f1cb3c998c2ceb6e5cf2d68ad289f15c7dba1166

### Summary
The UK Companies House stack is genuinely production-viable as the backbone of a covenant/distress monitoring engine, and it is free. The Public Data API sits at https://api.company-information.service.gov.uk with HTTP Basic auth (API key as username, blank password) and a hard limit of 600 requests per rolling 5-minute window, signalled via X-Ratelimit-* headers and 429s. Every resource QuarterMark needs has a clean REST endpoint: company profile, filing history, officers, charges, insolvency, and PSC — and the schemas are rich enough to drive real covenant logic (charge status enums including part-satisfied, insolvency case-type and date-type enums covering moratoria and administration, accounts.next_accounts.overdue and confirmation_statement.overdue booleans, company_status_detail carrying active-proposal-to-strike-off). The Streaming API at https://stream.companieshouse.gov.uk pushes nine separate event streams over long-lived HTTP with a small JSON envelope carrying an integer timepoint for resumption — but the killer architectural constraint is a maximum of two concurrent connections per account, with a new connection silently killing the oldest, which forces a multi-key or single-consumer-fan-out design. Streams also drop nightly around 2-3am, so reconnect-with-last-timepoint is mandatory, and too-old timepoints return 416. Commercial SaaS use is permitted: the data is Open Government Licence v3.0 and Companies House staff have confirmed on the record that nothing restricts commercial use, though UK GDPR still governs the personal data of directors and PSCs. Distress signals map cleanly onto filing-history category enums (mortgage, liquidation, insolvency) and specific form types — MR01 charge creation, MR04/MR05 satisfaction and release, TM01 director termination, plus overdue-accounts flags and proposal-to-strike-off. The single most important 2026 news is negative for financial-depth ambitions: the ECCTA accounts reforms — software-only iXBRL filing, abolition of abridged accounts, and mandatory profit-and-loss filing by small and micro companies — were confirmed on 9 June 2026 to be delayed to April 2028, and even then small companies get an opt-out from publishing P&L on the public register, so borrower financials will NOT arrive via Companies House on any near-term horizon. Identity verification, by contrast, is live: legally required since 18 November 2025 with a 12-month transition running out around November 2026. The Gazette provides a genuinely excellent, free, unauthenticated REST feed for insolvency notices with precise numeric notice codes (2450 petitions to wind up, 2452 winding-up orders, 2410 appointment of administrators, 2441 CVL resolution), date-range filters and JSON output — this is where you catch winding-up petitions, which Companies House does not surface. Pan-European monitoring is technically feasible but heterogeneous and mostly not real-time: Ireland's CRO and the Netherlands' KVK have proper authenticated APIs (KVK is metered per query), France's INPI publishes RNE data via API and SFTP, while Germany and Luxembourg have no confirmed official developer API and would need commercial aggregators.

### Findings

**Companies House Public Data API: base URL https://api.company-information.service.gov.uk, HTTP Basic auth with API key as username and blank password**  
_Confidence: high_

Register an 'API Key' application on the Companies House Developer Hub. Send the key as the HTTP Basic username with an empty password (i.e. Authorization: Basic base64(APIKEY:)). TLS is mandatory; Companies House recommends TLS 1.2. Developer guidelines explicitly require keys never be embedded in source trees, and require clients to tolerate new JSON fields and member reordering over time (so parse defensively — do not use strict schema validation that rejects unknown keys).

Sources:
- https://developer-specs.company-information.service.gov.uk/guides/authorisation
- https://developer.company-information.service.gov.uk/developer-guidelines

**Rate limit is 600 requests per rolling 5-minute window, returning HTTP 429 for the remainder of the window**  
_Confidence: high_

Headers returned on responses: X-Ratelimit-Limit (600), X-Ratelimit-Remain, X-Ratelimit-Reset, X-Ratelimit-Window (5m). Use X-Ratelimit-Remain and X-Ratelimit-Reset to drive an adaptive token-bucket rather than fixed sleeps. Higher limits are available on request by contacting Companies House. Critically, the guidelines state: 'We reserve the right to ban without notice applications that regularly exceed or attempt to bypass the rate limits' — so do NOT shard across multiple API keys purely to evade the limit; request an uplift instead. At 600/5min = 2 req/sec sustained, a full refresh of a 300-borrower portfolio across 6 endpoints each (1,800 calls) takes ~15 minutes, which is fine; a 50,000-company universe sweep is not.

Sources:
- https://developer-specs.company-information.service.gov.uk/guides/rateLimiting
- https://developer.company-information.service.gov.uk/developer-guidelines
- https://forum.companieshouse.gov.uk/t/api-rate-limiting-and-streaming-api-endpoints-clarification/5256

**Exact Public Data API endpoint paths for every resource QuarterMark needs**  
_Confidence: high_

Company profile: GET /company/{company_number}. Filing history list: GET /company/{company_number}/filing-history; single item: GET /company/{company_number}/filing-history/{transaction_id}. Officers: GET /company/{company_number}/officers; individual appointment: GET /company/{company_number}/appointments/{appointment_id}. Charges list: GET /company/{company_number}/charges; single charge: GET /company/{company_number}/charges/{charge_id}. Insolvency: GET /company/{company_number}/insolvency. PSC list: GET /company/{company_number}/persons-with-significant-control; PSC statements: GET /company/{company_number}/persons-with-significant-control-statements (plus separate sub-paths for individual, corporate-entity, legal-person and super-secure PSCs). Registered office: GET /company/{company_number}/registered-office-address. Exemptions: GET /company/{company_number}/exemptions. UK establishments: GET /company/{company_number}/uk-establishments. Registers: GET /company/{company_number}/registers. Search: GET /search, /search/companies, /search/officers, /search/disqualified-officers, /advanced-search/companies, /alphabetical-search/companies, /dissolved-search/companies.

Sources:
- https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference

**Company profile schema contains directly usable distress flags: company_status, company_status_detail, and overdue booleans**  
_Confidence: high_

company_status enum: active, dissolved, liquidation, receivership, administration, voluntary-arrangement, converted-closed, insolvency-proceedings, registered, removed, closed, open. company_status_detail enum includes active-proposal-to-strike-off and petition-to-restore-dissolved — 'active-proposal-to-strike-off' is a strong early distress signal on an otherwise 'active' company. Accounts object: accounts.next_accounts.due_on, accounts.next_accounts.overdue (boolean), accounts.next_accounts.period_end_on, accounts.last_accounts.type (full/small/medium/dormant). Note accounts.next_due and accounts.next_made_up_to are DEPRECATED — use next_accounts.*. confirmation_statement.overdue is a separate boolean. has_charges and has_insolvency_history are both marked deprecated — do not build on them; call the charges and insolvency endpoints instead. type enum has 30+ values including ltd, plc, llp, registered-overseas-entity; subtype includes private-fund-limited-partnership (relevant for fund-level entities).

Sources:
- https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyprofile?v=latest

**Charges resource gives fixed/floating/negative-pledge flags and satisfaction status — directly usable for security and negative-pledge covenant monitoring**  
_Confidence: high_

status enum: outstanding, fully-satisfied, part-satisfied, satisfied. particulars[] carries boolean flags contains_fixed_charge, contains_floating_charge, contains_negative_pledge, floating_charge_covers_all, chargor_acting_as_bare_trustee — these let you detect a new competing charge with a negative pledge, or a floating charge over all assets, programmatically. classification[] has type charge-description or nature-of-charge. secured_details[] has type amount-secured or obligations-secured with a free-text description (the amount is NOT a structured numeric field — you will need parsing/LLM extraction). persons_entitled[] gives the chargee name (i.e. who else has lent). Dates: created_on, delivered_on, satisfied_on, acquired_on. There is an insolvency_cases[] array with case_number and a link to the case — this is the join between a charge and an enforcement event.

Sources:
- https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/chargelist?v=latest

**Insolvency resource has a rich, machine-readable case type and event-date taxonomy**  
_Confidence: high_

cases[].type enum: compulsory-liquidation, creditors-voluntary-liquidation, members-voluntary-liquidation, in-administration, corporate-voluntary-arrangement, corporate-voluntary-arrangement-moratorium, administration-order, receiver-manager, administrative-receiver, receivership, foreign-insolvency, moratorium. cases[].dates[].type enum: instrumented-on, administration-started-on, administration-discharged-on, administration-ended-on, concluded-winding-up-on, petitioned-on, ordered-to-wind-up-on, due-to-be-dissolved-on, case-end-on, wound-up-on, voluntary-arrangement-started-on, voluntary-arrangement-ended-on, moratorium-started-on, moratorium-ended-on, declaration-solvent-on. practitioners[] gives name, role, appointed_on, ceased_to_act_on and address. Note members-voluntary-liquidation is a SOLVENT wind-up and must not be scored as distress — the declaration-solvent-on date distinguishes it.

Sources:
- https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/companyinsolvency?v=latest

**Streaming API base URL is https://stream.companieshouse.gov.uk with nine distinct event streams**  
_Confidence: high_

Confirmed paths: GET /companies (basic company information), /filings, /officers, /persons-with-significant-control, /charges, /insolvency-cases, /disqualified-officers, plus company-exemptions and persons-with-significant-control-statements streams documented in the reference navigation. Same API key / HTTP Basic auth as the REST API. Each connection is a long-lived HTTP response streaming newline-delimited JSON objects.

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/reference/company-information/stream
- https://developer-specs.company-information.service.gov.uk/streaming-api/reference/insolvency-cases/stream
- https://chguide.co.uk/streams/

**Streaming event JSON envelope structure (exact field names)**  
_Confidence: high_

{ "resource_kind": string, "resource_uri": string, "resource_id": string, "data": { ...identical payload to the equivalent REST resource... }, "event": { "timepoint": integer, "published_at": date-time, "type": string, "fields_changed": [string] } }. Two things matter for implementation: (1) event.fields_changed tells you precisely which attributes mutated, so you can trigger covenant rules on a delta rather than diffing full documents yourself; (2) event.timepoint is a monotonically incrementing integer you must persist after each successfully processed event — it is your resumption cursor. data is the same shape as the on-demand API resource, so you can share deserialisation code between the poller and the stream consumer.

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview
- https://companies.stream/samples
- https://github.com/companieshouse/chs-streaming-api-frontend

**CRITICAL CONSTRAINT: maximum two concurrent streaming connections per account, and a third connection silently kills the oldest**  
_Confidence: high_

Official docs: 'A maximum of two concurrent connections per-account can be made.' Each additional connection above the limit causes the oldest open connection to close. QuarterMark realistically wants at least four streams (filings, charges, insolvency-cases, officers) plus arguably companies and PSC — that exceeds the limit on one key. Design implications: either (a) request an uplift from Companies House, or (b) use separate registered accounts/keys per stream (note the rate-limit guidance warns against key-sharding to bypass limits — clarify with CH before doing this), or (c) run exactly two connections and cover the remaining signals by polling the REST API on a schedule. Also fatal in a naive deployment: a rolling deploy or a duplicate pod will kill your live connection, and a health-check that reconnects will thrash. Run the stream consumer as a SINGLETON (e.g. a single-replica StatefulSet or a leader-elected worker), never behind an autoscaler, and fan events out internally via a queue.

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview
- https://forum.companieshouse.gov.uk/t/streaming-api-concurrent-connections/4912
- https://forum.companieshouse.gov.uk/t/streaming-api-concurrent-connection-limit-per-account-and-adding-further-streams/12813

**Streaming resumption: ?timepoint=N replays from that point; too-old timepoints return HTTP 416; history is only a few days**  
_Confidence: high_

Connect with GET /filings?timepoint=<last_processed_timepoint>. If the timepoint is too old the API returns 416. Companies House retains only a few days of replayable history, so if your consumer is down for a week you cannot backfill from the stream — you must reconcile via REST polling or a bulk snapshot. Persist the timepoint transactionally with the processed event (or at-least-once with idempotent handlers keyed on resource_id + timepoint), because replay from a timepoint re-delivers events.

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview
- https://developer-specs.company-information.service.gov.uk/streaming-api/reference/company-information/stream
- https://forum.companieshouse.gov.uk/t/last-timepoint-ch-streams/7773

**Streams send blank-line heartbeats, and Companies House force-disconnects all streams nightly around 2-3am**  
_Confidence: high_

Official docs: the API 'periodically sends an empty record as a heartbeat' during quiet periods to keep the connection alive — clients must ignore blank lines rather than treating them as malformed JSON or as EOF. Community operators report the streams 'go down (offline or errors) quite frequently' and that Companies House disconnects all streams every night, usually around 2-3AM. Production architecture must therefore assume disconnection is normal, not exceptional: maintain a persistent connection, reconnect with the stored timepoint, use exponential backoff on failure, and back off ~1 minute on HTTP 429. Official guidance explicitly warns that 'repeatedly reconnecting to the streaming API is a resource expensive operation, and you may be rate-limited if you do this frequently' — so never implement a tight reconnect loop.

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview
- https://chguide.co.uk/streams/

**Recommended production consumer architecture for the streaming API**  
_Confidence: medium_

Synthesising the documented constraints: (1) One singleton connector process per stream, max two per API key, with leader election so a redeploy never opens a third connection. (2) Read the response body as a line-delimited stream; skip empty lines (heartbeats); parse each line as one envelope. (3) Write the raw envelope immediately to a durable queue/outbox (Postgres table or Redis stream) BEFORE any business logic, so slow covenant evaluation never stalls the socket and trigger a CH-side backpressure disconnect. (4) Commit last_timepoint per stream in Postgres after durable write, not after processing. (5) A separate worker pool consumes the outbox, applies covenant rules, and is idempotent on (resource_kind, resource_id, timepoint). (6) A nightly reconciliation job REST-polls the full borrower portfolio to heal anything missed during the 416 window or an outage — this is non-negotiable given only a few days of replay. (7) Bootstrap by loading the Free Company Data Product snapshot, then attaching to the stream, accepting that CH does not provide a timepoint-aligned public snapshot (see separate finding).

Sources:
- https://developer-specs.company-information.service.gov.uk/streaming-api/guides/overview
- https://chguide.co.uk/streams/
- https://github.com/companieshouse/chs-streaming-api-frontend

**Commercial and SaaS use of Companies House data IS permitted; data is Open Government Licence v3.0**  
_Confidence: medium_

On the official Companies House developer forum, staff stated: 'Your assumption is correct - there is nothing in the documentation that restricts commercial use.' Companies House register data is published under the Open Government Licence v3.0, which permits free reuse including commercial reuse subject to attribution. There is no documented restriction on caching, storing or building derivative products. The real constraints are: (a) the rate limit and the anti-circumvention warning; (b) UK GDPR / Data Protection Act 2018 obligations over director and PSC personal data (names, addresses, dates of birth) — OGL covers copyright/database right, it does NOT license you to process personal data however you like, so QuarterMark needs a lawful basis (legitimate interests) and a ROPA entry for officer/PSC data. NOTE: I could not retrieve a single canonical Companies House 'terms of use' page stating the OGL grant verbatim — the developer-guidelines page covers only operational matters. Verify the exact licence wording directly with Companies House before making licensing claims to fund clients.

Sources:
- https://forum.companieshouse.gov.uk/t/commercial-use-of-api/6787
- https://developer.company-information.service.gov.uk/developer-guidelines
- https://www.api.gov.uk/ch/companies-house/

**Filing history 'category' enum and the specific form 'type' codes that signal distress**  
_Confidence: high_

filing-history items carry date, type (the form code, e.g. MR01), category, subcategory, description, transaction_id, barcode, paper_filed, pages, links, plus optional annotations[], associated_filings[], resolutions[]. category enum: accounts, address, annual-return, capital, change-of-name, incorporation, liquidation, miscellaneous, mortgage, officers, resolution — so you can cheaply pre-filter on category IN ('mortgage','liquidation'). Distress-relevant form types: MR01 = registration of a charge (new security granted to another lender — a classic negative-pledge / additional-indebtedness covenant breach trigger; must be filed within 21 days of creation, so it is a near-real-time signal); MR02 = charge by property acquired; MR04 = statement of satisfaction in full or part; MR05 = release of charged property; TM01 = termination of appointment of a director (CFO/CEO departure signal, especially clustered resignations); AP01 = director appointment; AD01 = change of registered office (watch for moves to an accountant's or IP's address); CS01 = confirmation statement; SH01 = allotment of shares (emergency equity injection); NM01 = change of name; LIQ03 = notice of progress report in voluntary winding up; LIQ04/LIQ13 = dissolution-related notices. Overdue accounts are NOT a filing — detect them via accounts.next_accounts.overdue and confirmation_statement.overdue on the company profile, plus company_status_detail = active-proposal-to-strike-off.

Sources:
- https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/resources/filinghistorylist?v=latest
- https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/544016/MR01_checklist.pdf
- https://ewf.companieshouse.gov.uk/help/en/stdwf/charges.html
- https://assets.publishing.service.gov.uk/media/5a7f29b4ed915d74e6228c55/LIQ03_V1.0.pdf

**Companies House Document API retrieves the actual filed document (PDF or iXBRL) at https://document-api.company-information.service.gov.uk**  
_Confidence: medium_

GET https://document-api.company-information.service.gov.uk/document/{document_id}/content with Authorization: Basic <key> and an Accept header selecting the representation — application/pdf for scanned/paper filings, application/xhtml+xml for iXBRL accounts. The document_id comes from the filing-history item's links.document_metadata. The API responds with a redirect (Location header) to an S3 bucket where the document is stored; your HTTP client must be configured to either follow that redirect or handle it explicitly, and note the S3 URL is pre-signed and short-lived. This is the pipeline for pulling an MR01 charge instrument PDF or a set of iXBRL accounts into an LLM extraction step — which is how QuarterMark gets financial covenant inputs that the structured API does not expose.

Sources:
- https://developer-specs.company-information.service.gov.uk/document-api/reference/document-location/fetch-a-document
- https://chguide.co.uk/rest-api/document-api/filing
- https://www.icaew.com/groups-and-networks/communities/data-analytics-community/community-insights-and-announcements/asynchronous-api-calls-and-the-companies-house-document-api-part-2

**The Gazette REST API is free, unauthenticated for reads, and returns JSON — and is the ONLY practical feed for winding-up petitions**  
_Confidence: high_

Base pattern: https://www.thegazette.co.uk/{service}/notice/data.{format} where service is all-notices, insolvency (constrained to Corporate Insolvency category 24 and Personal Insolvency category 25), or wills-and-probate. Formats via extension: data.json (JSON), data.feed (Atom XML), data.htm (HTML); or via Accept header content negotiation (application/json, application/atom+xml, text/html). Read access is over HTTPS and open; only WRITE access is restricted to authorised users. Query parameters: noticetype (one or more 4-digit codes joined by +, e.g. 2450+2452), categorycode (2-digit codes joined by +, e.g. 24+25), start-publish-date / end-publish-date (ISO 8601 YYYY-MM-DD), edition (London/Edinburgh/Belfast), issue, results-page, results-page-size, sort-by (latest-date | oldest-date), plus location-postcode-[n] / location-distance-[n] / location-local-authority-[n] for geographic filtering. Example: https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=11&results-page-size=1. Practical implementation: poll https://www.thegazette.co.uk/insolvency/notice/data.json?noticetype=2450+2452+2410+2441&start-publish-date=<yesterday>&results-page-size=100 on a daily or hourly cron, and fuzzy-match notice text to borrower company numbers/names.

Sources:
- https://github.com/TheGazette/DevDocs/blob/master/notice/notice-feed.md
- https://www.thegazette.co.uk/data
- https://github.com/TheGazette/DevDocs/blob/master/home.md

**Gazette corporate insolvency notice codes (category 24) — the precise numeric codes to subscribe to**  
_Confidence: high_

Administration: 2410 appointment of administrators, 2411 administration orders, 2412 meetings of creditors, 2413 notices to members, 2414 deemed consent. Receivership: 2421 appointment of administrative receivers, 2422 meetings of creditors, 2423 appointment of receivers, 2424 deemed consent. Members' Voluntary Liquidation (SOLVENT — exclude from distress scoring): 2431 resolutions for winding up, 2432 appointment of liquidators, 2433 notices to creditors, 2434 annual liquidation meetings, 2435 final meetings. Creditors' Voluntary Liquidation: 2441 resolution for winding up, 2442 meetings of creditors, 2447 deemed consent (plus shared 2432/2433/2434/2435). Liquidation by the Court: 2450 petitions to wind up (companies), 2451 petitions to wind up (partnerships), 2452 winding up orders, 2454 appointment of liquidators, 2455 meetings of creditors, 2456 notice of intended dividends, 2457 notice of dividends, 2458 final meetings, 2459 release of liquidator, 2460 notices to creditors, 2461 dismissal of winding up petition, 2462 service of petition. Codes 2401-2409 cover moratoria, dividends, overseas/cross-border insolvencies and practitioner applications. HIGHEST-VALUE SIGNAL: 2450 — a winding-up petition is advertised in The Gazette seven days after presentation and typically triggers an immediate bank account freeze; it appears NOWHERE in the Companies House API until an order is made. Pair it with 2461 (dismissal) to avoid false positives.

Sources:
- https://www.thegazette.co.uk/all-notices/content/165
- https://www.thegazette.co.uk/all-notices/content/129
- https://www.thegazette.co.uk/all-notices/content/101087
- https://www.gov.uk/guidance/dear-insolvency-practitioner/12-gazette-and-avertisement

**MAJOR 2026 DEVELOPMENT: ECCTA accounts reforms delayed to April 2028, and small companies get an opt-out from publishing P&L**  
_Confidence: high_

Announced on GOV.UK on 9 June 2026. From April 2028 (pushed back from the previously planned April 2027): software-only filing of accounts in iXBRL becomes mandatory and the Companies House web and paper filing routes close; abridged accounts are abolished; audit exemption claims require an enhanced directors' statement identifying the specific exemption; all account components must be filed together; and the ability to shorten an accounting reference period is restricted. Small companies and micro-entities must file a profit and loss account — BUT they gain 'the option to opt out of publishing this information on the public register', with the opt-out mechanism 'to be confirmed in due course'. Companies House, law enforcement and HMRC retain access. Companies get 21 months (one full accounting year plus nine months) to prepare. Separately, the government intends to remove the directors' report requirement entirely under the Modernising Corporate Reporting programme, so the previously announced directors'-report filing change may never take effect.

Sources:
- https://www.gov.uk/government/news/companies-house-to-bring-in-changes-to-accounts-filing-from-april-2028
- https://changestoukcompanylaw.campaign.gov.uk/changes-to-accounts/
- https://www.icaew.com/insights/viewpoints-on-the-news/2026/jun-2026/companies-house-accounts-changes-confirmed-for-april-2028

**ECCTA identity verification is IN FORCE now: legal requirement since 18 November 2025, 12-month transition ending around November 2026**  
_Confidence: high_

Identity verification became a legal requirement on 18 November 2025, starting a 12-month transition period during which existing directors and PSCs must verify by their individual due dates — in practice tied to their next confirmation statement filing. Companies House estimated 6-7 million individuals need to verify by mid-November 2026. From no earlier than November 2026, IDV will extend to anyone who files at Companies House. Still deferred to a later date: limited partnerships, corporate directors, corporate members of LLPs, and officers of corporate PSCs. Authorised Corporate Service Providers (ACSPs) have had to register since 18 March 2025 to verify identities on clients' behalf. Sanctions for non-compliance include financial penalties and inability to file documents or incorporate.

Sources:
- https://changestoukcompanylaw.campaign.gov.uk/identity-verification/
- https://changestoukcompanylaw.campaign.gov.uk/changes-at-a-glance/
- https://www.taylorwessing.com/en/insights-and-events/insights/2025/04/new-identity-verification-requirements-under-eccta

**Other ECCTA changes already in force affecting data quality (from 4 March 2024 and 2025)**  
_Confidence: high_

From 4 March 2024: Companies House gained greater powers to query and reject information; stronger checks on company names; new registered office address rules (an 'appropriate address' — PO Boxes no longer acceptable); a mandatory registered email address; a lawful purpose statement on incorporation and on each confirmation statement; and enhanced investigation and enforcement powers. Spring/Summer 2025: individuals gained the ability to suppress personal information from historical documents — this is a data-availability RISK for QuarterMark, as historical director addresses and other details may be redacted over time. 1 February 2026: Companies House fees changed. Still forthcoming: limited partnerships must file through ACSPs with expanded information requirements; enhanced shareholder disclosure; restrictions on corporate directors.

Sources:
- https://changestoukcompanylaw.campaign.gov.uk/changes-at-a-glance/
- https://changestoukcompanylaw.campaign.gov.uk/

**Bulk data products for bootstrapping: Free Company Data Product (monthly CSV), PSC bulk (daily JSON), Accounts Data Product (iXBRL/XML) — but no public timepoint-aligned stream snapshot**  
_Confidence: medium_

Free Company Data Product at http://download.companieshouse.gov.uk/en_output.html — as at 1 August 2026 it is BasicCompanyDataAsOneFile-2026-08-01.zip at 470MB, or split into 7 parts of 49-70MB each (BasicCompanyData-2026-08-01-part1_7.zip ... part7_7.zip). CSV inside ZIP, updated within 5 working days of the previous month end. PSC bulk data is JSON, updated daily. Accounts Data Product at http://download.companieshouse.gov.uk/en_accountsdata.html provides iXBRL/XML instance documents of electronically filed accounts, with daily files for recent data and monthly files for history back to 2008; a new monthly file appears within 5 working days of month end. Officers bulk data is NOT public — it requires a direct request to Companies House and is delivered in fixed-width format via a cloud storage link. IMPORTANT GAP: Companies House does not offer a public snapshot aligned to a stream timepoint before you connect, so there is no clean 'snapshot + resume' bootstrap; you must load the bulk snapshot, attach to the stream, and accept a reconciliation window. (Timepoint-aligned snapshots are reportedly available via the paid Companies Catalogue / FTP products — unverified pricing.)

Sources:
- http://download.companieshouse.gov.uk/en_output.html
- https://download.companieshouse.gov.uk/en_accountsdata.html
- https://chguide.co.uk/bulk-data/
- https://data.europa.eu/data/datasets/companies-house-free-company-data-product?locale=en

**UK winding-up petitions are NOT available via any public API before Gazette advertisement — the Central Registry is phone/in-person only**  
_Confidence: medium_

The Central Registry of Winding-up Petitions is a computerised register of petitions and administration applications presented to the Insolvency and Companies List, Chancery District Registries and the County Court. It can be searched only by personal attendance at the Companies Court General Office or by telephone (020 7947 7328), and via public terminals at the court. It is explicitly 'not searchable online in the same way as Companies House records'. There is a ~7-day gap between presentation of a petition and its Gazette advertisement under code 2450. Commercial credit bureaux (e.g. Creditsafe, and Capitalise which added winding-up petitions and dismissals to credit profiles alongside CCJs) obtain this earlier. I found NO public API from the Companies Court or Registry Trust (CCJ data) — commercial licensing would be required to close the 7-day gap.

Sources:
- https://www.lexisnexis.co.uk/legal/guidance/winding-up-administration-searches-for-companies-at-the-central-registry
- https://go-legal.co.uk/central-registry-of-winding-up-petitions-expert-guide/
- https://capitalise.com/gb/news/winding-up-petitions-and-dismissals-added-to-credit-profiles
- https://www.insolvencydirect.bis.gov.uk/freedomofinformation/technical/TechnicalManual/Ch37-48/chapter45/part4/part_4.htm

**Ireland: CRO Open Services provides a real authenticated API with JSON support**  
_Confidence: medium_

CRO (Companies Registration Office) operates 'Open Services' at services.cro.ie, providing automated access to company and submission data, used by software developers, regulatory bodies and financial service providers. Supports XML and JSON (request JSON via the Content-Type / Accept header as application/json). Service interface help is published at https://services.cro.ie/cws/help. Access requires signing up, providing details and accepting the Open Services Terms and Conditions, after which an API key is issued. CRO also runs a CKAN-based open data portal at opendata.cro.ie with a standard CKAN Data API. I was unable to fetch services.cro.ie directly (HTTP 403 to automated agents), so exact endpoint paths, rate limits and any fees are UNVERIFIED — you will need to register and read /cws/help.

Sources:
- https://services.cro.ie/overview.aspx
- https://services.cro.ie/code/phpjson.htm
- https://opendata.cro.ie/ga/api/1/util/snippet/api_info.html?resource_id=e64eb540-fb97-44c2-b461-766f2babbdf6
- https://cro.ie/services-and-help/cro-support-services/

**Netherlands: KVK has a mature, metered developer API — the best-documented non-UK option, but pay-per-query**  
_Confidence: high_

Official developer portal at developers.kvk.nl. APIs available: Zoeken (search by trade name or location — FREE), Basisprofiel (basic registration details by KVK number: activity, owner/main location, list of locations), Vestigingsprofiel (establishment profile), Naamgeving (naming), and Mutatieservice (CHANGE/MUTATION SERVICE — this is the one that matters for monitoring, as it surfaces changes rather than requiring polling). Pricing: EUR 6.40 per month per API key for the connection, plus EUR 0.02 per query; Zoeken is free. Subscription is requested via the Developer Portal; once approved you receive an API key. A free test environment with fictitious data is available. Cost modelling: monitoring 200 Dutch borrowers daily via Basisprofiel ≈ 200 x 0.02 x 30 = EUR 120/month plus the key fee — cheap, but it does mean per-borrower marginal cost, unlike the UK.

Sources:
- https://developers.kvk.nl/
- https://developers.kvk.nl/pricing
- https://developers.kvk.nl/apis
- https://developers.kvk.nl/documentation
- https://www.kvk.nl/en/ordering-products/kvk-api/

**France: INPI provides free API and SFTP access to the Registre National des Entreprises (RNE), updated daily**  
_Confidence: medium_

INPI has been the operator of the RNE since 1 January 2023, replacing the previous format with a new JSON-based structure. APIs allow reusers to make refined queries on RNE data in bulk, updated daily for companies. Access is free of charge; users create an account on data.inpi.fr and manage credentials from the 'My API / SFTP Access' section of their personal space. Downloadable technical documentation covers RNE Base (formalities data in JSON), annual accounts (JSON), and acts (PDF). A separate route exists via API Entreprise (entreprise.api.gouv.fr) for the RNE attestation d'immatriculation, though API Entreprise is generally restricted to public-sector and authorised consumers. Note: French annual accounts availability is significant — unlike the UK, France publishes filed accounts in structured JSON via INPI, which may make French borrowers MORE tractable for financial-covenant automation than UK ones. Exact auth mechanism (token type, header) UNVERIFIED — obtain the technical documentation after registering.

Sources:
- https://data.inpi.fr/content/editorial/Acces_API_Entreprises
- https://www.inpi.fr/ressources/formalites-dentreprises/acces-lapi-formalite-rne
- https://www.inpi.fr/ressources/formalites-dentreprises/RNE
- https://entreprise.api.gouv.fr/catalogue/inpi/rne/attestation_immatriculation

**Germany: NO confirmed official public developer API for Handelsregister/Unternehmensregister — commercial intermediaries required**  
_Confidence: medium_

The Handelsregister is maintained by local courts (Amtsgerichte) and surfaced via handelsregister.de; the Unternehmensregister is the disclosure platform. Basic data access became free in August 2022 but through a web interface, not a documented public API. Handelsregister announcements are available from 2007 and annual financial statements from 2006. Independent analysis states plainly that 'Germany does not have one clean, unrestricted, free official bulk file containing every German company', and that the practical approach is controlled official access plus enrichment. Several commercial APIs exist (handelsregister.ai, OpenRegister/openregister.de, Apify scrapers) offering daily-updated REST access — these are third parties, NOT official, and carry ToS and reliability risk. I found NO official German government developer portal. Treat Germany as the hardest major market and budget for a paid data provider.

Sources:
- https://handelsregister.ai/en
- https://openregister.de/en/api
- https://docs.openregister.de/sources/handelsregister
- https://companiesdata.cloud/open-company-data-germany.html

**Luxembourg: LBR API claims could NOT be verified from primary sources — treat as unverified**  
_Confidence: low_

Luxembourg Business Registers (LBR) operates three registers: RCS (Registre de Commerce et des Sociétés — companies), RBE (Registre des Bénéficiaires Effectifs — beneficial owners), and RESA (Recueil électronique des sociétés et associations — the official electronic gazette, which is where Luxembourg insolvency/liquidation notices are published and is the direct analogue of The Gazette). Multiple secondary sources (Kyckr, Topograph, Zephira, SYNTA-IQ) assert that LBR operates an open-data REST API and/or a fielded XML API covering RCS records and RESA publications, with documentation on an 'LBR developer portal'. I could NOT confirm any of this from lbr.lu or an official Luxembourg government source — the data.public.lu dataset page returned 404. The RCS web search and document download are confirmed free to the public. UNVERIFIED: existence of an LBR API, its endpoints, auth, formats, and cost. Contact LBR directly before planning around it. RESA is the highest-value Luxembourg target for distress monitoring regardless of API availability.

Sources:
- https://www.lbr.lu/
- https://guichet.public.lu/en/entreprises/creation-developpement/constitution/entreprise-individuelle/immatriculation-entreprise-publication-rcs.html
- https://www.kyckr.com/blog/luxembourg-registry-guide-2025
- https://www.topograph.co/guides/business-registers-in-luxembourg

**BRIS (Business Registers Interconnection System) is a human-facing portal, not a usable API — it does not solve pan-European monitoring**  
_Confidence: medium_

BRIS connects the business registers of all 27 EU Member States plus Iceland, Liechtenstein and Norway to a 'European Central Platform' (ECP) that orchestrates traffic between national registers and the European e-Justice Portal. It is free, live, and queries national registers in real time via the 'Find a company' search. It also enables registers to share information on foreign branches and cross-border mergers, and assigns each company a EUID. However, I found NO documented public API or machine-readable interface for BRIS — it is a search UI. A companion system, BORIS, interconnects beneficial ownership registers. Conclusion: BRIS is useful for one-off manual verification and for the EUID as a cross-border identifier concept, but it cannot be the technical backbone of automated pan-European monitoring.

Sources:
- https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/blog/2017/09/19/533365899/Business+Register+Interconnection+System+BRIS
- https://e-justice.europa.eu/topics/registers-business-insolvency-land/beneficial-ownership-registers-interconnection-system-boris_en
- https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/210798097/Business+Registers+Interconnection+System+dashboard

**Pan-European monitoring verdict: technically feasible but structurally uneven — UK is a genuine moat, the Continent is not**  
_Confidence: medium_

Ranking by implementation tractability: (1) UK — free, real-time streaming, full REST, bulk snapshots, OGL, gazette API. Uniquely good. (2) Netherlands — proper documented API with a dedicated Mutatieservice change feed, but per-query pricing. (3) France — free API/SFTP with daily RNE updates and structured annual accounts in JSON. (4) Ireland — real API but registration-gated and under-documented publicly. (5) Luxembourg — official API unverified; RESA gazette is the target. (6) Germany — no official API; requires commercial vendors. NO country other than the UK offers a genuine push/streaming event feed (the KVK Mutatieservice is the closest analogue). A pan-European product must therefore be architected as: a UK real-time path, plus a per-jurisdiction scheduled-poll adapter layer normalising to a common internal event model (entity, event_type, effective_date, source, raw_payload). Budget for commercial data (Creditsafe, Kyckr, Bureau van Dijk-style) to fill Germany and to close the UK winding-up-petition 7-day gap.

Sources:
- https://developers.kvk.nl/pricing
- https://data.inpi.fr/content/editorial/Acces_API_Entreprises
- https://services.cro.ie/overview.aspx
- https://companiesdata.cloud/open-company-data-germany.html
- https://e-justice.europa.eu/topics/registers-business-insolvency-land/beneficial-ownership-registers-interconnection-system-boris_en

### Implications for QuarterMark
- Build the streaming consumer as a leader-elected SINGLETON, never behind an autoscaler or plain rolling deploy. The two-concurrent-connections-per-account limit means a duplicate pod silently kills your live connection and you will lose events with no error surfaced. This is the single most likely production incident in the whole ingestion stack.
- You cannot have all nine streams on one API key. Pick the two highest-value streams for real-time (recommended: /filings and /charges, since MR01 charge registrations and insolvency-category filings are the sharpest covenant triggers) and cover /insolvency-cases, /officers and /companies via scheduled REST polling of the borrower portfolio. Alternatively apply to Companies House for an uplift — do this early, it is a free ask.
- Persist last_timepoint per stream in Postgres and commit it only after durably writing the raw envelope to an outbox table. Make covenant evaluation a separate async worker, idempotent on (resource_kind, resource_id, timepoint). Never do business logic inline on the socket — backpressure will get you disconnected.
- A nightly full-portfolio REST reconciliation job is NOT optional. Stream replay history is only a few days and returns 416 beyond that, and CH force-disconnects every night around 2-3am. Any outage longer than the replay window is unrecoverable from the stream alone.
- Do NOT build covenant financial ratios on an assumption that UK small-company P&L data is coming. It slipped to April 2028 on 9 June 2026, and even then small companies can opt out of PUBLIC publication. QuarterMark must get borrower financials from the fund's own reporting packs (LLM extraction from PDF/Excel management accounts), not from Companies House. Position this as a feature: you handle the reporting pack that the registry will never give you.
- The highest-value single differentiator versus Allvue and 73 Strings is the MR01 charge-registration trigger. Companies House gives you contains_negative_pledge, contains_floating_charge, floating_charge_covers_all and persons_entitled[] as structured fields, and the 21-day filing deadline makes it near-real-time. A rule that fires 'borrower granted new security to a third party, negative pledge present' within hours of filing is something no incumbent surfaces well.
- The Gazette API is free, unauthenticated for reads, returns JSON, and is the ONLY public route to winding-up petitions (code 2450). Build this ingestion in week one — it is trivially cheap and it is the most severe distress signal available. Poll /insolvency/notice/data.json with noticetype filters daily. Pair 2450 with 2461 (dismissal) so you retract alerts on dismissed petitions.
- Exclude Members' Voluntary Liquidation from distress scoring. MVL (Gazette codes 2431-2435, CH case type members-voluntary-liquidation, declaration-solvent-on date) is a SOLVENT wind-up. Scoring it as distress will produce embarrassing false positives in front of credit committees.
- Do not build on accounts.next_due, accounts.next_made_up_to, has_charges or has_insolvency_history — all are deprecated in the company profile schema. Use accounts.next_accounts.*, and call the charges and insolvency endpoints directly.
- company_status_detail = 'active-proposal-to-strike-off' is an underrated early-warning field: the company still reads as 'active' but Companies House is moving to dissolve it. Surface this prominently; it usually indicates persistent filing failure well before formal insolvency.
- Parse defensively. Companies House developer guidelines explicitly require clients to accept new JSON fields and changed member ordering. Use permissive deserialisation with a raw JSONB column retained in Postgres — do not use strict schema validation that rejects unknown keys, and never drop the raw payload.
- Licensing is clean enough to sell against: OGL v3.0, and Companies House staff have stated on the record that nothing restricts commercial use. But get the exact licence wording confirmed in writing from Companies House before making licensing representations in fund due-diligence questionnaires — I could not locate a single canonical terms-of-use page. Separately, UK GDPR still applies to officer and PSC personal data: document a legitimate-interests basis and a ROPA entry.
- Never shard across multiple API keys purely to beat the 600-per-5-minutes limit. The guidelines reserve the right to ban without notice applications that 'attempt to bypass the rate limits'. Request an uplift instead — losing API access would be an extinction-level event for the product.
- Bootstrap the borrower universe from the Free Company Data Product monthly CSV (470MB, ~7 parts) rather than crawling the API, then attach to the stream. Accept and explicitly handle the reconciliation gap — there is no public timepoint-aligned snapshot.
- The Document API plus iXBRL is the bridge to deeper financial data today: filing-history gives you links.document_metadata, the Document API redirects to a pre-signed S3 URL, and you can request application/xhtml+xml for iXBRL accounts. Configure your HTTP client for the redirect and expect short-lived URLs. This is a real path to structured financials for medium and large borrowers now, ahead of the 2028 small-company change.
- For Europe, architect a per-jurisdiction adapter layer normalising to a common internal event model from day one, even while only the UK is implemented. Only the UK has true push streaming; the Netherlands Mutatieservice is the nearest analogue, and everything else is scheduled polling. Retrofitting this abstraction later will be painful.
- Germany is the expensive gap — no official API, commercial vendors only. If the target funds have material German exposure, price a data vendor into the model early. Conversely, France may be easier than the UK for financial covenants, since INPI publishes structured annual accounts in JSON, free, updated daily.
- Watch the ECCTA personal-information suppression right introduced in 2025: historical director addresses and details can be redacted over time. Snapshot and retain officer data as you observe it, because the register is now a mutable source, not an append-only one.


---

## v2:0c919fa3e0a198116b52e7280a92b1643fcb4292ddf1fb0d43aa5368fa970918

### Summary
QuarterMark's reporting-output surface splits into four distinct deliverables, and the UK regulatory half of it is being rewritten right now. (1) EU AIFMD Annex IV reporting is governed by Commission Delegated Regulation (EU) No 231/2013 Annex IV, transmitted as two XML files validated against ESMA's XSDs — AIFMD_DATMAN_V1.2.xsd (manager) and AIFMD_DATAIF_V1.2.xsd (fund), sharing AIFMD_REPORTING_DataTypes_V1.2.xsd — under IT Technical Guidance rev 6 (ESMA ref 2013/1358), applicable since 22 November 2023. Frequency is set by Article 110(3) on AUM thresholds (EUR 100m / 500m / 1bn), with a one-month deadline extended 15 days for funds-of-funds. (2) AIFMD II (Directive (EU) 2024/927) leaves Annex IV largely alone until later: most provisions transpose by 16 April 2026 but the amended Article 24 reporting applies from 16 April 2027, with ESMA RTS/ITS on the new templates due by that date — so the loan-origination-specific regulatory *fields* do not yet exist in public form. What does bite for loan-originating AIFs now is Article 15 (20% single-borrower limit where the borrower is a financial undertaking/AIF/UCITS, 5% risk retention, 175% open-ended / 300% closed-ended leverage caps, originate-to-distribute prohibition) and Article 23 investor disclosure of the composition of the originated loan portfolio and of loan-related fees, charges and expenses. (3) In the UK, the current regime is AIF001 (Manager Report) + AIF002 (Fund Transparency Report) submitted via RegData against FRN/PRN, with frequency set by SUP 16.18: small authorised and small registered UK AIFMs report annually to 31 December; full-scope UK AIFMs report annually, half-yearly or quarterly per SUP 16.18.4EU(3). (4) That entire regime is being replaced. FCA CP26/26 "Fund Reporting for Asset Management Entities" (FRAME, July 2026, closes 22 September 2026) explicitly proposes removing AIF001 and replacing AIF002, introducing an Essential/Enhanced two-tier framework split at £500m fund NAV, with a dedicated Loan Origination Fund classification and a loan-origination reporting module. Its proposed definitions are strikingly close to covenant-monitoring primitives: non-accrual at 90 days past due, covenant defaults, significant amendments to loan documentation, LTV, lien seniority, weighted average spread, average life, unrecoverable. Companion CP26/28 sets new firm tiers at £750m NAV (small→medium) and £5bn (medium→large), implementation envisaged 2028. (5) On the LP side, ILPA's updated Reporting Template (released January 2025) is mandatory-in-practice from Q1 2026, is no longer modifiable, and has two components: an enhanced Capital Account Statement (NAV roll with Internal Chargebacks broken out from ~20 named external Partnership Expense lines, Offsets roll-forward, Commitment Reconciliation, Accrued/Earned/Paid Carried Interest reconciliation) and a Schedule of Fees and Reimbursements received by the Adviser/Related Persons from portfolio companies. (6) Valuation is governed by the 2025 IPEV Valuation Guidelines, effective for quarterly reporting periods beginning on or after 1 April 2026, whose Section II 5.6 Debt Investments and 5.7 Rolled up Loan Interest are the operative private-debt provisions: fair value standalone, DCF as the typical technique, par is not automatically fair value, credit quality must be assessed, and non-performing debt is treated differently from performing debt.

### Findings

**EU Annex IV reporting is transmitted as two XML files validated against ESMA XSD v1.2, under IT Technical Guidance revision 6 (ESMA ref 2013/1358), applicable since 22 November 2023**  
_Confidence: high_

The manager file validates against AIFMD_DATMAN_V1.n.xsd and the fund file against AIFMD_DATAIF_V1.n.xsd, with shared element definitions in AIFMD_REPORTING_DataTypes_V1.2.xsd. The rev 6 package contains the guidance document with a 'change history' sheet, XML sample reports for both AIFM and AIF, Excel reference tables (Annex III geographical areas; Annex II tables 1-10), and validation rules that made additional fields mandatory. Scope is stated as Articles 3(3)(d) and 24(1),(2),(4) AIFMD. CSSF confirms all text fields must be completed in English and that a correction is filed as filing type 'AMND' resending the complete data record. ESMA technical contact is info.it.aifmd@esma.europa.eu. Practical implication for QuarterMark: you generate two separate XML documents per reporting period, not one, and an amendment is a full-record replay rather than a delta.

Sources:
- https://www.esma.europa.eu/document/aifmd-reporting-it-technical-guidance-rev-6-updated
- https://www.cssf.lu/wp-content/uploads/AIFM_Reporting_Technical_Guidance.pdf
- https://regdata.fca.org.uk/specifications/DRG/AIF002/1.2/AIFMD_DATAIF_V1.2.xsd

**The AIF XSD root element is AIFReportingInfo, containing AIFRecordInfo, CancellationAIFRecordInfo and Assumptions blocks — concrete element names QuarterMark must emit**  
_Confidence: high_

From the FCA's own hosted copy of AIFMD_DATAIF_V1.2.xsd: root element AIFReportingInfo carries attributes ReportingMemberState, Version, CreationDateAndTime. ComplexAIFRecordInfoType contains FilingType, AIFContentType, ReportingPeriodStartDate, ReportingPeriodEndDate, ReportingPeriodType, ReportingPeriodYear, AIFMNationalCode, AIFNationalCode, AIFName, AIFEEAFlag, AIFReportingCode, AIFDomicile, InceptionDate, LastReportingFlag, AIFNoReportingFlag (the Nil-return mechanism), and AIFCompleteDescription. ComplexCancellationAIFRecordInfoType contains CancelledAIFNationalCode, CancelledAIFMNationalCode, CancelledReportingPeriodType, CancelledReportingPeriodYear, CancelledRecordFlag. Supporting types include CountryCodeType, FilingTypeType, AIFContentTypeType, ReportingPeriodTypeType, AIFReportingCodeType, AIFMNationalCodeType, AIFNationalCodeType, StringRestricted300Type.

Sources:
- https://regdata.fca.org.uk/specifications/DRG/AIF002/1.2/AIFMD_DATAIF_V1.2.xsd

**Annex IV reporting frequency is set by Article 110(3) of Delegated Regulation 231/2013 on AUM thresholds, with a one-month deadline and a 15-day extension for funds-of-funds**  
_Confidence: medium_

Half-yearly where portfolios exceed EUR 100m (or EUR 500m for unleveraged closed-ended funds with a 5-year lock) but remain below EUR 1bn; quarterly where AUM exceeds EUR 1bn, and quarterly for each individual unleveraged AIF above EUR 500m; annual for unleveraged AIFs investing in non-listed companies and issuers to acquire control. Information must be provided 'as soon as possible and not later than one month after the end of the period', extended by 15 days for fund-of-funds. Reporting period end dates are 31 December (annual); 30 June and 31 December (half-yearly); 31 March, 30 June, 30 September and 31 December (quarterly). Note: the search-result gloss on Article 110(3) was summarised rather than quoted verbatim, so treat the exact wording of the EUR 100m/500m interaction as needing a final check against the consolidated text before hard-coding.

Sources:
- https://www.legislation.gov.uk/eur/2013/231/article/110
- https://www.fca.org.uk/publication/documents/reporting-annex-iv-transparency-aifmd.pdf

**UK reporting today is AIF001 (Manager Report) plus AIF002 (Fund Transparency Report) submitted via RegData, keyed on FRN and PRN — not LEI**  
_Confidence: high_

FCA guidance is explicit: 'You must provide the required transparency information in accordance with the pro-forma reporting templates set out in Annex IV of the AIFMD Level 2 Regulation.' AIF001 carries AIFM-specific information, AIF002 carries AIF-specific information. Identification must use the FCA-issued Firm Reference Number for the AIFM and Product Reference Number(s) for each AIF; the FCA states that for non-EEA AIFs, other regulators' manager/fund identifiers 'must not be used in the AIF001 and AIF002 national identifier fields' — those fields are reserved for FRN/PRN only. LEI is requested separately as an alternative identification code. Umbrella AIFs report at compartment/sub-fund level. Feeder AIFs are reported individually and must not be aggregated with their master; no look-through to master holdings, and no look-through for fund-of-funds. A Nil return is submitted via a specific field where there is nothing to report.

Sources:
- https://www.fca.org.uk/publication/documents/reporting-annex-iv-transparency-aifmd.pdf
- https://www.fca.org.uk/firms/aifmd/reporting

**UK frequency by manager type: small authorised and small registered UK AIFMs report annually to 31 December; full-scope UK AIFMs determine frequency from SUP 16.18.4EU(3) AUM thresholds**  
_Confidence: high_

SUP 16.18.6R (small authorised UK AIFM) and SUP 16.18.7D (small registered UK AIFM) both require annual reporting with period ending 31 December. Under SUP 16.18.4EU(3) a full-scope UK AIFM can be required to report quarterly, half-yearly or annually by reference to AUM thresholds. Small non-EEA AIFMs marketing in the UK report annually (SUP 16.18.9D); above-threshold non-EEA AIFMs use the SUP 16.18.4EU(3) thresholds, calculated on total AUM of all AIFs marketed in the Union, not just those marketed in the UK. Critically for QuarterMark: RegData's initially displayed schedule defaults to half-yearly for full-scope and annual for small AIFMs and the FCA states this 'should NOT be relied upon as being correct' — the firm must self-assess and communicate a change via change-in-frequency codes inside the AIF001/AIF002 submission itself. That is a genuine product hook: frequency determination is the manager's liability and is currently done in spreadsheets.

Sources:
- https://www.fca.org.uk/publication/documents/reporting-annex-iv-transparency-aifmd.pdf

**FCA CP26/26 (FRAME, July 2026) proposes removing AIF001 entirely and replacing AIF002 — the UK Annex IV regime QuarterMark would build against is being decommissioned**  
_Confidence: high_

CP26/26 paragraph 7.4: 'We also propose removing AIF001, as relevant essential data will be captured under the FRAME; for example, fund jurisdiction, currency, and market. AIF002 will be also replaced with the FRAME.' FSA042 is also decommissioned. FRAME covers FCA-authorised UK AIFMs (all AIFs managed), RVECA/SEF managers, UK UCITS mancos, third-country AIFMs marketing under NPPR, and operators of recognised schemes. Consultation closes 22 September 2026; the FCA states its proposals would 'reduce the reporting burden across the population of fund managers by 75%'. Companion CP26/28 (The UK AIFM Regime) closes 14 October 2026 with implementation envisaged in 2028, and confirms 'The Treasury will revoke the AIFMD reporting requirements and we will replace them with simplified, coherent reporting for all asset managers.'

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf
- https://www.fca.org.uk/publications/consultation-papers/cp26-26-fund-reporting-for-asset-management-entities
- https://www.fca.org.uk/publication/consultation/cp26-28.pdf

**FRAME creates an explicit 'Loan Origination Fund' classification with a dedicated reporting module, and its proposed rule definitions are covenant-monitoring primitives**  
_Confidence: high_

CP26/26 §6.9 defines a loan originating fund as any fund (including an authorised fund) '(i) that has an investment strategy that is mainly based on the use of originated loans; or (ii) where the fund has originated loans that have a notional value that represents at least 50% of the fund's NAV.' §6.13 sets out proposed rule definitions verbatim: Loan-to-value = 'the loan amount divided by the asset value multiplied by 100, given as a percentage'; Non-accrual = 'a loan is classified as non-accrual when it is 90 days past overdue on its interest payment, or other payment due in return for lending'; Lien = 'a claim on collateral. The first lien is the first claim on collateral; the second lien is the second claim and so on'; Spread = 'the interest rate or premium charged by the lender over a floating benchmark (eg Secured Overnight Financing Rate – SOFR)'; Average life of loans in the portfolio; Significant amendments to loan documentation = 'non-grammatical amendments to a document that sets any kind of lending term between multiple parties, resulting in a change of previously agreed terms'; Covenant defaults = 'when a borrower violates a contractual agreement in their loan agreement including but not limited to failing on a financial metric'; Unrecoverable = 'when a loan is written off by the lender when methods of recovery are exhausted'. §6.14: 'The loan origination reporting section of our enhanced reporting will enable us to follow the lifecycle of poorly performing loan books, from non-accrual to becoming unrecoverable.' §6.10 notes a 'FRAME template form' was published alongside the CP — QuarterMark should obtain that form directly for the exact field list. §6.15 explicitly asks loan origination fund managers which of these data points are 'already available through internal or investor reporting' — a clear signal the FCA expects this to come out of a covenant-monitoring system.

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf

**FRAME's two-tier structure splits at £500m fund NAV, with 19 enhanced sections; loan origination and private markets sections are enhanced-only**  
_Confidence: high_

CP26/26 §3.2: essential requirements for each fund under £500m NAV, enhanced requirements above. §3.37: 'around 9% of funds in scope of FRAME are over £500 million NAV'; §3.3: of 21,684 AIFs, 19,571 (90%) would report essential only. §5.3: enhanced requirements are split into 19 sections. Table 1 (§5.4) assigns: Private Markets = All Private Market funds; Private Equity = Private Equity funds only; Loan origination funds = Loan origination funds only; Market Risk Sensitivities and VaR excludes Private Market funds; Portfolio Exposures and Portfolio Concentrations exclude UK UCITS/NURS. Frequency and lag for unauthorised AIFs (the private credit case): annual, 120-day lag (vs the current one-calendar-month lag). Hedge funds get quarterly with 45-day lag. Two threshold-management rules: 'opt-up' (voluntarily report enhanced below £500m) and a 'time cushion' of two quarters (or one year for annual reporters) before new requirements bite. Thresholds are set at fund level, not manager level.

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf

**FRAME replaces the AIFMD exposure tables with a two-dimensional Portfolio Exposure Matrix and adds tailored private-credit sub-asset classes**  
_Confidence: high_

CP26/26 §5.45-5.48: current AIFMD collects exposures across Main Instruments, Individual exposures to assets, Geographical Focus, Principal Exposures, Most Important Portfolio Concentrations, and Principal Markets. FRAME rationalises these into a Portfolio Exposure Matrix with two dimensions — what the fund is exposed to at sub-asset level, and how that exposure is obtained (security, derivative, ETF, or investment in another fund) — reported as at the last business day of the reporting period. §5.48: 'For private assets, including unlisted equities and private credit, we have developed more tailored categories because current AIFMD reporting does not provide enough detail to reflect the growth and variety of these asset classes.' Also material: the FCA proposes to stop requiring Gross and Commitment method leverage calculations entirely (§3.16), collecting underlying leverage data instead. Private equity funds would additionally report net IRR, gross IRR and MOIC (§6.20), and dominant influence data with Companies House company numbers for UK companies only (§6.18).

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf

**FRAME collects private-market valuation data at portfolio level via yes/no and multiple-choice questions about third-party valuers, not asset-by-asset**  
_Confidence: high_

CP26/26 §6.5-6.6: 'Our proposals require information about whether the fund uses third party valuers, how often they are used, and whether the entire portfolio has been valued by a third party valuer... We propose collecting valuation data at a portfolio level based on the manager's valuation methodology, policy, and procedure, rather than on an asset-by-asset basis.' §6.4 notes HMT proposes to remove the legislative concept of an external valuer and with it strict liability for the valuation performed, while CP26/28 sets requirements for an authorised AIFM to have valuation policies and procedures. This is a lighter-touch regulatory ask than QuarterMark might assume — the differentiated depth belongs in the LP report and the valuation working papers, not the regulatory return.

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf

**CP26/28 sets new UK AIFM firm-size tiers at £750m and £5bn NAV, moving off the leverage-based AUM metric — QuarterMark's £50m-£500m target segment sits entirely in the 'small AIFM' tier**  
_Confidence: high_

CP26/28 §2.4: the FCA originally proposed £100m NAV for medium and £5bn for large, but 'received consistent feedback that the small to medium-sized threshold was too low. Respondents argued that this is a reduction from the current €500m threshold for firms managing closed-ended, unleveraged AIFs.' §2.9: 'We have decided to set the threshold for smaller AIFMs to transition to medium AIFMs at £750m NAV, rather than our initial proposal of £100m NAV.' §2.11 confirms £5bn for large. §2.14/2.17: size is the aggregate NAV of all AIFs managed (plus residual CIS), using the mean NAV for each AIF averaged over the most recent quarter of a calendar year. §2.13: 'we are moving away from a formulaic, leverage-based metric'. Grace periods: 6 months to comply after crossing a threshold, 12 months for the depositary requirement. A new ALTS sourcebook is proposed for managers of unauthorised funds. Feedback due 14 October 2026 (18 September 2026 for discussion chapters other than prudential); final policy statement in 2027 alongside HMT's SI; implementation 2028.

Sources:
- https://www.fca.org.uk/publication/consultation/cp26-28.pdf

**AIFMD II (Directive (EU) 2024/927) defers the amended Article 24 reporting to 16 April 2027 — the loan-origination regulatory fields do not yet exist publicly**  
_Confidence: high_

General transposition deadline is 16 April 2026, but the amended Article 24 reporting obligations apply from 16 April 2027, with ESMA mandated to develop RTS/ITS on the details of reporting (including frequency and timing) by that date. The amended Article 24 adds delegation reporting: 'information on the delegates, a list and description of the delegated activities, the amount and percentage of the assets of the managed AIFs that are subject to delegation arrangements', plus oversight/monitoring of delegates, sub-delegation arrangements, and commencement and expiry dates. Practical implication: QuarterMark cannot build the AIFMD II loan-origination regulatory template today because ESMA has not published it. The FCA's FRAME loan-origination module is currently the most concrete published field set anywhere for private-credit regulatory reporting.

Sources:
- https://eur-lex.europa.eu/eli/dir/2024/927/oj/eng
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL_202400927

**AIFMD II Articles 15 and 23 impose loan-origination constraints and investor disclosures that are directly computable and monitorable — this is QuarterMark's compliance-engine surface**  
_Confidence: high_

Article 15 (as amended): notional value of loans originated to any single borrower must not exceed in aggregate 20% of the capital of the AIF where the borrower is a financial undertaking, an AIF or a UCITS; leverage caps on the commitment method of 175% of NAV for open-ended loan-originating AIFs and 300% for closed-ended; retain 5% of the notional value of each loan originated and subsequently transferred, until maturity for loans of up to eight years, or for at least eight years for other loans; prohibition on managing AIFs whose strategy in whole or part is to originate loans 'with the sole purpose of transferring those loans or exposures to third parties'; and effective policies, procedures and processes for assessing credit risk and for administering and monitoring the credit portfolio, subject to at least annual review. Article 23 requires disclosure to investors of the composition of the originated loan portfolio and periodic reporting on all fees, charges and expenses borne by the AIFM that are allocated to the AIF or its investments. Each of these is a continuously-computable limit test against a loan book — exactly the shape of a covenant engine.

Sources:
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ%3AL_202400927
- https://eur-lex.europa.eu/eli/dir/2024/927/oj/eng

**ESMA finalised RTS on open-ended loan-originating AIFs on 21 October 2025 (ESMA34-671404336-1345), covering liquidity management, liquid assets, stress testing and redemption policy**  
_Confidence: high_

Consultation paper ESMA34-1985693317-1085 issued 12 December 2024, closed 12 March 2025; Final Report ESMA34-671404336-1345 published 21 October 2025. The requirements mandate a sound liquidity management system, availability of liquid assets, stress testing, and an appropriate redemption policy having regard to the liquidity profile of loan-originating AIFs. Separately, ESMA published a Discussion Paper on integrated reporting (ESMA12-2121844265-4904, 23 June 2025). Note these RTS are about open-ended structures specifically — a fund in QuarterMark's target segment running closed-ended direct lending is outside their scope, but the leverage cap distinction (175% vs 300%) still turns on open/closed-ended status.

Sources:
- https://www.esma.europa.eu/sites/default/files/2025-10/ESMA34-671404336-1345_Final_Report_on_the_Draft_Regulatory_Technical_Standards_on_open-ended_loan-originating_AIFs_under_the_AIFMD.pdf
- https://www.esma.europa.eu/press-news/esma-news/esma-publishes-implementing-rules-loan-originating-aifs
- https://www.esma.europa.eu/sites/default/files/2025-06/ESMA12-2121844265-4904_DP_on_integrated_reporting.pdf

**The ILPA Reporting Template v2.0 (released January 2025) has exactly two components and is no longer modifiable — QuarterMark can generate it deterministically**  
_Confidence: high_

Component A, the Capital Account Statement, presents movement from Beginning NAV to Ending NAV covering: Total Cash/Non-Cash Flows from capital activity (Contributions/Distributions), including Offering/Syndication Costs, Placement Fees and Partner Transfers; Management Fees; fees and expenses allocated or paid to the GP or Related Persons (Internal Chargebacks); fees and expenses paid to External/Third-Parties; Offsets, Rebates or Waivers; Investment Income; Realized and Unrealized Gain (Loss); and a Reconciliation for Accrued Carried Interest. It also walks Beginning Unfunded Commitment to Ending Unfunded Commitment (Commitment Reconciliation). Component B is the Schedule of Fees and Reimbursements Received by the Investment Adviser and Related Persons, with Respect to the Private Fund's Portfolio Companies/Investments. Values are presented at three levels — individual LP's Allocation, Total Fund, and GP's Allocation — and on three period bases — QTD, YTD and ITD. Frequency quarterly. ILPA states: 'Modifications are no longer able to be made to the Reporting Template – by LPs and GPs alike.'

Sources:
- https://ilpa.org/wp-content/uploads/2025/01/ILPA-Reporting-Template-v.-2.0-Suggested-Guidance.pdf
- https://ilpa.org/industry-guidance/templates-standards-model-documents/ilpa-templates-hub/ilpa-reporting-template/

**ILPA v2.0's named expense line items are a fixed, enumerable chart of accounts — this is directly implementable as a schema**  
_Confidence: high_

Internal Chargebacks (Expenses Allocated/Paid to Investment Adviser or Related Persons) has five lines: Administration, Accounting, Valuation, Audit & Tax Prep/Advisory; IT Activities; Legal, Regulatory, Compliance, Investigation & Examination; Organization Costs; Other. External Partnership Expenses has approximately twenty lines: Third-Party Fund Administration & Accounting; Third-Party Valuation Services; Third-Party IT Activities; Third-Party Legal, Regulatory & Compliance; Investigation & Examination; Third-Party Audit; Third-Party Tax Preparation & Tax Advisory; Third-Party Organization Costs; Taxes; Bank Fees; Subscription Facility – Fees; Subscription Facility – Interest; Other Credit Facilities – Fees; Other Credit Facilities – Interest; Other Interest Expense; Custody Fees; Due Diligence; Broken Deals; Travel & Entertainment; Insurance; Non-recoverable Portfolio Costs / Unreimbursed Portfolio Company Expenses; Other; and Other: 2016 ILPA Reporting Template Value (a bridging line for legacy funds). ILPA removed the 2016 Level 1/Level 2 distinction so all GPs provide a single uniform level of detail, and removed ILPA-specific 'Related Persons' definitions in favour of the accounting standards the GP already uses.

Sources:
- https://ilpa.org/wp-content/uploads/2025/01/ILPA-Reporting-Template-v.-2.0-Suggested-Guidance.pdf

**ILPA v2.0 timing: first delivery for Q1 2026 (data as of 31 March 2026), with 60/120/180-day delivery windows by fund type**  
_Confidence: high_

Applies to funds still in their investment period during Q1 2026 or commencing operations on or after 1 January 2026; funds no longer in their investment period as of 1 January 2026 may optionally continue with the 2016 template. First delivery after a fund commences operations: after the first full quarter after commencement of operations, or within 18 months after initial close, whichever is shorter. ILPA's promoted delivery framework (subject to the LPA): Direct Funds within 60 days after quarter-end, except the fiscal year-end quarter (120 days); Fund-of-Funds within 120 days, 180 at year-end; Fund-of-Fund-of-Funds within 180 days, 260 at year-end. Important scoping caveat for QuarterMark: ILPA states the template was 'Designed with closed-end PE Funds in mind' and 'was not designed to fully meet the needs outside of closed-end PE Funds'. A closed-ended direct lending fund can use it, but it will not carry loan-level credit content — that has to be a separate report section.

Sources:
- https://ilpa.org/wp-content/uploads/2025/01/ILPA-Reporting-Template-v.-2.0-Suggested-Guidance.pdf

**ILPA also released a separate Performance Template in 2025 with granular and gross methodology variants, but field-level detail is not publicly extractable**  
_Confidence: low_

ILPA released the Reporting Template and two Performance Templates (reflecting alternative performance calculation methodologies: granular and gross) on 22 January 2025 as deliverables of the Quarterly Reporting Standards Initiative (QRSI), which was launched January 2024 originally to comply with the SEC Private Fund Adviser rules and continued as an industry-driven effort after the Fifth Circuit vacated those rules in June 2024. A 'Definitions – Granular Methodology' document exists at version 1.1 dated 28 April 2025. I was unable to retrieve the actual metric list (IRR/TVPI/DPI/RVPI treatment, subscription-line impact, investment-level detail) — the template files are downloads behind the ILPA templates hub rather than rendered pages. QuarterMark should download the full zipped package from ilpa.org/reportingtemplate before specifying this module.

Sources:
- https://ilpa.org/resources-tools/resource-library/ilpa-performance-template/
- https://ilpa.org/wp-content/uploads/2025/01/ILPA-Reporting-Template-v.-2.0-Suggested-Guidance.pdf

**IPEV 2025 Valuation Guidelines are effective for quarterly reporting periods beginning on or after 1 April 2026 and supersede the 2022 Guidelines**  
_Confidence: high_

Preface: 'These Valuation Guidelines should be regarded as superseding the previous 2022 Valuation Guidelines issued by the IPEV Board and are considered in effect for quarterly reporting periods beginning on or after 1 April 2026. Early adoption is encouraged.' The Guidelines explicitly cover credit: 'The term "Private Capital" is used in these Valuation Guidelines in a broad sense to include privately held (i.e. unlisted) Investments in early-stage ventures, management buyouts, management buyins, infrastructure, credit and similar Investments.' Application section requires: a written robust valuation policy documenting procedures and methodologies for each Investment; documentation of inputs, assumptions and significant judgements and the rationale supporting the conclusion of value; use of an independent internal valuation committee and/or external advisers; and 'Incorporation of Backtesting as a component of the valuation process.' The Guidelines are IFRS- and US GAAP-compatible.

Sources:
- https://www.privateequityvaluation.com/Portals/0/Documents/Guidelines/2025%20IPEV%20Valuation%20Guidelines.pdf

**IPEV Section II 5.6 (Debt Investments) and 5.7 (Rolled up Loan Interest) are the operative private-debt provisions and prescribe DCF as the typical technique**  
_Confidence: high_

Section 5.6: 'The Fair Value of Debt Investments should generally be determined on a standalone basis.' The issue price 'may be a reliable indicator of Fair Value at that date depending on facts and circumstances', but 'a Market Participant would take into account risk, coupon, time to expected repayment, and other market conditions in determining the Fair Value of the Debt Investment, which may not be equivalent to face value.' At subsequent Measurement Dates the Valuer must consider whether indications of changes in credit risk, positive or negative, and changes in required yield based on changes in risk and in market rates of return, would impact Fair Value. 'Since the cash flows and terminal values associated with a Debt Investment may be predicted with a reasonable amount of certainty, typically these Investments are valued on the basis of a DCF calculation.' In dislocation/distress the Guidelines emphasise five points: Fair Value absent actively traded prices 'is generally derived from a yield analysis taking into account credit quality, coupon and term'; 'Par value or face value or cost value is not automatically Fair Value, even if there is sufficient Enterprise Value to cover the liability'; 'Credit quality (repayment risk) must be assessed'; 'Non-performing debt is considered differently from performing debt'; and rate rises, widening credit spreads, rating changes and modifications in other market terms will impact Fair Value. Warrants attached to mezzanine loans must be considered separately from the loan and disaggregated when calibrating the initial yield. Section 5.7 covers PIK and deep discount debentures: assess the expected present value of the amount to be recovered including reasonably anticipated enhancements such as interest rate step increases, and spread any excess of estimated recoverable amount over original cost over the anticipated life so as to give a constant rate of return. Other relevant sections: 3.8 Discounted Cash Flows (from an Investment) p35, 3.10 Calibrating to the Price of a Recent Investment p38, 5.9 Impacts from Structuring (covers convertible debt, liquidation preferences, ratchets) p60, 5.20 Venture Debt and Convertible Instruments p67, and Appendix 2 'Application of IFRS 9/ASC Topic 946 to Debt Investments' p85.

Sources:
- https://www.privateequityvaluation.com/Portals/0/Documents/Guidelines/2025%20IPEV%20Valuation%20Guidelines.pdf

**The FSB's Report on Vulnerabilities in Private Credit (6 May 2026) publishes a core metrics table that is effectively a target schema for private-credit portfolio reporting — and the FCA cites it as the basis for FRAME's loan-origination requirements**  
_Confidence: high_

CP26/26 §6.7: 'In our development of reporting requirements for loan origination funds, we have considered the Financial Stability Board's (FSB) Report on Vulnerabilities in Private Credit, and made use of relevant terms and metrics to loan origination.' The FSB's Table 3 'Core metrics identified to enhance surveillance of private credit' enumerates by category — Size and trends: NAV or AUM of private credit funds; NAV or AUM by strategy segmented into (i) direct lending, (ii) asset-based finance, (iii) NAV/fund finance, (iv) special situations/distressed; private credit issuance as % of GDP or total lending to nonfinancial companies; SRT holdings over total NAV. Interconnectedness: bank lending to private credit funds by facility type (subscription lines, NAV, ABL); insurer investments; PE ownership of insurers; committed vs drawn capital. Leverage: private credit funds' debt-to-NAV and debt-to-equity; borrowers' debt-to-EBITDA. Liquidity mismatch: open-ended fund NAV as a proportion of total; redemptions frequency; investor base retail vs institutional. Concentration: fund concentration (top N funds); sector concentration (top N economic sectors). Cross-border: international exposures; geographic concentration (top N geographies). Borrower credit quality: loan-to-value (average and distribution); interest coverage ratio (average and distribution); debt service coverage ratio (average and distribution); default rate; share of borrowers with negative free cash flows; credit spreads over risk-free. Annex 2 contains a further list of 'additional' metrics. The FSB explicitly flags that 'limited granular fund- and loan-level data' is the key data challenge, and notes borrowers 'appear to be relying more on payment-in-kind loans, which can also signal deteriorating credit conditions' and that 'certain lending practices may obscure true leverage'.

Sources:
- https://www.fsb.org/uploads/P060526.pdf
- https://www.fca.org.uk/publication/consultation/cp26-26.pdf

**The ACC (Alternative Credit Council, AIMA) publishes a private credit corporate lending DDQ and a private credit manager DDQ, but the field content is member-gated and unverified**  
_Confidence: unverified_

AIMA published the private credit – corporate lending DDQ on 4 July 2023, developed at the request of the ACC investor-manager forum for a standard DDQ to support investor due diligence, aligned with AIMA's existing DDQ suite. A 2025 edition of the ACC Illustrative Questionnaire for the Due Diligence of Private Credit Managers exists, retaining a modular approach with a decision tree for identifying applicable modules. The ACC states it represents over 250 members managing US$800 billion of private credit assets globally. I could not verify the actual sections, data fields or whether it is free — content is behind the ACC's Compass platform. Note this is a due-diligence questionnaire, not a periodic reporting template: it standardises what an LP asks at diligence, not what the GP reports quarterly. There does not appear to be an ACC/AIMA equivalent of the ILPA Reporting Template for ongoing private credit portfolio reporting.

Sources:
- https://www.aima.org/article/new-private-credit-corporate-lending-ddq.html
- https://www.aima.org/article/presenting-the-2025-edition.html
- https://www.aima.org/sound-practices/due-diligence-questionnaires.html

**There is no single standard for the loan-level content of a direct lending quarterly investor report — conventional practice is a loan-level schedule plus portfolio credit aggregates**  
_Confidence: medium_

Practitioner and consultant sources converge on a loan-level table showing each active loan with outstanding balance, LTV, sector/collateral type, geography, maturity date and status (current / watchlist / default), alongside portfolio aggregates: weighted average leverage (debt/TTM EBITDA), interest coverage (EBITDA/interest), fixed charge coverage, minimum liquidity, weighted average spread, average life, non-accrual rate, PIK share, first vs second lien split, and watchlist/internal risk-rating migration. Cambridge Associates and Ares publish observed portfolio-level benchmarks (e.g. Cambridge Associates cites roughly 4.9x debt/TTM EBITDA and ~2.3x interest coverage as typical). This is the gap QuarterMark is aiming at: unlike the ILPA capital-account content, which is now fully standardised and therefore commoditised, the credit content of an LP report is unstandardised — which means it is both a differentiation opportunity and something you must design rather than implement from a spec. Confidence is medium because these are practitioner/vendor sources rather than a standards body.

Sources:
- https://www.cambridgeassociates.com/wp-content/uploads/2026/04/2026-04-A-New-Era-of-Dispersion-in-Direct-Lending-Favors-Disciplined-Managers.pdf
- https://www.ares.com/us/news-and-insights/four-key-credit-metrics-evaluating-direct-lending-portfolios
- https://www.sidley.com/en/insights/newsupdates/2026/03/financial-covenants-in-private-credit-transactions

**Mandatory XML for Annex IV is arriving in some EEA jurisdictions in 2026, but this is a national-competent-authority matter, not a uniform ESMA date**  
_Confidence: medium_

Norway's Finanstilsynet has announced that with effect from 30 June 2026 it will be mandatory for both registered and authorised AIFMs to report Annex IV using XML file attachments. ESMA's rev 6 guidance and the XSDs are already the EU-wide technical standard, but ESMA states that national competent authorities handle XML submission procedures at national level — meaning submission channel, authentication and any manual-entry fallback differ per NCA (CSSF, for example, offers API and eDesk channels per Circular CSSF 23/833). Claims circulating that a new 'Rev 7 / v2.0' XSD will be published are not verified against any ESMA source; treat the next schema version as unknown until ESMA publishes the AIFMD II ITS, which is due by 16 April 2027.

Sources:
- https://www.finanstilsynet.no/en/news-archive/news/2025/mandatory-xml-format-to-be-introduced-for-annex-iv-reporting-from-30-june-2026/
- https://www.cssf.lu/wp-content/uploads/AIFM_Reporting_Technical_Guidance.pdf
- https://www.esma.europa.eu/document/aifmd-reporting-it-technical-guidance-rev-6-updated

### Implications for QuarterMark
- Build the LP quarterly report as two separable layers: an ILPA v2.0 layer that is fully specified and can be generated deterministically from a general ledger (fixed chart of ~25 expense lines, three value columns LP/Fund/GP, three period bases QTD/YTD/ITD, Commitment Reconciliation, Offsets roll-forward, Carried Interest reconciliation), and a credit layer that ILPA explicitly does not cover. The ILPA layer is table stakes and gets you parity with Allvue; the credit layer is where the differentiation lives.
- Treat FCA CP26/26 (FRAME) chapter 6 as the single best published field specification for private-credit regulatory reporting anywhere, and obtain the 'FRAME template form' published alongside the CP for the exact field list — CP26/26 references it repeatedly but the fields are in the separate form, not the CP body. Its loan-origination definitions (non-accrual at 90 days, covenant defaults, significant amendments to loan documentation, LTV, lien seniority, weighted average spread, average life, unrecoverable) should become QuarterMark's canonical internal data model, because they will be the UK regulatory vocabulary from 2028 and they map cleanly onto covenant-monitoring events you already need to capture.
- Do not over-invest in AIFMD II loan-origination regulatory templates yet — they do not exist. The amended Article 24 applies from 16 April 2027 and ESMA's RTS/ITS are due by that date. Build against the current rev 6 XSDs (AIFMD_DATMAN_V1.2 / AIFMD_DATAIF_V1.2 / AIFMD_REPORTING_DataTypes_V1.2) for today's EU obligation, and architect the XML emitter so the schema version is data-driven rather than hard-coded.
- Conversely, do build the AIFMD II Article 15 limit tests now, because they are fully specified and continuously computable against a loan book: 20% single-borrower aggregate notional where the borrower is a financial undertaking/AIF/UCITS, 5% risk retention with the 8-year holding distinction, 175% (open-ended) / 300% (closed-ended) commitment-method leverage caps, and originate-to-distribute detection. These are covenant-shaped rules on the fund rather than the borrower, and no incumbent is likely to be monitoring them continuously in the small/mid segment.
- The UK Annex IV build has a defined shelf life. AIF001 is proposed for removal and AIF002 for replacement, with implementation envisaged 2028. Support AIF001/AIF002 because it is the live obligation and an immediate sales wedge, but scope it as a mapping layer over a FRAME-shaped internal model rather than as the primary schema, so the 2028 transition is a re-emit rather than a rebuild.
- QuarterMark's £50m-£500m AUM target segment falls entirely below CP26/28's proposed £750m small-to-medium AIFM threshold and, at fund level, below FRAME's £500m NAV Essential/Enhanced split. That means most target customers would face 'essential' reporting only, annually with a 120-day lag. The regulatory-reporting pain you are selling against is therefore modest and shrinking for this segment — position covenant monitoring and LP reporting as the primary value, with regulatory filing as a retention feature, not the wedge. The exception worth targeting: funds approaching £500m NAV, who must anticipate crossing into Enhanced (including the full loan-origination module) with only a two-quarter time cushion.
- Implement the FSB Table 3 core metrics as a standing portfolio analytics layer — LTV, ICR, DSCR (each as average and distribution, not just average), default rate, share of borrowers with negative free cash flow, credit spread over risk-free, borrower debt-to-EBITDA, fund debt-to-NAV, strategy segmentation (direct lending / asset-based finance / NAV-fund finance / special situations), sector and geographic top-N concentration. This single table simultaneously serves the FCA loan-origination module, LP report credit aggregates, and any future ESMA template, because the FCA explicitly derived FRAME from it.
- Adopt the 2025 IPEV Guidelines as the valuation spine and design for Section II 5.6/5.7 specifically: DCF as the default technique for debt, yield analysis on credit quality/coupon/term, explicit non-performing versus performing treatment, PIK and rolled-up interest accreted to a constant rate of return over anticipated life, and warrants disaggregated from the loan when calibrating initial yield. Effective for quarterly periods beginning on or after 1 April 2026, so it is live for the product's first release. Also build the process artefacts IPEV's Application section demands — a written valuation policy, documented inputs/assumptions/significant judgements with rationale, valuation committee review, and backtesting — because those are audit evidence and are exactly what a solo-founder product can automate as a by-product of the data model.
- Note the divergence between what regulators want on valuation and what LPs want. FRAME collects valuation data at portfolio level via yes/no and multiple-choice questions about third-party valuer usage, not asset-by-asset. So asset-level valuation depth is an LP-report and audit-defence feature, not a regulatory-filing feature — price and position it accordingly.
- There is no ACC/AIMA standard periodic reporting template for private credit portfolios, only due-diligence questionnaires. That is a genuine white space: a well-designed, defensible loan-level LP reporting schema (loan-level schedule with balance, LTV, lien, spread, maturity, status current/watchlist/default, risk-rating migration, plus portfolio aggregates) has no incumbent standard to conform to, and aligning it to FSB Table 3 plus FRAME definitions gives it external legitimacy that a purely proprietary format would lack.

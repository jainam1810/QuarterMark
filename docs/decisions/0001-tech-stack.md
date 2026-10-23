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

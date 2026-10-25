# Phase 6 — Companies House early warning

**Verdict: ✅ Buildable, free, and the only feature I could not find a
competitor offering.** Constraints are real but well-documented.
Checked 2026-10-25.

## Why this phase matters commercially

ExactCov, Lumonic and CovenantIQ all monitor *documents* — overdue deliverables,
stale data, reporting calendars. **None of them mention monitoring the public
register**: new charges, director resignations, insolvency notices.

⚠️ Absence from a marketing page is not proof of absence from a product. But it
is the one capability on our roadmap with no visible competitor, and it is
UK-registry-specific plumbing — unglamorous, no payoff for a US-built product.
See `../positioning/competitive-landscape.md`.

It also fixes the overclaim in the pitch: daily monitoring does **not** give
fresh financials (UK private companies file annually, often abridged and late).
It gives **events**.

## The two APIs

`[VERIFIED 2026-10-25, developer-specs.company-information.service.gov.uk]`

### Public Data API — polling
- `api.company-information.service.gov.uk`
- HTTP Basic auth: API key as username, **blank password**
- **600 requests per rolling 5-minute window**; `X-Ratelimit-*` headers, 429 on breach
- Endpoints we need: company profile, filing history, officers, **charges**,
  **insolvency**, PSC

### Streaming API — push
- `stream.companieshouse.gov.uk`
- **Nine streams**: company information, filing history, **insolvency**,
  **charges**, officers, PSC, disqualified officers, exemptions, PSC statements
- Long-lived HTTP, each event carries an integer **timepoint**

## The constraints that shape the architecture

These are the ones that bite, and they are all documented:

**1. Two concurrent connections per account — and the oldest is silently killed.**
> "A maximum of two concurrent connections per-account can be made to the
> streaming API."

Exceeding it terminates the oldest connection. Repeated reconnection also risks
rate limiting. **This forbids one-connection-per-worker.** The design must be a
**single consumer that fans out internally** — one process holds the connection,
writes events to a queue, and workers read from the queue.

*Open question:* the docs say "the same credentials", which may mean the limit is
per-key rather than per-account. Not worth relying on — design for two.

**2. `416` on a stale timepoint — and on slow consumption.**
A too-old timepoint returns HTTP 416. **So does consuming events too slowly**,
because the server-side queue grows until the connection is closed. The consumer
must therefore do nothing but read and enqueue; all processing happens
downstream.

Retention depth for timepoints is **not documented**. So a 416 must be a handled
path, not an exception: fall back to the Public Data API to backfill.

**3. Disconnections are normal, not exceptional.**
Documented causes: server restarts on deployment, workload rebalancing, network
changes, routine maintenance, congestion. Reconnect-with-last-timepoint is
**mandatory**, not defensive.

Documented backoff: `429` → wait 60s. Retryable HTTP error → 10s. Network
error → a few seconds.

## Signals worth acting on

| Filing | Signal |
|---|---|
| **MR01** — charge registered | New borrowing, possibly secured ahead of us |
| **TM01** — director resignation | Especially the FD, especially unreplaced |
| **Accounts overdue** | `accounts.next_accounts.overdue` boolean |
| **Insolvency case** | Case-type enums cover moratoria and administration |
| **Gazette notices** | Separate API — winding-up petitions |
| `company_status_detail` | Active proposal to strike off |

## Licensing

`[VERIFIED 2026-08-04]` Companies House data is published under **Open
Government Licence v3.0**, which permits commercial use including within a
commercial SaaS product. Attribution required.

**Re-verify the current licence text before launch** — this was checked in
August and licensing terms can change.

## What Phase 6 delivers

A single-consumer stream reader with timepoint persistence and 416 backfill, an
event classifier mapping filings to signals, and an alert feed per borrower.

## Risk rating: 🟢 Low

Free data, documented constraints, no legal blocker, no vendor dependency. The
only real engineering risk is the two-connection limit, and the fan-out pattern
solves it.

## Sources

- Companies House Streaming API overview and rate-limiting guides
- Companies House Public Data API reference
- Open Government Licence v3.0

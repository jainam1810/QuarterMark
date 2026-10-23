# 0002 — Hosting and cost model

**Decided** 2026-08-21 · **Status** Accepted

## Staged plan

| Stage | Setup | Cost | Trigger to move on |
|---|---|---|---|
| **Pilot / build** | Supabase free tier, **AWS London (eu-west-2)** | £0 | — |
| **First paying clients** | Vercel Pro + Supabase Pro | ~£37/mo | Before selling to anyone |
| **First real DDQ** | Supabase **Team** | +$599/mo | Only if the DDQ demands the gated SOC 2 report |
| **Enterprise client** | Own AWS account (RDS + S3, eu-west-2) | Paid for by that contract | Single-tenancy demanded |

## Verified facts

`[VERIFIED 2026-08-21, supabase.com/pricing + /security]`
Free $0 (500 MB) · Pro $25/mo (8 GB, London region) · Team $599/mo.
SOC 2 Type 2, ISO 27001, HIPAA, GDPR DPA available.
**The SOC 2 Type 2 report is gated** — "Enterprise and Team customers can access our SOC 2
Type 2 report on the dashboard." Point-in-Time Recovery is **$100/mo per 7 days retention**.

`[VERIFIED 2026-08-21, vercel.com/pricing + /security]`
Hobby $0 but **explicitly non-commercial** — "Our Hobby plan is for personal, non-commercial
use." Pro $20/mo, not per-seat. Vercel holds SOC 2 Type 2, ISO 27001, PCI DSS, GDPR with DPA.
Caveat: *"No data is stored permanently inside EU regions"* — but Vercel holds no customer
data here; Supabase (London) does, and Pro can pin compute to London.

`[VERIFIED 2026-08-21, anthropic.com/legal/commercial-terms]`
**"Anthropic may not train models on Customer Content from Services."** This is the **standard**
commercial term — no enterprise agreement needed. Do not pay extra for a guarantee already held.

`[ESTIMATE]` Claude cost ~£1 per credit agreement, 10–25p per quarterly pack. Modelled from
published per-token pricing, not measured. Production extraction (multiple passes, verification)
runs higher. Re-measure against real documents before quoting.

## Deliberately deferred

- **Supabase Team ($599/mo).** Do not pre-pay. Many DDQs only ask whether subprocessors *are*
  certified — answerable free from Supabase's public trust page. Wait for a real DDQ, read what
  it demands, upgrade same-day if required.
- **Point-in-Time Recovery ($100/mo).** Pro includes daily backups. Add when a fund asks.
- **Own AWS account.** See 0001 — the free credits self-destruct after 6 months.

## Known limitations accepted

**CLOUD Act / sovereignty.** Supabase is a US company; an EU region solves residency but not
sovereignty, which some EU buyers raise. Mitigation is the migration path, not a different
pilot choice — it is vanilla Postgres on AWS, so moving to RDS in our own account is
lift-and-shift.

**Cost model is infrastructure-only.** Excludes professional indemnity insurance, SOC 2
certification (£10–18k when demanded), and founder onboarding time. See
`../positioning/corrections-register.md` §8.

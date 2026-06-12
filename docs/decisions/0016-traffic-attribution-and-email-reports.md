# 0016 — Traffic-source attribution + weekly/monthly dealer e-mail reports

- **Status:** accepted — built 2026-06-12; sending dark until Resend domain +
  secrets are configured
- **Date:** 2026-06-12

## Context

Two owner directives: (1) the promotion spend must be visible — tariff copy
says "30% of your payment funds promotion of YOUR lots" (Pro: $30 of $99 →
the $1/day Meta budget of ADR-0015; featured slots: 30% of the contract →
social traffic for that brand), and dealers must SEE social/paid traffic in
their stats; (2) dealers don't open dashboards — a 20-lot manager won't click
20 modals. Reports must come to them: weekly every Monday + monthly on the
1st, printable enough to hand to a boss, for ALL tiers with tier-appropriate
data, and the free tier should see honest evidence that Pro works.

## Decision

1. **Attribution is utm-only over links WE mint** (no referrer sniffing):
   `utm_medium=social` → organic social (content-factory boosts),
   `utm_medium=catalog_ads|cpc|paid_social` → paid (Meta catalog ads);
   everything else is direct/search. Recorded at view time
   (`recordView(..., classifyViewSource(url))`) into new
   `entity_stats_daily.views_social/views_paid` columns (0018) — same atomic
   UPSERT, no extra writes. The stats modal shows the split under the chart.
2. **Reports are composed and sent by the cron worker** (Mon 14:00 UTC +
   1st 14:30 UTC) via the Resend HTTP API — table-based print-friendly HTML:
   KPI cards (views/contacts/social/ads/new/sold), per-lot table, sold-with-
   days-on-market line, Pro market-position bullets (from `market_stats`),
   and the 30% line. No `RESEND_API_KEY` → logged no-op.
3. **The free-tier teaser never fabricates**: "Pro dealers sold N cars of
   your makes, averaging D days" renders only when the real sample ≥ 3 sold
   listings that period; otherwise a number-free pitch. Same honesty doctrine
   as the public site.
4. **CASL compliance**: every mail ends with a one-click unsubscribe —
   HMAC-signed link (`REPORTS_UNSUB_SECRET`, shared worker↔Pages) flipping
   `dealers.reports_opt_out`; idempotent, no session required. Reports go to
   account holders about their own account (existing business relationship).
5. **Idempotent sends**: `report_runs (period, dealer_id)` reserved before
   each send; retried crons skip; failures release the reservation for the
   next run. Dealers with zero lots are skipped (no empty spam).

## Alternatives

- **In-app-only stats** (status quo): rejected by the owner — "люди ленивые";
  push beats pull for retention and for the Pro upsell moment.
- **Referrer-based attribution:** rejected for v1 — noisy, spoofable, and our
  own utm discipline already covers every link we control.
- **Per-send Resend templates/audiences:** rejected — one HTML builder in the
  worker keeps the dependency count at zero and the layout print-safe.

## Consequences (incl. consciously accepted gaps)

Accepted at launch scale (2 known partners), revisit with growth:
e-mail addresses are UNVERIFIED (verify-email is still a skeleton — a stranger
whose address was typed at signup could receive reports; acceptable while
every account is personally onboarded); no bounce/complaint suppression loop
yet (add a Resend webhook before opening signups broadly); failed sends are
at-most-once per period (no retry). The CASL footer carries sender
identification via the REPORTS_SENDER_LINE var — set the exact legal
name/mailing address before the first send.


Operator setup (runbook "Dealer reports"): verify japanauto.ca in Resend
(SPF/DKIM DNS), `wrangler secret put RESEND_API_KEY` + `REPORTS_UNSUB_SECRET`
on the cron worker, same `REPORTS_UNSUB_SECRET` + redeploy on Pages.
Migration 0018 adds the source columns/opt-out/run-log. Featured-slot
sections enter the reports when slot impression tracking lands (admin v2).
The "30%" copy ships in the cabinet badge now and must land on the public
Pricing page when Stripe wiring builds it (Phase 3 item).

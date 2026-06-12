# Dealer reports — utm attribution + weekly/monthly e-mail

> Captured 2026-06-12. Implements decision 0016 (see
> `docs/decisions/0016-traffic-attribution-and-email-reports.md`). Verify
> symbols against the code when relying on this document
> (DOCS-CONVENTIONS.md R5).

## Purpose

Two owner directives in one subsystem: (1) the "30% of your payment funds
promotion of YOUR lots" claim must be substantiated by visible social/paid
traffic in the dealer's own numbers; (2) dealers don't open dashboards, so
the numbers come to them — a print-friendly e-mail every Monday (weekly) and
on the 1st (monthly), for ALL tiers, with the free tier getting an honest
Pro teaser instead of fabricated promises.

## Key files

| Path | Role |
|---|---|
| `migrations/0018_traffic_sources_and_reports.sql` | `entity_stats_daily.views_social/views_paid`, `dealers.reports_opt_out`, `report_runs` |
| `functions/api/_lib/db.ts` | `classifyViewSource` (:823), `recordView` (:840), `getDailyStats` (:883) |
| `functions/used-cars/listing/[slug].ts` (:52), `functions/parts/listing/[slug].ts` (:72) | Record each human detail-page view with its classified source |
| `workers/expire-sweeper/src/reports.ts` | Period keys, report composer (`buildDealerReport`), Resend orchestration (`sendReports`) |
| `workers/expire-sweeper/src/index.ts` | Cron dispatch: `"0 14 * * 1"` weekly, `"30 14 1 * *"` monthly |
| `functions/api/reports/unsubscribe.ts` | One-click CASL opt-out (HMAC-verified, sessionless) |
| `src/components/sections/StatsModal.astro` | In-app surface of the same split ("Sources: … from social posts · … from ads · … direct & search") |
| `functions/api/listings/[id]/stats.ts`, `functions/api/donors/[id]/stats.ts` | Cabinet stats APIs; their `series` rows carry `views_social/views_paid` via `getDailyStats` |

## How it works

### Attribution: utm-only, campaign-pinned

`classifyViewSource(url)` (`functions/api/_lib/db.ts:823`) reads only the
utm params on links **we ourselves mint** — no referrer sniffing:

| Match | Source |
|---|---|
| `utm_medium=social` AND `utm_campaign` starts with `boost-` | `social` (content-factory posts; campaign = `boost-{job_id}`, see `docs/architecture/social-boost.md` step 4) |
| `utm_medium=catalog_ads` AND `utm_campaign=pro-promo` | `paid` (Meta catalog feed, minted in `functions/feeds/meta-vehicles.csv.ts:147`) |
| anything else (incl. no utm) | `direct` |

The campaign pin matters: anyone can append `?utm_medium=social` to a shared
link, and these splits substantiate the "30% to ads" claim shown to paying
dealers. The code is deliberately **stricter** than the prose in migration
0018 / decision 0016 (which mention `cpc`/`paid_social` media) — the code is
authoritative.

Both detail pages call
`waitUntil(recordView(env, type, id, classifyViewSource(new URL(request.url))))`
off the render path; bots (middleware UA tag, `isBot`) are excluded by the
caller, and edge-cached hits (`s-maxage=60`) go uncounted — counts are a
floor, the honest direction to err. `recordView`
(`db.ts:840`) is one atomic D1 batch: lifetime `view_count` increment + UPSERT
into `entity_stats_daily` adding 1 to `views` and conditionally to
`views_social`/`views_paid`. Direct is derived, never stored:
`views − views_social − views_paid`.

### Period keys (Monday-anchored — not run-dated)

`weeklyPeriod(now)` (`reports.ts:45`) anchors to the most recent Monday ≤ now
(UTC): key `weekly-<that Monday>`, window = the 7 days before it. A re-run on
any other weekday reproduces the **same** key and window, so `report_runs`
dedupes it (review 2026-06-12 — run-date keys could double-send).
`monthlyPeriod` (`reports.ts:63`): key `monthly-YYYY-MM` for the previous
calendar month. A `Period` carries both `fromSec/toSec` (unix seconds, for
`created_at`/`sold_at`) and `fromDay/toDay` (`YYYY-MM-DD` UTC, the
`entity_stats_daily.day` keys); both ranges are half-open `[from, to)`.

### Composer (`buildDealerReport`, `reports.ts:181`)

- Tier from a local `effectiveTier` mirror (`reports.ts:98`) of
  `functions/api/_lib/entitlements.ts:46` — the worker cannot import the
  Pages lib; **keep them in sync** (the mirror is annotated).
- Two `LIMIT 60` queries (listings + donor_cars), each ordered by period
  views desc, feed **only the table**; `lotTable` renders the first 40 of the
  concatenation. KPI totals come from a separate **unbounded** aggregate over
  all the dealer's entities (`IN (SELECT id … UNION …)`) — a sold car outside
  the top-60 still counts (review catch).
- Skip rules: dealer with zero lots → no mail; lots exist but
  `views + contacts + created + sold == 0` → no mail (the caller releases the
  `report_runs` reservation either way).
- Pro extras: "From social / From ads" KPI cards + per-lot Social/Ads column;
  market-position bullets for up to 12 active lots from `market_stats` with
  `mileage_bucket='all' AND seller_kind='dealer'` (the dealer's actual
  competitive field, migration 0019), highest-`n_active` row; |diff| < 2% reads
  "at the market median". Cents on both sides of the comparison.
- Free teaser (`proTeaser`, `reports.ts:125`): real sold outcomes of Pro
  dealers for the recipient's own makes within the period; renders **only**
  when the sample ≥ 3 sold listings; otherwise a number-free pitch.
  Fabricating numbers is banned project-wide.
- 30% copy is trial-aware (`onTrialNow`, `reports.ts:185`): trialing dealers
  read "at our expense … on the paid plan 30% keeps funding"; paying Pro reads
  "30% of your subscription funds Facebook promotion".
- CASL s.6(2) footer: why-you-got-this line, unsubscribe link, and the
  `REPORTS_SENDER_LINE` var (default in `workers/expire-sweeper/wrangler.toml`;
  replace with the exact legal name + mailing address before the first send).
- HTML is table-based with inline styles — e-mail clients first, print second.
  Money rendered by `cad()` from INTEGER cents.

### Delivery + idempotency (`sendReports`, `reports.ts:358`)

1. Both `RESEND_API_KEY` and `REPORTS_UNSUB_SECRET` required, else logged
   no-op — the feature ships dark until the runbook's "Dealer e-mail reports"
   setup is done.
2. Audience: `dealers WHERE reports_opt_out = 0 ORDER BY created_at LIMIT 500`.
3. Per dealer, `INSERT OR IGNORE INTO report_runs (period, dealer_id, …)`
   **before** composing; `meta.changes == 0` → already sent, skip.
4. Empty report → reservation deleted (silent period, maybe next time).
5. Send via Resend HTTP API (`POST https://api.resend.com/emails`), from
   `REPORTS_FROM ?? "japanauto.ca <reports@japanauto.ca>"`.
6. Non-2xx or thrown error → reservation deleted so a re-run **within the
   same period** can retry. No retry is scheduled by us: the next cron tick is
   a new period, so a failed send is effectively at-most-once per period
   unless the cron is re-triggered in-period (manual `__scheduled` curl or a
   platform retry). This is the consciously chosen semantics of decision 0016.

Cron dispatch in `workers/expire-sweeper/src/index.ts` is exact-match on the
trigger string; an unknown cron throws instead of running the wrong job.

### Unsubscribe (`functions/api/reports/unsubscribe.ts`)

`GET /api/reports/unsubscribe?d=<dealer_id>&s=<hmac>`. The worker mints
`s = HMAC-SHA256(REPORTS_UNSUB_SECRET, "reports-unsub:v1:" + dealerId)`
(`reports.ts:380`); Pages recomputes and compares with `timingSafeEq`. The
`reports-unsub:v1:` purpose prefix binds the signature to this endpoint — a
signature over a bare dealer id could otherwise be replayed by any future
HMAC-over-id feature sharing the secret. Valid → idempotent
`UPDATE dealers SET reports_opt_out = 1`; sessionless by design (CASL
one-click); response is a tiny standalone `noindex`/`no-store` HTML page;
missing secret → 503.

## Invariants

- Money is INTEGER cents end-to-end (`listings.price`,
  `market_stats.price_p*_cents`); timestamps unix seconds;
  `entity_stats_daily.day` is UTC `YYYY-MM-DD`.
- Attribution trusts only campaign-pinned utm pairs we mint
  (`boost-*`/`pro-promo`); a bare `utm_medium` never counts.
- Never fabricate: the teaser needs a real sample ≥ 3; silent dealers get no
  mail at all.
- At-most-once per `(period, dealer_id)`: reservation precedes send; failure
  releases; period keys are anchor-dated, never run-dated.
- Fail closed on missing secrets (worker no-op / unsubscribe 503).
- Market numbers stay private to the recipient (same invariant as the cabinet
  market block, `functions/api/listings/[id]/stats.ts` header) and use the
  `seller_kind='dealer'` segment only.

## Gaps (consciously accepted — decision 0016 Consequences)

- Recipient addresses are **unverified** (verify-email is still a skeleton);
  acceptable while every account is personally onboarded.
- No bounce/complaint suppression loop — add a Resend webhook before opening
  signups broadly.
- A network failure after Resend accepted the mail but before the response was
  read would release the reservation; an in-period re-run could then
  double-send. Edge case, accepted at launch scale.
- Audience capped at 500 dealers, sent sequentially in one scheduled
  invocation — revisit (pagination + batching) with growth.
- Rollup rows written before migration 0018 have zero `views_social/views_paid`
  (column defaults), so historical splits read as all-direct — arithmetically
  honest, attribution simply starts 2026-06-12.
- Lifetime `view_count` on the entity row has no source split; the split
  exists only in the daily rollups (30-day window in the modal, period window
  in reports).
- Featured-slot sections enter the reports when slot impression tracking lands
  (admin v2).

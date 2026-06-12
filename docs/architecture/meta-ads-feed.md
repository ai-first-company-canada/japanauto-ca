# Meta ads feed — vehicle catalog for Automotive Inventory Ads

> Captured 2026-06-12. Decision 0015 v1 (feed-first; Marketing API deferred to
> v2). Verify symbols against the code when relying on this document
> (DOCS-CONVENTIONS.md R5).

## Purpose

Pro includes a Facebook promotion perk: every active listing of a Pro-entitled
dealer runs as a vehicle in one Advantage+ Catalog Ads campaign (Automotive
Inventory Ads vertical). We deliberately do **not** rebuild Meta's optimizer —
v1's entire integration surface is one CSV endpoint that Meta's scheduler
fetches daily. No tokens, no app review, no Marketing API client
(docs/decisions/0015-meta-ads-feed-first-architecture.md).

## Key files

| Path | Role |
|---|---|
| `functions/feeds/meta-vehicles.csv.ts` | The feed: key auth, Pro-entitlement SQL, Meta CSV dialect |
| `functions/api/_lib/entitlements.ts` | `fbPromotion` entitlement (`getEntitlements`, pro only) — the conceptual gate the feed SQL mirrors |
| `functions/api/_lib/db.ts:823` | `classifyViewSource` — maps the feed's utm params to the `paid` view source |
| `migrations/0018_traffic_sources_and_reports.sql` | `entity_stats_daily.views_paid` column the attribution lands in |
| `src/components/sections/StatsModal.astro` | Shows "N from ads" to the dealer (decision 0016) |
| `types/env.d.ts:64` | `META_FEED_KEY?` secret declaration |
| `docs/decisions/0015-meta-ads-feed-first-architecture.md` | Why feed-first, why pooled budget, what was rejected |

## How it works

### Endpoint and auth

`GET /feeds/meta-vehicles.csv?key=<META_FEED_KEY>` (Pages Function,
`onRequestGet` in `functions/feeds/meta-vehicles.csv.ts`).

- `META_FEED_KEY` secret absent → **503** "Feed not configured." (fail-closed,
  same posture as decision 0011's JWT rule).
- Key missing or wrong → **403**. Comparison is constant-time: `keyMatches`
  SHA-256-hashes both sides and XOR-compares the digests — the same pattern as
  `requireFactory` in `functions/api/_lib/factory-auth.ts`, made
  length-independent by hashing first.
- Key travels as a query param (not a header) because Meta's feed scheduler
  only supports a URL.

Response headers: `text/csv; charset=utf-8`, `cache-control: no-store` (Meta
fetches on its own schedule; a stale edge-cached inventory snapshot would keep
ads alive for sold cars), `x-robots-tag: noindex`.

### Row selection — Pro entitlement inlined in SQL

One query (`meta-vehicles.csv.ts:96`) selects rows that are simultaneously:

1. `listings.status = 'active'` and not TTL-expired
   (`expires_at IS NULL OR expires_at > unixepoch()` — unix seconds);
2. owned by a Pro-entitled dealer — the SQL **mirrors `effectiveTier()`**
   (`entitlements.ts:46`): paid Pro with a live status
   (`subscription_tier='pro' AND subscription_status IN
   ('active','trialing','past_due')` = `LIVE_PAID_STATUSES`) **or** an
   unexpired trial (`trial_ends_at > unixepoch()`);
3. ordered `created_at DESC`, capped at `LIMIT 5000`.

A correlated subquery pulls up to `MAX_IMAGES = 10` `media.cf_image_id`s
(`is_primary DESC, display_order ASC`); rows that end up with zero images are
skipped in the emit loop — Meta rejects imageless vehicles.

This is the one place the `fbPromotion` gate is enforced by SQL instead of
`getEntitlements()` — a whole-table scan can't call a per-dealer function. The
boolean still exists in `Entitlements` (`entitlements.ts:55,69`) so cabinet UI
and v2 endpoints gate through the standard choke point (decision 0012).

### Self-updating membership

There is no enrolment table and no sync job. Membership in the campaign **is**
presence in the feed: a listing sold/expired/archived, or a dealer downgraded
or trial-lapsed, simply stops matching the SQL — the row disappears on Meta's
next fetch and the ad stops. New Pro inventory enters ads within a day. Stripe
wiring later only updates the same mirror columns (`subscription_tier`,
`subscription_status`), so the feed needs no change.

### CSV dialect

Header row, then one row per vehicle (`csvCell` quotes fields containing
`"`/`,`/newline):

| Column(s) | Value |
|---|---|
| `vehicle_id` | `listings.id` |
| `title` | `{year} {make} {model}[ {trim}]` |
| `description` | listing description, whitespace-collapsed, ≤4990 chars; fallback `Used {title} from {dealer}, {city}.` |
| `url` | `https://japanauto.ca/used-cars/listing/{slug}/?utm_source=facebook&utm_medium=catalog_ads&utm_campaign=pro-promo` |
| `mileage.value` / `mileage.unit` | km integer / `KM` |
| `price` | `"{dollars}.{cc} CAD"` — D1 stores INTEGER cents; `(price / 100).toFixed(2)` converts only at the CSV edge |
| `state_of_vehicle` / `condition` / `availability` | fixed `USED` / `GOOD` / `AVAILABLE` |
| `exterior_color` | `color_exterior` or `Unknown` |
| `transmission` | enum map: `automatic`/`cvt`/`dct`→`AUTOMATIC`, `manual`→`MANUAL`, else `OTHER` |
| `drivetrain` | `fwd`/`rwd`/`awd` uppercased, `4wd`→`4X4`, else empty |
| `fuel_type` | `gasoline`→`GASOLINE`, `hybrid`+`plugin_hybrid`→`HYBRID`, `electric`/`diesel` mapped, else `OTHER` |
| `body_style` | mapped (`pickup`→`TRUCK`), else `OTHER` |
| `image[0].url` … `image[9].url` | carousel: `https://imagedelivery.net/{PUBLIC_CLOUDFLARE_ACCOUNT_HASH}/{cf_image_id}/public`, primary first, unused slots empty |
| `dealer_name`, `address.*` | dealer row; `address.country` fixed `CA` |
| `custom_label_0` | **dealer id** — enables per-dealer product sets in v2 (one-listing boost, per-dealer Insights splits) |
| `custom_label_1` | listing city slug |

### Attribution loop (decision 0016)

Every feed URL carries `utm_source=facebook&utm_medium=catalog_ads&
utm_campaign=pro-promo`. On a detail-page hit, `classifyViewSource`
(`functions/api/_lib/db.ts:823`) returns `paid` only for that exact
medium+campaign pair (campaign marker required — anyone can append a bare
`utm_medium`), `recordView` increments `entity_stats_daily.views_paid`
(migration `0018`), and `StatsModal.astro` renders it as "N from ads" in the
dealer's 30-day sources line. Callers: `functions/used-cars/listing/[slug].ts:52`
and `functions/parts/listing/[slug].ts:72`. This is the same utm track the
social boost uses for `views_social` (`utm_medium=social`, `boost-{job_id}`).

## Meta-side setup (operator actions, not code)

From decision 0015's consequences — on the critical path:

1. **Business Manager + Business verification** — started 2026-06-12-era
   because v2's `ads_management` app review needs it; long lead time.
2. CAD ad account.
3. **Vehicle catalog** (Automotive Inventory Ads vertical) with a scheduled
   **daily fetch** of the feed URL (including the `?key=`).
4. **One Advantage+ catalog campaign** over the whole catalog with a
   **pooled daily budget = N(Pro dealers) × CA$1**. Pooling is deliberate: a
   $1/day ad set never exits the learning phase, so strict per-dealer
   isolation would be worse for every dealer. The perk is sold as "your
   inventory runs in our Facebook catalog campaign", not a dedicated spend
   ledger. Expectation: ~15–60 clicks/dealer/month — a Pro-pitch perk and
   data source, not a growth engine.

The budget multiplier is manual in v1 (operator adjusts as Pro count moves).

## Invariants

- **Fail-closed auth.** No secret → 503; bad key → 403; the compare is
  constant-time over SHA-256 digests. Never downgrade to a plain `===`.
- **The feed SQL and `effectiveTier()` must agree.** The status set
  `('active','trialing','past_due')` is `LIVE_PAID_STATUSES`
  (`entitlements.ts:34`) inlined. Any change to tier semantics changes both
  places in the same commit.
- **Money is INTEGER cents in storage**; dollars exist only in the CSV cell.
  Timestamps compared via `unixepoch()` — unix seconds throughout.
- **No imageless rows** — Meta rejects them; the emit loop skips, never pads.
- **utm params are load-bearing**, not decoration: drop or rename
  `utm_campaign=pro-promo` and paid attribution (the dealer-facing "from ads"
  number and the "30% to ads" pitch substantiation) silently zeroes.
- `no-store` + `x-robots-tag: noindex` stay on the response: the feed is
  neither cacheable nor indexable.
- The feed is read-only over existing tables; it introduced **no migration**.

## Design decisions (abridged — full reasoning in ADR 0015)

- **Feed-first, not Marketing API:** a homegrown per-listing optimizer
  reimplements Meta's delivery optimization worse and multiplies API/review
  surface. Rejected.
- **Pooled budget, not per-dealer ad sets:** $1/day per ad set is below
  learning thresholds. Revisit only if dealer count and budgets grow.
- **No Meta Pixel in v1 — prospecting only.** Retargeting requires the Pixel
  on listing pages, which means CSP allowlist additions (decision 0003 posture)
  **and** a consent story (PIPEDA / Québec Law 25 — the site has no consent
  banner). Deliberately deferred as its own future decision; do not add the
  Pixel as a side effect of other work.

## v2 roadmap (post-launch; needs Meta business verification + `ads_management` app review)

- **Self-serve "Boost on Facebook"**: Stripe payment → Marketing API ad set
  over a one-listing product set (filtered on `custom_label_0`/vehicle_id) →
  auto-stop at term. Pricing = spend pass-through + service fee
  (margin-positive, unlike the pooled perk).
- **Insights pull** into the stats modal (impressions/clicks per dealer),
  joining the utm view-source breakdown already shipping.
- Gate any v2 endpoint through `getEntitlements().fbPromotion`, not raw tier
  columns.

## Gaps

- `docs/runbook.md` secrets list predates this feature and does not yet name
  `META_FEED_KEY` (it is declared in `types/env.d.ts:64`; same "takes effect
  on next deployment" gotcha as all Pages secrets).
- The site origin `https://japanauto.ca` is hardcoded in the feed URL builder
  (`meta-vehicles.csv.ts:146`) rather than read from `PUBLIC_SITE_URL` —
  harmless until a preview environment needs its own catalog.
- `LIMIT 5000` is an unmonitored ceiling; at that inventory size the feed
  silently truncates oldest-first listings.
- Budget multiplier (N × $1) is manual; no alert when Pro count changes.

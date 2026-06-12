# Market analytics — scraper snapshot → private dealer price context

> Captured 2026-06-12. Feature 1 step 3 (LAUNCH-PLAN-2026-06). Verify symbols
> against the code when relying on this document (DOCS-CONVENTIONS.md R5).

## Purpose

A Pro dealer opening the cabinet "Statistics" modal sees, below their own
view/contact numbers, **how their asking price sits against the open market**:
percentile bands of asking prices for the same model ±1 year in their city,
split by mileage bucket and by seller kind (other dealers vs private sellers),
plus liquidity (median days to delist). The data comes from an **external
scraper project** (separate codebase, own Supabase) that crawls public
marketplaces; japanauto pulls one aggregated view daily into D1 and never
touches raw scraped lots.

**HARD PRIVACY INVARIANT:** this data is cabinet-only, Pro-only, listing-owner-
only. Marketplace asking prices sit systematically below dealer retail —
surfacing them to buyers would undercut the very dealers we host (owner
decision, Feature 1). No public page, no free-tier response, no donor endpoint
may ever read `market_stats`. See [Invariants](#invariants).

## Key files

| Path | Role |
|---|---|
| `migrations/0016_market_stats.sql` | Original snapshot table (PK without `seller_kind`) |
| `migrations/0019_market_stats_seller_kind.sql` | Table rebuild: `seller_kind` added to the PK (SQLite cannot extend a PK in place) |
| `workers/expire-sweeper/src/index.ts` | `syncMarketStats()` — daily pull, dollars→cents, batched upsert + prune; cron-dispatched by `MARKET_SYNC_CRON` |
| `workers/expire-sweeper/wrangler.toml` | `"45 9 * * *"` trigger, `MARKET_SUPABASE_URL` var, secret names |
| `functions/api/listings/[id]/stats.ts` | `onRequestGet` — owner-gated stats; market block behind the `marketAnalytics` entitlement |
| `functions/api/_lib/entitlements.ts` | `getEntitlements()` — `marketAnalytics: tier === "pro"` (paid Pro or unexpired trial, decision 0012) |
| `src/components/sections/StatsModal.astro` | `renderMarket()` — dealer-primary rendering, private/unknown context lines |
| `workers/admin/src/pages/ops.ts` | `/ops` freshness badge: `MARKET_STALE_AFTER_S = 36 * 3600` |
| `workers/admin/src/pages/dashboard.ts` | `/` KPI: row count, `MAX(synced_at)`, distinct sources |

## The contract with the scraper project

The integration contract is `japanauto-contract-2026-06-12.md` in the scraper
project's planning folder (FB BD vault — planning material, deliberately not in
this repo; the in-repo normative copy of everything our code depends on is
this document plus the header of `migrations/0016_market_stats.sql`). The
frozen surface:

- **One PostgREST view**: `GET {MARKET_SUPABASE_URL}/rest/v1/japanauto_market_stats`.
  Raw tables, normalization, and scrapers are the other project's internals;
  the view is the API. Breaking changes (rename/drop column, change of units
  or key semantics) require a `_v2` view published **alongside** v1, never an
  in-place edit.
- **Columns bound by name** (extra columns are ignored, so additive changes
  are free): `city_slug`, `make_slug`, `model_slug` (frozen slug dictionaries
  — 6 cities, 9 makes, 49 models, mapped in the scraper's
  `japanauto_model_map`), `anchor_year` (rows aggregate model year ±1),
  `mileage_bucket`, `source`, `seller_kind`, `n_active`, `n_delisted`,
  `price_p25`/`price_p50`/`price_p75`, `median_days_listed`, `computed_on`.
- **Enums**: `mileage_bucket` ∈ `all | 0-100k | 100-200k | 200k+`;
  `seller_kind` ∈ `dealer | private | unknown`. New values in either require
  prior agreement — our sync silently drops unknown values (skip-and-log).
  New `source` values (e.g. `kijiji` arriving next to `autotrader`,
  `marketplace`) flow through automatically; the UI falls back to the raw key
  until a label is added to `SOURCE_LABELS` in `StatsModal.astro`.
- **Units are law**: percentiles are **whole CAD dollars** in the view; the
  sync multiplies by 100 into INTEGER cents (app-wide money invariant).
- **Row uniqueness** = our PK: `(city_slug, make_slug, model_slug,
  anchor_year, mileage_bucket, source, seller_kind)`.
- **Timing window**: our sync pulls daily at **09:45 UTC**; the view must
  serve a complete, consistent snapshot by **09:30 UTC** — either the nightly
  rebuild is done, or it is atomic (staging swap), or the view serves
  yesterday's full slice. An *empty* view is safe on our side (we keep the
  previous snapshot); a *half-built* one would sync as truth.

## How it works

### 1. Daily sync (`syncMarketStats`, workers/expire-sweeper/src/index.ts)

Runs in the cron Worker (`japanauto-expire-sweeper` — the name is historic; it
dispatches every scheduled job by exact cron-string match in `scheduled()`).
`MARKET_SYNC_CRON = "45 9 * * *"` — 09:45 UTC ≈ 03:45 Calgary, after the
scraper's nightly cadence.

**Auth ladder** (contract §3; the scraper project runs ES256 signing keys, so
the originally-designed self-minted HS256 `japanauto_sync` JWT may not
validate there). Attempts in order, falling one rung on a 401/403 of the
first page and logging loudly via `console.error`:

1. `jwt-role (least privilege)` — `apikey: MARKET_SUPABASE_SECRET_KEY` (gateway)
   + `Authorization: Bearer MARKET_SYNC_JWT` (narrows the Postgres role to the
   stats view only);
2. `legacy anon+jwt` — `apikey: MARKET_SUPABASE_ANON_KEY` + the same Bearer;
3. `sb-secret only` — `apikey: MARKET_SUPABASE_SECRET_KEY` (service-role
   rights, broader than designed; accepted because it lives only in Cloudflare
   secrets).

No rungs configured → logged no-op. All rungs rejected → throw (the run shows
as failed in Workers logs).

**Ordered pagination.** PostgREST limit/offset is only deterministic with an
explicit total order; without it Postgres may duplicate or skip rows across
pages. The sync orders over the full target PK
(`city_slug.asc,…,source.asc,seller_kind.asc`), pages by `PAGE = 1000`,
advances the offset by rows actually received (a project-level max-rows cap
can shrink a "full" page), terminates only on an empty page, and aborts past
100 000 rows as runaway.

**Empty view → keep yesterday.** Zero rows almost certainly means an upstream
problem (role grant, empty rescrape); the sync returns without writing, so the
cabinet keeps the previous snapshot instead of blanking.

**Skip-and-log enum guard.** The D1 `CHECK` on `mileage_bucket` would abort a
whole batch over one drifted label. Rows whose `mileage_bucket` is outside
`KNOWN_BUCKETS` or whose `seller_kind` is outside `KNOWN_KINDS` are filtered
out and counted in a log line — an upstream rename degrades gracefully instead
of killing the nightly run (but the data silently doesn't arrive; contract
§2.3 makes new enum values agreement-only for exactly this reason).

**Dollars → cents.** `cents()` does `Math.round(d * 100)`; `NULL` passes
through. `median_days_listed` is rounded to whole days.

**Batched upsert + prune under D1's parameter cap.** D1 hard-caps **100 bound
parameters per statement** (not SQLite's 999, and local miniflare does not
enforce it — only prod would fail). At 15 columns per row, `ROWS_PER_STMT = 6`
gives 90 params per `INSERT OR REPLACE`; statements go to `env.DB.batch()` in
slices of `STMTS_PER_BATCH = 40` (a D1 batch is an implicit transaction).
After all upserts, `DELETE FROM market_stats WHERE synced_at < ?` (bound to
this run's timestamp, unix seconds) prunes rows the run didn't touch — e.g. a
model that left the scraper's grid. Readers may briefly observe a fresh/stale
row mix mid-run, acceptable for a daily snapshot.

### 2. D1 schema (migrations 0016 + 0019)

`migrations/0016_market_stats.sql` created `market_stats` keyed on
`(city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source)`.
The 2026-06-12 contract update split rows by seller kind; under the old PK,
dealer and private rows for the same key would `INSERT OR REPLACE` each other
on sync (last-write-wins corruption). SQLite cannot extend a PK, so
`migrations/0019_market_stats_seller_kind.sql` rebuilds: create
`market_stats_v2` with `seller_kind TEXT NOT NULL DEFAULT 'unknown'` in the
PK, copy existing rows as `seller_kind='unknown'` (the cabinet block stays
live until the next sync replaces the snapshot), drop, rename. Reads are
always an exact `(city_slug, make_slug, model_slug, anchor_year)` prefix
lookup, covered by the PK index — no extra index.

Columns: money is INTEGER cents (`price_p25_cents` …), `synced_at` is unix
seconds, `computed_on` is the scraper's `YYYY-MM-DD` recompute stamp
(`max(last_seen_at)::date` per source, per the contract ack).

### 3. Stats API (`functions/api/listings/[id]/stats.ts`)

`GET /api/listings/:id/stats` — `requireDealer` auth plus an explicit
`listing.dealer_id !== auth.dealerId → forbidden()` owner check. The response
always carries lifetime totals, `created_at` (unix seconds — the "days on
market" basis), `sold_at`, and the 30-day `series` from `entity_stats_daily`
(migration 0012). The `market` field is one of:

- `{ available: false, reason: "pro_feature" }` — dealer's
  `getEntitlements().marketAnalytics` is false (free tier, no live trial);
- `{ available: false, reason: "no_data" }` — entitled but no rows for this
  (city, make, model, year), or the block degraded (see below);
- `{ available: true, anchor_year, listing_bucket, price_cents, computed_on,
  segments: [...] }`.

Mechanics: catalog slugs are resolved from `makes`/`models` by id (the
snapshot is keyed on slugs, not ids); the D1 read is the exact PK-prefix
lookup bound to `listing.city.toLowerCase()`, both slugs, and `listing.year`
as `anchor_year`. Rows are grouped into **segments keyed `(source,
seller_kind)`** — dealer and private asks are never blended into one median
(contract: dealers carry prep/warranty/margin, privates ask less; mixing
skews both). Segments sort by `KIND_ORDER` (`dealer` 0, `private` 1,
`unknown` 2) then source; buckets within a segment by `BUCKET_ORDER`.
`listing_bucket` comes from `mileageBucket(listing.mileage)`
(`<100 000 → 0-100k`, `<200 000 → 100-200k`, else `200k+`); `price_cents` is
the listing's own asking price (already cents); `computed_on` is the freshest
stamp across rows.

The whole market lookup sits in a `try/catch` that degrades to
`{ available: false, reason: "no_data" }` — the market block must never take
down base stats (e.g. code deployed before migration 0016/0019 applied; this
repo has known D1 migration-journal drift).

Donor stats (`functions/api/donors/[id]/stats.ts`) deliberately carry **no
market field** — there is no parts-market data source, and the modal treats an
absent `market` as "render nothing".

### 4. Modal rendering (`src/components/sections/StatsModal.astro`)

`renderMarket(market)` inside the shared cabinet `<dialog>` (the script is
`is:inline` on a noindex SSG page, hashed at build time per the CSP
no-`unsafe-inline` policy). Behaviour:

- `reason: "pro_feature"` → upsell line; `reason: "no_data"` / empty
  `segments` → "arrives with the next update" note; absent `market` (donors)
  → nothing.
- **Primary segment = dealer** — the first segment with
  `seller_kind === 'dealer'` (fallback: first segment). It gets the full
  treatment: a comparison sentence ("Your price CA$X is N% above/below the
  market median of CA$Y") against the listing's own mileage bucket, falling
  back to the `all` pool when the bucket is empty; scarcity callouts (bucket
  row absent or `n_active === 0` → "no similar cars… demand may meet no
  supply but yours"; `n_active <= 3` → "scarce supply"); a per-bucket
  p25–p75 table with the listing's own bucket highlighted; and a liquidity
  line from `median_days_listed` (NULL until the scraper has ~a week of
  delisting cadence).
- **Non-primary segments (private sellers, other platforms) render as one
  compact context line each**: "Private sellers · Facebook Marketplace:
  median CA$X · N listed — M% below dealer asks", with the spread computed
  against the primary segment's `all` median. `unknown` segments are
  suppressed once real kinds exist (they are pre-0019 leftovers or
  unclassified noise).
- Labels come from `SOURCE_LABELS` / `KIND_LABELS` maps; unknown keys render
  raw. All API data lands via `textContent` — nothing is parsed as HTML.
- The block header reads "MARKET CONTEXT — ONLY YOU SEE THIS" and the footer
  states the sourcing ("asking prices from public listings on other
  platforms, same model ±1 year in your city. Never shown to buyers") — the
  privacy invariant is also a UI promise.

### 5. Staleness monitoring (admin Worker, decision 0014)

The Access-gated admin Worker watches the pipeline:

- `/ops` (`opsPage`, `workers/admin/src/pages/ops.ts`): `MAX(synced_at)` over
  `market_stats` vs `MARKET_STALE_AFTER_S = 36 * 3600` → a `fresh`/`stale`
  badge, plus row count, latest `computed_on`, and a per-`source` row
  breakdown. 36 h = one missed daily run plus slack.
- `/` dashboard (`workers/admin/src/pages/dashboard.ts`): row count,
  `MAX(synced_at)`, `GROUP_CONCAT(DISTINCT source)` in the KPI batch.

There is no push alert — the owner glances at the dashboard daily; a missed
sync also shows as a failed scheduled run in Workers logs
(`[observability] enabled = true` in `workers/expire-sweeper/wrangler.toml`).

## Invariants

- **PRIVACY (iron):** `market_stats` never feeds a public surface. Reads
  exist in exactly three places: the owner-gated Pro-gated listing stats
  endpoint, and the two read-only admin pages behind Cloudflare Access. Any
  new reader must preserve owner + `marketAnalytics` gating; "available to
  buyers" or "available on free tier" is a product-breaking regression, not a
  style choice.
- **Segments are never blended.** A median is always per `(source,
  seller_kind)`. Dealer and private asking prices must not be averaged,
  pooled, or compared as one population — in SQL, in the API shape, or in UI
  copy.
- **Money is INTEGER cents** end-to-end in our systems; the view's whole-CAD
  dollars exist only inside `syncMarketStats` before `cents()`.
- **Timestamps are unix seconds** (`synced_at`, and everything else in D1);
  `computed_on` is the one deliberate exception — a `YYYY-MM-DD` date string
  stamped by the scraper's view and passed through for display/freshness.
- **The view is the API.** Our code may depend only on
  `japanauto_market_stats` columns named in the contract. Slug dictionaries
  are frozen; catalog expansion (new city/model) is initiated from our side.
- **Unknown enum values are dropped, not stored.** The sync's skip-and-log
  filter is the guard in front of the D1 `CHECK` constraints; both must list
  the same values as the contract.
- **An empty upstream view never blanks D1.** Keep-previous-snapshot on zero
  rows; prune only happens after a non-empty upsert succeeded.
- **Sync failures fail loudly.** Auth-rung fallbacks log `console.error`; an
  exhausted ladder or mid-pagination error throws. Only the
  "secrets not configured" state is a quiet no-op (pre-launch posture).

## Design decisions

- **Daily snapshot in D1, not live queries to Supabase** — the stats endpoint
  stays single-datastore and fast, the scraper project can be down for a day
  without dealer-visible impact, and the blast radius of an upstream schema
  accident is one sync run, not every modal open.
- **Pull, not push** — symmetric with the social-boost factory protocol: the
  external project never holds japanauto credentials; japanauto holds
  read-only(ish) credentials to one view.
- **`INSERT OR REPLACE` + prune-by-`synced_at` instead of
  `DELETE`-all-then-insert** — readers during the run see a fresh/stale mix
  rather than an empty table, and a mid-run crash leaves yesterday's rows in
  place for keys not yet rewritten.
- **Table rebuild in 0019 instead of a new versioned table** — the snapshot
  is fully regenerated daily, so preserving history was worthless;
  re-keying in place (with an `'unknown'` backfill bridging until the next
  sync) kept every reader's SQL unchanged except for the added column.
- **Secret-key auth accepted as a fallback rung** (commits `b4f35cf`,
  `e03fbba`) — the designed least-privilege HS256 `japanauto_sync` JWT may
  not validate against the scraper project's ES256 keys; rather than block
  the feature on someone else's key infrastructure, the ladder tries least
  privilege first and degrades with loud logs. The sb-key is not to be
  revoked upstream until the JWT rung is confirmed in a production sync.

## Gaps

- `median_days_listed` stays NULL until the scraper accumulates ~a week of
  delisting cadence; the modal simply omits the liquidity line.
- No push alert on staleness — `/ops` badge and dashboard only. If a daily
  glance stops being the routine, wire a notification onto the >36 h
  condition.
- The JWT auth rung is unconfirmed in production as of 2026-06-12 (first
  post-handover sync runs 09:45 UTC next morning); until then the sync may be
  running on the sb-secret rung — check the run logs for
  `auth 'jwt-role (least privilege)' OK`.
- No automated tests cover `syncMarketStats` (pagination, enum filtering,
  batching arithmetic); the 100-param cap regression class is exactly the
  kind local dev won't catch.
- `SOURCE_LABELS` in `StatsModal.astro` must be extended manually when the
  scraper adds a platform (the contract obliges them to send the exact
  spelling in advance); an unlabeled source renders as its raw key — ugly but
  functional.

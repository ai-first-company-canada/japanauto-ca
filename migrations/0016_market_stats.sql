-- 0016_market_stats.sql — Feature 1 step 3 (market analytics, LAUNCH-PLAN-2026-06).
--
-- Daily snapshot of the scraper project's `japanauto_market_stats` Supabase
-- view (see the spec/SQL in the FB-BD project: anchor_year = model year ±1,
-- mileage buckets, percentiles over ACTIVE listings, median days-listed over
-- DELISTED ones). Pulled by the market-sync cron in workers/expire-sweeper;
-- read ONLY by GET /api/listings/:id/stats behind the marketAnalytics
-- entitlement (docs/decisions/0012).
--
-- PRIVACY INVARIANT: this table must never feed a public surface. Marketplace
-- asking prices sit systematically below dealer retail — showing them to
-- buyers would undercut the very dealers we host (owner decision, Feature 1).
--
-- Money is INTEGER cents (app-wide invariant); the view emits whole dollars,
-- the sync multiplies by 100.
CREATE TABLE market_stats (
  city_slug          TEXT    NOT NULL,
  make_slug          TEXT    NOT NULL,
  model_slug         TEXT    NOT NULL,
  anchor_year        INTEGER NOT NULL,
  mileage_bucket     TEXT    NOT NULL CHECK (mileage_bucket IN ('all','0-100k','100-200k','200k+')),
  source             TEXT    NOT NULL,              -- 'marketplace' today; view v3 will split per platform
  n_active           INTEGER NOT NULL DEFAULT 0,
  price_p25_cents    INTEGER,
  price_p50_cents    INTEGER,
  price_p75_cents    INTEGER,
  n_delisted         INTEGER NOT NULL DEFAULT 0,
  median_days_listed INTEGER,                       -- NULL until the scraper has ~a week of cadence
  computed_on        TEXT,                          -- 'YYYY-MM-DD' stamped by the view
  synced_at          INTEGER NOT NULL,
  PRIMARY KEY (city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source)
);
-- Reads are always an exact (city, make, model, anchor_year) prefix lookup —
-- the PK index covers them; no extra index needed.

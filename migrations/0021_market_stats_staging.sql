-- 0021_market_stats_staging.sql — atomic market-sync snapshot swap (deep-audit
-- COR-1). The daily sync previously wrote market_stats across many separate
-- env.DB.batch() calls + a final prune, so a mid-run failure left a torn
-- fresh/stale mix visible to the private Pro market block (violating the
-- "one transactional snapshot" the docstring claimed). Fix: the cron fills
-- THIS staging table (unread by any reader), then swaps in ONE atomic batch —
-- [DELETE FROM market_stats; INSERT INTO market_stats SELECT * FROM staging].
-- The INSERT-SELECT is a single SQL statement (no bound-param cap), so the
-- swap is all-or-nothing; readers never observe a half-updated table.
-- Column order MUST match market_stats exactly (INSERT ... SELECT *).
-- IF NOT EXISTS: this DB has a documented migration-journal-drift history (REG-4).
CREATE TABLE IF NOT EXISTS market_stats_staging (
  city_slug          TEXT    NOT NULL,
  make_slug          TEXT    NOT NULL,
  model_slug         TEXT    NOT NULL,
  anchor_year        INTEGER NOT NULL,
  mileage_bucket     TEXT    NOT NULL,
  source             TEXT    NOT NULL,
  seller_kind        TEXT    NOT NULL DEFAULT 'unknown',
  n_active           INTEGER NOT NULL DEFAULT 0,
  price_p25_cents    INTEGER,
  price_p50_cents    INTEGER,
  price_p75_cents    INTEGER,
  n_delisted         INTEGER NOT NULL DEFAULT 0,
  median_days_listed INTEGER,
  computed_on        TEXT,
  synced_at          INTEGER NOT NULL,
  PRIMARY KEY (city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source, seller_kind)
);

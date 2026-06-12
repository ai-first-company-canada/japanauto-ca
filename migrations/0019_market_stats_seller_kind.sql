-- 0019 — seller_kind dimension in market stats (scraper contract update
-- 2026-06-12): rows now split dealer vs private vs unknown sellers, and the
-- old PK (…, source) would let segments INSERT-OR-REPLACE each other on sync
-- (last-write-wins corruption). SQLite can't extend a PK — rebuild the table.
-- Existing rows are kept as seller_kind='unknown' so the cabinet block stays
-- live until the next sync replaces the snapshot (stale rows are pruned by
-- synced_at as usual).
CREATE TABLE market_stats_v2 (
  city_slug          TEXT    NOT NULL,
  make_slug          TEXT    NOT NULL,
  model_slug         TEXT    NOT NULL,
  anchor_year        INTEGER NOT NULL,
  mileage_bucket     TEXT    NOT NULL CHECK (mileage_bucket IN ('all','0-100k','100-200k','200k+')),
  source             TEXT    NOT NULL,              -- 'autotrader' | 'marketplace' | 'kijiji' | …
  seller_kind        TEXT    NOT NULL DEFAULT 'unknown'
                       CHECK (seller_kind IN ('dealer','private','unknown')),
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

INSERT INTO market_stats_v2
  (city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source, seller_kind,
   n_active, price_p25_cents, price_p50_cents, price_p75_cents,
   n_delisted, median_days_listed, computed_on, synced_at)
SELECT city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source, 'unknown',
       n_active, price_p25_cents, price_p50_cents, price_p75_cents,
       n_delisted, median_days_listed, computed_on, synced_at
FROM market_stats;

DROP TABLE market_stats;
ALTER TABLE market_stats_v2 RENAME TO market_stats;

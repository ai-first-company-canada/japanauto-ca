-- 0018 — traffic-source attribution + e-mail reports (decision 0016).
--
-- (a) Views split by acquisition source. Our own links carry the utm:
--     utm_medium=social      → organic social (content-factory boosts)
--     utm_medium=catalog_ads / cpc → paid social (Meta catalog ads, ADR-0015)
--     everything else        → direct/search (views - views_social - views_paid)
ALTER TABLE entity_stats_daily ADD COLUMN views_social INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entity_stats_daily ADD COLUMN views_paid   INTEGER NOT NULL DEFAULT 0;

-- (b) Weekly/monthly e-mail reports (CASL: one-click opt-out).
ALTER TABLE dealers ADD COLUMN reports_opt_out INTEGER NOT NULL DEFAULT 0;

-- (c) Send-idempotency: one report per (period, dealer); retried cron runs
--     INSERT OR IGNORE and skip rows that already exist.
--     period examples: 'weekly-2026-06-15', 'monthly-2026-06'.
CREATE TABLE report_runs (
  period    TEXT NOT NULL,
  dealer_id TEXT NOT NULL REFERENCES dealers (id) ON DELETE CASCADE,
  sent_at   INTEGER NOT NULL,
  PRIMARY KEY (period, dealer_id)
);

-- ============================================================================
-- Migration 0012 — per-day view/contact rollups (Feature 1: cabinet stats)
-- ============================================================================
-- The dealer cabinet's "Statistics" modal needs a 30-day timeseries per
-- listing/donor. Lifetime totals already live on the entity rows
-- (view_count/contact_count); this table adds the per-day dimension.
--
-- One row per (entity_type, entity_id, UTC day). Writes are atomic UPSERTs
-- (INSERT ... ON CONFLICT ... DO UPDATE — same serialization argument as the
-- rate limiter, migration 0008) fired via ctx.waitUntil off the request path:
--   * views    — detail-page Pages Functions, bot-filtered via md.isBot
--   * contacts — the track-contact endpoints, alongside contact_reveals
--
-- First-party, no cookies, aggregates only — no consent surface. Chosen over
-- GA4 (third-party JS + consent under Quebec Law 25 + 24-48h API lag) and
-- Workers Analytics Engine (90-day retention + external query API); D1 keeps
-- the data queryable in-place at this scale. See LAUNCH-PLAN-2026-06 Feature 1.
--
-- Retention: rows are tiny and bounded by entities x days; sweep later via the
-- cron worker if needed (DELETE WHERE day < date('now','-400 days')).
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE entity_stats_daily (
  entity_type TEXT    NOT NULL CHECK (entity_type IN ('listing', 'donor_car')),
  entity_id   TEXT    NOT NULL,
  day         TEXT    NOT NULL,              -- UTC 'YYYY-MM-DD'
  views       INTEGER NOT NULL DEFAULT 0,
  contacts    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_type, entity_id, day)
) WITHOUT ROWID;

-- ============================================================================
-- Migration 0015 — social boost job queue (Feature 3, LAUNCH-PLAN-2026-06)
-- ============================================================================
-- The dealer clicks "Promote on social" -> a job row is queued here with a
-- SNAPSHOT of the listing (the content factory builds posts from what the
-- dealer approved, not from a moving target). The external content-factory
-- project works PULL-model through /api/social/jobs (service token) and
-- writes back the published links. Our D1 owns the queue — no shared database
-- with the factory (schema coupling + due-diligence hygiene, see plan).
--
-- Lifecycle: requested -> in_production -> published; requested/in_production
-- -> cancelled. One ACTIVE job per listing (partial unique index) — re-promote
-- is possible after the previous job reaches a terminal state.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE social_boost_jobs (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  dealer_id    TEXT NOT NULL REFERENCES dealers (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'requested'
                 CHECK (status IN ('requested', 'in_production', 'published', 'cancelled')),
  payload      TEXT NOT NULL,            -- JSON listing snapshot at request time
  result_links TEXT,                     -- JSON array of published post URLs
  requested_at INTEGER NOT NULL,
  published_at INTEGER,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_social_jobs_status ON social_boost_jobs (status, requested_at);
CREATE INDEX idx_social_jobs_dealer ON social_boost_jobs (dealer_id, requested_at);
CREATE UNIQUE INDEX idx_social_jobs_one_active_per_listing
  ON social_boost_jobs (listing_id)
  WHERE status IN ('requested', 'in_production');

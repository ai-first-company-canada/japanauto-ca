-- ============================================================================
-- Migration 0008 — Atomic rate-limit counters (replaces KV read-modify-write)
-- ============================================================================
-- The previous limiter (functions/api/_lib/rate-limit.ts) stored sliding-window
-- timestamps in KV and did get -> check -> put. Cloudflare KV has no
-- compare-and-swap and is eventually consistent, so a concurrent burst would all
-- read the same (or a stale) count, all see "under limit", and all pass — the
-- limit only bound sequential traffic, not parallel bursts (login brute-force,
-- signup, contact-reveal). This table moves the counter into D1, where a single
-- `INSERT ... ON CONFLICT ... RETURNING` is serialized by SQLite's write lock,
-- making check-and-increment atomic: concurrent requests get distinct
-- post-increment counts, so the limit holds.
--
-- Semantics: fixed window. `window_start` is the unix-second start of the
-- current window; once it ages past the configured windowSeconds the counter
-- resets to 1 on the next hit. One row per (bucket, identifier) — rows are
-- reused in place, never appended.
--
-- Retention: rows are bounded by distinct identifiers seen. Stale rows can be
-- swept by a future maintenance job: `DELETE FROM rate_limits WHERE
-- window_start < <now - 86400>;` (the index below supports it).
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,            -- "rl:<bucket>:<identifier>"
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL             -- unix seconds: start of current window
);

CREATE INDEX idx_rate_limits_window_start ON rate_limits (window_start);

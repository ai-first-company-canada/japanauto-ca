-- 0023_ops_heartbeats.sql — cron observability (deep-audit OPS-4, WS-4).
-- Every scheduled job of workers/expire-sweeper records its run outcome here
-- (fail-safe: a heartbeat write never fails the job). The staleness checker
-- (scripts/check-cron-heartbeats.mjs, run by deploy.yml's 3-hourly schedule)
-- reads it and turns a silent cron death into a red scheduled run + GitHub
-- email to the owner. The admin /ops page renders the same rows.
-- IF NOT EXISTS: this DB has a documented migration-journal-drift history.
CREATE TABLE IF NOT EXISTS ops_heartbeats (
  job_name      TEXT PRIMARY KEY,   -- 'expire-sweep' | 'market-sync' | 'reports-weekly' | 'reports-monthly'
  last_ok_at    INTEGER,            -- unixepoch of the last successful completion
  last_error    TEXT,               -- last error message, truncated to 500 chars
  last_error_at INTEGER,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 0024_stripe_billing.sql — Stripe billing wiring (WS-1, ADR-0012 §3).
-- (Numbering note: OPUS-PLAN drafted this as "0022"; 0022 went to
-- dealer_email_verified and 0023 to ops_heartbeats — numbers are assigned in
-- execution order.)
--
-- stripe_events: webhook idempotency + audit. The event INSERT rides in the
-- SAME env.DB.batch() as the dealer mutation, so a duplicate delivery
-- (PK conflict) rolls back the whole batch → handler answers
-- {received:true, duplicate:true}; a mid-batch failure writes nothing →
-- 500 → Stripe retries cleanly. Replaces the never-created
-- subscription_events from migrations/README.
--
-- IF NOT EXISTS / ADD COLUMN: this DB has a documented journal-drift history;
-- verify the journal before applying (docs/runbook.md).
CREATE TABLE IF NOT EXISTS stripe_events (
  id            TEXT PRIMARY KEY,      -- evt_… from Stripe
  type          TEXT NOT NULL,
  created       INTEGER NOT NULL,      -- event.created (unix)
  processed_at  INTEGER NOT NULL,
  payload_json  TEXT                   -- raw event truncated to 64KB (due-diligence audit trail)
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events (type, created DESC);

-- Mirror of Stripe subscription state + downgrade mechanics (ADR-0012 §3):
-- subscription_period_end   = current_period_end / ended_at from Stripe;
--                             grace = 7 days past max(trial_ends_at, this).
-- stripe_last_event_created = guard against out-of-order webhook retries.
ALTER TABLE dealers ADD COLUMN subscription_period_end INTEGER;
ALTER TABLE dealers ADD COLUMN stripe_last_event_created INTEGER;

-- frozen_at (NOT a new status — the status CHECK can't grow without a table
-- rebuild): a frozen row keeps status='active' for the owner's cabinet but
-- disappears from every public surface (frozen_at IS NULL filters, T8).
ALTER TABLE listings ADD COLUMN frozen_at INTEGER;
ALTER TABLE donor_cars ADD COLUMN frozen_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_listings_frozen ON listings (dealer_id, frozen_at) WHERE frozen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_donor_cars_frozen ON donor_cars (dealer_id, frozen_at) WHERE frozen_at IS NOT NULL;

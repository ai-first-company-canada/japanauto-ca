-- ============================================================================
-- Migration 0013 — dealer trial window + Stripe subscription mirror
-- ============================================================================
-- Billing foundation (Feature 5, LAUNCH-PLAN-2026-06; ADR docs/decisions/0012).
-- Product logic ships now; Stripe wiring is post-launch. Two additive columns:
--
--   trial_ends_at          — unix seconds. Set to signup + 30 days. While
--                            now < trial_ends_at the account is treated as Pro
--                            (full features, no card). effectiveTier() reads it.
--   stripe_subscription_id — mirror of the Stripe subscription, NULL until a
--                            paid plan is wired. subscription_tier/status remain
--                            the Stripe mirror; the trial lives separately so the
--                            two never fight (see ADR 0012).
--
-- Both NULL-able / defaulted so existing rows stay valid. The active-listing
-- cap for the free tier is enforced in app code (getEntitlements), not as a
-- CHECK — it depends on a COUNT across rows.
-- ============================================================================

PRAGMA foreign_keys = ON;

ALTER TABLE dealers ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE dealers ADD COLUMN stripe_subscription_id TEXT;

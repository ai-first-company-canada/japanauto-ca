-- ============================================================================
-- Migration 0007 — Phase 3.3 — Salvage-yard profile fields on dealers
-- ============================================================================
-- Adds three nullable columns to `dealers` so salvage_yard onboarding can
-- capture the extra profile information that doesn't apply to used-car
-- dealerships:
--   * specializes_in   — free-text "Toyota, Honda, Subaru" (salvage_yard only)
--   * bio              — free-text 0..2000 chars (salvage_yard or dealer)
--   * founded_year     — INT, sanity-bounded 1900..2030 (E-E-A-T trust signal)
--
-- All columns are NULL-able. Existing dealer rows stay valid; salvage_yard
-- signups populate them via /api/auth/signup.
--
-- App-layer rule (Phase 3.3): when type='salvage_yard', signup requires
-- specializes_in. Enforced in zod (lib/schema.ts), not as a CHECK — keeps
-- existing dealer rows valid without backfill.
-- ============================================================================

PRAGMA foreign_keys = ON;

ALTER TABLE dealers ADD COLUMN specializes_in TEXT;
ALTER TABLE dealers ADD COLUMN bio TEXT;
ALTER TABLE dealers ADD COLUMN founded_year INTEGER
  CHECK (founded_year IS NULL OR founded_year BETWEEN 1900 AND 2030);

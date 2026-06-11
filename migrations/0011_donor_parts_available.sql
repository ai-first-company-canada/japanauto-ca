-- ============================================================================
-- Migration 0011 — donor_cars.parts_available (Feature 4: parts checklists)
-- ============================================================================
-- Junkyards rarely write prose, so donor pages had no parts substance for
-- SEO beyond the free-text available_parts_notes (usually empty). This column
-- stores the structured availability checklist the yard ticks at listing time:
-- a JSON TEXT array of canonical part slugs from DONOR_PART_SLUGS in
-- lib/schema.ts (e.g. ["engine-assembly","doors","headlights"]).
--
-- NULL = checklist not provided (older rows / yard skipped it). The page then
-- falls back to notes-only rendering, exactly as before this migration.
--
-- Validation lives in zod (donorPartsAvailableSchema: enum slugs, unique,
-- bounded) — same pattern as the compatible_* JSON columns from 0005; no
-- CHECK constraint here for the same reason those columns have none.
-- ============================================================================

PRAGMA foreign_keys = ON;

ALTER TABLE donor_cars ADD COLUMN parts_available TEXT;

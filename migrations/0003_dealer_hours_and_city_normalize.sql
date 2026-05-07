-- ============================================================================
-- Migration 0003 — Phase 2c1
-- ============================================================================
-- 1. Add dealers.hours column (TEXT, JSON-encoded DealerHours[]).
--    NULL means "hours not configured" — UI shows "Hours coming soon" copy.
-- 2. Standardize dealers.city to slug format (lowercase kebab) so it matches
--    listings.city (which always stores slug). Phase 2b2 deviation #8 logged
--    that frontend sent display names ("Calgary") for dealers.city while
--    listings.city was slug ("calgary") — Phase 2c1 unifies на slug.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. Add hours column. Nullable; default NULL for existing rows.
-- ----------------------------------------------------------------------------
ALTER TABLE dealers ADD COLUMN hours TEXT;

-- ----------------------------------------------------------------------------
-- 2. Normalize existing dealers.city values to slug.
--    Strategy:
--      a) If current value matches a known cities.name (case-insensitive) OR
--         already matches a known cities.slug, replace with the canonical slug.
--      b) Otherwise (small towns not in CMA list) — kebab-case fallback:
--         lowercase + spaces→hyphens, strip commas/dots.
-- ----------------------------------------------------------------------------

-- (a) Map via cities table (covers Tier-1 + Tier-2/3 CMAs).
UPDATE dealers
SET city = (
  SELECT cities.slug
  FROM cities
  WHERE LOWER(cities.name) = LOWER(dealers.city)
     OR cities.slug = LOWER(dealers.city)
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM cities
  WHERE LOWER(cities.name) = LOWER(dealers.city)
     OR cities.slug = LOWER(dealers.city)
);

-- (b) Best-effort kebab-case for any remaining unmatched rows.
--     Lowercases + replaces spaces with hyphens + strips commas/dots.
UPDATE dealers
SET city = REPLACE(REPLACE(REPLACE(LOWER(city), ' ', '-'), ',', ''), '.', '')
WHERE city != LOWER(city)
   OR city LIKE '% %'
   OR city LIKE '%,%'
   OR city LIKE '%.%';

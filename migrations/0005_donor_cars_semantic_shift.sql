-- ============================================================================
-- Migration 0005 — Phase 3.1 — Semantic shift: parts → donor_cars (ADR-0008)
-- ============================================================================
-- Drops the unused `parts` granular-catalog table and replaces it with
-- `donor_cars` per ADR-0008 (junkyard donor car directory, not part-level).
--
-- Verified preconditions (Phase 3.1 Step 0):
--   * parts.COUNT(*) = 0 on local + remote (no data preservation needed)
--   * media:           empty table; no 'part' rows to migrate
--   * contact_reveals: empty table; no 'part' rows to migrate
--   * dealers.type CHECK already includes 'salvage_yard'
--   * Toyota models seeded with ids 1..8; 6 active CMA cities exist.
--
-- SQLite cannot ALTER COLUMN CHECK in place — `media` and `contact_reveals`
-- are rebuilt with the standard rename + create + copy + drop pattern so the
-- 'part' literal in their CHECK becomes 'donor_car'.
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- ============================================================================
-- 1. DROP unused parts table (granular catalog rejected by ADR-0008)
-- ============================================================================
DROP INDEX IF EXISTS idx_parts_slug;
DROP INDEX IF EXISTS idx_parts_dealer_status;
DROP INDEX IF EXISTS idx_parts_category_status;
DROP TRIGGER IF EXISTS trg_parts_updated_at;
DROP TABLE IF EXISTS parts;

-- ============================================================================
-- 2. CREATE donor_cars (whole-vehicle inventory at salvage_yard dealers)
-- ============================================================================
-- App-layer enforcement (NOT in DB CHECK):
--   * dealer.type MUST equal 'salvage_yard' for any insert.
--   * compatible_makes/models/years/trims are JSON arrays — zod-validated.
--
-- DB-level CHECK enforces enum values, numeric bounds, currency literal.
-- Year window is static [1980, 2030] — donor cars have NO rolling age cap
-- (older donors are valuable for rare-parts recovery — ADR-0008 explicit).
-- ============================================================================
CREATE TABLE donor_cars (
  id                       TEXT PRIMARY KEY,
  dealer_id                TEXT NOT NULL REFERENCES dealers (id) ON DELETE CASCADE,

  slug                     TEXT NOT NULL,
  year                     INTEGER NOT NULL CHECK (year BETWEEN 1980 AND 2030),
  make_id                  INTEGER NOT NULL REFERENCES makes (id) ON DELETE RESTRICT,
  model_id                 INTEGER NOT NULL REFERENCES models (id) ON DELETE RESTRICT,
  trim                     TEXT,
  generation_code          TEXT,                          -- 'E170', 'E140', etc.
  generation_range         TEXT,                          -- '2014–2018'
  city_slug                TEXT NOT NULL REFERENCES cities (slug) ON DELETE RESTRICT,

  color_exterior           TEXT NOT NULL,
  color_exterior_full      TEXT,
  tone                     TEXT,                          -- placeholder-illustration palette key
  color_interior           TEXT,
  vin                      TEXT,
  mileage                  INTEGER CHECK (mileage IS NULL OR mileage BETWEEN 0 AND 9999999),

  engine                   TEXT,
  transmission             TEXT CHECK (transmission IS NULL OR transmission IN
                              ('manual','automatic','cvt','dct')),

  condition                TEXT NOT NULL DEFAULT 'fully_available'
                             CHECK (condition IN
                               ('fully_available','partially_available','almost_depleted','depleted')),
  available_parts_notes    TEXT,

  -- Cross-compatibility (JSON arrays — soft-validated by zod)
  compatible_makes         TEXT,
  compatible_models        TEXT,
  compatible_years         TEXT,
  compatible_trims         TEXT,

  -- Pricing — usually NULL ("call for price"); some yards advertise whole-donor sale.
  price                    INTEGER CHECK (price IS NULL OR price BETWEEN 0 AND 100000000),
  price_currency           TEXT NOT NULL DEFAULT 'CAD' CHECK (price_currency = 'CAD'),

  status                   TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','active','depleted','expired','flagged')),

  view_count               INTEGER NOT NULL DEFAULT 0,
  contact_count            INTEGER NOT NULL DEFAULT 0,

  created_at               INTEGER NOT NULL,
  updated_at               INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_donor_cars_slug             ON donor_cars (slug);
CREATE        INDEX idx_donor_cars_dealer_status    ON donor_cars (dealer_id, status);
CREATE        INDEX idx_donor_cars_make_status      ON donor_cars (make_id, status);
CREATE        INDEX idx_donor_cars_make_model_status ON donor_cars (make_id, model_id, status);
CREATE        INDEX idx_donor_cars_city_status      ON donor_cars (city_slug, status);
CREATE        INDEX idx_donor_cars_status_created   ON donor_cars (status, created_at DESC);

CREATE TRIGGER trg_donor_cars_updated_at
AFTER UPDATE ON donor_cars FOR EACH ROW
BEGIN
  UPDATE donor_cars SET updated_at = CAST(strftime('%s','now') AS INTEGER)
  WHERE id = NEW.id AND updated_at = OLD.updated_at;
END;

-- ============================================================================
-- 3. REBUILD media so entity_type CHECK accepts 'donor_car' (was 'part')
-- ============================================================================
-- Both media and media_old exist briefly; FKs are off so no constraint
-- failures. Indexes are recreated verbatim from 0001.
-- ============================================================================
DROP INDEX IF EXISTS idx_media_entity;
DROP INDEX IF EXISTS idx_media_r2_key;
ALTER TABLE media RENAME TO media_old;

CREATE TABLE media (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN
                    ('listing','donor_car','dealer','featured_slot')),
  entity_id       TEXT NOT NULL,
  r2_key          TEXT NOT NULL,
  cf_image_id     TEXT,
  alt_text        TEXT,
  width           INTEGER,
  height          INTEGER,
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_primary      INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  bytes           INTEGER,
  created_at      INTEGER NOT NULL
);

-- Map any pre-existing 'part' rows to 'donor_car' (defensive — Step 0 showed 0 rows).
INSERT INTO media (id, entity_type, entity_id, r2_key, cf_image_id, alt_text,
                   width, height, display_order, is_primary, bytes, created_at)
SELECT id,
       CASE WHEN entity_type = 'part' THEN 'donor_car' ELSE entity_type END,
       entity_id, r2_key, cf_image_id, alt_text,
       width, height, display_order, is_primary, bytes, created_at
FROM media_old;

DROP TABLE media_old;

CREATE INDEX        idx_media_entity ON media (entity_type, entity_id, display_order);
CREATE UNIQUE INDEX idx_media_r2_key ON media (r2_key);

-- ============================================================================
-- 4. REBUILD contact_reveals so entity_type CHECK accepts 'donor_car'
-- ============================================================================
DROP INDEX IF EXISTS idx_contact_reveals_entity;
DROP INDEX IF EXISTS idx_contact_reveals_ip;
ALTER TABLE contact_reveals RENAME TO contact_reveals_old;

CREATE TABLE contact_reveals (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('listing','donor_car','dealer')),
  entity_id       TEXT NOT NULL,
  ip_hash         TEXT NOT NULL,
  user_agent_hash TEXT,
  revealed_at     INTEGER NOT NULL
);

INSERT INTO contact_reveals (id, entity_type, entity_id, ip_hash, user_agent_hash, revealed_at)
SELECT id,
       CASE WHEN entity_type = 'part' THEN 'donor_car' ELSE entity_type END,
       entity_id, ip_hash, user_agent_hash, revealed_at
FROM contact_reveals_old;

DROP TABLE contact_reveals_old;

CREATE INDEX idx_contact_reveals_entity ON contact_reveals (entity_type, entity_id, revealed_at);
CREATE INDEX idx_contact_reveals_ip     ON contact_reveals (ip_hash, revealed_at);

PRAGMA foreign_keys = ON;

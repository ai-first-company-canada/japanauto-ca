-- ============================================================================
-- Migration 0004 — Phase 2c2a — Seed models table from MODELS_BY_BRAND stub
-- ============================================================================
-- Source: src/data/models-stubs.ts MODELS_BY_BRAND (Phase 1.2 stub data).
-- Body types loosely follow Phase 1.3 catalog-stubs.ts MODEL_VARIANTS pattern.
-- year_start / year_end left NULL — Phase 2c2b/4 may populate per-model.
--
-- Idempotent via UNIQUE (make_id, slug) — re-applying skips existing rows.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Toyota (make_id = 1)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (1, 'Camry',      'camry',      json_array('sedan')),
  (1, 'Corolla',    'corolla',    json_array('sedan','hatchback')),
  (1, 'RAV4',       'rav4',       json_array('suv')),
  (1, 'Highlander', 'highlander', json_array('suv')),
  (1, 'Prius',      'prius',      json_array('hatchback')),
  (1, 'Sienna',     'sienna',     json_array('minivan')),
  (1, 'Tacoma',     'tacoma',     json_array('pickup')),
  (1, '4Runner',    '4runner',    json_array('suv'));

-- Honda (make_id = 2)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (2, 'Civic',     'civic',     json_array('sedan','hatchback','coupe')),
  (2, 'Accord',    'accord',    json_array('sedan')),
  (2, 'CR-V',      'cr-v',      json_array('suv')),
  (2, 'Pilot',     'pilot',     json_array('suv')),
  (2, 'Odyssey',   'odyssey',   json_array('minivan')),
  (2, 'HR-V',      'hr-v',      json_array('suv')),
  (2, 'Ridgeline', 'ridgeline', json_array('pickup'));

-- Nissan (make_id = 3)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (3, 'Altima',     'altima',     json_array('sedan')),
  (3, 'Rogue',      'rogue',      json_array('suv')),
  (3, 'Sentra',     'sentra',     json_array('sedan')),
  (3, 'Pathfinder', 'pathfinder', json_array('suv')),
  (3, 'Murano',     'murano',     json_array('suv')),
  (3, 'Frontier',   'frontier',   json_array('pickup'));

-- Mazda (make_id = 4)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (4, 'Mazda3',     'mazda3', json_array('sedan','hatchback')),
  (4, 'CX-5',       'cx-5',   json_array('suv','crossover')),
  (4, 'CX-30',      'cx-30',  json_array('crossover')),
  (4, 'CX-9',       'cx-9',   json_array('suv')),
  (4, 'MX-5 Miata', 'mx-5',   json_array('convertible'));

-- Subaru (make_id = 5)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (5, 'Outback',   'outback',   json_array('wagon')),
  (5, 'Forester',  'forester',  json_array('suv')),
  (5, 'Crosstrek', 'crosstrek', json_array('crossover')),
  (5, 'Impreza',   'impreza',   json_array('sedan','hatchback')),
  (5, 'Ascent',    'ascent',    json_array('suv')),
  (5, 'WRX',       'wrx',       json_array('sedan'));

-- Lexus (make_id = 6)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (6, 'RX', 'rx', json_array('suv')),
  (6, 'NX', 'nx', json_array('suv','crossover')),
  (6, 'ES', 'es', json_array('sedan')),
  (6, 'IS', 'is', json_array('sedan')),
  (6, 'GX', 'gx', json_array('suv'));

-- Acura (make_id = 7)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (7, 'MDX',     'mdx',     json_array('suv')),
  (7, 'RDX',     'rdx',     json_array('suv','crossover')),
  (7, 'TLX',     'tlx',     json_array('sedan')),
  (7, 'Integra', 'integra', json_array('sedan','hatchback'));

-- Infiniti (make_id = 8)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (8, 'QX50', 'qx50', json_array('suv','crossover')),
  (8, 'QX60', 'qx60', json_array('suv')),
  (8, 'Q50',  'q50',  json_array('sedan')),
  (8, 'QX80', 'qx80', json_array('suv'));

-- Mitsubishi (make_id = 9)
INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (9, 'Outlander',     'outlander',     json_array('suv')),
  (9, 'RVR',           'rvr',           json_array('crossover')),
  (9, 'Eclipse Cross', 'eclipse-cross', json_array('crossover')),
  (9, 'Mirage',        'mirage',        json_array('hatchback'));

-- ============================================================================
-- Migration 0002 — Seed static data (makes, cities, city_aliases)
-- ============================================================================
-- Static reference data that must exist before any dealer/listing is created.
-- Idempotent via INSERT OR IGNORE — safe to re-run during dev.
--
-- Sources:
--   japanese-brands-whitelist.md (9 brands, Andrew 2026-05-02)
--   cities-list.md (6 Tier 1 active + 6 Tier 2/3 planned, Andrew 2026-05-01)
--   adr-0007-navigation-flow-and-monetization.md
-- ============================================================================

-- ============================================================================
-- MAKES — Japanese brands whitelist (commercial weight order = display_order)
-- ============================================================================
INSERT OR IGNORE INTO makes (id, name, slug, origin, display_order) VALUES
  (1, 'Toyota',     'toyota',     'japan', 1),
  (2, 'Honda',      'honda',      'japan', 2),
  (3, 'Nissan',     'nissan',     'japan', 3),
  (4, 'Mazda',      'mazda',      'japan', 4),
  (5, 'Subaru',     'subaru',     'japan', 5),
  (6, 'Lexus',      'lexus',      'japan', 6),
  (7, 'Acura',      'acura',      'japan', 7),
  (8, 'Infiniti',   'infiniti',   'japan', 8),
  (9, 'Mitsubishi', 'mitsubishi', 'japan', 9);

-- Suzuki / Daihatsu intentionally excluded (left Canadian market;
-- see japanese-brands-whitelist.md for reverse-trigger conditions).

-- ============================================================================
-- CITIES — CMA only. Tier 1 = active on launch. Tier 2/3 = planned.
-- ============================================================================
INSERT OR IGNORE INTO cities
  (id, slug, name, province, population_cma, lat, lng, tier, status) VALUES
  -- Tier 1 (active on launch)
  (1,  'toronto',     'Toronto',            'ON', 6400000, 43.6532,  -79.3832, 1, 'active'),
  (2,  'montreal',    'Montreal',           'QC', 4300000, 45.5019,  -73.5674, 1, 'active'),
  (3,  'vancouver',   'Vancouver',          'BC', 2800000, 49.2827, -123.1207, 1, 'active'),
  (4,  'calgary',     'Calgary',            'AB', 1600000, 51.0447, -114.0719, 1, 'active'),
  (5,  'edmonton',    'Edmonton',           'AB', 1500000, 53.5461, -113.4938, 1, 'active'),
  (6,  'ottawa',      'Ottawa',             'ON', 1500000, 45.4215,  -75.6972, 1, 'active'),
  -- Tier 2 (post-launch ~4 weeks)
  (7,  'quebec-city', 'Quebec City',        'QC',  830000, 46.8139,  -71.2080, 2, 'planned'),
  (8,  'winnipeg',    'Winnipeg',           'MB',  830000, 49.8951,  -97.1384, 2, 'planned'),
  (9,  'hamilton',    'Hamilton',           'ON',  800000, 43.2557,  -79.8711, 2, 'planned'),
  (10, 'kitchener',   'Kitchener-Waterloo', 'ON',  600000, 43.4516,  -80.4925, 2, 'planned'),
  -- Tier 3 (borderline; revisit after dealer-coverage data)
  (11, 'london',      'London',             'ON',  550000, 42.9849,  -81.2453, 3, 'planned'),
  (12, 'halifax',     'Halifax',            'NS',  480000, 44.6488,  -63.5752, 3, 'planned');

-- ============================================================================
-- CITY_ALIASES — city-political → CMA-slug mapping for edge geolocation
-- ============================================================================
-- Used by Pages Functions middleware: request.cf.city → CMA → user.city.
-- Only includes politically-distinct municipalities inside CMAs we serve.
-- Small / unrecognized cities → user sees choose-city UI (no auto-fallback).
-- ============================================================================

-- Greater Toronto Area (CMA 'toronto')
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('toronto',         'toronto', 'ON'),
  ('mississauga',     'toronto', 'ON'),
  ('brampton',        'toronto', 'ON'),
  ('markham',         'toronto', 'ON'),
  ('vaughan',         'toronto', 'ON'),
  ('oakville',        'toronto', 'ON'),
  ('richmond hill',   'toronto', 'ON'),
  ('richmond-hill',   'toronto', 'ON'),
  ('burlington',      'toronto', 'ON'),
  ('milton',          'toronto', 'ON'),
  ('ajax',            'toronto', 'ON'),
  ('pickering',       'toronto', 'ON'),
  ('whitby',          'toronto', 'ON'),
  ('oshawa',          'toronto', 'ON'),
  ('aurora',          'toronto', 'ON'),
  ('newmarket',       'toronto', 'ON'),
  ('caledon',         'toronto', 'ON'),
  ('king',            'toronto', 'ON'),
  ('uxbridge',        'toronto', 'ON'),
  ('halton hills',    'toronto', 'ON'),
  ('halton-hills',    'toronto', 'ON'),
  ('georgina',        'toronto', 'ON'),
  ('east gwillimbury','toronto', 'ON'),
  ('east-gwillimbury','toronto', 'ON');

-- Greater Montreal (CMA 'montreal')
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('montreal',        'montreal', 'QC'),
  ('montréal',        'montreal', 'QC'),
  ('laval',           'montreal', 'QC'),
  ('longueuil',       'montreal', 'QC'),
  ('terrebonne',      'montreal', 'QC'),
  ('brossard',        'montreal', 'QC'),
  ('repentigny',      'montreal', 'QC'),
  ('saint-jean-sur-richelieu', 'montreal', 'QC'),
  ('saint-jérôme',    'montreal', 'QC'),
  ('saint-jerome',    'montreal', 'QC'),
  ('mirabel',         'montreal', 'QC'),
  ('dollard-des-ormeaux', 'montreal', 'QC'),
  ('chateauguay',     'montreal', 'QC'),
  ('châteauguay',     'montreal', 'QC');

-- Greater Vancouver (CMA 'vancouver')
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('vancouver',       'vancouver', 'BC'),
  ('surrey',          'vancouver', 'BC'),
  ('burnaby',         'vancouver', 'BC'),
  ('richmond',        'vancouver', 'BC'),
  ('coquitlam',       'vancouver', 'BC'),
  ('langley',         'vancouver', 'BC'),
  ('delta',           'vancouver', 'BC'),
  ('north vancouver', 'vancouver', 'BC'),
  ('north-vancouver', 'vancouver', 'BC'),
  ('west vancouver',  'vancouver', 'BC'),
  ('west-vancouver',  'vancouver', 'BC'),
  ('new westminster', 'vancouver', 'BC'),
  ('new-westminster', 'vancouver', 'BC'),
  ('port coquitlam',  'vancouver', 'BC'),
  ('port-coquitlam',  'vancouver', 'BC'),
  ('port moody',      'vancouver', 'BC'),
  ('port-moody',      'vancouver', 'BC'),
  ('maple ridge',     'vancouver', 'BC'),
  ('maple-ridge',     'vancouver', 'BC'),
  ('pitt meadows',    'vancouver', 'BC'),
  ('pitt-meadows',    'vancouver', 'BC'),
  ('white rock',      'vancouver', 'BC'),
  ('white-rock',      'vancouver', 'BC');

-- Calgary CMA (mostly single-city)
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('calgary',         'calgary', 'AB'),
  ('airdrie',         'calgary', 'AB'),
  ('chestermere',     'calgary', 'AB'),
  ('cochrane',        'calgary', 'AB'),
  ('okotoks',         'calgary', 'AB');

-- Greater Edmonton (CMA 'edmonton')
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('edmonton',        'edmonton', 'AB'),
  ('st. albert',      'edmonton', 'AB'),
  ('st albert',       'edmonton', 'AB'),
  ('saint albert',    'edmonton', 'AB'),
  ('sherwood park',   'edmonton', 'AB'),
  ('sherwood-park',   'edmonton', 'AB'),
  ('strathcona',      'edmonton', 'AB'),
  ('spruce grove',    'edmonton', 'AB'),
  ('spruce-grove',    'edmonton', 'AB'),
  ('leduc',           'edmonton', 'AB'),
  ('beaumont',        'edmonton', 'AB'),
  ('fort saskatchewan','edmonton', 'AB'),
  ('fort-saskatchewan','edmonton', 'AB'),
  ('stony plain',     'edmonton', 'AB'),
  ('stony-plain',     'edmonton', 'AB');

-- National Capital Region (CMA 'ottawa') — includes Gatineau (QC).
-- NOTE: Gatineau aliases use province='QC' even though CMA-slug is 'ottawa' (ON).
-- Workers logic must allow cross-province alias for the Ottawa CMA only.
INSERT OR IGNORE INTO city_aliases (city_political, cma_slug, province) VALUES
  ('ottawa',          'ottawa', 'ON'),
  ('kanata',          'ottawa', 'ON'),
  ('orleans',         'ottawa', 'ON'),
  ('orléans',         'ottawa', 'ON'),
  ('nepean',          'ottawa', 'ON'),
  ('gloucester',      'ottawa', 'ON'),
  ('barrhaven',       'ottawa', 'ON'),
  ('stittsville',     'ottawa', 'ON'),
  -- Gatineau side (Quebec)
  ('gatineau',        'ottawa', 'QC'),
  ('hull',            'ottawa', 'QC'),
  ('aylmer',          'ottawa', 'QC'),
  ('chelsea',         'ottawa', 'QC'),
  ('cantley',         'ottawa', 'QC');

-- ============================================================================
-- Verification queries (commented; run manually post-apply):
-- ============================================================================
-- SELECT slug, name, status, tier FROM cities ORDER BY tier, population_cma DESC;
-- SELECT cma_slug, COUNT(*) AS aliases FROM city_aliases GROUP BY cma_slug ORDER BY aliases DESC;
-- SELECT slug, name, display_order FROM makes ORDER BY display_order;

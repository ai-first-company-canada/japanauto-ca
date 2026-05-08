-- ============================================================================
-- Migration 0006 (dev-only) — Phase 3.2 — Seed sample donor for UAT
-- ============================================================================
-- Apply locally only:
--   wrangler d1 execute japanauto-prod --local --file=migrations/dev/0006_seed_sample_donor.sql
--
-- DO NOT apply to remote — `migrations/dev/` is a sentinel subfolder so
-- `wrangler d1 migrations apply --remote` won't pick it up. Production donor
-- listings will be created by the Phase 3.3 dashboard.
--
-- Mirrors DONOR_2015_COROLLA from _archives/cloud-design/mockups/parts-data.jsx.
-- Idempotent via `INSERT OR REPLACE` on stable demo IDs / slugs.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. Salvage-yard dealer
-- ----------------------------------------------------------------------------
-- password_hash is a placeholder — this dealer is never logged into; the row
-- exists only so the donor_cars FK + the joined query for the detail page
-- have something to read. Phase 3.3 dashboard onboarding will create real
-- salvage-yard accounts with real bcrypt hashes.
-- ----------------------------------------------------------------------------
INSERT OR REPLACE INTO dealers (
  id, type, name, slug, email, password_hash, phone, website, description,
  address_line1, address_line2, city, province, postal_code, country, lat, lng,
  business_number, gst_number, amvic_number,
  verified, subscription_tier, subscription_status, stripe_customer_id,
  daily_listing_count, daily_listing_reset_at,
  created_at, updated_at, hours
) VALUES (
  'salvageyard_foothills_demo',
  'salvage_yard',
  'Foothills Auto Wreckers',
  'foothills-auto-wreckers',
  'parts@foothills-demo.ca',
  '$2a$10$DEMO_PLACEHOLDER_HASH_NEVER_USED_FOR_LOGIN_xxxxxxxxxxxxxx',
  '+14035551234',
  'https://foothillsauto.ca',
  'Calgary salvage yard specializing in Toyota, Honda, and Subaru donor cars.',
  '8800 Barlow Trail SE',
  NULL,
  'calgary',
  'AB',
  'T2C 4M3',
  'CA',
  51.0211,
  -114.0073,
  NULL, NULL, NULL,
  1,
  'free',
  NULL,
  NULL,
  0, NULL,
  CAST(strftime('%s','now') AS INTEGER),
  CAST(strftime('%s','now') AS INTEGER),
  '[{"dow":[1,2,3,4,5,6],"open":"08:00","close":"17:00"},{"dow":[0],"open":null,"close":null}]'
);

-- ----------------------------------------------------------------------------
-- 2. Donor car — 2015 Toyota Corolla LE Silver, fully_available
-- ----------------------------------------------------------------------------
INSERT OR REPLACE INTO donor_cars (
  id, dealer_id, slug, year, make_id, model_id, trim,
  generation_code, generation_range, city_slug,
  color_exterior, color_exterior_full, tone, color_interior,
  vin, mileage, engine, transmission,
  condition, available_parts_notes,
  compatible_makes, compatible_models, compatible_years, compatible_trims,
  price, price_currency, status,
  view_count, contact_count,
  created_at, updated_at
) VALUES (
  'donorcar_corolla_2015_demo',
  'salvageyard_foothills_demo',
  '2015-toyota-corolla-le-silver-calgary-demo',
  2015,
  1,                                                  -- Toyota
  (SELECT id FROM models WHERE make_id = 1 AND slug = 'corolla'),
  'LE',
  'E170',
  '2014–2018',
  'calgary',
  'Silver',
  'Silver Metallic',
  'silver',
  'Beige',
  NULL,                                                -- VIN omitted (real one would have a valid checksum)
  280000,
  '1.8L 2ZR-FE',
  'cvt',
  'fully_available',
  'Engine intact (last started 1 month ago, no smoke). Transmission available. Body panels excellent — no rust, original silver paint. Interior LE-spec, no tears, all switches working. All 4 doors and trunk lid available. Lights and bumpers undamaged. Mileage 280,000 km.',
  '["toyota"]',
  '["corolla","corolla-im","matrix"]',
  '[2014,2015,2016,2017,2018]',
  '["CE","LE","S","SE","XSE"]',
  NULL,                                                -- Call for price
  'CAD',
  'active',
  0, 0,
  CAST(strftime('%s','now') AS INTEGER) - 345600,      -- Listed 4 days ago
  CAST(strftime('%s','now') AS INTEGER) - 345600
);

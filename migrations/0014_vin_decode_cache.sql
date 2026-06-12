-- ============================================================================
-- Migration 0014 — VIN decode cache (Tier-1 VIN enrichment)
-- ============================================================================
-- POST /api/vin/decode resolves a VIN through the free NHTSA vPIC API and
-- normalizes the result (our catalog ids, enums, engine, factory equipment
-- list). VIN data is immutable, so one row per VIN, decoded once, no TTL —
-- both the form autofill endpoint and the detail-page renderers read from
-- here without re-hitting vPIC.
--
-- payload = the normalized JSON (see functions/api/vin/decode.ts), NOT the
-- raw vPIC response — normalization happens once at write time.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE vin_decode_cache (
  vin        TEXT PRIMARY KEY CHECK (length(vin) = 17),
  payload    TEXT NOT NULL,
  decoded_at INTEGER NOT NULL
);

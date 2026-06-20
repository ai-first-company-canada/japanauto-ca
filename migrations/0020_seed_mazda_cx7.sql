-- ============================================================================
-- Migration 0020 — Add Mazda CX-7 to the model catalog
-- ============================================================================
-- The first-generation Mazda CX-7 (ER chassis, 2007–2012) was missing from the
-- seeded catalog (0004 seeded only Mazda3, CX-5, CX-30, CX-9 for make_id 4). A
-- partner salvage yard's donor inventory includes a 2007 CX-7
-- (VIN JM3ER293070142094); donor_cars.model_id FK is ON DELETE RESTRICT, so the
-- model must exist before any CX-7 donor can be inserted.
--
-- Catalog companions (public pages) live in code and are updated alongside this
-- migration: src/data/models-stubs.ts + src/data/catalog-stubs.ts. See ADR-0017.
--
-- Idempotent: INSERT OR IGNORE on the existing UNIQUE(make_id, slug).
-- ============================================================================

INSERT OR IGNORE INTO models (make_id, name, slug, body_types) VALUES
  (4, 'CX-7', 'cx-7', json_array('suv','crossover'));

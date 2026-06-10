-- ============================================================================
-- Migration 0009 — Pending media uploads (bind CF image_id to its minter)
-- ============================================================================
-- /api/media/upload-url mints a Cloudflare Images Direct Creator Upload URL and
-- returns the CF-generated image_id to the dealer. Previously /api/media/finalize
-- trusted that client-supplied image_id verbatim, checking only that the *entity*
-- belonged to the caller — never that THIS dealer minted THIS image_id. Since
-- image_ids are a public segment of the delivery URL
-- (imagedelivery.net/<hash>/<image_id>/<variant>), a dealer could finalize
-- someone else's image_id onto their own listing (content misattribution / IDOR),
-- or finalize a fabricated id. (Audit finding #14.)
--
-- This table records, at mint time, which dealer is allowed to finalize which
-- image_id against which entity. finalize() consumes the claim atomically
-- (DELETE ... RETURNING): a single statement, serialized by SQLite's write lock,
-- so a claim cannot be double-spent. A row keyed by the CF-generated image_id
-- (which the minting dealer alone learns at mint time) cannot be pre-claimed by
-- anyone else.
--
-- Retention: a successful finalize deletes the row. Orphans (minted, never
-- finalized) accumulate; sweep with a future maintenance job:
--   DELETE FROM pending_media_uploads WHERE created_at < <now - 86400>;
-- (the index below supports lookups; created_at supports the sweep.)
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE pending_media_uploads (
  image_id    TEXT PRIMARY KEY,            -- CF Images id returned at mint time
  dealer_id   TEXT NOT NULL,               -- dealer allowed to finalize it
  entity_type TEXT NOT NULL,               -- 'listing' | 'donor_car'
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL             -- unix seconds, for orphan sweep
);

CREATE INDEX idx_pending_media_dealer
  ON pending_media_uploads (dealer_id, entity_type, entity_id);

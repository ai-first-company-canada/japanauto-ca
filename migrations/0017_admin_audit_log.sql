-- 0017_admin_audit_log.sql — every mutation performed through the admin panel
-- (workers/admin, admin.japanauto.ca behind Cloudflare Access) lands here:
-- who (Access-verified email), what, on which target, with what payload.
-- Operational accountability now; due-diligence artifact later.
CREATE TABLE admin_audit_log (
  id          TEXT    PRIMARY KEY,
  at          INTEGER NOT NULL,            -- unix seconds
  admin_email TEXT    NOT NULL,            -- from the verified Access JWT
  action      TEXT    NOT NULL,            -- e.g. 'dealer.verify', 'slot.activate'
  target      TEXT,                        -- entity id / key the action touched
  details     TEXT                         -- JSON blob of inputs (no secrets)
);

CREATE INDEX idx_admin_audit_at ON admin_audit_log (at DESC);

-- One LIVE featured-slot contract per (city, make) — the exclusivity the
-- product sells (ADR-0013). The admin panel's check-then-act SELECT cannot be
-- atomic across D1 statements (security review 2026-06-12); this partial
-- unique index is the real enforcement: INSERT of a second pending/active/
-- paused slot for the pair fails at the DB, and since activation never
-- changes (city, make_id), create-time uniqueness covers the whole lifecycle.
-- 'ended' rows fall out of the partial set, so history accumulates freely.
CREATE UNIQUE INDEX ux_featured_slots_live
  ON featured_slots (city, make_id)
  WHERE status IN ('pending', 'active', 'paused');

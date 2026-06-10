-- ============================================================================
-- Migration 0010 — dealers.token_epoch (server-side access-token kill switch)
-- ============================================================================
-- Access tokens are 15-min HMAC JWTs that snapshot verified/dealer_type at mint
-- and are trusted until exp with no DB re-check, and there is no revocation list
-- for them: logout and password-reset revoke refresh tokens only, so a valid
-- access token kept working until exp even after logout / password change /
-- account changes. (Audit finding #11.)
--
-- token_epoch is a per-dealer "session generation" counter baked into every
-- access token at mint time. requireDealer (and the /dealer/* page guard)
-- compare the token's epoch against the live row; a mismatch = the token
-- predates a revocation event -> reject. Bumping token_epoch (logout, future
-- password-reset confirm, account suspension) instantly invalidates every
-- outstanding access token for that dealer.
--
-- DEFAULT 0 keeps every existing row valid and matches the `?? 0` fallback used
-- for access tokens minted before this migration, so the deploy forces no
-- re-login.
-- ============================================================================

PRAGMA foreign_keys = ON;

ALTER TABLE dealers ADD COLUMN token_epoch INTEGER NOT NULL DEFAULT 0;

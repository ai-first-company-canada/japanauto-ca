# 0005 — Refresh-token rotation with reuse detection revoking the token family

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** b3820b9, 40799bf

## Context

Refresh tokens are opaque 30-day secrets stored hashed in refresh_tokens with a rotation chain (revoked_at + rotated_to). With rotation alone, a stolen refresh token can be replayed: an attacker who captures a token can rotate it and run a parallel session indefinitely, and a legitimately rotated token being presented again is indistinguishable from theft without explicit handling (OWASP refresh-rotation guidance, audit #10).

## Decision

On every /api/auth/refresh, look up the presented token hash including already-revoked rows. If the matched row has revoked_at set (i.e. an already-rotated token is being reused), treat it as a stolen-token replay: call revokeAllRefreshTokensForDealer to revoke the entire token family for that dealer and return 401. This kills the attacker's rotated session as well, and forces the real owner to re-authenticate. The endpoint is additionally IP rate-limited (REFRESH_PER_IP) since it was the one unauthenticated auth endpoint previously unbounded.

## Consequences

Stolen refresh tokens cannot yield a durable parallel session; the first reuse trips a full-family revocation. Trade-off: a legitimate client that replays an old token due to a race or retry bug will log the whole family out (re-auth required), so client refresh logic must be careful not to resend rotated tokens. Reuse detection depends on revoked rows being retained (lookupRefreshToken returns revoked/expired rows by design).

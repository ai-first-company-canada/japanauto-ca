# 0004 — Server-side session kill-switch via dealers.token_epoch

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 488208c

## Context

Access tokens are stateless 15-minute HMAC-SHA256 JWTs, so there was no way to forcibly revoke a still-valid access token before its natural expiry (e.g. after password reset, account compromise, or role change). Refresh-token revocation alone leaves a window of up to the access-token TTL where a stolen access token keeps working (audit #11).

## Decision

Add a token_epoch integer column on dealers, snapshot it into every access token's claims at signing time, and on every verifyAccessToken re-fetch the live dealer row and reject (401 'Session revoked') when the stored token_epoch differs from the claim. Incrementing dealers.token_epoch immediately invalidates all outstanding access tokens for that dealer. Legacy tokens with no token_epoch claim are compared as 0 against the default-0 column so they remain valid until the epoch is first bumped.

## Consequences

Instant server-side invalidation of all of a dealer's access tokens without waiting for TTL expiry, closing the post-compromise window. Cost: verifyAccessToken now performs a DB read of the dealer row on every authenticated request (the token is no longer purely stateless), trading a small amount of the JWT stateless-verification benefit for revocability.

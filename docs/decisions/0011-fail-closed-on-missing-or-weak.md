# 0011 — Fail closed on missing or weak JWT_SECRET

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 88cf5ad

## Context

JWTs are HMAC-SHA256 signed with JWT_SECRET. WebCrypto's importKey happily imports a zero-length key from enc.encode(""), and HMAC sign/verify succeed with it. So a missing, empty, or typo'd JWT_SECRET would silently mint and accept tokens signed with a publicly guessable empty key — a full authentication bypass — with no startup error (audit #12). Local dev also has no .dev.vars checked in, making an empty secret an easy accident.

## Decision

Refuse to operate without adequate key material: importHmacKey throws if the secret is not a string or is shorter than MIN_JWT_SECRET_LEN (32 chars / 256 bits, matching the HS256 digest size). This fails closed at the point of key import, so neither signing nor verification can proceed with a missing/short key; the request errors instead of authenticating.

## Consequences

A deploy or dev environment without a properly configured strong JWT_SECRET fails loudly rather than authenticating everyone, eliminating the empty-key auth-bypass class. Operational requirement: every environment (prod secret, preview, and local wrangler pages dev via --binding JWT_SECRET=...) must supply a 32+ character secret or auth endpoints will error.

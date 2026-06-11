# 0006 — CSRF defense via Sec-Fetch-Site / Origin attestation (not tokens)

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** dac188b

## Context

Authentication rides in HttpOnly jc_access/jc_refresh cookies with SameSite=Lax. Lax blocks most cross-site cookie-bearing requests but leaves gaps: Chrome's Lax+POST grace window for fresh cookies, same-site sibling contexts, and legacy browsers. /api/auth/refresh and /api/auth/logout authenticate by cookie outside requireDealer, so they need protection too. A synchronizer-token scheme would add server state and client plumbing (audit #9).

## Decision

Guard all unsafe-method (POST/PUT/PATCH/DELETE) cookie-authenticated /api/* requests using browser-supplied fetch metadata rather than CSRF tokens: (1) Sec-Fetch-Site: same-origin|none -> allow (this header cannot be set by page JS, so it is the strongest signal; none = user-initiated navigation); (2) otherwise judge by Origin, which must equal the request origin or be in an explicit allowlist (apex/www + Pages preview hosts); (3) neither header present -> allow, since that is a non-browser client (curl, Stripe webhook) carrying no victim cookies. Enforced in two layers: _middleware.ts rejects for all /api/* unsafe methods, and requireDealer() re-checks cookie-sourced tokens in case middleware is ever bypassed.

## Consequences

Stateless CSRF protection with no token issuance/validation overhead and no client changes, covering the cookie-only refresh/logout endpoints. Relies on the browser correctly sending Sec-Fetch-Site/Origin (true for all modern browsers); the 'no headers -> allow' branch is safe only because such clients carry no cookies. Non-browser API consumers and Stripe webhooks must continue to send no Origin or be allowlisted. The allowlist (apex/www/preview) must be maintained.

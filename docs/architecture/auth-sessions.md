# Auth & sessions
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Dealer authentication and session management for the JapanAuto Pages Functions API: HS256 JWT access tokens plus rotating opaque refresh tokens, with a server-side per-dealer kill switch, CSRF protection for cookie-borne mutations, and PBKDF2 password hashing — all on WebCrypto only (no Node deps), backed by D1.

## Key files

| Path | Role |
|---|---|
| `functions/api/_lib/auth.ts` | Core primitives: JWT sign/verify (HS256, alg-pinned), refresh-token generation + SHA-256 hashing, PBKDF2 hash/verify, requireDealer() guard, buildAuthCookies/buildLogoutCookies. |
| `functions/api/_lib/csrf.ts` | isCrossSiteUnsafe() + isAllowedOrigin(): fetch-metadata / Origin based CSRF gate for cookie-authenticated unsafe-method requests; also used for CORS allowlist. |
| `functions/_middleware.ts` | Primary enforcement layer: CSRF gate for all /api/*, /dealer/* page auth guard (verify JWT + token_epoch, redirect to login), CORS preflight, security headers, CSP, body-size cap. |
| `functions/api/auth/login.ts` | POST /api/auth/login — credential check (timing-safe via dummy hash), layered rate limits, mints access+refresh, sets cookies. |
| `functions/api/auth/signup.ts` | POST /api/auth/signup — creates dealer (PBKDF2), mints tokens, sets cookies. verified=0, token_epoch=0. |
| `functions/api/auth/refresh.ts` | POST /api/auth/refresh — refresh-token rotation with reuse detection (revoke whole family on replay). |
| `functions/api/auth/logout.ts` | POST /api/auth/logout — revoke current refresh token + bump token_epoch; clears cookies; idempotent. |
| `functions/api/auth/verify-email.ts` | POST /api/auth/verify-email — SKELETON, returns 501. |
| `functions/api/auth/password-reset.ts` | POST /api/auth/password-reset[/confirm] — SKELETON, returns 501 (Resend + token-table TODO). |
| `functions/api/_lib/db.ts` | D1 helpers: getDealerById/ByEmail, storeRefreshToken, lookupRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllRefreshTokensForDealer, bumpTokenEpoch. |
| `functions/api/_lib/rate-limit.ts` | D1 atomic fixed-window rate limiter; LOGIN/SIGNUP/REFRESH buckets; hashIpStable() for storing refresh-token IPs as salted hashes. |
| `functions/api/dealers/me.ts` | Representative requireDealer() consumer (GET/PATCH self profile); shows the MUTABLE_COLUMNS allowlist pattern. |
| `migrations/0001_initial_schema.sql` | Defines dealers, refresh_tokens (token_hash, revoked_at, rotated_to), verification_tokens tables. |
| `migrations/0010_dealer_token_epoch.sql` | Adds dealers.token_epoch (per-dealer session generation / access-token kill switch). |
| `types/env.d.ts` | Env type: JWT_SECRET (secret), JWT_ISSUER/JWT_ACCESS_TTL_SECONDS(900)/JWT_REFRESH_TTL_SECONDS(2592000)/ENV (vars). |
| `workers/expire-sweeper/src/index.ts` | Separate scheduled worker — sweeps EXPIRED LISTINGS ONLY; does not purge expired/revoked refresh_tokens or verification_tokens. |

## How it works

Login (login.ts onRequestPost): rate-limit by IP, then layered email buckets (5/min, 20/hr, 100/day) and a global 5000/hr ceiling; getDealerByEmail; verifyPassword (PBKDF2-SHA256, 100k iters, constant-time compare). On unknown email it still runs verifyPassword against DUMMY_PASSWORD_HASH to equalize timing (no enumeration). On success signAccessToken({sub,email,dealer_type,verified,token_epoch}) -> HS256 JWT (15min); generateRefreshToken() = 32 random bytes b64url; storeRefreshToken writes SHA-256 hash + hashIpStable(ip) + UA into refresh_tokens. buildAuthCookies sets jc_access (Path=/, HttpOnly, SameSite=Lax, 15min), jc_refresh (Path=/api/auth, HttpOnly, SameSite=Lax, 30d), jc_session=1 (non-HttpOnly UI hint, 30d). Signup mirrors this with token_epoch=0.\n\nRequest auth (requireDealer in auth.ts): CSRF backstop — if no Bearer header and isCrossSiteUnsafe()==true -> 403. extractAccessToken reads Authorization: Bearer or jc_access cookie. verifyAccessToken splits 3 parts, parses header and PINS alg===HS256 && typ===JWT (never trusts token header to choose verify alg), importHmacKey (rejects secret <32 chars, fail-closed), crypto.subtle.verify, then checks exp/iss/type. Then getDealerById and compares (dealer.token_epoch ?? 0) === (payload.token_epoch ?? 0); mismatch -> 401 'Session revoked'. verified/dealer_type are rebuilt from the live row, not trusted from the stale token.\n\nPage guard (_middleware.ts isDealerProtected): /dealer/* except login/signup/logout/forgot-password and reset-password/* and verify-email/* require a valid jc_access; missing/invalid/epoch-mismatch -> 302 redirect to /dealer/login/?next=. Sets md.dealerId.\n\nRefresh rotation (refresh.ts): rate-limit 60/hr per IP; read jc_refresh cookie (or body.refresh_token); hashRefreshToken; lookupRefreshToken returns the row even if revoked/expired. If revoked_at !== null -> reuse detected -> revokeAllRefreshTokensForDealer + 401. If expired -> 401. Else mint new refresh (storeRefreshToken) + rotateRefreshToken(old.id,new.id) sets old.revoked_at + rotated_to, mint new access, set cookies.\n\nLogout (logout.ts): lookupRefreshToken -> revokeRefreshToken(hash) + bumpTokenEpoch(dealer_id) (UPDATE token_epoch = token_epoch+1), clears cookies, 204; best-effort/idempotent.\n\nCSRF (csrf.ts isCrossSiteUnsafe): only unsafe methods matter; Sec-Fetch-Site same-origin|none -> allow; else judge Origin: equals request origin or in isAllowedOrigin allowlist (apex/www, plus *.japanauto.pages.dev only when ENV!=production, plus localhost only when ENV==dev) -> allow, else reject; no Origin + no SFS -> allow (non-browser, carries no victim cookies). Enforced in middleware for all /api/* AND re-checked in requireDealer.

## Invariants

- JWT is always HS256: verifyAccessToken rejects any token whose header alg!=='HS256' or typ!=='JWT' — the token's own header never selects the verification algorithm (no alg:none / alg-confusion).
- JWT_SECRET must be >=32 chars (MIN_JWT_SECRET_LEN); importHmacKey throws otherwise. signAccessToken does NOT catch (minting fails loudly); verifyAccessToken catches and returns null (fail-closed: deny all tokens, never verify against an empty key).
- Access token claims that gate authorization (verified, dealer_type) are rebuilt from the live dealer row in requireDealer — never trusted from the (up to 15-min stale) token.
- token_epoch in the token must equal dealers.token_epoch (with `?? 0` fallback for pre-0010 tokens) or the session is rejected, even before exp — checked in both requireDealer and the /dealer/* middleware guard.
- Refresh tokens are stored only as SHA-256 hashes (token_hash, UNIQUE); the raw token never persists. lookupRefreshToken returns revoked/expired rows so reuse can be distinguished from unknown.
- Presenting an already-rotated/revoked refresh token (revoked_at != null) revokes the dealer's entire token family (revokeAllRefreshTokensForDealer) — single-use rotation.
- Cookie-borne auth on a cross-site unsafe-method request must not authenticate: enforced in _middleware.ts for all /api/* and re-checked in requireDealer; Bearer-header requests are exempt (attacker pages cannot set Authorization).
- Auth cookies are HttpOnly + SameSite=Lax; Secure is added only when ENV==='production'. jc_refresh is scoped Path=/api/auth so it is not sent on general page/API requests.
- jc_session is a non-HttpOnly UI hint only — its value (1) carries no auth; only presence drives client menu state.
- Password hash format is self-describing (pbkdf2$<iters>$<salt>$<hash>); verifyPassword reads iters from the stored value, enabling later parameter/algorithm migration without invalidating existing passwords. Comparison is constant-time.
- Stored refresh-token IPs are salted SHA-256 (hashIpStable, stable salt derived from JWT_SECRET) — never raw IPs (PII minimization).
- dealerPublicSchema / dealerSelfSchema strip password_hash (and token_epoch, stripe_customer_id) before any response leaves the API.

## Design decisions

- **Two-token model: short-lived (15m) HS256 access JWT + long-lived (30d) opaque, DB-stored, rotating refresh token.** — Stateless fast-path auth (no DB read needed to validate signature/expiry) while keeping revocability via the refresh table and token_epoch. *Rejected:* Pure stateless JWT with no server state — rejected because it cannot be revoked before exp (logout/password-reset/suspension would not take effect).
- **token_epoch per-dealer kill switch (migration 0010), re-checked against the live row in requireDealer and the page guard.** — Access tokens previously snapshotted verified/dealer_type and were trusted until exp with no DB recheck; logout/reset only revoked refresh tokens, so a stolen access token kept working up to 15 min. Bumping the epoch invalidates all outstanding access tokens instantly. (Audit #11.) *Rejected:* Per-token access-token denylist in D1/KV — rejected: defeats the stateless fast path (a DB lookup per request anyway) and needs its own sweeper; a single integer compare is cheaper and the dealer row is already fetched.
- **Refresh-rotation with reuse detection that revokes the whole token family on replay.** — OWASP refresh-token rotation; a rotated (revoked) token presented again is a theft signal — killing the family ejects the attacker and forces the real owner to re-auth. (Audit #10.) *Rejected:* Non-rotating long-lived refresh token — rejected: a single leak grants 30 days of silent access with no detection signal.
- **PBKDF2-SHA256 at 100,000 iterations (not Argon2/bcrypt, not 600k).** — Cloudflare Workers WebCrypto hard-caps PBKDF2 at 100k iterations and offers no Argon2/bcrypt; 100k SHA-256 is comparable to Django's default. The self-describing hash format lets a later migration to Argon2 happen without invalidating stored passwords. *Rejected:* Argon2id (preferred OWASP) — not available in the Workers runtime; 600k iterations (as the file header originally claimed) — rejected, runtime throws NotSupportedError above 100k.
- **CSRF defense by fetch-metadata + Origin attestation rather than a synchronizer/double-submit CSRF token.** — Sec-Fetch-Site cannot be set by page JS, making it the strongest signal; combined with SameSite=Lax cookies and Origin allowlisting it closes the Lax gaps (Lax+POST grace window, same-site siblings, legacy browsers) with no token plumbing in every form. *Rejected:* Per-form CSRF token — rejected: extra state/plumbing across SSG + dynamic pages; the attestation-header approach needs no shared secret and degrades safely for non-browser clients.
- **Anti-enumeration on login via generic message AND a dummy PBKDF2 verify on unknown emails.** — Equalizes both the error message and response timing between known and unknown accounts so neither can be used to enumerate registered dealers. *Rejected:* Generic message only — rejected: the ~100k-iteration verify on the known path vs an early return on the unknown path is a timing oracle.
- **Defense-in-depth CSRF/epoch checks duplicated in _middleware.ts and in requireDealer.** — Refresh/logout authenticate by cookie OUTSIDE requireDealer, so the middleware is the only guard there; requireDealer re-checks in case the middleware is ever bypassed or refactored. *Rejected:* Single enforcement point — rejected as too fragile for an auth boundary.

## Security notes

- No script-src 'unsafe-inline' in CSP (per project memory); inline event-handler attributes fail the build gate. Auth pages must use hashed/nonce'd scripts, never on*= handlers.
- jc_refresh Path=/api/auth means a refresh token is only transmitted to auth endpoints, shrinking its exposure surface; jc_access is Path=/ because the page guard and all /api/* read it.
- Secure flag is omitted when ENV!=='production' (local/dev over http); ensure preview/prod actually set ENV='production' so cookies get Secure. Preview env vars set ENV='preview', which means cookies on *.pages.dev preview hosts are NOT marked Secure.
- verifyAccessToken does not validate audience and ignores nbf (only exp/iss/type). Acceptable for a single-audience app but note for any future multi-service token reuse.
- Body-size cap (64KB) and rate limits are applied before handler/D1 work; refresh endpoint is now rate-limited (60/hr per IP, audit #42) — previously the only unauthenticated auth endpoint without one.
- hashIpStable derives its salt from JWT_SECRET; rotating JWT_SECRET silently breaks correlation of previously-stored refresh-token IP hashes (and invalidates all live access tokens). SHA-256 is one-way so JWT_SECRET is not exposed by the stored hashes.
- Email is lowercased for lookup (getDealerByEmail) but signup inserts input.email as provided — verify the schema normalizes case at write time, otherwise a mixed-case signup could be unreachable by the lowercased login lookup (confirm in dealerCreateInputSchema).
- verify-email and password-reset are 501 skeletons: dealers.verified can currently only be 0 (set at signup) — there is no wired path to set verified=1, and no working password-reset, so the password-reset-confirm step that would revokeAllRefreshTokensForDealer + bumpTokenEpoch does not yet run.

## Gaps / TODO

- functions/api/auth/verify-email.ts — skeleton, returns 501 (notImplemented). TODO: hash token, look up verification_tokens(purpose='email_verify'), set dealers.verified=1, mark consumed_at. No path currently sets verified=1.
- functions/api/auth/password-reset.ts — skeleton, both request and confirm return 501. TODO: Resend email integration, verification_tokens(purpose='password_reset') queries, and on confirm: revokeAllRefreshTokensForDealer + bumpTokenEpoch. Single-file handler is itself a placeholder (comment says split into request.ts/confirm.ts).
- No sweeper purges expired or revoked refresh_tokens or consumed/expired verification_tokens. workers/expire-sweeper only flips expired listings; refresh_tokens grow unbounded (lookups stay correct via UNIQUE hash + revoked_at/expires_at checks, but the table is never garbage-collected).
- bumpTokenEpoch is wired only on logout. The migration 0010 comment and db.ts doc note it 'should' also fire on password-reset confirm and account suspension — neither flow exists yet (password-reset is a skeleton; no suspension endpoint).
- Refresh-token reuse-detection family-revocation is real, but there is no separate notification/alerting hook — the only signal is the 401 returned to whoever presented the reused token.
- Email-case normalization: getDealerByEmail lowercases on read; signup/login insert/verify paths rely on dealerCreateInputSchema/loginInputSchema to normalize — not verified in this pass.

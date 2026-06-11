# Rate limiting & abuse controls
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

D1-backed atomic fixed-window rate limiter that throttles abuse-prone endpoints (login, signup, token refresh, listing/donor creation, contact-reveal beacons, media upload-URL minting), plus salted IP-hashing helpers used for anti-scraping audit and PII-minimized session forensics.

## Key files

| Path | Role |
|---|---|
| `functions/api/_lib/rate-limit.ts` | Core module: rateLimit() atomic check-increment, RATE_LIMITS bucket config table, hashIp (daily salt), hashIpStable (stable salt). |
| `migrations/0008_rate_limit_counters.sql` | Defines rate_limits table (key PK, count, window_start) + idx_rate_limits_window_start. Header documents the KV->D1 atomicity rationale. |
| `functions/api/_lib/response.ts` | tooManyRequests(retryAfterSec) builds the 429 {error:'rate_limited'} body and conditional Retry-After header. |
| `functions/api/auth/login.ts` | Enforces LOGIN_PER_IP, LOGIN_PER_EMAIL, LOGIN_PER_EMAIL_HOUR, LOGIN_PER_EMAIL_DAY, LOGIN_GLOBAL; uses hashIpStable for refresh-token row. |
| `functions/api/auth/signup.ts` | Enforces SIGNUP_PER_IP (5/hr per IP). |
| `functions/api/auth/refresh.ts` | Enforces REFRESH_PER_IP (60/hr per IP, audit #42). |
| `functions/api/listings/index.ts` | POST enforces LISTING_CREATE_FREE/PRO_TIER keyed by dealerId, selected from dealers.subscription_tier. |
| `functions/api/donors/index.ts` | POST reuses LISTING_CREATE_FREE/PRO_TIER for salvage-yard donor-car creation. |
| `functions/api/listings/[id]/track-contact.ts` | Enforces CONTACT_REVEAL_PER_IP + CONTACT_REVEAL_PER_LISTING (keyed listing:<id>); existence check precedes limiter. |
| `functions/api/donors/[id]/track-contact.ts` | Same contact-reveal pair, keyed donor:<id>; uses hashIp for audit row. |
| `functions/api/media/upload-url.ts` | Enforces MEDIA_UPLOAD_URL_PER_DEALER (100/hr per dealer) before any DB work to cap billable CF Images abuse. |
| `types/env.d.ts` | Declares Env.DB (D1), JWT_SECRET, DAILY_IP_HASH_SALT used by the module. |

## How it works

rateLimit(env, identifier, cfg) computes key=`rl:${cfg.bucket}:${identifier}`, now=floor(Date.now()/1000), windowCutoff=now-windowSeconds, then runs ONE statement against D1 `rate_limits`: `INSERT ... VALUES(key,1,now) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start<=cutoff THEN 1 ELSE count+1 END, window_start = CASE WHEN window_start<=cutoff THEN now ELSE window_start END RETURNING count, window_start`. SQLite serializes writers via its write lock, so concurrent requests receive distinct post-increment counts — no parallel-burst bypass. allowed = count<=limit; remaining = max(0, limit-count); retryAfterSeconds = allowed?0:max(1, windowStart+windowSeconds-now). RETURNING always yields one row; null row falls back to count=limit+1 (deny). Callers derive ip from `request.headers.get('cf-connecting-ip') ?? 'unknown'`, call rateLimit, and on !allowed return tooManyRequests(retryAfterSeconds) -> 429 with body {error:'rate_limited'} and Retry-After header (header omitted when retryAfterSec is 0/falsy). login.ts layers five buckets in order (IP, then email min/hour/day after zod parse, then the literal 'all' global key); the IP bucket is checked before JSON parsing so malformed floods are cheap to reject. listing/donor create select the FREE vs PRO config from getDealerById(...).subscription_tier and key by auth.dealerId. media upload-url keys by auth.dealerId and is checked before body parse/DB lookup. hashIp(env,ip) = hex SHA-256 of `${DAILY_IP_HASH_SALT}:${YYYY-MM-DD UTC}:${ip}` — daily-rotating salt, written to contact_reveals.ip_hash. hashIpStable(env,ip) = hex SHA-256 of `refresh-ip:${JWT_SECRET}:${ip}` — non-rotating, written to refresh_tokens.ip_address; auth handlers store null when ip==='unknown'.

## Invariants

- Check-and-increment must remain a SINGLE D1 statement (INSERT ON CONFLICT RETURNING). Splitting into SELECT-then-UPDATE reintroduces the KV-era parallel-burst bypass that 0008 fixed.
- Every attempt increments the counter, including denied ones — spamming a blocked key never resets the window; the window only resets when window_start <= now-windowSeconds.
- Limiter fails CLOSED: a thrown D1 error propagates to the caller (5xx), and a null RETURNING row is treated as count=limit+1 (deny). It never silently allows.
- rate_limits.key is the only uniqueness boundary; identifiers must be namespaced by bucket via the `rl:<bucket>:<identifier>` prefix so different buckets never collide.
- hashIpStable MUST stay on a stable salt (JWT_SECRET) because refresh_tokens rows live up to ~30 days; using the daily salt would break same-IP correlation for session forensics (audit #20). hashIp MUST stay daily-rotating to defeat cross-day reveal correlation.
- JWT_SECRET is enforced >=32 chars elsewhere and is reused as the stable IP salt; SHA-256 one-wayness means storing hashIpStable output never exposes JWT_SECRET.
- Contact-reveal handlers must verify entity existence/liveness BEFORE calling rateLimit, or bogus ids create unbounded per-entity counter rows.
- Fixed-window semantics permit up to ~2x limit across a window boundary; this is accepted, not a bug.

## Design decisions

- **Store counters in D1 with INSERT ... ON CONFLICT ... RETURNING serialized by SQLite's write lock.** — Makes check-and-increment atomic so concurrent bursts get distinct counts and cannot all pass the limit. *Rejected:* Rejected: the prior KV implementation doing get->check->put. KV has no compare-and-swap and is eventually consistent, so a parallel burst all read the same/stale count and bypassed the limit (only sequential traffic was bound). Documented in 0008 header.
- **Fixed window (reset count to 1 once window_start ages out) rather than sliding window.** — One row per (bucket,identifier) reused in place, trivially atomic in a single statement; the only property that mattered (no parallel-burst bypass) holds. *Rejected:* Rejected: sliding-window timestamp lists (the KV approach) — heavier, not atomic, and the burst-bypass was the actual threat. Trade-off: up to ~2x limit can pass across a boundary, deemed acceptable for abuse control.
- **Layer five login buckets: per-IP, per-email min/hour/day, and a global 'all' ceiling.** — Per-email hour/day catch IP-rotated credential stuffing against one account that dodges the 5/min burst; the 5000/hr global ceiling bounds botnet-scale spraying across many accounts that no per-key bucket catches (audit #16). *Rejected:* Rejected: a single per-IP or per-email burst limit, which left both IP-rotation-against-one-account and distributed-spray-across-accounts unbounded.
- **Reuse JWT_SECRET as the salt for hashIpStable instead of adding a new secret.** — Avoids introducing another always-required secret; JWT_SECRET is already stable, secret, and present; SHA-256 keeps it one-way. *Rejected:* Rejected: a dedicated stable IP-salt secret (more config surface) and using the existing DAILY_IP_HASH_SALT (rotates daily, breaks 30-day refresh-token correlation).
- **Tier the create limits off dealers.subscription_tier at request time (50/day free, 500/day pro).** — Lets paid dealers list more without a separate enforcement path; keyed by dealerId so it is per-account. *Rejected:* Rejected: a single flat per-dealer cap, which would either throttle paying customers or under-protect free-tier abuse.

## Security notes

- IP identity derives solely from the cf-connecting-ip header with a literal 'unknown' fallback. All requests missing the header collapse into one shared 'unknown' counter, so per-IP buckets (login/signup/refresh/contact-reveal) give no isolation when that header is absent; behind Cloudflare it is set, but local/dev or misconfigured proxy paths share a bucket.
- The limiter is correct only against parallel bursts hitting the SAME D1 primary; it provides no cross-region/global atomicity beyond what D1's single-writer model gives.
- 429 body is intentionally minimal ({error:'rate_limited'}) and contact-reveal endpoints always return 204 regardless of limit state, preventing existence/count enumeration. Retry-After is only emitted when retryAfterSec is truthy.
- hashIp/hashIpStable both depend on secret salts (DAILY_IP_HASH_SALT, JWT_SECRET). If either secret is empty/weak, stored ip_hash/ip_address become guessable; JWT_SECRET reuse means a JWT_SECRET rotation also silently invalidates all prior refresh-token IP correlations.
- Atomic counter rows are written before authentication/validation on several paths (login IP bucket before JSON parse, media before DB lookup), which is the intended cheap-reject ordering but means an attacker can grow the rate_limits table with distinct identifiers (see gaps — no sweep).
- Fixed-window ~2x burst tolerance at boundaries is an accepted weakening of the nominal limit.

## Gaps / TODO

- No retention/sweep is wired. 0008 header proposes `DELETE FROM rate_limits WHERE window_start < now-86400` (and idx_rate_limits_window_start supports it), but no cron/scheduled handler or `[triggers].crons` exists. Table grows unbounded by distinct identifiers (every unique IP/email/listing/donor id), an availability/storage risk under id-spray.
- No automated tests for the rate limiter — no *.test.ts references rateLimit or rate-limit; the atomicity guarantee and fail-closed behavior are unverified by tests.
- The module docstring still claims 'sliding window' in the RateLimitConfig.windowSeconds comment while the implementation and 0008 are fixed-window — stale comment.
- Migration journal could not be located/verified in this tree (no migrations/*.json or meta journal found); per project memory, prod migration journal drift is a known hazard — 0008's applied state should be confirmed against prod before relying on it.
- 'unknown' IP fallback is a single shared counter with no separate handling beyond null-on-store for refresh_tokens.ip_address; there is no rejection or distinct treatment of header-less requests at the limiter layer.

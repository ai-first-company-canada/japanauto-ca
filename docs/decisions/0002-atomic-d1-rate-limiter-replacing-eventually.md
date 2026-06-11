# 0002 — Atomic D1 rate limiter replacing eventually-consistent KV

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** 1d18370

## Context

The first rate limiter stored a JSON array of event timestamps in KV and did GET -> filter -> PUT with no compare-and-swap. KV has no transactional read-modify-write and is eventually consistent, so a parallel burst against one key all read the same sub-limit count, all appended, and all slipped past the cap. Because each PUT overwrote rather than appended, the store also under-counted. The limiter is the only anti-abuse mechanism on login, signup, contact-reveal and media upload-URL minting (no lockout/CAPTCHA), so the bypass directly weakened credential-stuffing, bot-signup and contact-scraping defenses (audit #2).

## Decision

Move the counter into D1 (table rate_limits, migration 0008), keyed rl:<bucket>:<identifier>. Check-and-increment is a single INSERT ... ON CONFLICT ... RETURNING statement, serialized by SQLite's write lock, making it atomic: concurrent writers receive distinct post-increment counts and cannot all pass. The rateLimit() signature is unchanged at call sites. A fixed-window model is used (accepting up to ~2x limit across a window boundary as standard for abuse control). A per-dealer quota was added to the previously unbounded /api/media/upload-url billable endpoint at the same time.

## Consequences

Parallel-burst bypass is eliminated for all buckets (LOGIN_PER_EMAIL, LOGIN_PER_IP, SIGNUP_PER_IP, CONTACT_REVEAL_PER_IP, REFRESH_PER_IP, media mint). Trade-offs: every attempt (allowed or denied) is a D1 write, adding DB load on the hottest auth paths; the fixed-window boundary allows a documented ~2x burst; rate-limit state now shares the primary D1 database rather than an isolated KV namespace. The Durable Object alternative was considered but D1 was chosen to avoid adding a DO class and migration.

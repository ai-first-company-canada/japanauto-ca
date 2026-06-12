# 0014 — Admin panel as a separate Worker behind Cloudflare Access

- **Status:** accepted — built 2026-06-12
- **Date:** 2026-06-12

## Context

The operator (single founder today) needs a panel: all dealers with tier/
trial/inventory, moderation (flagged listings), featured-slot contracts
(ADR-0013 said "manual SQL"), social-boost queue oversight, ops unblocking
(rate limits), and — critically with no email service — a way to hand a
locked-out partner a password-reset link. The public codebase deliberately
contains no admin role ("admin role does not exist on MVP"). The owner asked
for maximum isolation, up to a separate domain/device.

## Decision

1. **Separate Worker (`workers/admin/`) on `admin.japanauto.ca`**, sharing
   the prod D1 binding. Zero admin code in the public Pages bundle; separate
   deploy lifecycle; the hostname is linked nowhere on the site.
2. **Cloudflare Access (Zero Trust) in front**: policy pins the operator's
   email (One-Time PIN / SSO). Unauthenticated traffic never reaches the
   Worker — there is no login form, password, or session code of our own to
   get wrong. Free tier (≤50 seats).
3. **Defense in depth in-Worker:** `requireAdmin()` re-verifies the
   `Cf-Access-Jwt-Assertion` RS256 JWT against the team JWKS and checks
   aud/iss/exp/email allowlist. Missing config or header → 503/403
   (fail-closed), so the Worker is safe to deploy before Access exists.
4. **CSRF:** POSTs require same-origin `Sec-Fetch-Site` (same pattern as
   decision 0006). **Audit:** every mutation writes `admin_audit_log`
   (migration 0017) with the Access-verified email.
5. **Server-rendered HTML, no framework, no dependencies** — matches the
   project's zero-dep posture; everything escapes through one `esc()`.
6. **Password reset completes the loop:** admin mints a 1-hour single-use
   token (`verification_tokens`, purpose `password_reset`, SHA-256 hash);
   the public `/api/auth/password-reset/confirm` (now implemented) consumes
   it, sets the PBKDF2 hash, revokes refresh tokens, bumps `token_epoch`.
   The email-request path stays 501 until a mail service lands.

## Alternatives

- **`/admin/*` inside the Pages project with an `is_admin` flag:** rejected —
  enlarges the public attack surface, mixes admin SQL into customer-facing
  bundles, and a single middleware/role bug exposes everything.
- **Local-only tooling (wrangler SQL):** rejected as the primary tool — no
  phone access, error-prone hand SQL, nothing presentable for due diligence.
  (It remains the break-glass fallback.)
- **Device-bound access (WARP posture checks):** deferred post-launch; Access
  identity pinning + OTP is the right cost/benefit for a one-person team.

## Consequences

Featured-slot sales, trial extensions, verification, moderation and partner
unblocking become two-click operations with an audit trail. The panel works
today against `admin.japanauto.ca` because the zone already lives in
Cloudflare (the apex 525 only reflects the missing Pages attachment). Setup
requires a one-time ~10-minute Zero Trust configuration by the owner
(runbook: "Admin panel"); the Worker stays dark until then. Keeping
`effectiveTier` logic mirrored in the admin Worker is a known sync point
(comment-linked both ways).

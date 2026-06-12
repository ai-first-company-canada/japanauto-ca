# Admin panel — operator Worker behind Cloudflare Access

> Captured 2026-06-12. Decision 0014. Verify symbols against the code when
> relying on this document (DOCS-CONVENTIONS.md R5).

## Purpose

A single-operator panel on **admin.japanauto.ca**: dealer accounts (tier,
trial, verification, password-reset links), listing/donor moderation,
featured-slot contracts (ADR-0013 B2B deals), social-boost queue oversight,
and ops unblocking (rate limits, stale media). It is a **separate Worker**
(`workers/admin/`) sharing only the prod D1 binding — zero admin code in the
public Pages bundle, no admin role in the public API ("admin role does not
exist on MVP"), the hostname linked nowhere on the site.

## Key files

| Path | Role |
|---|---|
| `workers/admin/wrangler.toml` | Worker `japanauto-admin`; custom domain, `workers_dev = false`, `preview_urls = false`; D1 `japanauto-prod` (`remote = true`); `ACCESS_*` vars |
| `workers/admin/src/index.ts` | Router: `requireAdmin()` first, then GET pages / POST actions; `sameOrigin()` CSRF gate on every POST; error boundary (generic 500, full stack to Worker logs) |
| `workers/admin/src/lib/access.ts` | `requireAdmin()` — in-Worker Cloudflare Access JWT verification, fail-closed; `AdminEnv` |
| `workers/admin/src/lib/html.ts` | `esc()`, `page()` (security headers + no-JS CSP), `actionBtn()`, `redirect()`, `fmtCad()` (cents → CA$) |
| `workers/admin/src/lib/audit.ts` | `audit()` → `admin_audit_log`; `auditMark()` makes a failed audit write loud in the flash message |
| `workers/admin/src/pages/dashboard.ts` | `/` — read-only KPIs in one `DB.batch()`; recent signups + audit tail |
| `workers/admin/src/pages/dealers.ts` | `/dealers` — accounts, effective tier, actions incl. reset-link minting |
| `workers/admin/src/pages/listings.ts` | `/listings?kind=listing\|donor` — moderation (expire / restore); donors view-only in v1 |
| `workers/admin/src/pages/slots.ts` | `/slots` — featured-slot contracts: create (pending) + status machine |
| `workers/admin/src/pages/social.ts` | `/social` — boost-queue oversight; single mutation: guarded cancel |
| `workers/admin/src/pages/ops.ts` | `/ops` — table counts, market-sync freshness, rate-limit clear, stale pending-media purge, audit log |
| `migrations/0017_admin_audit_log.sql` | `admin_audit_log` table + `ux_featured_slots_live` partial unique index |
| `functions/api/auth/password-reset.ts` | Public confirm endpoint consuming admin-minted reset tokens (shared token contract) |
| `docs/decisions/0014-admin-panel-separate-worker-behind-access.md` | Why a separate Worker + Access, and what was rejected |
| `docs/runbook.md` § "Admin panel" | One-time Zero Trust setup, deploy command, post-setup verification |

## How it works

### Two-layer auth, fail-closed

1. **Cloudflare Access (Zero Trust) at the edge.** A self-hosted Access
   application covers `admin.japanauto.ca`; policy allows only the operator's
   email (One-Time PIN). Unauthenticated traffic never reaches the Worker —
   there is no login form, password, or session code of ours to get wrong.
   Team name `japanauto`; the AUD tag and team domain are pinned as
   plain `[vars]` in `wrangler.toml` (non-secret by design — they identify,
   not authenticate).
2. **In-Worker re-verification** (`requireAdmin()` in
   `workers/admin/src/lib/access.ts`). Access injects an RS256 JWT in the
   `Cf-Access-Jwt-Assertion` header; the Worker verifies it against the
   team's published JWKS (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`,
   module-global cache, 1 h TTL) and checks `alg == RS256`, signature,
   `exp`, `iss == https://<team>.cloudflareaccess.com`, `aud ==
   env.ACCESS_AUD`, and that the lowercased `email` claim is in the
   `ADMIN_EMAILS` allowlist.

Everything fails **closed**: unset `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`/
`ADMIN_EMAILS` → 503; JWKS unreachable → 503; missing header, malformed
token, unknown `kid`, bad signature, expired, wrong iss/aud, or an email
outside the allowlist → 403. Deploying the Worker before Access exists is
therefore safe — it is simply dark.

### Router, CSRF, output discipline

`workers/admin/src/index.ts` runs `requireAdmin()` before any routing; the
verified email is threaded into every page and audit write. GETs map to the
six pages; POSTs map to `/dealers/action`, `/listings/action`,
`/slots/create`, `/slots/action`, `/social/action`, `/ops/action` and are
additionally gated by `sameOrigin()`: `Sec-Fetch-Site` must be exactly
`same-origin` (same pattern as decision 0006; absence of the header means a
non-browser client, which has no business POSTing to the panel). A top-level
catch returns a generic 500 and logs the stack to Worker logs only.

Pages are server-rendered HTML with **zero client JS** — no framework, no
dependencies. Every dynamic value passes through `esc()` (`lib/html.ts`).
`page()` stamps every response with `cache-control: no-store`,
`x-robots-tag: noindex, nofollow` (plus a meta robots tag),
`referrer-policy: no-referrer`, `x-frame-options: DENY`,
`x-content-type-options: nosniff`, and a strict CSP:

```
default-src 'none'; style-src 'unsafe-inline'; img-src 'self';
form-action 'self'; base-uri 'none'; frame-ancestors 'none'
```

No `script-src` at all — the panel renders dealer-controlled strings to the
operator, and with zero shipped JS a future `esc()` slip cannot execute
anything (security review 2026-06-12). Mutations use the POST→303→GET
pattern (`redirect()` carries a `?msg=` flash).

### The six pages and their mutations

| Page | Reads | Mutations (audit action) |
|---|---|---|
| `/` dashboard | KPI batch: dealers/tier split, inventory, 7-day signups + `entity_stats_daily` traffic, social pipeline, `market_stats` freshness, active-slot revenue; latest signups; last 10 audit rows | none (read-only) |
| `/dealers` | All accounts (search by email/name/id, LIKE-metachar-escaped), effective tier, inventory counts, last sign-in (`MAX(refresh_tokens.issued_at)`) | `dealer.verify` / `dealer.unverify`; `dealer.trial_extend` (+30 d on top of `max(trial_ends_at, now)`); `dealer.tier_set` (manual until Stripe — `→ free` also NULLs `trial_ends_at`, otherwise demoting a trialing dealer is a silent no-op); `dealer.reset_link` |
| `/listings` | Both catalogs via `?kind=listing\|donor`, status filter allowlisted against the CHECK constraints (0001 listings, 0005 donor_cars) | `listing.expire` (active\|flagged → expired), `listing.restore` (flagged → active only — never resurrects sold/expired). Donors view-only in v1 |
| `/slots` | All `featured_slots` contracts + create form (6 live CMAs only, `CITY_PROVINCE` map) | `slot.create` (pending); `slot.activate` / `slot.pause` / `slot.end` per the `TRANSITIONS` machine: pending→active, active⇄paused, {active,paused}→ended |
| `/social` | Boost-queue jobs (status tabs, allowlisted filter), defensive `payload`/`result_links` parsing | `social.cancel` — only from requested\|in_production; terminal states immutable; `result_links` deliberately untouched (cancellation withdraws the queue entry, not history) |
| `/ops` | Row counts over the `COUNT_TABLES` code-constant allowlist (table names never from input), market-sync freshness (stale after 36 h), `rate_limits` windows, stale `pending_media_uploads` count, last 50 audit rows | `ops.rl_clear` (exact bound-param key delete — never a pattern); `ops.pending_media_purge` (claims minted >24 h ago, never finalized — migration 0009) |

Every state-changing UPDATE carries its from-state **inside the WHERE
clause** (`status IN (…)`), so a stale tab or double-submit changes 0 rows
and reports "no change" instead of clobbering a newer state — the same
compare-and-swap discipline as the public lifecycle endpoints.

### Audit log (migration 0017)

Every mutation writes `admin_audit_log (id, at, admin_email, action, target,
details)` — `at` unix seconds, `admin_email` from the verified Access JWT,
`details` a JSON blob of inputs (no secrets). `audit()` never throws into the
action path, but returns `false` on failure and `auditMark()` appends a loud
"⚠ AUDIT WRITE FAILED" to the flash so an unaudited mutation is never silent.
Dashboard and `/ops` tolerate a DB where 0017 isn't applied (the audit table
read degrades to a warning instead of a 500). PII stance: `ops.rl_clear`
audits only the bucket prefix of the rate-limit key (`login:email:<redacted>`
style), since key tails embed raw IPs/emails.

### Featured-slot exclusivity (`ux_featured_slots_live`)

Featured is the exclusivity the product sells: at most one live contract per
(city, make) (ADR-0013, billing.md). Enforcement is two-tier:

- **Advisory**: `slotsCreate()` and `slotsAction("activate")` SELECT for a
  clashing pending/active/paused (resp. active) row and refuse with a
  readable message.
- **Atomic**: the partial unique index in `migrations/0017_admin_audit_log.sql`
  — `ux_featured_slots_live ON featured_slots (city, make_id) WHERE status IN
  ('pending','active','paused')` — is the real guard against double-submit
  races; the INSERT's UNIQUE failure is caught and rendered as a conflict.
  Since activation never changes `(city, make_id)`, create-time uniqueness
  covers the whole lifecycle; `ended` rows fall out of the partial set, so
  history accumulates freely.

Money is integer cents throughout: the form takes whole CAD dollars, the
INSERT stores `contract_paid_cents = months * monthlyCad * 100` and
`promo_msrp_cents = msrpCad * 100`. The window stamped at create is
provisional — the **first** activation (pending → active) re-stamps
`active_from = now` and carries the duration as `(active_until -
active_from)`, so creative-review days never burn paid time. Resuming from
pause keeps the window (paused time burns — the pause is the dealer's call);
a lapsed window cannot be resurrected.

### Reset-link minting (contract with password-reset.ts)

There is no email service yet, so the panel is the only reset-token minter:
Dealers → "Reset link" (`dealersAction`, case `"resetlink"`) generates
`token = base64url(32 random bytes)`, first marks any outstanding
`purpose = 'password_reset'` rows consumed (a mis-sent earlier link must not
stay live), then inserts into `verification_tokens` with
`token_hash = hex(SHA-256(token))`, TTL 1 hour. The link
`https://japanauto.ca/dealer/reset-password/?token=…` is rendered **once**;
the operator copies and delivers it to the dealer themselves.

The public side, `functions/api/auth/password-reset.ts` (`/confirm`, fully
live), shares the token contract by comment-link both ways: it hashes the
presented token, looks up an unconsumed unexpired row, **consumes first**
with a `consumed_at IS NULL` guard (two racing confirms can't both succeed),
sets the new PBKDF2 hash, then kills every live session —
`revokeAllRefreshTokensForDealer()` + `bumpTokenEpoch()`
(`functions/api/_lib/db.ts`). Rate limit 10/h per IP (bucket
`pw-reset-confirm`); the only failure surface is one generic
`invalid_token`. The `/request` (email) path stays 501 until a mail service
lands.

## Invariants

- **Fail-closed everywhere.** No `ACCESS_*` config → 503; no/invalid Access
  JWT → 403. The Worker must remain safe to deploy with Access unconfigured.
- **Two independent auth layers.** Never rely on Access alone (a routing or
  zone mistake must not expose the panel) nor on the JWT check alone.
- **Zero client JS, one `esc()`.** The no-`script-src` CSP is a deliberate
  backstop; adding any inline script to a panel page breaks the page by
  design — keep it that way.
- **POSTs are same-origin only** (`Sec-Fetch-Site: same-origin`), mirroring
  decision 0006.
- **Every mutation is audited** with the Access-verified email; a failed
  audit write surfaces in the UI, never silently.
- **From-state guards live in SQL WHERE clauses** — stale tabs and races
  produce "no change", never an illegal transition.
- **One live slot per (city, make)** — `ux_featured_slots_live` is the
  atomic enforcement; the SELECT checks are UX only.
- **Money is integer cents; timestamps unix seconds** (`at`, `active_from`,
  `active_until`, `trial_ends_at`, `expires_at`, …).
- **`effectiveTier` is mirrored, not shared.** The admin Worker can't import
  the Pages bundle, so `dealers.ts` (TS) and `dashboard.ts` (SQL CASE)
  duplicate `functions/api/_lib/entitlements.ts effectiveTier()` — a known
  sync point, comment-linked on all three sides.

## Deploy & configuration

- **Deploy:** `cd workers/admin && npx wrangler deploy`. **NOT** covered by
  the Pages `npm run deploy` — a separate Worker with its own lifecycle.
- `workers_dev = false` and `preview_urls = false`: version preview URLs
  would expose the panel on a hostname **outside** the Access application
  (the in-Worker JWT check still denies, but that drops to one security
  layer) — keep them off.
- Route: `admin.japanauto.ca` as `custom_domain` (zone already in the
  account). D1 binding targets `japanauto-prod` with `remote = true` so
  local `wrangler dev` also hits prod data — treat dev sessions accordingly.
- Zero Trust: one-time ~10-minute setup in the Cloudflare dashboard (team
  `japanauto`, self-hosted app on `admin.japanauto.ca`, Allow-policy on the
  operator email, OTP login, 24 h session) — exact steps and post-setup
  verification (`curl -I` must get Access's 302, never 200) live in
  `docs/runbook.md` § "Admin panel (workers/admin → admin.japanauto.ca)".
  Live since 2026-06-12 (commit e4730df), AUD pinned in `wrangler.toml`.

## Gaps / future

- Donor cars are view-only; moderation goes through the yard's dealer
  account until donor actions are added.
- Manual tier switch and slot contracts predate Stripe — both become
  read-mostly once billing webhooks write `subscription_status`.
- Reset links are operator-delivered; the `/request` email path unlocks with
  Resend post-launch (decision 0016 already brings Resend for reports).
- Single admin email today; `ADMIN_EMAILS` is comma-separated and ready for
  more, but there are no per-admin permission tiers.
- Device-bound access (WARP posture checks) deferred post-launch (0014).

# Runbook — deploy, data, and operations

Operational procedures and the gotchas that cost real time. Verified 2026-06-11.

## Deploy (Cloudflare Pages)

```bash
cd ~/sites/japanauto
npm run deploy
```

- `git push` does **NOT** deploy. `npm run deploy` runs the `predeploy` gate
  (typecheck → build → `npm run audit:seo`) and then `wrangler pages deploy dist`.
  The SEO gate **blocks** on any indexable page missing title/description/
  self-canonical, h1≠1, missing OG or JSON-LD.
- Requires valid wrangler auth (`npx wrangler whoami`).
- ⚠️ **The deploy ships the working tree, not a commit.** Parallel sessions
  share one tree — check `git status` before deploying; you may ship someone
  else's uncommitted work.
- CI (`.github/workflows/deploy.yml`) deploys on push to main and runs the same
  gates including the SEO audit.

## The cron worker deploys separately

`workers/expire-sweeper/` (flips TTL-expired listings to `expired` every 6h UTC)
is **not** covered by `npm run deploy`:

```bash
cd workers/expire-sweeper && npx wrangler deploy
# logs: npx wrangler tail japanauto-expire-sweeper
```

## D1 migrations (production)

```bash
npx wrangler d1 migrations apply japanauto-prod --remote
```

- Database: `japanauto-prod` (`b0d65b95-2f43-403d-9237-0d4cac6e186a`), binding `DB`.
- ⚠️ **Journal drift:** some early migrations were applied out-of-band, so the
  remote `d1_migrations` journal may not match reality. If `migrations apply`
  fails with "already exists": verify the actual schema
  (`PRAGMA table_info(...)` / `sqlite_master`), then backfill the journal row
  (`INSERT INTO d1_migrations (name) VALUES ('NNNN_name.sql')`) and re-apply.
  Never re-run a migration against a schema that already has its objects.
- **Order on deploys that need a new table:** migration first, code second
  (the rate limiter and other D1 consumers fail closed → 5xx if the table is
  missing).

## Local dev

```bash
npm run dev                       # Astro only, port 4321
npx wrangler pages dev dist --binding "JWT_SECRET=<32+ chars>"   # full stack
```

- ⚠️ Never pass `--d1=DB=<name>` to `wrangler pages dev` — it forks an **empty**
  local D1 and silently ignores seeded data.
- `JWT_SECRET` must be ≥32 chars or auth fails closed (by design, ADR 0011).
  No `.dev.vars` is checked in.

## Secrets & environment

Secrets (set via Pages project settings / `wrangler secret`, never committed):
`JWT_SECRET` (≥32 chars), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_IMAGES_API_TOKEN`,
`DAILY_IP_HASH_SALT`, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (when billing
wires up), `INDEXNOW_KEY`.

Vars (in `wrangler.toml`): `ENV` (production/preview), `JWT_ISSUER`,
`JWT_ACCESS_TTL_SECONDS=900`, `JWT_REFRESH_TTL_SECONDS=2592000`,
`LISTING_DEFAULT_TTL_DAYS=90`, `USED_CAR_AGE_CAP_YEARS=10`, `PUBLIC_SITE_URL`,
`PUBLIC_CLOUDFLARE_ACCOUNT_HASH`. Full list: `types/env.d.ts`.

Gotchas (each one cost a debugging session — don't relearn them):

- **A new/updated Pages secret only takes effect on the NEXT deployment.**
  `wrangler pages secret put` alone is not enough — redeploy after.
- **Build-time vs runtime env are different worlds.** `wrangler.toml [vars]`
  reach Pages Functions at runtime; Astro's `import.meta.env.*` is baked at
  `npm run build` on the machine that builds (we deploy with a LOCAL build —
  the Pages dashboard build env never applies). Public build-time constants
  get committed defaults in `astro.config.mjs`.
- **New third-party browser calls need CSP allowances** in
  `functions/_middleware.ts` (e.g. `connect-src https://upload.imagedelivery.net`
  for direct photo upload). An API path can be 100% green via curl and still
  dead in the browser — test new origins in a real browser.

## Admin panel (workers/admin → admin.japanauto.ca)

Separate Worker behind Cloudflare Access (decision 0014). Deploy:
`cd workers/admin && npx wrangler deploy` — NOT covered by `npm run deploy`.
Fail-closed: with the `ACCESS_*` vars unset or no Access JWT, every request
is denied, so deploying before/without Access is safe (just dark).

One-time Zero Trust setup (owner, ~10 min, free plan):

1. Cloudflare dashboard → **Zero Trust** → pick a team name
   (`<team>.cloudflareaccess.com`) if not already chosen.
2. **Access → Applications → Add application → Self-hosted**:
   - Application domain: `admin.japanauto.ca` (zone is already in the account).
   - Session duration: 24h.
   - Policy "Owner only": Action **Allow**, Include → **Emails** →
     `targetwizard@icloud.com`. Login method: One-time PIN (default) is enough.
3. From the application's **Overview**, copy the **Application Audience (AUD)
   tag**; note the team name.
4. Fill `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `workers/admin/wrangler.toml`
   [vars] and redeploy the worker.

Verify after setup: open `https://admin.japanauto.ca` in a private window →
Access OTP page (NOT the panel); after the PIN — the dashboard. `curl -I
https://admin.japanauto.ca` from anywhere must return Access's 302, never 200.

Every panel mutation lands in `admin_audit_log` (migration 0017). Password
reset for a locked-out dealer: Dealers → "Reset link" → copy the 1-hour
single-use URL and send it to the partner yourself (no email service yet).

## Launch / domain cutover

⚠️ **Attaching japanauto.ca = instant indexing.** The static `robots.txt` in the
repo is production-open; the staging `Disallow: /` is injected by middleware
only for `*.pages.dev` hosts. There is no manual "open robots" step.

Before attaching the domain, ALL of:
1. `LAUNCH-CHECKLIST.md` — every item.
2. `npm run audit:launch` green (fails while any page carries
   `data-demo-content`, robots blocks the host, or sitemap is missing).
3. Test accounts cleaned from prod D1 (`diag-*`, `e2e-test-*`, etc.).

## Production verification recipes

- **Throwaway-row method:** insert a throwaway dealer (+ listing with the state
  under test) into prod D1, exercise the surface, then delete the dealer (FK
  cascade removes children). Mind the API validators: VIN needs a valid ISO 3779
  checksum, hours need `HH:MM`, phone must not be +1555…
- **Cache-bust** dynamic pages with `?cb=<random>` when checking fixes (s-maxage
  on listing/dealer pages).
- **Rate limiter check:** 6 rapid wrong-password logins → expect 5×401 then 429.
- Prod D1 is the live store — read-only queries are safe;
  `npx wrangler d1 execute japanauto-prod --remote --json --command "SELECT ..."`.

## Incident basics

- Roll back a bad Pages deploy: redeploy the previous good build from the
  Cloudflare dashboard (Deployments → … → Rollback), or `git checkout <good>`
  + `npm run deploy`.
- Kill all sessions for a dealer (stolen token):
  `UPDATE dealers SET token_epoch = token_epoch + 1 WHERE id = '<id>';`
  (access tokens die instantly; refresh family can be revoked via
  `UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE dealer_id = '<id>';`)
- Disable a compromised dealer's content:
  `UPDATE listings SET status='flagged' WHERE dealer_id='<id>' AND status='active';`

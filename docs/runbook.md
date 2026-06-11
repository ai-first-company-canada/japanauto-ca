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

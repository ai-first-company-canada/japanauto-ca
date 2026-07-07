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
  gates (typecheck → build → `audit:seo` → `audit:launch`) before `pages deploy`.

## Deploy is main-only (OPS-1)

`.github/workflows/deploy.yml` triggers **only** on `push` to `main` (plus the
scheduled cron below and `workflow_dispatch`). It used to also fire on
`feature/**` + `fix/**` — that shipped every branch to the **production** Pages
project as a preview deployment, whose Functions bind the **production**
D1/KV/R2 (bindings are declared at `wrangler.toml` top level, not per
environment) and expose unauthenticated prod-D1 write paths (`track-contact`)
on the public `*.pages.dev` host. Deep-audit 2026-07-05 flagged this (OPS-1); it
is fixed.

- **Feature/fix branches no longer auto-deploy.** To ship a branch deliberately
  (a one-off preview or hotfix), trigger it by hand: GitHub → Actions → *Deploy
  to Cloudflare Pages* → **Run workflow** (`workflow_dispatch`), or
  `gh workflow run deploy.yml --ref <branch>`. Same gates run; you are opting in
  knowingly to prod-bound preview Functions.
- Residual gate **NEW-GATE-3**: confirm no `JWT_SECRET`/`STRIPE_*`/
  `RESEND_API_KEY` sit at Pages *preview* scope (main-only deploy closed the
  branch path, but a preview-scoped secret would still be reachable from a
  `workflow_dispatch` preview URL). Check in the Cloudflare Pages dashboard.

## Scheduled catalog rebuild (ADV-1)

The browse surface (city/model/make pages and every "N listed" count) is a
**build-time snapshot** of prod D1 — `catalog-live.json`, produced by
`scripts/export-catalog-data.mjs` (selects `WHERE l.status='active'`). Listing
**detail** pages are already live from D1 at request time and IndexNow-pinged on
create; but without a rebuild a dealer's newly-active listing is **orphaned**
from every browse page and count until someone redeploys. Deep-audit 2026-07-05
flagged this (ADV-1); it is closed by a scheduled rebuild.

- **The cron.** `deploy.yml` carries `schedule: - cron: '17 */3 * * *'` — every
  3 hours (~240 runs/month). Each run re-exports `catalog-live.json` from D1,
  rebuilds, passes the same gates, and deploys. New listings therefore reach the
  browse pages/counts within **≤3h** with no manual redeploy; detail pages stay
  instant.
- **The fail-safe.** The "Refresh catalog from D1" step runs
  `node scripts/export-catalog-data.mjs || echo "::warning::…"`. If the export
  fails — most often because the deploy token lacks D1 read — CI keeps the
  **committed** `catalog-live.json` snapshot and emits a CI warning rather than
  failing the deploy. A stale-but-honest catalog beats a broken deploy.
- **Hard requirement:** the Cloudflare API token in the `CLOUDFLARE_API_TOKEN`
  secret **must carry `D1:read` on `japanauto-prod`**. Without it the refresh
  step silently fails-safe to the committed snapshot (watch for the
  `::warning::catalog export from D1 failed` line in the Actions log) and browse
  freshness stops tracking D1 — the deploy still succeeds, so this fails quietly.
  Verify with `npx wrangler d1 execute japanauto-prod --remote --command
  "SELECT 1"` under the same token.
- **Changing cadence:** edit the `cron:` line (standard 5-field UTC cron). Stay
  under the Pages deploy budget — 3h ≈ 240 runs/month; e.g. hourly `'17 * * * *'`
  ≈ 720/month, every 6h `'17 */6 * * *'` ≈ 120/month. The offset minute (`17`)
  spreads load off the top of the hour; keep it non-zero.
- **Verify (NEW-GATE-2):** after onboarding, run the live e2e — signup → activate
  a listing → confirm it appears on its city/model **browse** page (by
  navigation, not just the direct slug) within one cron interval, using the
  prod-throwaway recipe below.

## Edge protection for view-counting (PERF-1)

`recordViewThrottled` (`functions/api/_lib/db.ts`) already bounds view-counting
**in code**: each client is counted at most once per entity per day via a
per-(hashed-IP, entity, day) limiter in `rate_limits`, so a `?cb=<rand>` loop no
longer poisons the dealer-visible `view_count` or fires the 2-write
`recordView` batch on repeats. Deep-audit 2026-07-05 flagged the unbounded case
(PERF-1); the code gate closes counting/poisoning. What remains is **raw
write-amplification / Function-invocation cost** under a distributed flood
(each unique cache-busted URL still MISSES cache and invokes the Function, which
runs one limiter upsert). Close that at the **edge**, out of band — nothing to
deploy from this repo:

- **Cloudflare Cache Rule (recommended).** In the dashboard → *Caching → Cache
  Rules*, add a rule matching `/used-cars/listing/*` and `/parts/listing/*` that
  **ignores query string** in the cache key (Cache Key → Query String → *Ignore
  query string*, or *Include* a fixed allowlist). Then `?cb=<rand>` can no longer
  force an origin MISS — repeated hits serve from edge cache and never reach the
  Function. The detail routes emit `s-maxage=60`, so a shared cache key is safe.
- **WAF rate-limit rule (optional).** Add a rate-limit rule scoped to the two
  `.../listing/*` path prefixes (e.g. N requests / 10s per client IP) as a
  backstop against a determined flood that varies the path itself.
- Both are belt-and-suspenders on top of the in-code limiter; neither is
  required for correctness, only for cost containment on the metered edge.

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

## Dealer e-mail reports (decision 0016)

Weekly (Mon 14:00 UTC) + monthly (1st) reports are composed and sent by the
cron worker via Resend. Dark until configured:

1. **Resend domain**: [resend.com](https://resend.com) → Domains → Add
   `japanauto.ca` → add the shown DNS records (SPF TXT + DKIM CNAME/TXT) in
   the Cloudflare DNS of the zone → wait for "Verified".
2. **API key**: Resend → API Keys → create (sending access) →
   `cd workers/expire-sweeper && npx wrangler secret put RESEND_API_KEY`.
3. `REPORTS_UNSUB_SECRET` is already set on both the worker and Pages
   (generated 2026-06-12, local copy `.reports-unsub-secret.local`).
4. Migration 0018 must be applied before the first run (source columns,
   reports_opt_out, report_runs).

Test a single send without waiting for Monday:
`npx wrangler dev --test-scheduled` +
`curl "http://localhost:8787/__scheduled?cron=0+14+*+*+1"` (needs
RESEND_API_KEY + REPORTS_UNSUB_SECRET in `workers/expire-sweeper/.dev.vars`;
the D1 binding is remote — it WILL send real mail to every dealer and mark
report_runs; to dry-run a single dealer, temporarily set every other
dealer's reports_opt_out=1).

Unsubscribes: `dealers.reports_opt_out` (CASL one-click link in every mail).
Re-subscribe = set it back to 0 (admin panel /dealers or SQL).

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

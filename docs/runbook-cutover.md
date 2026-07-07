# Runbook: japanauto.ca domain cutover

> Written 2026-07-07 (OPUS-PLAN WS-6), to be executed the day the owner closes
> the four Phase-0 gates. Companion to [runbook.md](runbook.md) («Launch /
> domain cutover» there links here). **Attaching the domain opens indexing
> instantly** — the static `public/robots.txt` is production-open (Allow: /,
> explicit AI-crawler Allows, Disallow only for `/dashboard/ /dealer/ /api/
> /auth/`); the blocking `Disallow: /` is middleware-injected for `*.pages.dev`
> hosts only. There is no "open robots later" step: whatever Google sees in the
> first hours, it keeps. Hence the hard ordering: **cleanup → deploy → e2e →
> attach** — never any other order.

## Phase 0 — prerequisite gates (any day before T-1; all owner-closed)

| Gate | How to verify |
|---|---|
| **G1** Legal review of `/terms/` + `/privacy/` (WEB-2) | Owner confirms in writing. The signup consent notice (src/pages/dealer/signup.astro) references exactly these pages. |
| **G2** `CLOUDFLARE_API_TOKEN` has D1:read (ADV-1) | GitHub → Actions → latest deploy.yml run: NO `::warning::catalog export from D1 failed`. **Status 2026-07-07: CONFIRMED FAILING** (run 28872708736 shows the warning) — the token must be re-scoped or the 3-hourly catalog refresh builds from the committed snapshot. |
| **G3** No prod secrets on preview scope (NEW-GATE-3) | **CLOSED 2026-07-07**: `npx wrangler pages secret list --project-name japanauto --env preview` → empty. Re-check in the dashboard if new secrets get added. |
| **G4** Live e2e (NEW-GATE-2) | **EXECUTED & PASSED 2026-07-07** (throwaway dealer, full chain): signup 201 → active listing 201 (atomic cap guard path) → detail page 200 instantly → local rebuild+deploy → **listing on `/toronto/toyota/camry/` browse by navigation** → contact reveal 204 (contact_count=1; view_count=1 — PERF-1 dedupe counted exactly one view) → cleanup SQL → all-zero inventory. Found & fixed live: the WEB-5 dead-link gate flagged function-served routes (`/used-cars/listing/*`, `/dealers/<slug>/`) as 404s the moment REAL inventory existed — would have blocked the first partner-era deploy; seo-audit.py now second-chances known function routes after static resolution. Re-run at T-0 against the final build per Phase 2. |

Cheaper-before-cutover (not blocking): Cache Rule "ignore query string" on
`/used-cars/listing/*` + `/parts/listing/*` and WAF rate-limit (edge half of
PERF-1, see runbook.md); zone **AI Crawl Control = OFF** (an enabled toggle
silently blocks GPTBot/ClaudeBot at the edge despite robots.txt); Zero Trust
for admin.japanauto.ca confirmed.

## Phase 1 — T-1 day (freeze + preflight)

1. **Freeze**: no merges to main (the 3-hourly schedule deploys main — a merge
   mid-cutover ships itself). Check parallel sessions + `git status` — the
   deploy ships the working tree, not the commit.
2. `npm run audit:launch` green (includes the WEB-5 dead-link gate).
3. **D1 inventory**: `npx wrangler d1 execute japanauto-prod --remote --json
   --file scripts/audit-prod-testdata.sql`. Clean anything found (cascade
   misses `contact_reveals` — no FKs — delete explicitly), re-run → only real
   partners / zeros. Do NOT replay the 2026-06-12 cleanup blindly: its UUIDs
   are stale; inventory first.
4. **Lighthouse baseline** on the current pages.dev build, 3 page types
   (home, a city/make browse page, a real listing detail with `?cb=<rand>`):
   `npx lighthouse <url> --preset=desktop ...` + default mobile run.
   Thresholds: Perf ≥85 mobile / ≥95 desktop, SEO ≥95, BP ≥95, A11y ≥90.
   Fix real regressions; ignore: "unused CSS" (inlineStylesheets: always),
   robots-fail on pages.dev (that IS our swap → SEO ~66 there is expected),
   IBM Plex font warnings.
   **Baseline 2026-07-07** (pages.dev, astro 6.4.8, 0 listings): home mobile
   perf 97 / desktop 99, city hub 97, **browse `/toronto/toyota/` 58 (mobile,
   TBT 1450ms — main thread is Style & Layout 2699ms, i.e. DOM/layout cost of
   the link grids under inlined CSS, NOT scripts)**; BP 100 everywhere; a11y
   88–95 (home fails: aria-prohibited-attr, color-contrast,
   label-content-name-mismatch). Follow-ups before/at T-1: profile the browse
   DOM size, fix the three a11y audits on home. Desktop browse is fine —
   mobile-CPU-throttle artifact of a large DOM.
5. Check the last scheduled deploy.yml runs and
   `npx wrangler tail japanauto-expire-sweeper` for fresh errors; admin `/ops`
   → Cron heartbeats all ok.

## Phase 2 — T-0 (attach day)

1. Final `npm run deploy` (gates run via predeploy). Record the deployment id.
2. **Live e2e (NEW-GATE-2), BEFORE attaching, on pages.dev.** Throwaway-row
   recipe (runbook.md, Production verification): valid-checksum VIN, `HH:MM`
   hours, no `+1555` phone, `?cb=<rand>` cache-bust. Full chain: UI signup
   (consent notice under the button) → login → create listing → activate →
   detail page 200 → wait for the scheduled rebuild (≤3h, or force:
   `gh workflow run deploy.yml --ref main`) → listing reachable on the
   city/model **browse page by navigation** + counts updated → contact reveal
   → cleanup SQL → inventory SELECTs return zeros. Note: verify-email sending
   activates only with Resend configured; a silent skip is expected, not a bug.
3. **Attach**: dashboard → Workers & Pages → japanauto → Custom domains →
   `japanauto.ca`, then `www.japanauto.ca`. The zone is already on the account
   (currently 525) — Pages offers to replace the DNS record (apex via CNAME
   flattening). Preflight: `dig japanauto.ca +short`, `curl -sI
   https://japanauto.ca` (525 = zone alive, not attached).
4. **TLS**: wait for Active on both; `curl -sI https://japanauto.ca/` → 200 +
   `strict-transport-security`.
5. **www→apex**: Pages doesn't redirect the second domain and `_redirects`
   can't do hosts → zone → Rules → Redirect Rules → Single Redirect:
   `www.japanauto.ca` → 301 `https://japanauto.ca` + preserved path/query.
6. **Robots both ways**: `https://japanauto.ca/robots.txt` → open file with
   the Sitemap line, no `Disallow: /`; `https://japanauto.pages.dev/robots.txt`
   → `Disallow: /` + `x-robots-tag: noindex`.
7. IndexNow ownership: `curl -s
   https://japanauto.ca/e3d465c40a7250b500ed3d3358a86ee5.txt` → body = key.

## Phase 3 — T+1h

1. **Search Console**: Domain property `japanauto.ca` (TXT in CF DNS) →
   Sitemaps → submit `https://japanauto.ca/sitemap.xml` → URL Inspection +
   Request indexing for: home, one city hub, one real partner listing.
2. **IndexNow/Bing**: `./scripts/indexnow-batch-ping.sh https://japanauto.ca/
   https://japanauto.ca/toronto/ https://japanauto.ca/sitemap.xml` (expect
   200/202). Optionally Bing Webmaster Tools (one-click GSC import).
3. **Smoke, 15 URLs** (curl -sI + eyeball): `/` · `/toronto/` · `/calgary/` ·
   `/toronto/toyota/` · a live city×model page · a real listing detail ·
   `/toronto/parts/` · a donor detail (if any) · `/blog/` · one post ·
   `/terms/` · `/api/cities` (JSON 200) · `/sitemap.xml` +
   `/sitemap-listings.xml` (valid XML, real slugs) · `/robots.txt` ·
   `/nonexistent-xyz/` → 404. Plus: `curl -I https://admin.japanauto.ca` →
   302 Access (never 200), and one legacy `_redirects` 301:
   `/used-cars/toyota/toronto/` → `/toronto/toyota/`.

## Phase 4 — T+48h monitoring

- GSC Pages: "indexed" grows; no spike of "Excluded by noindex" / "Soft 404".
- CF: Pages analytics (5xx rate), D1 metrics anomalies.
- `npx wrangler tail japanauto-expire-sweeper` after each cron of day one;
  admin `/ops` heartbeats; red scheduled deploy.yml runs = cron alert (OPS-4).
- **Rollback criteria** (any → roll back): 5xx on >5% of HTML; site-wide auth
  failure; private-data leak (market_stats public); compromise.
- **Rollback, honest version**: (a) bad deploy → Pages → Deployments →
  Rollback to previous build (seconds, domain untouched) — the primary path;
  (b) domain detach → site serves 522/525; Google treats that as a temporary
  server error and keeps pages indexed for days — detaching does NOT erase
  what got indexed. Detach only for a catastrophe (leak), paired with GSC
  Removals for the specific URLs.

## Phase 5 — post-cutover tail (T+0…T+7d)

1. **Resend immediately** (unblocks WS-2 auth email + dealer reports): domain
   Verified → `RESEND_API_KEY` on BOTH the sweeper worker and the Pages
   project (see runbook.md, Transactional auth email). Worker secrets apply
   instantly — no redeploy needed; check `wrangler tail` on the next cron.
2. **Meta Business verification — start now** (days-to-weeks lead time; the
   vehicle feed is live and rate-limited).
3. Re-run Lighthouse on the same 3 pages on japanauto.ca; `npm run
   audit:launch` on a fresh build; Rich Results Test on one city-model page.
4. Day 7: GSC Performance first impressions; reconcile indexed URLs vs sitemap.

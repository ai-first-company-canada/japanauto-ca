# 0018 — Launch-readiness remediation: main-only deploy, scheduled re-export, in-code view idempotency, link-integrity build gate

- **Status:** accepted
- **Date:** 2026-07-05
- **Commits:** cf5de1f

## Context

The 2026-07-05 deep audit (`deep-audit/2026-07-05-1/`) returned a **no-go**
verdict for attaching `japanauto.ca` / onboarding a paying partner: 0 critical,
5 high, 15 medium, 19 low. None of the highs is exploited today — the apex is
unattached, prod D1 holds 0 dealers / 0 listings — but each arms the instant the
domain attaches or the first partner onboards. Four of the five high blockers
required an architectural choice about *how* to close them, not just a patch;
this record captures those four choices and why the alternatives were rejected.
(The fifth blocker, WEB-1 dead footer/nav links, was a content/redirect fix with
no architectural fork and is not re-argued here.)

## Decision

**1. Deploy only from `main` (OPS-1).** `.github/workflows/deploy.yml` previously
triggered on `main` + `feature/**` + `fix/**`. Because `wrangler.toml` declares
the `[[d1_databases]]` / KV / R2 bindings at top level (not per-environment),
every Pages *preview* deployment's Functions bind **production** D1/KV/R2, and
the public `*.pages.dev` host exposes unauthenticated prod-D1 write paths
(`track-contact`). So any branch push shipped an arbitrary Function against prod
data on a public URL. The trigger is now `main` only, plus a `schedule:` (see 2)
and `workflow_dispatch` for an intentional one-off branch deploy. This treats
"branch preview = prod-bindings" as the real hazard and removes the automatic
path to it rather than trying to per-environment the bindings under time
pressure.

**2. Catalog freshness via scheduled re-export + rebuild, not client hydration
or runtime SSR (ADV-1).** Browse/city/model pages and every "N listed" count are
a build-time snapshot of prod D1 (`catalog-live.json`, produced by
`scripts/export-catalog-data.mjs`, which ran only in `predeploy`). Without a
rebuild, a newly-active listing is live on its detail page (already served from
D1 at request time + IndexNow-pinged) but orphaned from every browse page and
count until a human ran `npm run deploy`. The fix keeps the SSG model: a
3-hourly `schedule:` cron (`17 */3 * * *`) plus a fail-safe "Refresh catalog
from D1" build step that re-exports before the build; if the export fails it
keeps the committed `catalog-live.json` snapshot and emits a CI `::warning::`
rather than shipping an empty catalog. Browse inventory and counts now track D1
within ≤3h with no manual redeploy.

**3. View-count idempotency in application code; flood defense at the edge
(PERF-1).** `recordView` was 2 unthrottled D1 writes per detail-page hit, the
only bot gate was a spoofable UA regex, and no cache rule ignored unknown query
strings — so a browser loop with a random `?cb=` was an unbounded metered-write
drain that also poisoned the dealer-visible `view_count`. The counting logic is
now `recordViewThrottled` (`functions/api/_lib/db.ts`): it gates on a
per-(hashed-IP, entity, day) key through the existing `rate_limits` table
(`view-dedupe` bucket, limit 1 / 86400s) so each client is counted at most once
per entity per day; repeats cost only the limiter's single upsert, never the
2-write batch. Both detail-page callers (listing + parts) switched from
`recordView`. The residual raw write-amplification under a *distributed* flood is
explicitly left to the edge — a Cloudflare cache rule ignoring unknown query
strings on the listing detail routes and/or a WAF rate limit — because it is not
closable in code.

**4. Internal-link integrity as a build gate (WEB-5).** No audit gate checked
internal-link integrity — the control that would have caught WEB-1/WEB-3 before
they shipped. `scripts/seo-audit.py` LAUNCH mode (`npm run audit:launch`) now
fails on **any** dead internal link (a static link whose target page was never
built) alongside its fabricated-content and robots/sitemap gates. On first run
it immediately caught 3 more dead links the manual pass had missed (an EV blog
post linking non-catalog models), now repointed to brand hubs.

## Alternatives

- **Per-environment preview bindings instead of main-only (2 → 1):** the correct
  long-term fix, but larger and unverified under the launch window (needs a
  separate preview D1/KV/R2 and confirmation of preview *secret* scoping,
  NEW-GATE-3). Deferred; main-only removes the exposure today and is a strict
  precondition anyway. `workflow_dispatch` preserves intentional branch deploys.
- **Client-side hydration of browse counts/rows from D1 (against 2):** rejected —
  adds client JS and a new CSP/`connect-src` surface to ~900 static pages, moves
  rendering off the SSG/SEO path, and would need runtime rate limiting; the
  counts are not real-time-critical. **Kept as the documented upgrade path** if
  instant browse ever becomes a requirement.
- **Runtime SSR of browse pages (against 2):** rejected — abandons the SSG model
  wholesale, adds per-request D1 load and cost across the highest-traffic pages,
  for a freshness need a ≤3h cron already satisfies.
- **Rate-limit only, no in-code dedupe (against 3):** rejected — a pure edge
  limit still admits legitimate-looking repeat hits inflating `view_count`; the
  data-integrity poisoning is fixed in code, cost/flood at the edge.
- **Count views via the daily rollup only (against 3):** viable but a larger
  rewrite of the stats path; the per-day idempotency gate achieves the same
  once-per-client-per-day semantics with a minimal change.
- **Runtime broken-link monitoring instead of a build gate (against 4):**
  rejected — detects dead links only *after* they ship and get crawled; a build
  gate makes a dead link un-shippable, which is the whole point post-WEB-1.

## Consequences

The five blockers are fixed and committed to `main` (gates green: typecheck +
build + `audit:launch`); this is a remediation commit, not a re-audit — a formal
re-audit is a new run with the `regressions` domain, and the changes are **not
yet deployed to prod**. The SSG/SEO model is preserved intact: no new client JS,
no new CSP surface, detail pages stay instant, browse pages stay static and now
refresh within ≤3h. The accepted tradeoff is **≤3h browse lag vs instant detail**
— acceptable at 0–few dealers, revisited via the client-hydration upgrade path if
instant browse is later required. Dead internal links can no longer reship. New
operational dependencies the owner must still close before attaching the domain:

- The deploy token needs **`D1:read` on `japanauto-prod`** or the scheduled
  refresh fails-safe to the committed snapshot (CI warning) forever.
- The 3h cadence must stay under the Pages deploy budget (~240 runs/month);
  tune the cron if it grows.
- PERF-1's residual flood defense (edge cache rule + optional WAF limit) lives
  in the runbook, not in code — it must actually be configured.
- NEW-GATE-2 (live signup→listing→**browse appearance**→contact e2e against prod
  with a throwaway dealer) and NEW-GATE-3 (no `JWT_SECRET`/`STRIPE_*` at Pages
  *preview* scope) remain open owner gates.

# 0009 — Listing TTL enforced on read plus a standalone cron sweeper Worker

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** c57e0a5, 5ebc44b

## Context

Listings get an expires_at written at creation (LISTING_DEFAULT_TTL_DAYS=90), but it was never read, and Cloudflare Pages Functions cannot run scheduled() handlers, so no job flipped past-TTL rows to expired. Stale active listings lived forever and were indexed (audit #8). Two distinct problems: hiding expired rows from the public, and keeping the stored status accurate for dashboards/analytics.

## Decision

Two-sided enforcement. Read side (c57e0a5): an isListingExpired() helper plus a LISTING_NOT_EXPIRED SQL predicate (expires_at IS NULL OR expires_at > now, covered by idx_listings_status_expires) is applied to every public surface — listCatalog page+count, listRecentListings, getListingDetailBySlug, by-slug JSON, used-cars detail HTML, track-contact, and the listings sitemap — so past-TTL active rows read as 404/absent immediately. Write side (5ebc44b): because Pages Functions cannot schedule, a separate standalone Worker (japanauto-expire-sweeper) bound to the same prod D1 runs an idempotent UPDATE ... SET status='expired' WHERE status='active' AND expires_at <= now on a cron of every 6h UTC. Status transitions were also constrained by an explicit legal-transition map (reviving to active re-runs the age cap and stamps a fresh TTL; flagged is moderation-only).

## Consequences

Expired listings disappear from public surfaces the instant they cross TTL (read enforcement) and their stored status is corrected within 6h (sweeper), keeping dashboards and analytics honest. Operational cost: a second deploy target — the sweeper is NOT covered by npm run deploy and must be deployed separately (cd workers/expire-sweeper && npx wrangler deploy), a documented footgun. The read predicate must be remembered on every new public query.

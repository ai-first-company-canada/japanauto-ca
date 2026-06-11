# Listings lifecycle
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Create→publish→sell/expire/delete lifecycle for used-car listings: a D1-backed state machine (draft/active/sold/expired/flagged) with a TTL on every row, read-side expiry filtering, owner-guarded mutations, and IndexNow notifications, complemented by a separate cron Worker that retires past-TTL rows.

## Key files

| Path | Role |
|---|---|
| `functions/api/listings/index.ts` | GET catalog query (boosted+organic+featured) and POST create (dealer-only, rate-limited, TTL stamped, IndexNow ping on active) |
| `functions/api/listings/[id]/index.ts` | GET (owner-gated for non-active), PATCH (status state-machine LEGAL_STATUS_TRANSITIONS + revival sanitization), DELETE (soft-delete to expired) |
| `functions/api/listings/[id]/mark-sold.ts` | POST primary sold path; owner check then markListingSold (active-only atomic update) |
| `functions/api/listings/[id]/track-contact.ts` | Anonymous contact-reveal beacon; existence+TTL precheck, dual rate-limit, always 204 |
| `functions/api/listings/by-slug/[slug].ts` | Public detail by slug; 404 unless status='active' AND not TTL-expired |
| `functions/api/listings/recent.ts` | Public 'Latest' feed (homepage / dealer profile), active+not-expired only |
| `functions/api/_lib/db.ts` | Listing query helpers: LISTING_NOT_EXPIRED predicate, getListingBy{Id,Slug}, getListingDetailBySlug, markListingSold, listCatalog, listRecentListings, getActiveFeaturedSlot, recordContactReveal |
| `functions/api/_lib/indexnow.ts` | Fire-and-forget IndexNow ping; no-ops when INDEXNOW_KEY empty |
| `lib/schema.ts` | LISTING_STATUSES enum, LIMITS (TTL 90d, age cap 10y), listingYearWindow, isListingExpired, isValidVinChecksum (ISO 3779), vinSchema/slugSchema, listingCreate/Update/Row schemas |
| `workers/expire-sweeper/src/index.ts` | Separate cron Worker scheduled() handler: bulk UPDATE active→expired where past TTL |
| `workers/expire-sweeper/wrangler.toml` | Cron '0 */6 * * *', remote=true D1 binding to japanauto-prod, NOT deployed by npm run deploy |
| `migrations/0001_initial_schema.sql` | listings DDL: status CHECK, default 'draft', expires_at/sold_at/boost_until cols, UNIQUE(slug)/UNIQUE(vin), idx_listings_status_expires, rolling age-cap triggers, updated_at trigger |
| `functions/api/_lib/auth.ts` | requireDealer: JWT verify + token_epoch kill-switch + CSRF backstop; supplies dealerId/dealerType for ownership checks |

## How it works

CREATE: POST /api/listings → requireDealer (auth.ts), reject if dealerType!=='dealer' (salvage_yards use donor-cars), rate-limit by subscription_tier (RATE_LIMITS.LISTING_CREATE_{FREE,PRO}_TIER), validate body via listingCreateInputSchema (vinSchema enforces ISO-3779 checksum via isValidVinChecksum). A UUID is minted; expires_at = now + env.LISTING_DEFAULT_TTL_DAYS*86400 (90). initialStatus = input.status ?? 'draft'. INSERT into listings; UNIQUE(vin)→409, UNIQUE(slug)→409, age-cap trigger RAISE→422, FK→422. If initialStatus==='active', ctx.waitUntil(pingIndexNow(...)) for /used-cars/listing/<slug>/. READ (public): listCatalog/listRecentListings/getListingBySlug/by-slug route all require status='active' AND the LISTING_NOT_EXPIRED predicate `(expires_at IS NULL OR expires_at > unixepoch)` — TTL is enforced read-side because the sweeper is async/6-hourly. by-slug route additionally re-checks isListingExpired() in app code. tier/boost_amount are computed inline from boost_until>now (2=boosted,3=organic); catalog sorts tier ASC, boost_amount DESC, then user sort. SELL: POST /api/listings/:id/mark-sold → owner check (listing.dealer_id===auth.dealerId) → markListingSold() runs `UPDATE … SET status='sold', sold_at=now WHERE id=? AND status='active' RETURNING *`; null result (not active)→409. Then IndexNow ping so Schema.org SoldOut variant recrawls. PATCH /api/listings/:id can also transition status, gated by LEGAL_STATUS_TRANSITIONS (draft→active/expired, active→sold/expired, sold→active, expired→active, flagged→∅). On →active revival it re-runs listingYearWindow age-cap (status-only PATCH bypasses the UPDATE-OF-year trigger), stamps fresh expires_at, and zeroes boost_until/boost_paid_cents; on leaving active it forfeits the boost; sold_at is kept consistent. DELETE is a soft-delete: `UPDATE … SET status='expired'` (never row deletion) + IndexNow ping. EXPIRE: workers/expire-sweeper scheduled() runs every 6h: `UPDATE listings SET status='expired', updated_at=unixepoch() WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=unixepoch()`, covered by idx_listings_status_expires. CONTACT: track-contact precheck-exists-and-active → dual rate-limit (per-IP 30/h, per-listing) → recordContactReveal increments contact_count and inserts hashed audit row; always 204.

## Invariants

- A row is publicly visible iff status='active' AND (expires_at IS NULL OR expires_at > now). Every public read path enforces BOTH halves — status alone is insufficient because the sweeper lags up to 6h (LISTING_NOT_EXPIRED in db.ts; isListingExpired re-check in by-slug and [id] GET).
- sold can only be entered from active. markListingSold's UPDATE is guarded `WHERE id=? AND status='active'`; PATCH mirrors via LEGAL_STATUS_TRANSITIONS. This prevents resurrecting an expired/flagged/draft row into sold (would fire IndexNow for a 404 URL and corrupt sold-history).
- Deleting a listing never removes the row; it sets status='expired' (soft delete) to preserve the Schema.org SoldOut window and analytics.
- Every active/draft listing carries a finite expires_at (now + 90d at create). A revival to active re-stamps a fresh expires_at so a stale (already-past) TTL is never inherited.
- A boost (boost_until/boost_paid_cents) never survives a lifecycle round-trip: leaving active forfeits it, re-entering active zeroes it. No free boost via sold→active→… cycling.
- Non-active/expired listings and their internal fields (dealer_id, expires_at, boost_*, flagged_reason) are owner-only on GET /api/listings/:id (requireDealer + dealer_id match) — anonymous callers get 404/403, never the row.
- Status transitions are owner-initiated only via the explicit transition map; dealers cannot self-set 'flagged' (moderation-only) — listingUpdateInputSchema only admits active/sold/expired.
- VIN is globally UNIQUE and (on write) must pass the ISO-3779 checksum; reads relax the checksum (listingRowSchema) so grey-market JDM VINs remain renderable.
- year must sit in the rolling window [currentYear-10, currentYear+1], enforced by D1 triggers (insert + UPDATE OF year) AND re-checked in app code on status-only →active PATCH (which bypasses the trigger).
- slug is globally UNIQUE; collisions surface as 409 'Slug collision; please retry'.
- Only dealerType='dealer' may create car listings; salvage_yards are rejected (they create donor_cars).

## Design decisions

- **Separate cron Worker (workers/expire-sweeper) flips past-TTL active rows to 'expired' every 6h, while ALL public reads independently filter on expires_at.** — Cloudflare Pages Functions cannot run scheduled() handlers, so a row past its TTL would otherwise sit at status='active' forever — skewing dealer dashboards and analytics. Read-side filtering keeps the public surface correct between sweeps; the sweeper only fixes the stored status. Sweep is idempotent (only touches already-past rows). *Rejected:* Rely solely on the read-side predicate and never materialize 'expired' (rejected: dashboards/analytics counted dead rows as live). Or schedule inside Pages Functions (impossible — no cron there).
- **DELETE soft-deletes to status='expired' instead of removing the row.** — Preserves the Schema.org SoldOut window and 'sold N days ago' copy, and keeps boost_orders/contact_reveals FKs intact for dispute/analytics history. *Rejected:* Hard DELETE (rejected — breaks Schema.org SoldOut lifecycle and cascades away history).
- **mark-sold and the sold transition are atomic single-statement UPDATEs guarded WHERE status='active' … RETURNING.** — Avoids a read-then-write race and blocks illegal source states in one round-trip; a null RETURNING cleanly maps to 409. Same pattern reused for markDonorDepleted. *Rejected:* Generic PATCH allowlist (Phase 2b2) that silently dropped non-allowlisted fields and could flip any source status — replaced.
- **Catalog page rows + total are issued as one env.DB.batch([pageStmt,countStmt]); featured slot runs in parallel via Promise.all.** — Collapses the busiest public read to a single network round-trip (audit #26); the count query re-aliases listings as l so the shared year/mileage/TTL predicates apply. *Rejected:* Two serial round-trips (previous behavior).
- **Boost tier is derived at query time from boost_until>now (CASE → tier 2/3), not stored as a denormalized flag.** — Boost auto-expires without a writer; no row needs touching when a boost lapses. *Rejected:* A persisted is_boosted column needing its own sweeper.
- **IndexNow ping is fired via ctx.waitUntil only when the resulting state is publicly indexable (active AND not TTL-expired).** — Draft/expired rows serve as 404, so notifying engines about them wastes crawl budget and can cause soft-404 penalties. *Rejected:* Ping on every mutation regardless of resulting visibility.

## Security notes

- All mutating listing routes go through requireDealer: JWT HS256 verify, token_epoch kill-switch (re-checked against live dealer row so logout/reset/suspension instantly invalidates), and a CSRF backstop (cookie-auth cross-site unsafe requests → 403; Bearer exempt). Primary CSRF enforcement is functions/_middleware.ts.
- Ownership (IDOR) is enforced on every per-listing mutation and on owner-only reads: listing.dealer_id must equal auth.dealerId (mark-sold, PATCH, DELETE, and GET for non-active rows). Anonymous/foreign callers get 404/403 and never see dealer_id/expires_at/boost_*/flagged_reason (audit #35).
- track-contact verifies the listing exists AND is active BEFORE touching the KV rate-limiter or audit table, preventing sprayed/bogus ids from creating unbounded per-listing rate-limit keys or orphan contact_reveals rows; it always returns 204 (no existence/count leak).
- contact_reveals stores only hashed IP (hashIp) and a truncated UA hash — no raw PII. recordContactReveal increments the entity counter first and skips the audit insert if the entity id didn't match (no orphan rows).
- All D1 access uses prepared statements with ? placeholders (db.ts header); dynamic year/mileage filters bind via parameter arrays, not string interpolation.
- Listing creation is rate-limited by subscription tier; contact reveals are double rate-limited (per-IP 30/h and per-listing). The multi-select years array is length-bounded (audit #33) to cap query fan-out.
- VIN uniqueness + ISO-3779 checksum on write; on read the checksum is intentionally relaxed (listingRowSchema) so a malformed-but-stored VIN cannot 500 the public detail page.

## Gaps / TODO

- lib/slug.ts does NOT exist. functions/api/listings/index.ts POST has a TODO (lines 227-228) and calls buildListingSlug with makeSlug:'' and modelSlug:'' (lines 231-234), so generated slugs OMIT make/model entirely — they are `<year>-<trim?>-<city>-<6charSuffix>`. This is a known skeleton; slugs are not the SEO-rich form the docstring implies.
- view_count is never incremented anywhere in the codebase (grep finds no UPDATE of view_count). It is created at 0, read, and surfaced in row types but the analytics increment path is unwired.
- 'flagged' status has no setter wired: no API route or worker sets status='flagged' or writes flagged_reason. The moderation path is a placeholder — flagged exists only in the enum, the transition map (flagged→∅, dealers cannot self-unflag), and the DDL CHECK.
- reduced_by_cents on ListingCard is hardcoded null with a comment 'reserved — populated when price_revisions table lands' (index.ts:157, recent.ts:59). No price-revision tracking exists.
- Boost application (boost_until/boost_paid_cents writes) is described in functions/api/boost/checkout.ts comments as happening 'on webhook success'; the checkout file only documents the intended write — verify the Stripe webhook writer is implemented elsewhere.
- deleteOwnedMediaById returns cf_image_id 'so a future cleanup worker can purge the underlying CF image asset' — that purge worker does not exist; deleting/expiring a listing leaves orphaned Cloudflare Images assets.
- expire-sweeper is deployed OUT OF BAND: it is explicitly NOT part of `npm run deploy` (Pages-only). A code change there ships only via a manual `cd workers/expire-sweeper && npx wrangler deploy`; easy to forget. Its wrangler dev/test hits REAL prod D1 (remote=true).
- The sweeper sets updated_at=unixepoch() in its UPDATE, but trg_listings_updated_at also fires AFTER UPDATE — harmless redundancy; the explicit set is unnecessary.
- No automated test coverage for the lifecycle transitions was located in this pass (not confirmed present).

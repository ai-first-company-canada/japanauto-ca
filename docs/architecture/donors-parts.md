# Donors & parts (junkyard donor-car directory)
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Salvage-yard "donor car" inventory: whole-vehicle records (one row per parted-out car, not per part) with cross-fit compatibility metadata, surfaced as SEO/AI-citable parts-listing pages with Vehicle + AutoPartsStore + FAQPage + BreadcrumbList JSON-LD. Replaced the rejected granular-parts catalog per ADR-0008.

## Key files

| Path | Role |
|---|---|
| `functions/api/donors/index.ts` | GET list donors (dealer_id=me authed all-status; dealer_id=<id> public active-only) + POST create donor (salvage_yard only); builds slug, stringifies compatible_* arrays, IndexNow ping on active |
| `functions/api/donors/[id]/index.ts` | GET single by UUID (draft owner-only), PATCH (owner; status state-machine; blocks depleted), DELETE (soft-delete to status='expired') |
| `functions/api/donors/[id]/mark-depleted.ts` | POST atomic active→depleted (condition+status) owner-only; only legal path to depleted state |
| `functions/api/donors/[id]/track-contact.ts` | Anonymous contact-reveal beacon: increments contact_count, writes hashed IP/UA to contact_reveals; always 204. NOTE: has no client-side caller (dead) |
| `functions/api/donors/by-slug/[slug].ts` | GET JSON shape of one donor (tooling/smoke tests); parses compatible_* JSON; active+depleted only |
| `functions/parts/listing/[slug].ts` | Public donor-detail HTML Pages Function (ADR-0008); 17 sections; builds @graph; composeDonorFaqs lives here (NOT in parts-components.ts) |
| `functions/_lib/parts-components.ts` | String-returning HTML render helpers + parseCompatibility, donorPhone, formatTransmission, tone-SVG placeholders; no JSX/template engine |
| `functions/api/_lib/db.ts` | D1 queries: getDonorCarBySlug, getDonorCarById, listDonorsForDealer, markDonorDepleted, listRelatedDonors, listDonorCountsByCity, getMediaForEntity, recordContactReveal |
| `lib/schema.ts` | zod donorCarCreateInputSchema/donorCarUpdateInputSchema, enums (conditions/statuses/transmissions/tones), compatible_* array bounds (audit #33) |
| `migrations/0005_donor_cars_semantic_shift.sql` | Drops parts table, creates donor_cars with DB CHECK constraints + 6 indexes + updated_at trigger; rebuilds media/contact_reveals CHECKs to accept 'donor_car' |
| `functions/sitemap-donors.xml.ts` | Sitemap of /parts/listing/<slug>/ for status IN (active,depleted), limit 50000 |

## How it works

CREATE: POST /api/donors → requireDealer → reject if dealerType!='salvage_yard' (403) → rate-limit reusing LISTING_CREATE_{FREE,PRO}_TIER (50/500 per day) → zod donorCarCreateInputSchema → resolve make/model slug rows → buildDonorSlug([year,makeSlug,modelSlug,trim?,color,citySlug,6-char-uuid-suffix], lowercased, ≤75 chars) → INSERT into donor_cars with compatible_* JSON.stringify'd, view_count/contact_count=0, price_currency hard-coded 'CAD', status defaults to 'draft' unless input.status='active'. IndexNow ping (ctx.waitUntil) fires only when initialStatus==='active'. FK/UNIQUE/CHECK errors are caught and mapped to 422/409.\n\nREAD (public page): GET /parts/listing/:slug → takeCspNonce(data) → getDonorCarBySlug (JOINs dealers+makes+models+cities; WHERE status IN ('active','depleted'); parses dealer.hours JSON) → null ⇒ 404 render404DonorBody. Then Promise.all of getMediaForEntity('donor_car'), listRelatedDonors(sameYard by dealerId+modelId), listRelatedDonors(sameCityModel by modelId+citySlug), listDonorCountsByCity(makeId,modelId,excludeCity). isDepleted = condition==='depleted'||status==='depleted'. Builds schemaLD array [vehicleNode, yardNode, faqNode, breadcrumbNode] — renderShell wraps Organization+WebSite. Vehicle.offers.availability flips InStock/OutOfStock on isDepleted; additionalType='https://japanauto.ca/schema/donor-car'; isAccessoryOrSparePartFor from compat.models. yardNode is AutoPartsStore with PostalAddress + per-day OpeningHoursSpecification (expanded one row per dow because compound dayOfWeek arrays aren't universally validated). Body = 17 sections via parts-components render* helpers; sticky bar + IntersectionObserver script (nonce'd) only when !isDepleted. Response cache-control public s-maxage=60 swr=300.\n\nCOMPATIBILITY: stored as 4 JSON TEXT columns (compatible_makes/models/years/trims). parseCompatibility/safeJsonArray defensively JSON.parse to native arrays (catch ⇒ fallback []). renderCompatibilityCard falls back to the donor's own model/generation when arrays empty. compatible_makes defaults at insert to [make's own slug].\n\nCONTACT TRACKING: track-contact verifies donor exists & status IN (active,depleted) BEFORE rate-limiting/audit (so bogus ids can't flood), rate-limits CONTACT_REVEAL_PER_IP (30/hr) then per-donor (100/day), then recordContactReveal increments donor_cars.contact_count and inserts a hashed row; best-effort (errors swallowed), always returns 204.\n\nLIFECYCLE: draft→active|expired and active→expired via PATCH (DONOR_LEGAL_TRANSITIONS); active→depleted only via mark-depleted (markDonorDepleted UPDATE ... WHERE status='active' RETURNING *). DELETE is soft (status='expired'). depleted/expired/flagged are terminal for dealer actions.

## Invariants

- Only dealers with type='salvage_yard' may create donors (POST returns 403 otherwise) — app-layer only, NOT a DB constraint
- Public visibility = status IN ('active','depleted'); draft/expired/flagged rows are hidden from getDonorCarBySlug, by-slug, track-contact, and the sitemap. Draft is additionally owner-only via GET /api/donors/:id
- status='depleted' is reachable ONLY through POST mark-depleted, and ONLY from status='active' (UPDATE ... WHERE status='active'); PATCH explicitly rejects condition/status='depleted'
- Status state-machine: draft→{active,expired}, active→{expired} are the only dealer-reachable transitions; depleted/expired/flagged are terminal. A picked-apart car must not silently re-activate (would re-ping IndexNow for a 404)
- DELETE never hard-deletes — soft-delete to 'expired' preserves the legal/liability paper trail of parted-out cars
- compatible_makes/models/years/trims are JSON-stringified TEXT in D1; the API stringifies on write and every reader defensively JSON.parses with a [] fallback
- price is stored in integer cents (price_currency forced to 'CAD' at insert and by DB CHECK); the page divides price/100 and rounds for schema.org
- slug is globally UNIQUE (idx_donor_cars_slug); collision on insert returns 409 conflict
- IndexNow is pinged only for URLs that resolve (status becomes/ is 'active', or on soft-delete to refresh the now-changed page); draft creation does not ping
- Mutating donor endpoints require a same-site request or Bearer header (requireDealer CSRF backstop) and a non-revoked token (token_epoch must match live dealer row)
- Ownership: PATCH/DELETE/mark-depleted require existing.dealer_id === auth.dealerId (403 forbidden otherwise)

## Design decisions

- **Model inventory as whole 'donor_cars' (one row per parted-out vehicle) with cross-fit compatibility arrays, not a granular per-part catalog** — ADR-0008; junkyard staff know their car better than any catalog and parts cross-fit by generation. Page steers buyers to call rather than browse a parts list. No rolling age cap (old donors are valuable for rare-parts recovery) *Rejected:* A granular `parts` table (per-part rows/categories) — built then rejected; migration 0005 DROPs the empty `parts` table and its indexes/trigger
- **Render the donor detail page as hand-written HTML strings in a Pages Function (functions/parts/listing/[slug].ts + parts-components.ts), not an Astro/SSR component** — Phase 2c2b proved @astrojs/cloudflare is incompatible with this project's Pages Functions setup; mirrors used-cars/listing and dealers/[slug] *Rejected:* Astro SSR via @astrojs/cloudflare adapter (incompatible); a template engine/JSX (avoided — plain string concatenation with esc())
- **The public HTML page reads D1 directly via getDonorCarBySlug instead of calling GET /api/donors/by-slug** — Cross-Function HTTP would double the round-trip at the edge. by-slug exists purely for tooling/smoke tests/future clients *Rejected:* Page fetches its own JSON API (rejected for latency)
- **mark-depleted is a dedicated endpoint doing an atomic single-UPDATE of both condition AND status, gated to status='active'** — audit #21 — mirrors markListingSold; prevents resurrecting expired/flagged/draft donors into depleted and avoids a non-atomic two-write race *Rejected:* Allow depleted via the generic PATCH (rejected — PATCH explicitly returns 422 pointing to mark-depleted)
- **Bound compatible_* array lengths in zod (makes ≤BRAND_SLUGS.length, models ≤50, years ≤60, trims ≤50)** — audit #33 — per-element rules didn't cap length and arrays allow dupes, so an unbounded salvage_yard could persist multi-megabyte JSON blobs (storage amplification) *Rejected:* No max() (the pre-audit state)
- **Keep depleted donors indexed (sitemap + render) rather than dropping them** — They render a 'fully parted out' SoldOut/OutOfStock Schema.org variant that is still citable and drives buyers to related/replacement donors *Rejected:* Exclude depleted from sitemap and 404 them (rejected; only draft/expired/flagged are excluded)
- **Expand OpeningHoursSpecification to one JSON-LD node per day-of-week** — compound dayOfWeek arrays are not supported by all schema validators *Rejected:* Single node with a dayOfWeek array (rejected for validator compatibility)

## Security notes

- track-contact contact_count increment + audit insert are gated behind an existence+status check performed BEFORE the rate-limiter and before recordContactReveal, so sprayed/bogus ids cannot flood contact_reveals with orphan rows (recordContactReveal also no-ops the insert when the UPDATE changed 0 rows)
- contact_reveals stores only SHA-256-derived hashes: ip_hash via hashIp (daily-rotating salt, privacy-by-design ADR-0003) and an 8-byte UA hash; no raw IP/UA persisted. Beacon always returns 204 to avoid leaking whether a donor exists or the count
- All mutating donor endpoints go through requireDealer which (a) rejects cross-site unsafe cookie-auth requests lacking a Bearer header (CSRF backstop; primary enforcement in _middleware.ts) and (b) re-validates token_epoch against the live dealer row (server-side session kill switch, audit #11) — a 15-min access token is never trusted for authz claims
- All user-controlled strings in rendered HTML flow through esc(); outbound dealer website/href run through safeUrl() (rejects non-http(s)); the only inline <script> (sticky-bar observer) carries the per-request CSP nonce — CSP has no script-src 'unsafe-inline' (audit #18)
- POST create reuses the listing-create daily rate limiter (50 free / 500 pro) as anti-spam; donor creation is restricted to salvage_yard dealers
- DB enforces enum/numeric/currency CHECKs and FK RESTRICT on make/model/city (and CASCADE on dealer delete); the salvage_yard-only rule is app-layer only and would not survive a direct DB write or a non-donor code path

## Gaps / TODO

- DEAD CODE / not wired: functions/api/donors/[id]/track-contact.ts has NO client caller. The detail page emits data-event='donor-call'/'donor-call-sticky' + data-donor-id attributes but the only inline script is the sticky-bar IntersectionObserver — nothing fetches/sendBeacons the endpoint. donor_cars.contact_count therefore stays 0 in practice (the endpoint's own docstring even notes contact tracking was 'previously dead'; it remains uninvoked)
- donor_cars.view_count is never incremented anywhere — set to 0 at INSERT, only ever SELECTed. No view-tracking path exists
- FAQ content is static factory copy hard-coded in composeDonorFaqs (in functions/parts/listing/[slug].ts, not parts-components.ts despite the task's premise). Comments mark Phase 3.3 dashboard override as not yet built
- deleteOwnedMediaById returns the orphaned cf_image_id 'so a future cleanup worker can purge the underlying CF image asset' — that purge worker does not exist; deleting donor media leaves the Cloudflare Images asset behind
- getDonorCarById returns Record<string,unknown> (untyped) and does NOT parse compatible_* or dealer_hours JSON — callers (PATCH/DELETE/mark-depleted) only need raw row + ownership, but consumers must not assume parsed arrays
- GET /api/donors public branch (dealer_id=<id>) runs an inline ad-hoc SQL query in the handler rather than a shared db.ts helper, duplicating the SELECT used by listDonorsForDealer
- No public list/index Pages Function for donors — /parts/, /[city]/parts/... browse pages are separate SSG Astro pages (src/pages/[city]/parts/...) that the breadcrumb/city-count links target; this subsystem only ships the dynamic detail route. Their data source/wiring is out of scope of these files
- by-slug JSON endpoint returns donor.price/price_currency raw (cents) while the HTML page converts to dollars for schema.org — consumers must know prices are integer cents

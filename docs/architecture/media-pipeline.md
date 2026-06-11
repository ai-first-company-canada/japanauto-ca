# Media pipeline
> Captured 2026-06-11 from a code-level read of the repository. Per [DOCS-CONVENTIONS.md](../../DOCS-CONVENTIONS.md) R5, verify cited symbols against the code when relying on this document.

## Purpose

Lets an authenticated dealer attach photos to a listing or donor_car by minting a one-time Cloudflare Images Direct Creator Upload URL, having the browser PUT the file directly to Cloudflare (server never in the byte path), then finalizing a row in the D1 `media` table. Delivery is public via imagedelivery.net.

## Key files

| Path | Role |
|---|---|
| `functions/api/media/upload-url.ts` | POST /api/media/upload-url — auth + rate-limit + ownership + photo-cap pre-check, calls CF Images v2/direct_upload, records pending-upload claim, returns {upload_url, image_id}. |
| `functions/api/media/finalize.ts` | POST /api/media/finalize — re-checks ownership + cap, atomically consumes the pending claim (consumePendingUpload), then createMedia inserts the row. Returns 201 {media}. |
| `functions/api/media/[id].ts` | DELETE /api/media/:id — ownership-checked row delete via deleteOwnedMediaById; only logs cf_image_id for a future purge, does NOT delete the CF asset. |
| `functions/api/_lib/db.ts` | db helpers: recordPendingUpload (488), consumePendingUpload (505, DELETE…RETURNING), createMedia (522, atomic primary demote+insert via batch), deleteOwnedMediaById (590), rowToMediaPublic (454), MediaRow (432). |
| `migrations/0009_pending_media_uploads.sql` | Creates pending_media_uploads (image_id PK, dealer_id, entity_type, entity_id, created_at) + idx_pending_media_dealer. Binds a CF image_id to its minter (audit #14). |
| `migrations/0001_initial_schema.sql` | media table DDL (line 356): polymorphic entity_type with CHECK IN ('listing','part','dealer','featured_slot'); r2_key NOT NULL + UNIQUE; cf_image_id nullable; is_primary CHECK(0,1). One-primary rule documented as app-layer only. |
| `lib/schema.ts` | Zod: mediaUploadInputSchema (779), mediaFinalizeInputSchema (793, image_id 1..200), mediaPublicSchema (812), MEDIA_ENTITY_TYPES (103: listing|donor_car|dealer|featured_slot), LIMITS.PHOTOS_PER_LISTING_MAX=20 (142). |
| `functions/api/_lib/rate-limit.ts` | RATE_LIMITS.MEDIA_UPLOAD_URL_PER_DEALER (139): 100 mints/hour/dealer over KV (RATE_LIMIT binding). |
| `functions/_lib/page-shell.ts` | cfImageUrl(hash, imageId, variant='public') (145) builds https://imagedelivery.net/<hash>/<id>/<variant>. |
| `src/components/sections/ListingForm.astro` | Client uploadOne() (700): 3-step mint → POST file to CF → finalize; builds delivery URLs from PUBLIC_CLOUDFLARE_ACCOUNT_HASH. DonorForm.astro mirrors it. |
| `types/env.d.ts` | Bindings: DB (D1), RATE_LIMIT (KV), MEDIA (R2, unused by this flow), CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_IMAGES_API_TOKEN (secret), PUBLIC_CLOUDFLARE_ACCOUNT_HASH. |

## How it works

Three-leg direct-creator-upload flow, server never touches image bytes. (1) MINT — upload-url.ts: requireDealer → rateLimit(MEDIA_UPLOAD_URL_PER_DEALER, keyed by dealerId, checked before any DB work) → parse mediaUploadInputSchema → ownership check (getListingById/getDonorCarById, 404 if missing, 403 if listing.dealer_id/donor.dealer_id !== auth.dealerId) → photo-cap pre-check (COUNT media for entity vs PHOTOS_PER_LISTING_MAX=20, audit #17) → require CLOUDFLARE_ACCOUNT_ID+CLOUDFLARE_IMAGES_API_TOKEN → POST multipart FormData (metadata={dealerId,entity_type,entity_id}, expiry=now+30min, audit #15) to api.cloudflare.com .../images/v2/direct_upload with Bearer token → on success recordPendingUpload(image_id, dealer_id, entity_type, entity_id) writes the binding row (failure returns 500 so dealer never gets a dead-end URL, audit #14) → returns {upload_url, image_id}. (2) BROWSER PUT — ListingForm.astro uploadOne() POSTs FormData with single 'file' field directly to the returned upload_url. (3) FINALIZE — finalize.ts: requireDealer → parse mediaFinalizeInputSchema → same ownership check → non-destructive cap re-check (so a cap rejection doesn't burn a valid claim) → consumePendingUpload runs `DELETE FROM pending_media_uploads WHERE image_id=? AND dealer_id=? AND entity_type=? AND entity_id=? RETURNING image_id`; null result → 403 'Unknown or already-finalized image_id'. The client-supplied image_id is never trusted alone because it is a public URL segment. → createMedia: r2_key set to `cf:<image_id>` (satisfies NOT NULL+UNIQUE without colliding with future R2 keys), cf_image_id set to image_id; if is_primary, env.DB.batch([UPDATE…is_primary=0 for entity, INSERT]) runs as one D1 transaction (audit #22) so the entity is never left with zero primaries; else plain insert. Returns 201 {media} via rowToMediaPublic. DELETE: deleteOwnedMediaById verifies ownership through a LEFT JOIN to listings/donor_cars in one round-trip, deletes the row, returns cf_image_id (logged, not purged). READ/RENDER: SSG/dynamic page templates call cfImageUrl(env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH, image_id, 'public'); CSP img-src allowlists https://imagedelivery.net.

## Invariants

- A media row is created only after the matching pending_media_uploads claim is atomically consumed — proves THIS dealer minted THIS image_id for THIS entity (image_id alone is public, untrusted).
- Each pending claim is single-use: DELETE…RETURNING is one statement serialized by SQLite's write lock, so concurrent finalizes cannot double-spend it.
- A successful finalize deletes the claim row; only orphans (minted, never finalized) remain.
- At most PHOTOS_PER_LISTING_MAX (20) media rows per (entity_type, entity_id) — enforced at both mint and finalize.
- At most one is_primary=1 row per entity — app-layer only (no DB partial-unique); preserved atomically via demote+insert batch so the entity never drops to zero primaries.
- media.r2_key is NOT NULL and UNIQUE; CF-Images rows use the synthetic `cf:<image_id>` value; cf_image_id holds the raw id.
- Ownership is verified independently in upload-url, finalize, and delete — no path trusts a prior leg.
- Public delivery URL is exactly https://imagedelivery.net/<PUBLIC_CLOUDFLARE_ACCOUNT_HASH>/<image_id>/<variant>, built only via cfImageUrl / inline equivalents.

## Design decisions

- **Cloudflare Images Direct Creator Upload — browser PUTs straight to CF; the Worker only mints a URL and records a claim.** — Keeps large image bytes off the Pages Function (no body-size / CPU limits, no egress through the Worker), and CF handles variant generation + CDN delivery. *Rejected:* Proxying uploads through the Worker into the R2 MEDIA bucket (binding exists but is unused by this flow). Rejected: Worker request-size/CPU limits and added latency/cost.
- **pending_media_uploads table (migration 0009): bind image_id→minter at mint, consume atomically at finalize.** — image_id is a public segment of the delivery URL, so a naive finalize that only checks entity ownership lets a dealer finalize someone else's (or a fabricated) image_id onto their own entity — content misattribution / IDOR (audit #14). *Rejected:* Trusting the client image_id with only an entity-ownership check (the prior behavior, rejected); or a HMAC-signed token round-tripped through the client (more crypto surface, still needs single-use tracking).
- **Atomic primary demote+insert via env.DB.batch (audit #22).** — If a separate UPDATE-then-INSERT had the INSERT fail, the entity would be left with zero primaries, blanking its catalog thumbnail (is_primary=1 LEFT JOIN). The batch runs as one transaction so demote rolls back with a failed insert. *Rejected:* Two sequential statements (rejected: non-atomic); a DB partial-unique index on (entity_id) WHERE is_primary=1 (rejected — SQLite multi-col partial-unique limitation, kept app-layer).
- **requireSignedURLs intentionally left OFF; images served publicly.** — Public imagedelivery.net delivery is the current product model; flipping to signed URLs would require every <img> to carry a signing token. *Rejected:* requireSignedURLs=true (rejected for now as a deliberate, separately-tracked product change).
- **Photo-cap checked at BOTH mint and finalize (audit #17).** — Without the mint-time check a dealer could loop minting billable CF upload URLs against an already-full entity even though finalize would later reject them. *Rejected:* Finalize-only check (rejected: leaves billable-mint abuse open).
- **Encode CF id into r2_key as `cf:<image_id>` instead of nulling it.** — r2_key is NOT NULL + UNIQUE on the table; the prefix keeps the value unique and namespaced away from future real R2 keys like listings/<id>/01.jpg. *Rejected:* Relaxing r2_key to nullable (rejected: larger migration, loses the uniqueness guard).
- **Per-dealer rate limit of 100 mints/hour, checked before any DB lookup.** — Each mint is a billable CF Images operation; an authenticated dealer could otherwise mint in a loop. Checking first makes abuse cheap to reject. *Rejected:* No limit / post-DB check (rejected: billing abuse, wasted DB work).

## Security notes

- IDOR defense is the pending_media_uploads claim: finalize.ts rejects (403) any image_id not minted by this dealer for this entity, because image_ids are public URL segments. Removing/weakening the claim re-opens audit #14.
- Ownership enforced on all three legs via dealer_id comparison (403) and existence (404); the DELETE path proves ownership through a JOIN to listings/donor_cars.
- CLOUDFLARE_IMAGES_API_TOKEN is a server-only secret used solely in upload-url.ts Bearer header; never sent to the client. The client only ever receives the one-time upload_url and the image_id.
- CF upload metadata tags each mint with {dealerId, entity_type, entity_id} for orphan attribution; expiry caps the one-time URL to ~30 min (audit #15).
- CSP (functions/_middleware.ts) restricts img-src to 'self' data: https://imagedelivery.net, limiting where delivered images can originate.
- Claim consumption is race-safe (single DELETE…RETURNING, SQLite writer serialization) — no TOCTOU window for double-finalize.
- alt_text and image_id are length-bounded and trimmed in Zod; delivery URLs are built only via cfImageUrl / equivalent, image_id is URL-escaped client-side.

## Gaps / TODO

- No CF Images asset deletion anywhere. DELETE /api/media/:id only console.logs cf_image_id 'Phase 6 cron will purge'; deleting a media row leaves the CF image (and billing) live indefinitely.
- Orphaned pending_media_uploads rows (minted, never finalized) are never swept. Migration 0009 documents a future job (DELETE … WHERE created_at < now-86400) and an index supports it, but no worker exists.
- Orphaned CF images (minted, PUT, never finalized) accumulate with no reconciliation job.
- Schema/DDL drift: Zod MEDIA_ENTITY_TYPES = listing|donor_car|dealer|featured_slot, but media table CHECK (migration 0001) = listing|part|dealer|featured_slot — 'donor_car' is accepted by handlers but would violate the table CHECK; 'part' is allowed by DDL but absent from Zod. No migration reconciles this; donor_car media inserts may fail at the DB layer.
- entity_type 'dealer' and 'featured_slot' upload paths are unwired — upload-url.ts/finalize.ts return 422 ('not yet wired'); only listing and donor_car are handled.
- The R2 MEDIA bucket binding exists but is unused by this pipeline; r2_key values are synthetic cf: placeholders, no real R2 originals are stored.
- Client is_primary on delete is best-effort UX only: ListingForm comment notes 'server-side promotion happens on next finalize' — deleting the primary leaves the entity with no primary until a later finalize promotes one.
- No server-side validation that the CF upload actually succeeded/produced a valid image before createMedia — finalize trusts the claim + client-reported width/height/bytes (bounded but unverified).

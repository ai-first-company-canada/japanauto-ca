/**
 * functions/api/_lib/db.ts
 *
 * Typed D1 query helpers. All queries use prepared statements (`?` placeholders)
 * — anti-SQL-injection by construction. Helpers return parsed/typed rows
 * (validated through zod where appropriate) instead of raw D1 results.
 *
 * Style:
 *   - Helpers prefixed by domain: `getDealerById`, `getListingBySlug`, etc.
 *   - Single-row returns are `… | null` (no row → null, never throw).
 *   - Multi-row returns are `[]` (no rows → empty array).
 *   - Mutations return `void` or the inserted/updated row id.
 */

import type { Env } from "../../../types/env";
import {
  dealerRowSchema, listingRowSchema, citySchema, makeSchema, modelSchema,
  mediaPublicSchema,
  type Dealer, type Listing, type City, type Make,
  type MediaPublic, type MediaFinalizeInput,
} from "../../../lib/schema";

// ============================================================================
// DEALERS
// ============================================================================

/**
 * Convert a raw D1 row (hours stored as JSON TEXT) to a typed Dealer.
 * Mutates a copy of the row — leaves the original untouched.
 */
function parseDealerRow(row: Record<string, unknown>): Dealer {
  const r: Record<string, unknown> = { ...row };
  const raw = r.hours;
  if (typeof raw === "string" && raw.length > 0) {
    try { r.hours = JSON.parse(raw); }
    catch { r.hours = null; }
  } else if (raw === undefined) {
    r.hours = null;
  }
  return dealerRowSchema.parse(r);
}

export async function getDealerById(env: Env, id: string): Promise<Dealer | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM dealers WHERE id = ? LIMIT 1`
  ).bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return parseDealerRow(row);
}

export async function getDealerByEmail(env: Env, email: string): Promise<Dealer | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM dealers WHERE email = ? LIMIT 1`
  ).bind(email.toLowerCase()).first<Record<string, unknown>>();
  if (!row) return null;
  return parseDealerRow(row);
}

export async function getDealerBySlug(env: Env, slug: string): Promise<Dealer | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM dealers WHERE slug = ? LIMIT 1`
  ).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;
  return parseDealerRow(row);
}

// ============================================================================
// LISTINGS
// ============================================================================

export async function getListingBySlug(env: Env, slug: string): Promise<Listing | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM listings WHERE slug = ? LIMIT 1`
  ).bind(slug).first();
  if (!row) return null;
  return listingRowSchema.parse(row);
}

export async function getListingById(env: Env, id: string): Promise<Listing | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM listings WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return null;
  return listingRowSchema.parse(row);
}

/**
 * Atomically set status='sold' + sold_at=now WHERE status != 'sold'.
 * Returns the updated row, or null if not found / already sold.
 */
export async function markListingSold(env: Env, id: string): Promise<Listing | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `UPDATE listings
     SET status = 'sold', sold_at = ?, updated_at = ?
     WHERE id = ? AND status != 'sold'
     RETURNING *`
  ).bind(now, now, id).first();
  if (!row) return null;
  return listingRowSchema.parse(row);
}

export interface CatalogRow extends Listing {
  dealer_name: string;
  dealer_slug: string;
  dealer_amvic: string | null;
  /** make.slug and make.name — joined by listRecentListings (legacy listCatalog leaves these undefined). */
  make_slug?: string;
  make_name?: string;
  /** model.slug and model.name — joined by listRecentListings. */
  model_slug?: string;
  model_name?: string;
  primary_image_r2_key: string | null;
  /** cf_image_id of the primary photo. listRecentListings populates this; legacy listCatalog leaves it undefined. */
  primary_image_cf_id?: string | null;
  primary_image_alt: string | null;
  tier: 2 | 3;             // 2 = boosted, 3 = organic
  boost_amount: number;
}

export interface CatalogQueryParams {
  makeId: number;
  modelId: number;
  city: string;
  yearsFilter: number[] | null;
  mileageMax: number | null;
  sort: "newest" | "price_asc" | "price_desc";
  page: number;
  perPage: number;
}

/**
 * Catalog query for /used-cars/[make]/[model]/[city]/.
 * Returns boosted + organic in single query, sorted by tier ASC then by user choice.
 * Featured slot is queried separately (see getFeaturedSlot below).
 */
export async function listCatalog(
  env: Env, q: CatalogQueryParams,
): Promise<{ rows: CatalogRow[]; total: number }> {
  // Build dynamic year filter
  let yearClause = "";
  const yearBinds: number[] = [];
  if (q.yearsFilter && q.yearsFilter.length > 0) {
    yearClause = `AND l.year IN (${q.yearsFilter.map(() => "?").join(",")})`;
    yearBinds.push(...q.yearsFilter);
  }
  let mileageClause = "";
  const mileageBinds: number[] = [];
  if (q.mileageMax !== null) {
    mileageClause = `AND l.mileage < ?`;
    mileageBinds.push(q.mileageMax);
  }

  const sortClause =
    q.sort === "price_asc"  ? "ORDER BY tier ASC, boost_amount DESC, l.price ASC, l.created_at DESC" :
    q.sort === "price_desc" ? "ORDER BY tier ASC, boost_amount DESC, l.price DESC, l.created_at DESC" :
                              "ORDER BY tier ASC, boost_amount DESC, l.created_at DESC";

  const offset = (q.page - 1) * q.perPage;
  const sql = `
    SELECT
      l.*,
      d.name AS dealer_name,
      d.slug AS dealer_slug,
      d.amvic_number AS dealer_amvic,
      m.r2_key AS primary_image_r2_key,
      m.cf_image_id AS primary_image_cf_id,
      m.alt_text AS primary_image_alt,
      CASE
        WHEN l.boost_until IS NOT NULL AND l.boost_until > CAST(strftime('%s','now') AS INTEGER) THEN 2
        ELSE 3
      END AS tier,
      CASE
        WHEN l.boost_until IS NOT NULL AND l.boost_until > CAST(strftime('%s','now') AS INTEGER) THEN l.boost_paid_cents
        ELSE 0
      END AS boost_amount
    FROM listings l
    JOIN dealers d ON d.id = l.dealer_id
    LEFT JOIN media m
      ON m.entity_type = 'listing' AND m.entity_id = l.id AND m.is_primary = 1
    WHERE l.make_id = ?
      AND l.model_id = ?
      AND l.city = ?
      AND l.status = 'active'
      ${yearClause}
      ${mileageClause}
    ${sortClause}
    LIMIT ? OFFSET ?
  `;

  const result = await env.DB.prepare(sql)
    .bind(q.makeId, q.modelId, q.city, ...yearBinds, ...mileageBinds, q.perPage, offset)
    .all();

  // Count total (separate, simpler query — could be cached in KV)
  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS n FROM listings
    WHERE make_id = ? AND model_id = ? AND city = ? AND status = 'active'
    ${yearClause} ${mileageClause}
  `).bind(q.makeId, q.modelId, q.city, ...yearBinds, ...mileageBinds).first<{ n: number }>();

  return {
    rows: (result.results ?? []) as unknown as CatalogRow[],
    total: totalRow?.n ?? 0,
  };
}

/**
 * Flexible "recent listings" query for homepage Latest section + dealer
 * profile inventory feed. No make/model required; optional city filter,
 * optional dealer_id filter. Returns same row shape as listCatalog so
 * downstream card-building code is interchangeable.
 */
export interface RecentListingsParams {
  city?: string | null;
  dealerId?: string | null;
  limit: number;
}

export async function listRecentListings(
  env: Env, q: RecentListingsParams,
): Promise<CatalogRow[]> {
  const where: string[] = [`l.status = 'active'`];
  const binds: (string | number)[] = [];
  if (q.city) {
    where.push(`l.city = ?`);
    binds.push(q.city);
  }
  if (q.dealerId) {
    where.push(`l.dealer_id = ?`);
    binds.push(q.dealerId);
  }
  binds.push(q.limit);

  const sql = `
    SELECT
      l.*,
      d.name AS dealer_name,
      d.slug AS dealer_slug,
      d.amvic_number AS dealer_amvic,
      mk.slug AS make_slug,
      mk.name AS make_name,
      md.slug AS model_slug,
      md.name AS model_name,
      m.r2_key AS primary_image_r2_key,
      m.cf_image_id AS primary_image_cf_id,
      m.alt_text AS primary_image_alt,
      CASE
        WHEN l.boost_until IS NOT NULL AND l.boost_until > CAST(strftime('%s','now') AS INTEGER) THEN 2
        ELSE 3
      END AS tier,
      CASE
        WHEN l.boost_until IS NOT NULL AND l.boost_until > CAST(strftime('%s','now') AS INTEGER) THEN l.boost_paid_cents
        ELSE 0
      END AS boost_amount
    FROM listings l
    JOIN dealers d ON d.id = l.dealer_id
    JOIN makes mk ON mk.id = l.make_id
    JOIN models md ON md.id = l.model_id
    LEFT JOIN media m
      ON m.entity_type = 'listing' AND m.entity_id = l.id AND m.is_primary = 1
    WHERE ${where.join(" AND ")}
    ORDER BY tier ASC, boost_amount DESC, l.created_at DESC
    LIMIT ?
  `;

  const result = await env.DB.prepare(sql).bind(...binds).all();
  return (result.results ?? []) as unknown as CatalogRow[];
}

export interface FeaturedSlotRow {
  slot_id: string;
  promo_title: string;
  promo_msrp_cents: number;
  promo_image_id: string | null;
  promo_url: string;
  disclosure: string;
  dealer_name: string;
}

/** Get active featured slot for (make, city). Falls back to make-only slot if no model match. */
export async function getActiveFeaturedSlot(
  env: Env, makeId: number, modelId: number, city: string,
): Promise<FeaturedSlotRow | null> {
  const row = await env.DB.prepare(`
    SELECT
      f.id AS slot_id,
      f.promo_title, f.promo_msrp_cents, f.promo_image_id, f.promo_url, f.disclosure,
      d.name AS dealer_name
    FROM featured_slots f
    JOIN dealers d ON d.id = f.dealer_id
    WHERE f.make_id = ?
      AND (f.model_id = ? OR f.model_id IS NULL)
      AND f.city = ?
      AND f.status = 'active'
      AND f.active_from <= CAST(strftime('%s','now') AS INTEGER)
      AND f.active_until > CAST(strftime('%s','now') AS INTEGER)
    ORDER BY (f.model_id IS NOT NULL) DESC, f.contract_paid_cents DESC
    LIMIT 1
  `).bind(makeId, modelId, city).first();
  return row ? (row as unknown as FeaturedSlotRow) : null;
}

// ============================================================================
// MEDIA (polymorphic — entity_type ∈ listing/part/dealer/featured_slot)
// ============================================================================

interface MediaRow {
  id: string;
  entity_type: string;
  entity_id: string;
  r2_key: string;
  cf_image_id: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  display_order: number;
  is_primary: 0 | 1;
  bytes: number | null;
  created_at: number;
}

/**
 * Convert a D1 media row to the public shape clients consume. Falls back to
 * `r2_key` when `cf_image_id` is null (legacy R2-only rows would have a key
 * like "listings/<id>/01.jpg"; current CF Images flow always sets cf_image_id
 * and we mirror the same value into r2_key as `cf:<image_id>` to satisfy the
 * NOT NULL constraint without conflicting with future R2 keys).
 */
function rowToMediaPublic(row: MediaRow): MediaPublic {
  const image_id = row.cf_image_id ?? row.r2_key;
  const data = {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    image_id,
    alt_text: row.alt_text ?? "",
    width: row.width,
    height: row.height,
    display_order: row.display_order,
    is_primary: row.is_primary,
    bytes: row.bytes,
    created_at: row.created_at,
  };
  return mediaPublicSchema.parse(data);
}

// ============================================================================
// PENDING MEDIA UPLOADS (audit #14 — bind CF image_id to its minter)
// ============================================================================

interface PendingUpload {
  image_id: string;
  dealer_id: string;
  entity_type: string;
  entity_id: string;
}

/**
 * Record, at mint time, that `dealer_id` is allowed to finalize `image_id`
 * against (`entity_type`, `entity_id`). Called by /api/media/upload-url after
 * a successful CF direct_upload mint.
 */
export async function recordPendingUpload(
  env: Env, p: PendingUpload,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO pending_media_uploads (image_id, dealer_id, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(p.image_id, p.dealer_id, p.entity_type, p.entity_id, now).run();
}

/**
 * Atomically consume the pending claim for (`image_id`, `dealer_id`,
 * `entity_type`, `entity_id`). Returns true iff a matching row existed and was
 * deleted — i.e. this dealer really minted this image_id for this entity. The
 * DELETE ... RETURNING is a single statement (SQLite serializes writers), so a
 * claim cannot be double-spent by concurrent finalize calls.
 */
export async function consumePendingUpload(
  env: Env, p: PendingUpload,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `DELETE FROM pending_media_uploads
       WHERE image_id = ? AND dealer_id = ? AND entity_type = ? AND entity_id = ?
       RETURNING image_id`,
  ).bind(p.image_id, p.dealer_id, p.entity_type, p.entity_id)
    .first<{ image_id: string }>();
  return row !== null;
}

/**
 * Insert a media row after a successful Cloudflare Images Direct Upload.
 * If `is_primary=1`, demote any existing primary for the same entity first
 * (one primary per entity, enforced at app layer per migration comment).
 */
export async function createMedia(
  env: Env, input: MediaFinalizeInput,
): Promise<MediaPublic> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const isPrimary = input.is_primary ? 1 : 0;
  // r2_key is NOT NULL on the table; for CF-Images rows we encode the CF id
  // with a `cf:` prefix so it stays unique and won't collide with future R2
  // originals stored under e.g. "listings/<id>/01.jpg".
  const r2Key = `cf:${input.image_id}`;

  if (isPrimary === 1) {
    await env.DB.prepare(
      `UPDATE media SET is_primary = 0
       WHERE entity_type = ? AND entity_id = ? AND is_primary = 1`,
    ).bind(input.entity_type, input.entity_id).run();
  }

  await env.DB.prepare(
    `INSERT INTO media (
       id, entity_type, entity_id, r2_key, cf_image_id, alt_text,
       width, height, display_order, is_primary, bytes, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, input.entity_type, input.entity_id, r2Key, input.image_id, input.alt_text,
    input.width ?? null, input.height ?? null, input.display_order, isPrimary,
    input.bytes ?? null, now,
  ).run();

  return rowToMediaPublic({
    id, entity_type: input.entity_type, entity_id: input.entity_id,
    r2_key: r2Key, cf_image_id: input.image_id, alt_text: input.alt_text,
    width: input.width ?? null, height: input.height ?? null,
    display_order: input.display_order, is_primary: isPrimary as 0 | 1,
    bytes: input.bytes ?? null, created_at: now,
  });
}

/** Photos for an entity, ordered display_order ASC then created_at ASC. */
export async function getMediaForEntity(
  env: Env, entityType: string, entityId: string,
): Promise<MediaPublic[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM media
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY display_order ASC, created_at ASC`,
  ).bind(entityType, entityId).all<MediaRow>();
  return (result.results ?? []).map(rowToMediaPublic);
}

/**
 * Delete a media row, but only if the requesting dealer owns the parent
 * entity. Phase 2b3 covered listing rows; Phase 3.3 extends to donor_cars.
 *
 * Implemented as a UNION-shaped query so a single round-trip both verifies
 * ownership and reads cf_image_id. Returns the deleted row's cf_image_id so
 * a future cleanup worker can purge the underlying CF image asset; null when
 * no row matched (not found or not owned).
 */
export async function deleteOwnedMediaById(
  env: Env, mediaId: string, dealerId: string,
): Promise<{ cf_image_id: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.cf_image_id
       FROM media m
       LEFT JOIN listings   l  ON m.entity_type = 'listing'   AND l.id  = m.entity_id
       LEFT JOIN donor_cars dc ON m.entity_type = 'donor_car' AND dc.id = m.entity_id
      WHERE m.id = ?
        AND (
          (m.entity_type = 'listing'   AND l.dealer_id  = ?)
          OR (m.entity_type = 'donor_car' AND dc.dealer_id = ?)
        )
      LIMIT 1`,
  ).bind(mediaId, dealerId, dealerId).first<{ id: string; cf_image_id: string | null }>();
  if (!row) return null;

  await env.DB.prepare(`DELETE FROM media WHERE id = ?`).bind(mediaId).run();
  return { cf_image_id: row.cf_image_id };
}

/** Back-compat alias — pre-Phase-3.3 callers used `deleteListingMediaById`. */
export const deleteListingMediaById = deleteOwnedMediaById;

// ============================================================================
// DONOR CARS — CRUD helpers (Phase 3.3 dashboard)
// ============================================================================

/**
 * Fetch a single donor by id (no status filter). Used by the dashboard edit
 * page and ownership checks in PATCH/DELETE handlers.
 */
export async function getDonorCarById(
  env: Env, id: string,
): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM donor_cars WHERE id = ? LIMIT 1`
  ).bind(id).first<Record<string, unknown>>();
  return row ?? null;
}

export interface DonorCarListRow {
  id: string;
  dealer_id: string;
  slug: string;
  year: number;
  make_id: number;
  model_id: number;
  trim: string | null;
  generation_code: string | null;
  generation_range: string | null;
  city_slug: string;
  color_exterior: string;
  color_exterior_full: string | null;
  tone: string | null;
  color_interior: string | null;
  vin: string | null;
  mileage: number | null;
  engine: string | null;
  transmission: string | null;
  condition: string;
  available_parts_notes: string | null;
  compatible_makes: string | null;
  compatible_models: string | null;
  compatible_years: string | null;
  compatible_trims: string | null;
  price: number | null;
  price_currency: string;
  status: string;
  view_count: number;
  contact_count: number;
  created_at: number;
  updated_at: number;
  make_slug: string | null;
  make_name: string | null;
  model_slug: string | null;
  model_name: string | null;
}

/**
 * List donor cars for a dealer (dashboard). Joins makes + models so the UI
 * can show "2015 Toyota Corolla LE" without an N+1 follow-up.
 */
export async function listDonorsForDealer(
  env: Env, dealerId: string, limit: number,
): Promise<DonorCarListRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      dc.*,
      mk.slug AS make_slug, mk.name AS make_name,
      md.slug AS model_slug, md.name AS model_name
    FROM donor_cars dc
    LEFT JOIN makes  mk ON mk.id = dc.make_id
    LEFT JOIN models md ON md.id = dc.model_id
    WHERE dc.dealer_id = ?
    ORDER BY dc.created_at DESC
    LIMIT ?
  `).bind(dealerId, limit).all<DonorCarListRow>();
  return result.results ?? [];
}

/**
 * Atomic mark-depleted: set both `condition` and `status` to 'depleted'
 * iff the row is not already depleted. Mirrors `markListingSold`.
 * Returns the updated row, or null on conflict (already depleted).
 */
export async function markDonorDepleted(
  env: Env, id: string,
): Promise<Record<string, unknown> | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `UPDATE donor_cars
     SET condition = 'depleted', status = 'depleted', updated_at = ?
     WHERE id = ? AND condition != 'depleted'
     RETURNING *`,
  ).bind(now, id).first<Record<string, unknown>>();
  return row ?? null;
}

// ============================================================================
// REFERENCE TABLES (cached candidates)
// ============================================================================

export async function listActiveCities(env: Env): Promise<City[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM cities WHERE status = 'active' ORDER BY tier ASC, population_cma DESC`
  ).all();
  return (result.results ?? []).map((r) => citySchema.parse(r));
}

export async function listMakes(env: Env): Promise<Make[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM makes WHERE display_order IS NOT NULL ORDER BY display_order ASC`
  ).all();
  return (result.results ?? []).map((r) => makeSchema.parse(r));
}

export async function getMakeBySlug(env: Env, slug: string): Promise<Make | null> {
  const row = await env.DB.prepare(`SELECT * FROM makes WHERE slug = ?`).bind(slug).first();
  return row ? makeSchema.parse(row) : null;
}

export async function getModelByMakeAndSlug(
  env: Env, makeId: number, slug: string,
): Promise<{ id: number; name: string; slug: string } | null> {
  const row = await env.DB.prepare(
    `SELECT id, name, slug FROM models WHERE make_id = ? AND slug = ?`
  ).bind(makeId, slug).first();
  return row ? (row as { id: number; name: string; slug: string }) : null;
}

// ============================================================================
// CITY ALIASES (for edge geolocation)
// ============================================================================

export async function resolveCityAlias(
  env: Env, cityPolitical: string, province: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT cma_slug FROM city_aliases WHERE city_political = ? AND province = ? LIMIT 1`
  ).bind(cityPolitical.toLowerCase(), province).first<{ cma_slug: string }>();
  return row?.cma_slug ?? null;
}

// ============================================================================
// CONTACT REVEALS (anti-scraping audit, ADR-0003)
// ============================================================================

export async function recordContactReveal(
  env: Env, entityType: "listing" | "donor_car" | "dealer",
  entityId: string, ipHash: string, userAgentHash: string | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Increment the counter on the owning entity FIRST. NOTE: the legacy `parts`
  // table was dropped in migration 0005 (donor_cars replaced it); both listings
  // and donor_cars carry a `contact_count` column. When the entity doesn't
  // exist we skip the audit insert entirely, so a sprayed/bogus id can't flood
  // contact_reveals with orphan rows.
  const table = entityType === "donor_car" ? "donor_cars"
    : entityType === "listing" ? "listings" : null;
  if (table) {
    const res = await env.DB.prepare(
      `UPDATE ${table} SET contact_count = contact_count + 1 WHERE id = ?`,
    ).bind(entityId).run();
    if (!res.meta.changes) return;
  }

  await env.DB.prepare(`
    INSERT INTO contact_reveals (id, entity_type, entity_id, ip_hash, user_agent_hash, revealed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), entityType, entityId, ipHash, userAgentHash, now).run();
}

// ============================================================================
// REFRESH TOKENS
// ============================================================================

export async function storeRefreshToken(
  env: Env,
  args: {
    id: string;
    dealerId: string;
    tokenHash: string;
    userAgent: string | null;
    ipAddress: string | null;
    issuedAt: number;
    expiresAt: number;
  },
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO refresh_tokens (id, dealer_id, token_hash, user_agent, ip_address, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    args.id, args.dealerId, args.tokenHash, args.userAgent, args.ipAddress,
    args.issuedAt, args.expiresAt,
  ).run();
}

export async function findActiveRefreshToken(
  env: Env, tokenHash: string,
): Promise<{ id: string; dealer_id: string; expires_at: number; revoked_at: number | null } | null> {
  const row = await env.DB.prepare(`
    SELECT id, dealer_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1
  `).bind(tokenHash).first<{ id: string; dealer_id: string; expires_at: number; revoked_at: number | null }>();
  if (!row || row.revoked_at !== null) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;
  return row;
}

export async function rotateRefreshToken(
  env: Env, oldId: string, newId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    UPDATE refresh_tokens SET revoked_at = ?, rotated_to = ? WHERE id = ?
  `).bind(now, newId, oldId).run();
}

export async function revokeRefreshToken(env: Env, tokenHash: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`
  ).bind(now, tokenHash).run();
}

// ============================================================================
// DONOR CARS (ADR-0008 — junkyard donor car directory)
// ============================================================================

export interface DonorCarDetailRow {
  // donor_cars.*
  id: string;
  dealer_id: string;
  slug: string;
  year: number;
  make_id: number;
  model_id: number;
  trim: string | null;
  generation_code: string | null;
  generation_range: string | null;
  city_slug: string;
  color_exterior: string;
  color_exterior_full: string | null;
  tone: string | null;
  color_interior: string | null;
  vin: string | null;
  mileage: number | null;
  engine: string | null;
  transmission: string | null;
  condition: "fully_available" | "partially_available" | "almost_depleted" | "depleted";
  available_parts_notes: string | null;
  compatible_makes: string | null;
  compatible_models: string | null;
  compatible_years: string | null;
  compatible_trims: string | null;
  price: number | null;
  price_currency: string;
  status: "draft" | "active" | "depleted" | "expired" | "flagged";
  view_count: number;
  contact_count: number;
  created_at: number;
  updated_at: number;
  // joined dealer fields
  dealer_name: string;
  dealer_slug: string;
  dealer_phone: string | null;
  dealer_email: string;
  dealer_website: string | null;
  dealer_address_line1: string | null;
  dealer_address_line2: string | null;
  dealer_city: string;
  dealer_province: string;
  dealer_postal_code: string | null;
  dealer_amvic: string | null;
  dealer_verified: 0 | 1;
  dealer_hours: Array<{ dow: number[]; open: string | null; close: string | null }> | null;
  // joined make/model/city
  make_slug: string;
  make_name: string;
  model_slug: string;
  model_name: string;
  city_name: string;
  city_province: string;
}

/**
 * Fetch a single donor car by slug, joined with its dealer, make, model, and
 * city. Returns null if not found or status is not in (active, depleted) so
 * draft / expired / flagged rows are hidden from public routes.
 *
 * `dealer_hours` is parsed from JSON TEXT into the typed structure here so
 * Pages Function and JSON handler get a consistent shape.
 */
export async function getDonorCarBySlug(
  env: Env, slug: string,
): Promise<DonorCarDetailRow | null> {
  const row = await env.DB.prepare(`
    SELECT
      dc.id, dc.dealer_id, dc.slug, dc.year, dc.make_id, dc.model_id, dc.trim,
      dc.generation_code, dc.generation_range, dc.city_slug,
      dc.color_exterior, dc.color_exterior_full, dc.tone, dc.color_interior,
      dc.vin, dc.mileage, dc.engine, dc.transmission,
      dc.condition, dc.available_parts_notes,
      dc.compatible_makes, dc.compatible_models, dc.compatible_years, dc.compatible_trims,
      dc.price, dc.price_currency, dc.status,
      dc.view_count, dc.contact_count, dc.created_at, dc.updated_at,
      d.name AS dealer_name, d.slug AS dealer_slug,
      d.phone AS dealer_phone, d.email AS dealer_email, d.website AS dealer_website,
      d.address_line1 AS dealer_address_line1, d.address_line2 AS dealer_address_line2,
      d.city AS dealer_city, d.province AS dealer_province, d.postal_code AS dealer_postal_code,
      d.amvic_number AS dealer_amvic, d.verified AS dealer_verified, d.hours AS dealer_hours,
      mk.slug AS make_slug, mk.name AS make_name,
      md.slug AS model_slug, md.name AS model_name,
      ci.name AS city_name, ci.province AS city_province
    FROM donor_cars dc
    JOIN dealers d ON d.id = dc.dealer_id
    JOIN makes mk ON mk.id = dc.make_id
    JOIN models md ON md.id = dc.model_id
    JOIN cities ci ON ci.slug = dc.city_slug
    WHERE dc.slug = ? AND dc.status IN ('active','depleted')
    LIMIT 1
  `).bind(slug).first<Record<string, unknown>>();
  if (!row) return null;

  const raw = row.dealer_hours;
  if (typeof raw === "string" && raw.length > 0) {
    try { row.dealer_hours = JSON.parse(raw); }
    catch { row.dealer_hours = null; }
  } else if (raw === undefined || raw === null) {
    row.dealer_hours = null;
  }

  return row as unknown as DonorCarDetailRow;
}

export interface DonorCardRow {
  id: string;
  slug: string;
  year: number;
  trim: string | null;
  color_exterior: string;
  tone: string | null;
  mileage: number | null;
  transmission: string | null;
  generation_range: string | null;
  condition: string;
  created_at: number;
  dealer_name: string;
  dealer_slug: string;
  city_name: string;
  city_slug: string;
  city_province: string;
  primary_image_cf_id: string | null;
  primary_image_alt: string | null;
  // for the link href: /parts/listing/<slug>/
}

export interface DonorRelatedQuery {
  excludeId: string;
  dealerId?: string;
  modelId?: number;
  citySlug?: string;
  limit: number;
}

/**
 * Active donor cars matching the supplied filters, excluding the current
 * detail-page row. Used for "More <model> donors at this junkyard" and
 * "More <year-range> <model> donors in <city>" sections.
 */
export async function listRelatedDonors(
  env: Env, q: DonorRelatedQuery,
): Promise<DonorCardRow[]> {
  const where: string[] = [`dc.status = 'active'`, `dc.id != ?`];
  const binds: (string | number)[] = [q.excludeId];
  if (q.dealerId) { where.push(`dc.dealer_id = ?`); binds.push(q.dealerId); }
  if (q.modelId) { where.push(`dc.model_id = ?`); binds.push(q.modelId); }
  if (q.citySlug) { where.push(`dc.city_slug = ?`); binds.push(q.citySlug); }
  binds.push(q.limit);

  const result = await env.DB.prepare(`
    SELECT
      dc.id, dc.slug, dc.year, dc.trim, dc.color_exterior, dc.tone,
      dc.mileage, dc.transmission, dc.generation_range,
      dc.condition, dc.created_at,
      d.name AS dealer_name, d.slug AS dealer_slug,
      ci.name AS city_name, ci.slug AS city_slug, ci.province AS city_province,
      m.cf_image_id AS primary_image_cf_id, m.alt_text AS primary_image_alt
    FROM donor_cars dc
    JOIN dealers d ON d.id = dc.dealer_id
    JOIN cities ci ON ci.slug = dc.city_slug
    LEFT JOIN media m
      ON m.entity_type = 'donor_car' AND m.entity_id = dc.id AND m.is_primary = 1
    WHERE ${where.join(' AND ')}
    ORDER BY dc.created_at DESC
    LIMIT ?
  `).bind(...binds).all<DonorCardRow>();
  return result.results ?? [];
}

export interface DonorCityCountRow {
  city_slug: string;
  city_name: string;
  city_province: string;
  count: number;
}

/**
 * Per-city aggregate counts for cross-CMA "Donor cars in other cities" grid.
 * Excludes the city the user is currently looking at.
 */
export async function listDonorCountsByCity(
  env: Env, makeId: number, modelId: number, excludeCity: string,
): Promise<DonorCityCountRow[]> {
  const result = await env.DB.prepare(`
    SELECT
      ci.slug AS city_slug, ci.name AS city_name, ci.province AS city_province,
      COUNT(*) AS count
    FROM donor_cars dc
    JOIN cities ci ON ci.slug = dc.city_slug
    WHERE dc.make_id = ? AND dc.model_id = ?
      AND dc.status = 'active'
      AND dc.city_slug != ?
    GROUP BY ci.slug, ci.name, ci.province
    ORDER BY count DESC, ci.name ASC
    LIMIT 8
  `).bind(makeId, modelId, excludeCity).all<DonorCityCountRow>();
  return result.results ?? [];
}

// Re-exports for typed consumers
export { modelSchema };

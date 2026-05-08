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
  dealerSchema, listingSchema, citySchema, makeSchema, modelSchema,
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
  return dealerSchema.parse(r);
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
  return listingSchema.parse(row);
}

export async function getListingById(env: Env, id: string): Promise<Listing | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM listings WHERE id = ? LIMIT 1`
  ).bind(id).first();
  if (!row) return null;
  return listingSchema.parse(row);
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
  return listingSchema.parse(row);
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
 * listing (the only entity_type wired up in Phase 2b3). Returns the deleted
 * row's cf_image_id so a future cleanup worker can purge the underlying CF
 * image asset; null when no row matched (not found or not owned).
 *
 * NOTE: only `entity_type='listing'` is enforced today. Dealer/part media
 * lands in Phase 3 — extend this JOIN then.
 */
export async function deleteListingMediaById(
  env: Env, mediaId: string, dealerId: string,
): Promise<{ cf_image_id: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.cf_image_id
       FROM media m
       JOIN listings l ON l.id = m.entity_id
      WHERE m.id = ? AND m.entity_type = 'listing' AND l.dealer_id = ?
      LIMIT 1`,
  ).bind(mediaId, dealerId).first<{ id: string; cf_image_id: string | null }>();
  if (!row) return null;

  await env.DB.prepare(`DELETE FROM media WHERE id = ?`).bind(mediaId).run();
  return { cf_image_id: row.cf_image_id };
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
  env: Env, entityType: "listing" | "part" | "dealer",
  entityId: string, ipHash: string, userAgentHash: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    INSERT INTO contact_reveals (id, entity_type, entity_id, ip_hash, user_agent_hash, revealed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, entityType, entityId, ipHash, userAgentHash, now).run();

  // Increment counter on owning entity
  const table = entityType === "dealer" ? null : entityType === "part" ? "parts" : "listings";
  if (table) {
    await env.DB.prepare(
      `UPDATE ${table} SET contact_count = contact_count + 1 WHERE id = ?`
    ).bind(entityId).run();
  }
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

// Re-exports for typed consumers
export { modelSchema };

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
  type Dealer, type Listing, type City, type Make,
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
  primary_image_r2_key: string | null;
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

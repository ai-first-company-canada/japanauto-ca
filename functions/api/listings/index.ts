/**
 * GET  /api/listings  — catalog query
 * POST /api/listings  — create new listing (auth: dealer)
 *
 * GET query params (validated via catalogQuerySchema):
 *   make    (slug)
 *   model   (slug)
 *   city    (slug, must be active CMA)
 *   years   (comma-separated ints, multi-select; optional)
 *   mileage_max (int km; optional)
 *   sort    (newest|price_asc|price_desc; default newest)
 *   page    (int ≥ 1; default 1)
 *   per_page (int 1..50; default 20)
 *
 * GET response 200: CatalogResponse {
 *   featured: FeaturedListing | null,
 *   boosted:  ListingCard[],
 *   organic:  ListingCard[],
 *   pagination: { page, per_page, total, has_more },
 *   filters: { years_available, mileage_buckets },
 * }
 *
 * POST body: ListingCreateInput.
 * POST response 201: { id, slug, status: 'draft' }
 */

import type { Env } from "../../../types/env";
import {
  catalogQuerySchema, listingCreateInputSchema, zodErrorToApiError,
  type ListingCard, type CatalogResponse, type Transmission, type Drivetrain,
  type BrandSlug, type Province, listingYearWindow,
} from "../../../lib/schema";
import {
  json, created, jsonError, badRequest, notFound, conflict, internalError,
  tooManyRequests,
} from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import {
  listCatalog, getActiveFeaturedSlot, getMakeBySlug, getModelByMakeAndSlug,
  getDealerById,
} from "../_lib/db";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";

// ============================================================================
// GET — dealer's own listings (?dealer_id=me) OR catalog query
// ============================================================================
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  // Dealer-scoped query (used by /dealer/dashboard + /dealer/listings).
  // Returns the dealer's own listings regardless of status.
  if (params.get("dealer_id") === "me") {
    const auth = await requireDealer(request, env);
    if (auth instanceof Response) return auth;

    const limitRaw = parseInt(params.get("limit") ?? "100", 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200
      ? limitRaw : 100;

    const result = await env.DB.prepare(`
      SELECT
        l.id, l.slug, l.dealer_id, l.year, l.trim, l.vin,
        l.body_type, l.fuel_type, l.transmission, l.drivetrain,
        l.mileage, l.price, l.price_currency, l.condition, l.negotiable,
        l.city, l.province, l.title, l.description, l.status,
        l.expires_at, l.sold_at, l.view_count, l.contact_count,
        l.created_at, l.updated_at,
        l.make_id, l.model_id,
        mk.slug AS make_slug, mk.name AS make_name,
        md.slug AS model_slug, md.name AS model_name
      FROM listings l
      LEFT JOIN makes mk ON mk.id = l.make_id
      LEFT JOIN models md ON md.id = l.model_id
      WHERE l.dealer_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `).bind(auth.dealerId, limit).all();

    return json({ listings: result.results ?? [] });
  }

  // Coerce & validate query params
  const yearsParam = params.get("years");
  const yearsArr = yearsParam
    ? yearsParam.split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n))
    : undefined;
  const mileageMax = params.get("mileage_max");
  const sort = params.get("sort") ?? "newest";
  const page = parseInt(params.get("page") ?? "1", 10);
  const perPage = parseInt(params.get("per_page") ?? "20", 10);

  const parsed = catalogQuerySchema.safeParse({
    make: params.get("make"),
    model: params.get("model"),
    city: params.get("city"),
    years: yearsArr,
    mileage_max: mileageMax !== null ? parseInt(mileageMax, 10) : undefined,
    sort, page, per_page: perPage,
  });
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const q = parsed.data;

  // Resolve make + model to IDs
  const make = await getMakeBySlug(env, q.make);
  if (!make) return notFound("Make not found");
  const model = await getModelByMakeAndSlug(env, make.id, q.model);
  if (!model) return notFound("Model not found for this make");

  // Run catalog + featured slot in parallel
  const [catalog, featuredRow] = await Promise.all([
    listCatalog(env, {
      makeId: make.id,
      modelId: model.id,
      city: q.city,
      yearsFilter: q.years && q.years.length > 0 ? q.years : null,
      mileageMax: q.mileage_max ?? null,
      sort: q.sort,
      page: q.page,
      perPage: q.per_page,
    }),
    getActiveFeaturedSlot(env, make.id, model.id, q.city),
  ]);

  // Build response
  const r2BaseUrl = `${env.PUBLIC_SITE_URL}/cdn/`;          // placeholder; real URL pattern via Cloudflare Images
  const cards: ListingCard[] = catalog.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    make_slug: q.make as BrandSlug,
    model_slug: q.model,
    trim: row.trim ?? null,
    mileage: row.mileage,
    transmission: (row.transmission ?? null) as Transmission | null,
    drivetrain: (row.drivetrain ?? null) as Drivetrain | null,
    price: row.price,
    city: row.city,
    province: row.province as Province,
    primary_image_url: row.primary_image_r2_key
      ? `${r2BaseUrl}${row.primary_image_r2_key}`
      : null,
    dealer_name: row.dealer_name,
    dealer_slug: row.dealer_slug,
    dealer_amvic: row.dealer_amvic,
    is_boosted: row.tier === 2,
    boost_paid_cents: row.boost_amount,
    is_new_today: row.created_at > Math.floor(Date.now() / 1000) - 86400,
    reduced_by_cents: null,                                  // reserved — populated when price_revisions table lands
    created_at: row.created_at,
  }));

  const response: CatalogResponse = {
    featured: featuredRow ? {
      slot_id: featuredRow.slot_id,
      promo_title: featuredRow.promo_title,
      promo_msrp_cents: featuredRow.promo_msrp_cents,
      promo_image_url: featuredRow.promo_image_id
        ? `${r2BaseUrl}${featuredRow.promo_image_id}`
        : "",
      promo_url: featuredRow.promo_url,
      disclosure: featuredRow.disclosure,
      dealer_name: featuredRow.dealer_name,
    } : null,
    boosted: cards.filter((c) => c.is_boosted),
    organic: cards.filter((c) => !c.is_boosted),
    pagination: {
      page: q.page, per_page: q.per_page, total: catalog.total,
      has_more: q.page * q.per_page < catalog.total,
    },
    filters: {
      years_available: yearsAvailableForWindow(),
      mileage_buckets: [50_000, 100_000, 200_000],
    },
  };

  // Cache catalog for 60s on edge — invalidated by listing create/update via tag.
  const headers = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };
  return json(response, { headers });
};

function yearsAvailableForWindow(): number[] {
  const { min, max } = listingYearWindow();
  const out: number[] = [];
  for (let y = max; y >= min; y--) out.push(y);
  return out;
}

// ============================================================================
// POST — create listing
// ============================================================================
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  // Salvage_yards cannot create cars — they create parts.
  if (auth.dealerType !== "dealer") {
    return jsonError(403, "forbidden", "Only dealers can create car listings; salvage yards use /api/parts");
  }

  // Rate limit by dealer subscription tier
  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return notFound("Dealer not found");
  const rl = await rateLimit(env, auth.dealerId,
    dealer.subscription_tier === "pro" ? RATE_LIMITS.LISTING_CREATE_PRO_TIER : RATE_LIMITS.LISTING_CREATE_FREE_TIER,
  );
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = listingCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const input = parsed.data;

  // Generate id + slug. TODO: wire lib/slug.ts when available;
  // for now build slug from title + 6-char id suffix.
  const id = crypto.randomUUID();
  const slugSuffix = id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const slug = buildListingSlug({
    year: input.year, makeSlug: "", modelSlug: "", trim: input.trim ?? null,
    citySlug: input.city.toLowerCase().replace(/\s+/g, "-"), suffix: slugSuffix,
  });

  const now = Math.floor(Date.now() / 1000);
  const ttlDays = parseInt(env.LISTING_DEFAULT_TTL_DAYS, 10);
  const expiresAt = now + ttlDays * 86400;

  try {
    await env.DB.prepare(`
      INSERT INTO listings (
        id, dealer_id, make_id, model_id, year, trim, vin,
        body_type, fuel_type, transmission, drivetrain, doors, seats,
        engine_displacement, color_exterior, color_interior,
        mileage, condition, price, price_currency, negotiable,
        city, province, slug, title, description,
        status, expires_at, view_count, contact_count, boost_paid_cents,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CAD', ?,
        ?, ?, ?, ?, ?, 'draft', ?, 0, 0, 0, ?, ?
      )
    `).bind(
      id, auth.dealerId, input.make_id, input.model_id, input.year, input.trim ?? null, input.vin,
      input.body_type ?? null, input.fuel_type ?? null, input.transmission ?? null,
      input.drivetrain ?? null, input.doors ?? null, input.seats ?? null,
      input.engine_displacement ?? null, input.color_exterior ?? null, input.color_interior ?? null,
      input.mileage, input.condition, input.price, input.negotiable,
      input.city, input.province, slug, input.title, input.description ?? null,
      expiresAt, now, now,
    ).run();
  } catch (e) {
    if (e instanceof Error && /UNIQUE.*vin/i.test(e.message)) {
      return conflict("A listing with this VIN already exists");
    }
    if (e instanceof Error && /UNIQUE.*slug/i.test(e.message)) {
      return conflict("Slug collision; please retry");
    }
    if (e instanceof Error && /age cap|rolling window/i.test(e.message)) {
      return jsonError(422, "validation_failed", e.message,
        { year: ["Outside the rolling 10-year age cap"] });
    }
    if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
      return jsonError(422, "validation_failed", "Unknown make_id or model_id");
    }
    return internalError("Failed to create listing");
  }

  return created({ id, slug, status: "draft" });
};

interface SlugInput {
  year: number;
  makeSlug: string;
  modelSlug: string;
  trim: string | null;
  citySlug: string;
  suffix: string;
}
function buildListingSlug(s: SlugInput): string {
  const parts = [String(s.year), s.makeSlug, s.modelSlug];
  if (s.trim) parts.push(s.trim.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  parts.push(s.citySlug, s.suffix);
  return parts.filter(Boolean).join("-").replace(/-+/g, "-").replace(/(^-|-$)/g, "").slice(0, 75);
}

/**
 * GET /api/listings/recent
 *
 * Flexible "Latest" feed used by the homepage and dealer profile pages.
 * No make/model required (those go through /api/listings).
 *
 * Query params (all optional):
 *   city      — slug, restricts to a Tier-1 CMA
 *   dealer_id — UUID, restricts to one dealer's inventory
 *   limit     — default 8, max 50
 *
 * Response 200: { listings: ListingCard[] }
 *
 * Public endpoint, no auth. Edge-cached for 60s.
 */

import type { Env } from "../../../types/env";
import type {
  ListingCard, BrandSlug, Province, Transmission, Drivetrain,
} from "../../../lib/schema";
import { json } from "../_lib/response";
import { listRecentListings } from "../_lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  const dealerId = url.searchParams.get("dealer_id");
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "8", 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, 50)
    : 8;

  const rows = await listRecentListings(env, { city, dealerId, limit });

  const hash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? "";
  const cards: ListingCard[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    make_slug: (row.make_slug ?? "") as BrandSlug,
    model_slug: row.model_slug ?? "",
    trim: row.trim ?? null,
    mileage: row.mileage,
    transmission: (row.transmission ?? null) as Transmission | null,
    drivetrain: (row.drivetrain ?? null) as Drivetrain | null,
    price: row.price,
    city: row.city,
    province: row.province as Province,
    primary_image_url: row.primary_image_cf_id && hash
      ? `https://imagedelivery.net/${hash}/${row.primary_image_cf_id}/public`
      : null,
    dealer_name: row.dealer_name,
    dealer_slug: row.dealer_slug,
    dealer_amvic: row.dealer_amvic,
    is_boosted: row.tier === 2,
    boost_paid_cents: row.boost_amount,
    is_new_today: row.created_at > Math.floor(Date.now() / 1000) - 86400,
    reduced_by_cents: null,
    created_at: row.created_at,
  }));

  const headers = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };
  return json({ listings: cards }, { headers });
};

/**
 * GET /api/listings/by-slug/:slug
 *
 * Public listing detail. Returns { listing, photos, dealer, make, model } so
 * the page can render Schema.org markup, breadcrumbs, and the photo gallery
 * without further round-trips.
 *
 * 404 — not found OR status != 'active' (drafts/expired/sold/flagged are
 * hidden from the public catalog).
 *
 * No auth. Edge-cached for 60s with SWR.
 */

import type { Env } from "../../../../types/env";
import { dealerPublicSchema } from "../../../../lib/schema";
import { json, notFound } from "../../_lib/response";
import {
  getListingBySlug, getMediaForEntity, getDealerById,
} from "../../_lib/db";

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ params, env }) => {
  const slug = params.slug as string;
  const listing = await getListingBySlug(env, slug);
  if (!listing) return notFound("Listing not found");
  if (listing.status !== "active") return notFound("Listing not available");

  const [photos, dealer, makeRow, modelRow] = await Promise.all([
    getMediaForEntity(env, "listing", listing.id),
    getDealerById(env, listing.dealer_id),
    env.DB.prepare(`SELECT id, slug, name FROM makes WHERE id = ?`)
      .bind(listing.make_id).first<{ id: number; slug: string; name: string }>(),
    env.DB.prepare(`SELECT id, slug, name FROM models WHERE id = ?`)
      .bind(listing.model_id).first<{ id: number; slug: string; name: string }>(),
  ]);

  if (!dealer || !makeRow || !modelRow) return notFound("Listing not available");

  const headers = { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" };
  return json({
    listing,
    photos,
    dealer: dealerPublicSchema.parse(dealer),
    make: makeRow,
    model: modelRow,
  }, { headers });
};

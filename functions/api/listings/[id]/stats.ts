/**
 * GET /api/listings/:id/stats   (auth: owner)
 *
 * Listing statistics for the dealer cabinet's "Statistics" modal (Feature 1,
 * LAUNCH-PLAN-2026-06): lifetime totals from the entity row + a 30-day daily
 * series from entity_stats_daily (migration 0012). Days with no traffic have
 * no series row — the client renders them as zero.
 *
 * Response 200:
 *   {
 *     totals: { views: number, contacts: number },
 *     status: string,
 *     created_at: number,        // unix seconds — "days on market" basis
 *     sold_at: number | null,
 *     series: Array<{ day: 'YYYY-MM-DD', views: number, contacts: number }>
 *   }
 */

import type { Env } from "../../../../types/env";
import { json, notFound, forbidden } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, getDailyStats } from "../../_lib/db";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  if (listing.dealer_id !== auth.dealerId) return forbidden();

  const series = await getDailyStats(env, "listing", id, 30);
  return json({
    totals: { views: listing.view_count, contacts: listing.contact_count },
    status: listing.status,
    created_at: listing.created_at,
    sold_at: listing.sold_at,
    series,
  });
};

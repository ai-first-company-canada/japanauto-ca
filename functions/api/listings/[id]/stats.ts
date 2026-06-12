/**
 * GET /api/listings/:id/stats   (auth: owner)
 *
 * Listing statistics for the dealer cabinet's "Statistics" modal (Feature 1,
 * LAUNCH-PLAN-2026-06): lifetime totals from the entity row + a 30-day daily
 * series from entity_stats_daily (migration 0012) + the private market block
 * (migration 0016) when the dealer's entitlements include marketAnalytics.
 *
 * The market block is CABINET-ONLY BY DESIGN: marketplace asking prices are
 * systematically below dealer retail and must never surface publicly
 * (owner decision, Feature 1). Donor stats deliberately have no market block.
 *
 * Response 200:
 *   {
 *     totals: { views: number, contacts: number },
 *     status: string,
 *     created_at: number,        // unix seconds — "days on market" basis
 *     sold_at: number | null,
 *     series: Array<{ day: 'YYYY-MM-DD', views: number, contacts: number }>,
 *     market:
 *       | { available: false, reason: 'pro_feature' | 'no_data' }
 *       | {
 *           available: true,
 *           anchor_year: number,           // = listing model year (rows cover year ±1)
 *           listing_bucket: '0-100k' | '100-200k' | '200k+',
 *           price_cents: number,           // the listing's own asking price
 *           computed_on: string | null,    // freshest snapshot date
 *           sources: Array<{
 *             source: string,              // 'marketplace' | 'autotrader' | …
 *             buckets: Array<{
 *               bucket: string, n_active: number,
 *               p25_cents: number | null, p50_cents: number | null, p75_cents: number | null,
 *               n_delisted: number, median_days_listed: number | null,
 *             }>,
 *           }>,
 *         }
 *   }
 */

import type { Env } from "../../../../types/env";
import { json, notFound, forbidden } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, getDailyStats, getDealerById } from "../../_lib/db";
import { getEntitlements } from "../../_lib/entitlements";

interface MarketRow {
  source: string;
  mileage_bucket: string;
  n_active: number;
  price_p25_cents: number | null;
  price_p50_cents: number | null;
  price_p75_cents: number | null;
  n_delisted: number;
  median_days_listed: number | null;
  computed_on: string | null;
}

function mileageBucket(km: number): "0-100k" | "100-200k" | "200k+" {
  if (km < 100_000) return "0-100k";
  if (km < 200_000) return "100-200k";
  return "200k+";
}

const BUCKET_ORDER: Record<string, number> = { "all": 0, "0-100k": 1, "100-200k": 2, "200k+": 3 };

export const onRequestGet: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  if (listing.dealer_id !== auth.dealerId) return forbidden();

  const series = await getDailyStats(env, "listing", id, 30);

  // ---- Private market block (Feature 1 step 3) -----------------------------
  let market:
    | { available: false; reason: "pro_feature" | "no_data" }
    | Record<string, unknown> = { available: false, reason: "no_data" };

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer || !getEntitlements(dealer).marketAnalytics) {
    market = { available: false, reason: "pro_feature" };
  } else try {
    // Resolve catalog slugs; market_stats is keyed on them, not on ids.
    const slugRow = await env.DB.prepare(`
      SELECT mk.slug AS make_slug, md.slug AS model_slug
      FROM makes mk, models md
      WHERE mk.id = ? AND md.id = ?
      LIMIT 1
    `).bind(listing.make_id, listing.model_id).first<{ make_slug: string; model_slug: string }>();

    if (slugRow) {
      const res = await env.DB.prepare(`
        SELECT source, mileage_bucket, n_active,
               price_p25_cents, price_p50_cents, price_p75_cents,
               n_delisted, median_days_listed, computed_on
        FROM market_stats
        WHERE city_slug = ? AND make_slug = ? AND model_slug = ? AND anchor_year = ?
        ORDER BY source, mileage_bucket
      `).bind(
        listing.city.toLowerCase(), slugRow.make_slug, slugRow.model_slug, listing.year,
      ).all<MarketRow>();

      const rows = res.results ?? [];
      if (rows.length > 0) {
        const bySource = new Map<string, MarketRow[]>();
        for (const r of rows) {
          const arr = bySource.get(r.source) ?? [];
          arr.push(r);
          bySource.set(r.source, arr);
        }
        let computedOn: string | null = null;
        for (const r of rows) {
          if (r.computed_on && (!computedOn || r.computed_on > computedOn)) computedOn = r.computed_on;
        }
        market = {
          available: true,
          anchor_year: listing.year,
          listing_bucket: mileageBucket(listing.mileage),
          price_cents: listing.price,
          computed_on: computedOn,
          sources: [...bySource.entries()].map(([source, list]) => ({
            source,
            buckets: list
              .sort((a, b) => (BUCKET_ORDER[a.mileage_bucket] ?? 9) - (BUCKET_ORDER[b.mileage_bucket] ?? 9))
              .map((r) => ({
                bucket: r.mileage_bucket,
                n_active: r.n_active,
                p25_cents: r.price_p25_cents,
                p50_cents: r.price_p50_cents,
                p75_cents: r.price_p75_cents,
                n_delisted: r.n_delisted,
                median_days_listed: r.median_days_listed,
              })),
          })),
        };
      }
    }
  } catch (e) {
    // The market block must never take down base stats (e.g. code deployed
    // before migration 0016 applied — this repo has known journal drift).
    console.error("stats: market block degraded:", e instanceof Error ? e.message : e);
    market = { available: false, reason: "no_data" };
  }

  return json({
    totals: { views: listing.view_count, contacts: listing.contact_count },
    status: listing.status,
    created_at: listing.created_at,
    sold_at: listing.sold_at,
    series,
    market,
  });
};

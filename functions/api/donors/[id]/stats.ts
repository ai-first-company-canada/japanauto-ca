/**
 * GET /api/donors/:id/stats   (auth: owner)
 *
 * Donor-car statistics for the cabinet "Statistics" modal (Feature 1).
 * Same shape as /api/listings/:id/stats; donors have no sold_at — the
 * depleted lifecycle lives in status/condition instead.
 *
 * Response 200:
 *   {
 *     totals: { views: number, contacts: number },
 *     status: string,
 *     created_at: number,
 *     series: Array<{ day: 'YYYY-MM-DD', views: number, contacts: number }>
 *   }
 */

import type { Env } from "../../../../types/env";
import { json, notFound, forbidden } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getDonorCarById, getDailyStats } from "../../_lib/db";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const donor = await getDonorCarById(env, id);
  if (!donor) return notFound();
  if (donor.dealer_id !== auth.dealerId) return forbidden();

  const series = await getDailyStats(env, "donor_car", id, 30);
  return json({
    totals: {
      views: (donor.view_count as number) ?? 0,
      contacts: (donor.contact_count as number) ?? 0,
    },
    status: donor.status,
    created_at: donor.created_at,
    series,
  });
};

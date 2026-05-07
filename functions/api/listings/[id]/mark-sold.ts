/**
 * POST /api/listings/:id/mark-sold
 *
 * Authenticated dealer (owner) only. Atomically sets status='sold' AND
 * sold_at=now in a single UPDATE — replaces Phase 2b2's generic PATCH which
 * silently dropped non-allowlisted fields.
 *
 * Responses:
 *   200 { listing }      — marked sold
 *   401 unauthorized     — no valid jc_access cookie
 *   403 forbidden        — listing belongs to a different dealer
 *   404 not_found        — listing id does not exist
 *   409 conflict         — listing already sold (idempotent guard)
 */

import type { Env } from "../../../../types/env";
import { json, forbidden, notFound, conflict, badRequest } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, markListingSold } from "../../_lib/db";

export const onRequestPost: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const id = params.id as string | undefined;
  if (!id) return badRequest("Missing listing id");

  const listing = await getListingById(env, id);
  if (!listing) return notFound("Listing not found");
  if (listing.dealer_id !== auth.dealerId) return forbidden("Not your listing");
  if (listing.status === "sold") return conflict("Listing already sold");

  const updated = await markListingSold(env, id);
  if (!updated) return conflict("Listing already sold");

  return json({ listing: updated });
};

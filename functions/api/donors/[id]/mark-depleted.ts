/**
 * POST /api/donors/:id/mark-depleted
 *
 * Authenticated dealer (owner) only. Atomically sets condition='depleted' AND
 * status='depleted' in a single UPDATE — mirrors mark-sold.ts.
 *
 * Responses:
 *   200 { donor }       — marked depleted
 *   401 unauthorized    — no valid jc_access cookie
 *   403 forbidden       — donor belongs to a different dealer
 *   404 not_found       — donor id does not exist
 *   409 conflict        — donor already depleted (idempotent guard)
 */

import type { Env } from "../../../../types/env";
import { json, forbidden, notFound, conflict, badRequest } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getDonorCarById, markDonorDepleted } from "../../_lib/db";

export const onRequestPost: PagesFunction<Env, "id"> = async (
  { request, env, params },
) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const id = params.id as string | undefined;
  if (!id) return badRequest("Missing donor id");

  const donor = await getDonorCarById(env, id);
  if (!donor) return notFound("Donor car not found");
  if (donor.dealer_id !== auth.dealerId) return forbidden("Not your donor car");
  if (donor.condition === "depleted") return conflict("Donor car already depleted");

  const updated = await markDonorDepleted(env, id);
  if (!updated) return conflict("Donor car already depleted");

  return json({ donor: updated });
};

/**
 * DELETE /api/media/:id
 *
 * Removes a media row owned by the authenticated dealer (verified through a
 * JOIN against `listings.dealer_id`). The underlying Cloudflare Images asset
 * is NOT deleted here — that's deferred to a Phase 6 cron worker that sweeps
 * orphaned CF images. We log the cf_image_id so the cleanup pass can find them.
 */

import type { Env } from "../../../types/env";
import { noContent, notFound } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { deleteOwnedMediaById } from "../_lib/db";

export const onRequestDelete: PagesFunction<Env, "id"> = async (
  { request, env, params },
) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const id = params.id as string;
  const result = await deleteOwnedMediaById(env, id, auth.dealerId);
  if (!result) return notFound("Media not found or not yours");

  if (result.cf_image_id) {
    console.log(
      `[media-delete] orphaned cf_image_id=${result.cf_image_id} ` +
      `dealer=${auth.dealerId} media=${id} — Phase 6 cron will purge`,
    );
  }
  return noContent();
};

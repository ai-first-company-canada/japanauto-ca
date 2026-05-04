/**
 * POST /api/media/finalize
 *
 * Called after the browser uploads to Cloudflare Images. Persists the row
 * in `media` table and updates entity-specific `is_primary`/order if needed.
 *
 * STATUS: skeleton.
 *
 * Body: { image_id, entity_type, entity_id, alt_text, is_primary, display_order }
 */

import type { Env } from "../../../types/env";
import { notImplemented } from "../_lib/response";
import { requireDealer } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  // TODO:
  //  1. Validate body via mediaUploadInputSchema + image_id.
  //  2. Call Cloudflare Images GET /images/v1/<image_id> to confirm upload.
  //  3. Ownership check (auth.dealerId owns entity_id).
  //  4. INSERT INTO media (...).
  //  5. If is_primary=1: UPDATE media SET is_primary=0 WHERE entity_type=? AND entity_id=? AND id != ?.
  //  6. Return media row.

  return notImplemented("Media finalize — TODO");
};

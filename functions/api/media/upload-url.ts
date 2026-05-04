/**
 * POST /api/media/upload-url
 *
 * Issues a one-time direct-upload URL to Cloudflare Images. The browser
 * uploads to that URL, then calls POST /api/media/finalize with the
 * returned image_id to record the row in `media`.
 *
 * STATUS: skeleton — actual Cloudflare Images integration TODO.
 *
 * Body: { entity_type: 'listing'|'part'|'dealer'|'featured_slot', entity_id, alt_text }
 *
 * Response 200:
 *   {
 *     upload_url: string,    // one-time URL (15 min TTL)
 *     image_id: string,      // returned to client; included in finalize call
 *   }
 */

import type { Env } from "../../../types/env";
import { mediaUploadInputSchema, zodErrorToApiError } from "../../../lib/schema";
import { jsonError, notImplemented, badRequest } from "../_lib/response";
import { requireDealer } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = mediaUploadInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // TODO: ownership check — verify auth.dealerId owns the parsed.data.entity_id row.
  // TODO: call Cloudflare Images Direct Upload endpoint:
  //   POST https://api.cloudflare.com/client/v4/accounts/<account>/images/v2/direct_upload
  //   with bearer token from env. Returns { uploadURL, id }.
  // TODO: insert pending media row to D1 (or hold until finalize).

  return notImplemented(
    "Cloudflare Images direct-upload integration — TODO. " +
    "Reference: https://developers.cloudflare.com/images/upload-images/direct-creator-upload/"
  );
};

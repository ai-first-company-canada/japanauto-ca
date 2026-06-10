/**
 * POST /api/media/upload-url
 *
 * Authenticated dealer mints a one-time Cloudflare Images Direct Creator
 * Upload URL. The browser then PUTs the file directly to CF (server is not
 * in the upload path), and finalises by calling POST /api/media/finalize
 * with the returned `image_id`.
 *
 * Body: { entity_type: 'listing', entity_id: string }
 *   (entity_id is verified — listing must belong to the authenticated dealer)
 *
 * Response 200:
 *   {
 *     upload_url: string,   // one-time, ~30 min TTL on CF side
 *     image_id:   string,   // pass back to /finalize
 *   }
 *
 * Errors:
 *   401 — missing/expired auth
 *   403 — entity belongs to a different dealer
 *   404 — entity not found
 *   422 — invalid body
 *   500 — Cloudflare Images config missing or upstream API error
 *
 * Reference:
 *   https://developers.cloudflare.com/images/upload-images/direct-creator-upload/
 */

import type { Env } from "../../../types/env";
import { mediaUploadInputSchema, zodErrorToApiError } from "../../../lib/schema";
import {
  json, jsonError, badRequest, notFound, forbidden, internalError, tooManyRequests,
} from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";
import { getListingById, getDonorCarById, recordPendingUpload } from "../_lib/db";

interface CfDirectUploadResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: { id: string; uploadURL: string };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  // Cap how many billable CF Images direct-upload URLs one dealer can mint per
  // hour. Without this, any authenticated dealer can mint URLs in a loop and
  // balloon the account's CF Images usage. Keyed by dealer, checked before any
  // DB lookup so abuse is cheap to reject.
  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.MEDIA_UPLOAD_URL_PER_DEALER);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = mediaUploadInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const { entity_type, entity_id } = parsed.data;

  // Phase 2b3 wired listings; Phase 3.3 added donor_cars. dealer + featured_slot
  // upload paths still pending — they need handler-side ownership checks too.
  if (entity_type === "listing") {
    const listing = await getListingById(env, entity_id);
    if (!listing) return notFound("Listing not found");
    if (listing.dealer_id !== auth.dealerId) {
      return forbidden("Cannot attach media to another dealer's listing");
    }
  } else if (entity_type === "donor_car") {
    const donor = await getDonorCarById(env, entity_id);
    if (!donor) return notFound("Donor car not found");
    if (donor.dealer_id !== auth.dealerId) {
      return forbidden("Cannot attach media to another dealer's donor car");
    }
  } else {
    return jsonError(422, "validation_failed",
      `entity_type='${entity_type}' upload not yet wired`);
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_IMAGES_API_TOKEN;
  if (!accountId || !apiToken) {
    return internalError(
      "Cloudflare Images not configured — set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_IMAGES_API_TOKEN",
    );
  }

  // Cloudflare expects multipart/form-data even when no fields are sent. We
  // tag the upload with the minting dealer + target entity (metadata) so
  // orphaned uploads can be attributed for cleanup/billing, and cap the mint
  // window with `expiry` (audit #15). `requireSignedURLs` is intentionally left
  // off: public delivery via imagedelivery.net/<hash>/<id>/<variant> is the
  // current product model — flipping it to signed URLs is a deliberate product
  // change (every <img> would need a signing token), tracked separately.
  const fd = new FormData();
  fd.append("metadata", JSON.stringify({
    dealerId: auth.dealerId, entity_type, entity_id,
  }));
  fd.append("expiry", new Date(Date.now() + 30 * 60 * 1000).toISOString());

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}` },
      body: fd,
    },
  );

  if (!cfRes.ok) {
    const errText = await cfRes.text();
    console.error("CF Images direct_upload non-2xx", cfRes.status, errText);
    return internalError("Image upload setup failed");
  }

  const cfData = await cfRes.json() as CfDirectUploadResponse;
  if (!cfData.success || !cfData.result) {
    console.error("CF Images direct_upload error", cfData.errors);
    return internalError("Image upload setup failed");
  }

  // Bind this image_id to the minting dealer + entity so finalize can verify
  // the caller actually minted it (audit #14). If this write fails the dealer
  // could never finalize the upload, so surface it rather than returning a
  // URL that leads to a dead end.
  try {
    await recordPendingUpload(env, {
      image_id: cfData.result.id,
      dealer_id: auth.dealerId,
      entity_type,
      entity_id,
    });
  } catch (e) {
    console.error("recordPendingUpload failed", e);
    return internalError("Image upload setup failed");
  }

  return json({
    upload_url: cfData.result.uploadURL,
    image_id: cfData.result.id,
  });
};

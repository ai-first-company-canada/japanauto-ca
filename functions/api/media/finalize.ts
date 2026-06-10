/**
 * POST /api/media/finalize
 *
 * Confirms a successful Cloudflare Images upload and creates the matching row
 * in the `media` table. Called by the browser after PUT-ing the file to the
 * one-time upload URL returned by /api/media/upload-url.
 *
 * Body (mediaFinalizeInputSchema):
 *   {
 *     entity_type: 'listing',
 *     entity_id:   string,
 *     image_id:    string,            // Cloudflare Images id from /upload-url
 *     alt_text:    string,
 *     display_order?: number,
 *     is_primary?:    boolean,
 *     width?: number, height?: number, bytes?: number,
 *   }
 *
 * Response 201: { media: MediaPublic }
 *
 * Errors:
 *   401 / 403 / 404 / 422 — same semantics as /upload-url
 *
 * The client-supplied `image_id` is NOT trusted on its own: image_ids are a
 * public segment of the delivery URL, so we verify against a pending-upload
 * claim recorded at mint time (consumePendingUpload) that THIS dealer minted
 * THIS image_id for THIS entity. The claim is consumed atomically, so it is
 * also single-use. (Audit #14.)
 */

import type { Env } from "../../../types/env";
import {
  mediaFinalizeInputSchema, zodErrorToApiError, LIMITS,
} from "../../../lib/schema";
import {
  created, jsonError, badRequest, notFound, forbidden,
} from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import {
  getListingById, getDonorCarById, createMedia, consumePendingUpload,
} from "../_lib/db";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = mediaFinalizeInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const input = parsed.data;

  if (input.entity_type === "listing") {
    const listing = await getListingById(env, input.entity_id);
    if (!listing) return notFound("Listing not found");
    if (listing.dealer_id !== auth.dealerId) {
      return forbidden("Cannot attach media to another dealer's listing");
    }
  } else if (input.entity_type === "donor_car") {
    const donor = await getDonorCarById(env, input.entity_id);
    if (!donor) return notFound("Donor car not found");
    if (donor.dealer_id !== auth.dealerId) {
      return forbidden("Cannot attach media to another dealer's donor car");
    }
  } else {
    return jsonError(422, "validation_failed",
      `entity_type='${input.entity_type}' finalize not yet wired`);
  }

  // Enforce the per-entity photo cap (was defined in the schema but never
  // checked — a dealer could attach unlimited media rows to their own entity).
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM media WHERE entity_type = ? AND entity_id = ?`,
  ).bind(input.entity_type, input.entity_id).first<{ n: number }>();
  if ((countRow?.n ?? 0) >= LIMITS.PHOTOS_PER_LISTING_MAX) {
    return jsonError(422, "validation_failed",
      `Maximum ${LIMITS.PHOTOS_PER_LISTING_MAX} photos allowed per listing`);
  }

  // Verify (and atomically consume) the mint-time claim: this dealer minted
  // this image_id for this entity. Done after the non-destructive cap check so
  // a cap rejection doesn't burn a valid claim. (Audit #14.)
  const claimed = await consumePendingUpload(env, {
    image_id: input.image_id,
    dealer_id: auth.dealerId,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
  });
  if (!claimed) {
    return forbidden("Unknown or already-finalized image_id for this dealer and entity");
  }

  const media = await createMedia(env, input);
  return created({ media });
};

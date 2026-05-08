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
 * Note: we trust the client-supplied `image_id` because direct uploads are
 * authenticated by the one-time URL (15-30 min TTL, single use). The browser
 * cannot mint URLs for arbitrary image_ids without going through /upload-url.
 */

import type { Env } from "../../../types/env";
import {
  mediaFinalizeInputSchema, zodErrorToApiError,
} from "../../../lib/schema";
import {
  created, jsonError, badRequest, notFound, forbidden,
} from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getListingById, getDonorCarById, createMedia } from "../_lib/db";

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

  const media = await createMedia(env, input);
  return created({ media });
};

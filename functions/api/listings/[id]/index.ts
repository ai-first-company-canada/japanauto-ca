/**
 * GET    /api/listings/:id
 * PATCH  /api/listings/:id   (auth: owner)
 * DELETE /api/listings/:id   (auth: owner) — sets status='expired', not row deletion
 *
 * NOTE on identifier: `id` here is the dealer-facing UUID. Public-facing pages
 * use slug — see GET /api/listings/by-slug/:slug (separate endpoint, TODO).
 */

import type { Env } from "../../../../types/env";
import {
  listingUpdateInputSchema, zodErrorToApiError, listingSchema,
} from "../../../../lib/schema";
import {
  json, jsonError, notFound, forbidden, badRequest, internalError, noContent, conflict,
} from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, getMediaForEntity } from "../../_lib/db";
import { pingIndexNow } from "../../_lib/indexnow";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ request, params, env }) => {
  const id = params.id as string;
  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  // Public callers may read only active listings. draft/sold/expired/flagged
  // rows — and their internal fields (flagged_reason, boost_*, dealer_id,
  // expires_at) — are owner-only (audit #35: anonymous BAC/IDOR otherwise).
  if (listing.status !== "active") {
    const auth = await requireDealer(request, env);
    if (auth instanceof Response) return auth;
    if (listing.dealer_id !== auth.dealerId) return forbidden();
  }
  const photos = await getMediaForEntity(env, "listing", id);
  return json({ listing, photos });
};

export const onRequestPatch: PagesFunction<Env, "id"> = async (ctx) => {
  const { request, env, params } = ctx;
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getListingById(env, id);
  if (!existing) return notFound();
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = listingUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // Build dynamic UPDATE — only include keys present in the patch.
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return json({ listing: existing });

  const setCols = fields.map(([k]) => `${k} = ?`);
  const values: unknown[] = fields.map(([, v]) => v ?? null);

  // Keep sold_at consistent with status transitions. /mark-sold is the primary
  // path, but a direct PATCH of `status` must not leave sold_at out of sync —
  // the Schema.org SoldOut window and "sold N days ago" copy depend on it.
  const nextStatus = parsed.data.status;
  if (nextStatus === "sold" && existing.status !== "sold") {
    setCols.push("sold_at = ?");
    values.push(Math.floor(Date.now() / 1000));
  } else if (nextStatus !== undefined && nextStatus !== "sold" && existing.sold_at !== null) {
    setCols.push("sold_at = NULL");
  }

  const setClause = setCols.join(", ");

  try {
    await env.DB.prepare(
      `UPDATE listings SET ${setClause} WHERE id = ?`
    ).bind(...values, id).run();
  } catch (e) {
    if (e instanceof Error && /UNIQUE.*vin/i.test(e.message)) {
      return conflict("VIN already in use by another listing");
    }
    if (e instanceof Error && /age cap|rolling window/i.test(e.message)) {
      return jsonError(422, "validation_failed", e.message,
        { year: ["Outside the rolling 10-year age cap"] });
    }
    return internalError("Failed to update listing");
  }

  const updated = await getListingById(env, id);

  // Notify IndexNow when the listing is publicly indexable. Captures status
  // transitions into 'active' and updates to already-active listings.
  if (updated?.status === "active") {
    ctx.waitUntil(pingIndexNow(env, [`${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/used-cars/listing/${updated.slug}/`]));
  }

  return json({ listing: updated });
};

/**
 * Soft delete: set status='expired'. Real DELETE would break Schema.org
 * SoldOut window (listing-lifecycle.md). Use sold endpoint to mark sold.
 */
export const onRequestDelete: PagesFunction<Env, "id"> = async (ctx) => {
  const { request, env, params } = ctx;
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getListingById(env, id);
  if (!existing) return notFound();
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  await env.DB.prepare(
    `UPDATE listings SET status = 'expired' WHERE id = ?`
  ).bind(id).run();

  // Ping IndexNow so engines re-crawl and pick up the expired state.
  ctx.waitUntil(pingIndexNow(env, [`${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/used-cars/listing/${existing.slug}/`]));

  return noContent();
};

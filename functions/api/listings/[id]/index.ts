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
import { getListingById } from "../../_lib/db";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ params, env }) => {
  const id = params.id as string;
  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  return json({ listing });
};

export const onRequestPatch: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
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

  const setClause = fields.map(([k]) => `${k} = ?`).join(", ");
  const values = fields.map(([, v]) => v ?? null);

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
  return json({ listing: updated });
};

/**
 * Soft delete: set status='expired'. Real DELETE would break Schema.org
 * SoldOut window (listing-lifecycle.md). Use sold endpoint to mark sold.
 */
export const onRequestDelete: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getListingById(env, id);
  if (!existing) return notFound();
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  await env.DB.prepare(
    `UPDATE listings SET status = 'expired' WHERE id = ?`
  ).bind(id).run();

  return noContent();
};

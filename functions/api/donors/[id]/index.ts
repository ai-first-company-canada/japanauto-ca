/**
 * GET    /api/donors/:id   — fetch single donor (auth required for draft, public for active/depleted)
 * PATCH  /api/donors/:id   — update donor (auth: owner only)
 * DELETE /api/donors/:id   — soft-delete (sets status='expired'; auth: owner only)
 *
 * `id` is the donor_cars.id UUID — the public-facing route uses slug, served
 * by the separate /api/donors/by-slug/:slug handler.
 *
 * PATCH does NOT permit setting condition='depleted' or status='depleted' —
 * use POST /api/donors/:id/mark-depleted for atomic transition.
 */

import type { Env } from "../../../../types/env";
import {
  donorCarUpdateInputSchema, zodErrorToApiError,
} from "../../../../lib/schema";
import {
  json, jsonError, notFound, forbidden, badRequest, internalError, noContent,
} from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getDonorCarById, getMediaForEntity } from "../../_lib/db";

export const onRequestGet: PagesFunction<Env, "id"> = async (
  { request, env, params },
) => {
  const id = params.id as string;
  const donor = await getDonorCarById(env, id);
  if (!donor) return notFound("Donor car not found");

  // Draft rows are owner-only. Other statuses are public.
  if (donor.status === "draft") {
    const auth = await requireDealer(request, env);
    if (auth instanceof Response) return auth;
    if (donor.dealer_id !== auth.dealerId) return forbidden();
  }

  const photos = await getMediaForEntity(env, "donor_car", id);
  return json({ donor, photos });
};

export const onRequestPatch: PagesFunction<Env, "id"> = async (
  { request, env, params },
) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getDonorCarById(env, id);
  if (!existing) return notFound("Donor car not found");
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = donorCarUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const data = parsed.data;

  // mark-depleted is the only path to depleted state.
  if (data.condition === "depleted" || data.status === "depleted") {
    return jsonError(422, "validation_failed",
      "Use POST /api/donors/:id/mark-depleted to mark donors depleted",
      { condition: ["Mark depleted via the dedicated endpoint"] });
  }

  // Build dynamic UPDATE — only include keys present in the patch.
  const fields = Object.entries(data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    const refreshed = await getDonorCarById(env, id);
    return json({ donor: refreshed });
  }

  const compatibleKeys = new Set([
    "compatible_makes", "compatible_models", "compatible_years", "compatible_trims",
  ]);
  const setClause = fields.map(([k]) => `${k} = ?`).join(", ");
  const values = fields.map(([k, v]) => {
    if (v === null || v === undefined) return null;
    if (compatibleKeys.has(k) && Array.isArray(v)) return JSON.stringify(v);
    return v as string | number;
  });

  try {
    await env.DB.prepare(
      `UPDATE donor_cars SET ${setClause} WHERE id = ?`,
    ).bind(...values, id).run();
  } catch (e) {
    if (e instanceof Error && /CHECK constraint/i.test(e.message)) {
      return jsonError(422, "validation_failed", e.message);
    }
    if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
      return jsonError(422, "validation_failed",
        "Unknown make_id, model_id, or city_slug",
      );
    }
    return internalError("Failed to update donor car");
  }

  const updated = await getDonorCarById(env, id);
  return json({ donor: updated });
};

/**
 * Soft delete: status='expired'. Real DELETE would lose history of donor cars
 * that have already been picked apart (legal/liability paper trail).
 */
export const onRequestDelete: PagesFunction<Env, "id"> = async (
  { request, env, params },
) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getDonorCarById(env, id);
  if (!existing) return notFound("Donor car not found");
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  await env.DB.prepare(
    `UPDATE donor_cars SET status = 'expired' WHERE id = ?`,
  ).bind(id).run();

  return noContent();
};

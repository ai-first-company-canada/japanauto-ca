/**
 * GET   /api/dealers/me  — return authenticated dealer's full profile
 * PATCH /api/dealers/me  — update profile (cross-field AMVIC rule re-applied)
 */

import type { Env } from "../../../types/env";
import { dealerUpdateInputSchema, zodErrorToApiError, dealerPublicSchema } from "../../../lib/schema";
import { json, jsonError, badRequest, internalError, notFound, conflict } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getDealerById } from "../_lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return notFound();
  return json({ dealer: dealerPublicSchema.parse(dealer) });
};

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = dealerUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    const dealer = await getDealerById(env, auth.dealerId);
    return json({ dealer: dealerPublicSchema.parse(dealer!) });
  }

  const setClause = fields.map(([k]) => `${k} = ?`).join(", ");
  const values = fields.map(([k, v]) => {
    if (v === null || v === undefined) return null;
    // hours stored as JSON TEXT
    if (k === "hours") return JSON.stringify(v);
    return v;
  });

  try {
    await env.DB.prepare(
      `UPDATE dealers SET ${setClause} WHERE id = ?`
    ).bind(...values, auth.dealerId).run();
  } catch (e) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return conflict("Slug or email already in use");
    }
    return internalError("Failed to update dealer profile");
  }

  const updated = await getDealerById(env, auth.dealerId);
  return json({ dealer: dealerPublicSchema.parse(updated!) });
};

/**
 * GET   /api/dealers/me  — return authenticated dealer's full profile
 * PATCH /api/dealers/me  — update profile (cross-field AMVIC rule re-applied)
 */

import type { Env } from "../../../types/env";
import { dealerUpdateInputSchema, zodErrorToApiError, dealerSelfSchema } from "../../../lib/schema";
import { json, jsonError, badRequest, internalError, notFound, conflict } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getDealerById } from "../_lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return notFound();
  return json({ dealer: dealerSelfSchema.parse(dealer) });
};

/**
 * Columns a dealer may change about THEMSELVES. dealerUpdateInputSchema derives
 * from dealerBaseFields, which also contains `type`, `slug`, and `email` —
 * role/identity columns that must NOT be self-mutable: `type` partitions which
 * inventory APIs the account can use, `email` is the unique login identifier
 * (changing it while keeping verified=1 decouples the verified identity from
 * the real login), `slug` is the public URL. They go through an admin/support
 * flow (email additionally needs re-verification). Without this allowlist the
 * handler builds a fully dynamic UPDATE from every parsed key (audit #13).
 */
const MUTABLE_COLUMNS = new Set([
  "name", "phone", "website", "description",
  "address_line1", "address_line2", "city", "province", "postal_code",
  "lat", "lng", "business_number", "gst_number", "amvic_number",
  "hours", "specializes_in", "bio", "founded_year",
]);

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

  const fields = Object.entries(parsed.data)
    .filter(([k, v]) => v !== undefined && MUTABLE_COLUMNS.has(k));
  if (fields.length === 0) {
    const dealer = await getDealerById(env, auth.dealerId);
    return json({ dealer: dealerSelfSchema.parse(dealer!) });
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
  return json({ dealer: dealerSelfSchema.parse(updated!) });
};

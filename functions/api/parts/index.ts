/**
 * GET  /api/parts         — search parts
 * POST /api/parts         — create new part (auth: salvage_yard only)
 *
 * STATUS: skeleton — full implementation pending parts-compatibility.md finalisation.
 * Validates input via partCreateInputSchema; DB writes return 501 with TODO.
 */

import type { Env } from "../../../types/env";
import { partCreateInputSchema, zodErrorToApiError } from "../../../lib/schema";
import { json, jsonError, badRequest, notImplemented } from "../_lib/response";
import { requireDealer } from "../_lib/auth";

export const onRequestGet: PagesFunction<Env> = async () => {
  // TODO: implement search by category + compatible make/model/year + city.
  // Catalog query analog to listings but with JSON filter on compatible_* fields.
  return notImplemented("Parts catalog query — TODO post-MVP-listings");
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  if (auth.dealerType !== "salvage_yard") {
    return jsonError(403, "forbidden",
      "Only salvage_yard accounts can create parts; dealers create listings");
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = partCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // TODO: insert into parts table; generate slug per slug-format.md (parts variant).
  return notImplemented("Parts CRUD — pending parts-compatibility.md finalisation");
};

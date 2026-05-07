/**
 * GET /api/models?make_id=<int>
 *
 * Returns models for a given make_id. Used by ListingForm dropdowns —
 * dealers must select from real models so the listings.model_id FK resolves.
 *
 * Caches 24h on edge — model whitelist is essentially static.
 */

import type { Env } from "../../../types/env";
import { json, badRequest } from "../_lib/response";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const makeIdRaw = url.searchParams.get("make_id");
  const makeId = makeIdRaw ? parseInt(makeIdRaw, 10) : NaN;
  if (!Number.isInteger(makeId) || makeId <= 0) {
    return badRequest("make_id query param required");
  }

  const result = await env.DB.prepare(`
    SELECT id, make_id, name, slug, year_start, year_end
    FROM models
    WHERE make_id = ?
    ORDER BY name ASC
  `).bind(makeId).all();

  return json({ models: result.results ?? [] }, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
};

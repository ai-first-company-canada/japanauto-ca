/**
 * GET /api/makes
 *
 * Returns the 9-brand whitelist in commercial weight order.
 * Used by:
 *  - homepage 3×3 brand grid
 *  - filters / dropdowns
 *  - sitemap generation
 *
 * Caches 24 hours on edge — whitelist is essentially static.
 */

import type { Env } from "../../types/env";
import { json } from "./_lib/response";
import { listMakes } from "./_lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const makes = await listMakes(env);
  return json({ makes }, {
    headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
};

/**
 * GET /api/cities
 *
 * Returns active CMAs (Tier 1 on launch). Used by:
 *  - choose-city UI on homepage
 *  - city dropdown in dealer signup form
 *  - sitemap generation
 *
 * Caches 1 hour on edge — list rarely changes.
 */

import type { Env } from "../../types/env";
import { json } from "./_lib/response";
import { listActiveCities } from "./_lib/db";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const cities = await listActiveCities(env);
  return json({ cities }, {
    headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
};

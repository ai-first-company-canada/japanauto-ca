/**
 * GET /api/dealers/:slug
 *
 * Public dealer profile. Returns DealerPublic (omits password_hash, stripe ids).
 * Used by /dealers/:slug pages.
 *
 * Errors:
 *   404 not_found
 */

import type { Env } from "../../../types/env";
import { dealerPublicSchema } from "../../../lib/schema";
import { json, notFound } from "../_lib/response";
import { getDealerBySlug } from "../_lib/db";

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ params, env }) => {
  const slug = params.slug as string;
  const dealer = await getDealerBySlug(env, slug);
  if (!dealer) return notFound();

  // Cache 5 min on edge — invalidated by dealer profile updates via tag (Phase 2).
  const headers = { "cache-control": "public, s-maxage=300, stale-while-revalidate=900" };
  return json({ dealer: dealerPublicSchema.parse(dealer) }, { headers });
};

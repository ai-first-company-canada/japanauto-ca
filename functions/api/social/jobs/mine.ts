/**
 * GET /api/social/jobs/mine   (auth: dealer)
 *
 * The dealer's social-boost jobs, newest first — drives the per-listing
 * promotion status + published links in the cabinet. result_links is stored
 * as JSON TEXT; parsed here.
 */

import type { Env } from "../../../../types/env";
import { json } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";

interface JobRow {
  id: string;
  listing_id: string;
  status: string;
  result_links: string | null;
  requested_at: number;
  published_at: number | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const res = await env.DB.prepare(`
    SELECT id, listing_id, status, result_links, requested_at, published_at
    FROM social_boost_jobs
    WHERE dealer_id = ?
    ORDER BY requested_at DESC
    LIMIT 100
  `).bind(auth.dealerId).all<JobRow>();

  const jobs = (res.results ?? []).map((j) => {
    let links: string[] = [];
    if (j.result_links) {
      try { const v = JSON.parse(j.result_links); if (Array.isArray(v)) links = v; }
      catch { /* leave empty */ }
    }
    return { ...j, result_links: links };
  });

  return json({ jobs });
};

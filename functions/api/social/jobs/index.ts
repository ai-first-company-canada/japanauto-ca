/**
 * GET /api/social/jobs?status=requested&limit=20   (auth: factory token)
 *
 * Pull endpoint for the external content factory: lists jobs in the given
 * status (default 'requested') with their listing snapshots, oldest first.
 * The factory claims a job by PATCHing it to 'in_production', publishes,
 * then PATCHes 'published' + result_links. Contract:
 * docs/architecture/social-boost.md.
 */

import type { Env } from "../../../../types/env";
import { json, badRequest } from "../../_lib/response";
import { requireFactory } from "../../_lib/factory-auth";

interface JobRow {
  id: string;
  listing_id: string;
  status: string;
  payload: string;
  requested_at: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = await requireFactory(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "requested";
  if (status !== "requested" && status !== "in_production") {
    return badRequest("status must be 'requested' or 'in_production'");
  }
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

  const res = await env.DB.prepare(`
    SELECT id, listing_id, status, payload, requested_at
    FROM social_boost_jobs
    WHERE status = ?
    ORDER BY requested_at ASC
    LIMIT ?
  `).bind(status, limit).all<JobRow>();

  const jobs = (res.results ?? []).map((j) => {
    let payload: unknown = null;
    try { payload = JSON.parse(j.payload); } catch { /* surface null */ }
    return { id: j.id, listing_id: j.listing_id, status: j.status, requested_at: j.requested_at, payload };
  });

  return json({ jobs });
};

/**
 * PATCH /api/social/jobs/:id   (auth: factory token)
 *
 * The content factory advances a job through its lifecycle:
 *   requested      -> in_production | cancelled
 *   in_production  -> published | cancelled
 * 'published' requires result_links (the published post URLs) — they surface
 * in the dealer's cabinet. Terminal states are immutable (409 on any further
 * transition). The factory cancels a job itself when the listing went
 * sold/expired before publication (it must check listing_url is live first —
 * see docs/architecture/social-boost.md).
 */

import type { Env } from "../../../../types/env";
import { socialJobPatchSchema, zodErrorToApiError } from "../../../../lib/schema";
import { json, jsonError, badRequest, notFound, conflict } from "../../_lib/response";
import { requireFactory } from "../../_lib/factory-auth";

const LEGAL: Record<string, readonly string[]> = {
  requested: ["in_production", "cancelled"],
  in_production: ["published", "cancelled"],
  published: [],
  cancelled: [],
};

export const onRequestPatch: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const denied = await requireFactory(request, env);
  if (denied) return denied;
  const id = params.id as string;

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = socialJobPatchSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const { status, result_links } = parsed.data;

  const job = await env.DB.prepare(
    `SELECT id, status FROM social_boost_jobs WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; status: string }>();
  if (!job) return notFound("Job not found");
  if (!(LEGAL[job.status] ?? []).includes(status)) {
    return conflict(`Cannot move job from '${job.status}' to '${status}'`);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`
    UPDATE social_boost_jobs
    SET status = ?,
        result_links = ?,
        published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END,
        updated_at = ?
    WHERE id = ?
  `).bind(
    status,
    result_links ? JSON.stringify(result_links) : null,
    status, now, now, id,
  ).run();

  return json({ job: { id, status, result_links: result_links ?? [], updated_at: now } });
};

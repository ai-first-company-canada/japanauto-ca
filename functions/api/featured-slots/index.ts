/**
 * POST /api/featured-slots  — Admin only (B2B contract creation)
 *
 * STATUS: skeleton — admin role + B2B contract flow TODO.
 *
 * Featured slots are sold via direct sales (not self-serve), so creation
 * is gated to admin role. On MVP this endpoint stays 501 until admin
 * dashboard / sales tooling lands.
 *
 * Reference: ADR-0007 monetization layer 1 (featured slots, $500-1500/mo CAD).
 */

import type { Env } from "../../../types/env";
import { featuredSlotCreateInputSchema, zodErrorToApiError } from "../../../lib/schema";
import { jsonError, notImplemented, badRequest, forbidden } from "../_lib/response";
import { requireDealer } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  // TODO: admin role check. On MVP the role concept doesn't exist (all dealers
  // are equal). Phase 2 introduces an `is_admin` flag on dealers or separate
  // `admin_users` table.
  return forbidden("Featured slot creation is admin-only and not exposed on MVP");

  // When unblocked:
  // const body = await request.json();
  // const parsed = featuredSlotCreateInputSchema.safeParse(body);
  // if (!parsed.success) { ... }
  // INSERT INTO featured_slots (...) VALUES (...);
};

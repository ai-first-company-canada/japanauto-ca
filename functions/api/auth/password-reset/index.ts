/**
 * POST /api/auth/password-reset — request a reset e-mail (still 501).
 *
 * No e-mail service yet: reset tokens are minted by the ADMIN panel
 * ("Generate reset link") and handed to the dealer by the operator. The
 * live consume path is the sibling ./confirm.ts. Anti-enumeration: the
 * 501 carries no hint whether the e-mail exists.
 */

import type { Env } from "../../../../types/env";
import { passwordResetRequestSchema, zodErrorToApiError } from "../../../../lib/schema";
import { jsonError, badRequest, notImplemented } from "../../_lib/response";

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  return notImplemented("Password reset by email is not available yet — contact support@japanauto.ca");
};

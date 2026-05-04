/**
 * POST /api/auth/verify-email
 *
 * Confirms an email-verification token. On success: dealers.verified = 1.
 *
 * STATUS: skeleton.
 *
 * Body: { token: string }
 */

import type { Env } from "../../../types/env";
import { emailVerifyInputSchema, zodErrorToApiError } from "../../../lib/schema";
import { jsonError, badRequest, notImplemented } from "../_lib/response";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = emailVerifyInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // TODO:
  //  1. Hash token, look up in verification_tokens (purpose='email_verify').
  //  2. UPDATE dealers SET verified = 1 WHERE id = ?.
  //  3. Mark token consumed_at.

  return notImplemented("Email verify — TODO");
};

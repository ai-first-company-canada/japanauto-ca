/**
 * POST /api/auth/password-reset/request   — request reset email
 * POST /api/auth/password-reset/confirm   — confirm with token, set new password
 *
 * STATUS: skeleton — Resend integration + token table queries TODO.
 *
 * Both endpoints return 204 even when the email is unknown (no enumeration).
 * Tokens are stored in `verification_tokens (purpose='password_reset')`,
 * expire in 1 hour, single-use (consumed_at set on confirm).
 */

import type { Env } from "../../../types/env";
import {
  passwordResetRequestSchema, passwordResetConfirmSchema, zodErrorToApiError,
} from "../../../lib/schema";
import { json, jsonError, badRequest, noContent, notImplemented } from "../_lib/response";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Route by URL — Pages doesn't sub-route from a single file, so this file
  // serves both endpoints; in real repo you'd split into request.ts/confirm.ts
  // (see api-workers.md). Keeping single-file here as a skeleton placeholder.
  const url = new URL(request.url);
  const action = url.pathname.endsWith("/confirm") ? "confirm" : "request";

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  if (action === "request") {
    const parsed = passwordResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      const err = zodErrorToApiError(parsed.error);
      return jsonError(422, err.error, err.message, err.issues);
    }
    // TODO:
    //  1. Look up dealer by email; if not found, still return 204 (anti-enumeration).
    //  2. Generate secure random token, hash, store in verification_tokens.
    //  3. Send email via Resend with link `${PUBLIC_SITE_URL}/auth/reset?token=...`.
    return notImplemented("Password reset request — Resend integration TODO");
  } else {
    const parsed = passwordResetConfirmSchema.safeParse(body);
    if (!parsed.success) {
      const err = zodErrorToApiError(parsed.error);
      return jsonError(422, err.error, err.message, err.issues);
    }
    // TODO:
    //  1. Hash token, look up in verification_tokens (purpose='password_reset',
    //     consumed_at IS NULL, expires_at > now).
    //  2. UPDATE dealers SET password_hash = pbkdf2(...) WHERE id = ?.
    //  3. UPDATE verification_tokens SET consumed_at = now WHERE id = ?.
    //  4. Revoke all refresh_tokens for that dealer (security best practice).
    return notImplemented("Password reset confirm — TODO");
  }
};

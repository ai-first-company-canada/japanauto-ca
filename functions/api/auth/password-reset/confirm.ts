/**
 * POST /api/auth/password-reset/confirm — consume a token, set a new password.
 *
 * Lives in its own file because Pages routes strictly by path: the original
 * single-file password-reset.ts answered ONLY /api/auth/password-reset, and
 * /confirm 405'd in prod (caught by the 2026-06-12 doc-pass prod probe).
 *
 * The REQUEST path stays a skeleton until an email service exists (post-launch
 * Resend). Until then reset tokens are minted by the ADMIN panel
 * (workers/admin — "Generate reset link") and handed to the dealer by the
 * operator; the CONFIRM path below is fully live and shared by both flows.
 *
 * Token contract (must match workers/admin/src/pages/dealers.ts):
 *   token       = base64url(32 random bytes), shown once in the admin UI
 *   token_hash  = hex(SHA-256(token)) in verification_tokens
 *   purpose     = 'password_reset', TTL 1 hour, single-use (consumed_at)
 *
 * The confirm path never reveals whether a token row exists beyond the single
 * generic invalid_token error, and a successful confirm kills every live
 * session: refresh tokens revoked + token_epoch bumped (audit #11).
 */

import type { Env } from "../../../../types/env";
import {
  passwordResetConfirmSchema, zodErrorToApiError,
} from "../../../../lib/schema";
import { json, jsonError, badRequest } from "../../_lib/response";
import { hashPassword } from "../../_lib/auth";
import { bumpTokenEpoch, revokeAllRefreshTokensForDealer } from "../../_lib/db";
import { rateLimit } from "../../_lib/rate-limit";

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = passwordResetConfirmSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // 10/h per IP: the token is 256-bit random so guessing is hopeless anyway,
  // but nobody gets to try for free.
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const rl = await rateLimit(env, ip, {
    bucket: "pw-reset-confirm", limit: 10, windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return jsonError(429, "rate_limited",
      `Too many attempts — try again in ${rl.retryAfterSeconds}s.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await sha256Hex(parsed.data.token);
  const row = await env.DB.prepare(`
    SELECT id, dealer_id FROM verification_tokens
    WHERE token_hash = ? AND purpose = 'password_reset'
      AND consumed_at IS NULL AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first<{ id: string; dealer_id: string }>();

  if (!row) {
    return jsonError(400, "invalid_token", "This reset link is invalid or has expired.");
  }

  // Consume FIRST with a consumed_at guard — two racing confirms can't both
  // succeed on the same token.
  const consumed = await env.DB.prepare(`
    UPDATE verification_tokens SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).bind(now, row.id).run();
  if ((consumed.meta.changes ?? 0) === 0) {
    return jsonError(400, "invalid_token", "This reset link is invalid or has expired.");
  }

  const newHash = await hashPassword(parsed.data.new_password);
  await env.DB.prepare(
    `UPDATE dealers SET password_hash = ?, updated_at = ? WHERE id = ?`,
  ).bind(newHash, now, row.dealer_id).run();

  // End every live session for the account (audit #11 semantics).
  await revokeAllRefreshTokensForDealer(env, row.dealer_id);
  await bumpTokenEpoch(env, row.dealer_id);

  return json({ ok: true });
};

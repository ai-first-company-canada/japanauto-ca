/**
 * POST /api/auth/verify-email — consume an email-verification token (WS-2).
 *
 * Lives in its own directory because Pages routes strictly by path (the
 * password-reset single-file lesson: /confirm 405'd in prod) — the re-send
 * endpoint is the sibling ./resend.ts.
 *
 * On success sets dealers.email_verified_at (migration 0022). Deliberately
 * does NOT touch dealers.verified: that is the admin-granted public
 * "Verified seller" trust badge, and clicking an email link must never hand
 * it out (decision 0020).
 *
 * Mirrors password-reset/confirm.ts: 10/h per-IP limit, generic
 * invalid_token, consume-FIRST with a consumed_at guard (two racing confirms
 * can't both succeed).
 */

import type { Env } from "../../../../types/env";
import { emailVerifyInputSchema, zodErrorToApiError } from "../../../../lib/schema";
import { json, jsonError, badRequest } from "../../_lib/response";
import { rateLimit, RATE_LIMITS } from "../../_lib/rate-limit";
import { sha256Hex } from "../../_lib/tokens";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = emailVerifyInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const rl = await rateLimit(env, ip, RATE_LIMITS.EMAIL_VERIFY_PER_IP);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", `Too many attempts — try again in ${rl.retryAfterSeconds}s.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await sha256Hex(parsed.data.token);
  const row = await env.DB.prepare(`
    SELECT id, dealer_id FROM verification_tokens
    WHERE token_hash = ? AND purpose = 'email_verify'
      AND consumed_at IS NULL AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first<{ id: string; dealer_id: string }>();

  if (!row) {
    return jsonError(400, "invalid_token", "This verification link is invalid or has expired.");
  }

  const consumed = await env.DB.prepare(`
    UPDATE verification_tokens SET consumed_at = ?
    WHERE id = ? AND consumed_at IS NULL
  `).bind(now, row.id).run();
  if ((consumed.meta.changes ?? 0) === 0) {
    return jsonError(400, "invalid_token", "This verification link is invalid or has expired.");
  }

  await env.DB.prepare(
    `UPDATE dealers SET email_verified_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(now, now, row.dealer_id).run();

  return json({ ok: true });
};

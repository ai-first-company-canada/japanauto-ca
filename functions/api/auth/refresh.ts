/**
 * POST /api/auth/refresh
 *
 * Reads jc_refresh cookie (or { refresh_token } body), rotates the token in
 * D1 (revoked_at + rotated_to chain), issues new access + refresh.
 *
 * Body: optional { refresh_token } — fallback for non-cookie clients.
 *
 * Response 200: { expires_at: number } + sets both cookies.
 * Errors:
 *   401 unauthorized — token missing, expired, revoked, or unknown.
 */

import type { Env } from "../../../types/env";
import { json, jsonError, unauthorized } from "../_lib/response";
import {
  signAccessToken, generateRefreshToken, hashRefreshToken, buildAuthCookies,
} from "../_lib/auth";
import {
  lookupRefreshToken, revokeAllRefreshTokensForDealer,
  rotateRefreshToken, storeRefreshToken, getDealerById,
} from "../_lib/db";

function readRefreshCookie(request: Request): string | null {
  const c = request.headers.get("cookie");
  if (!c) return null;
  const m = /(?:^|;\s*)jc_refresh=([^;]+)/.exec(c);
  return m?.[1] ?? null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let token = readRefreshCookie(request);
  if (!token) {
    try {
      const body = await request.json() as { refresh_token?: string };
      token = body.refresh_token ?? null;
    } catch { /* no body */ }
  }
  if (!token) return unauthorized("Refresh token missing");

  const tokenHash = await hashRefreshToken(token);
  const existing = await lookupRefreshToken(env, tokenHash);
  if (!existing) return unauthorized("Refresh token invalid or expired");

  // Reuse detection (OWASP refresh-rotation, audit #10): a token that was
  // already rotated/revoked is being presented again. Legitimate clients never
  // reuse a rotated token, so treat this as a stolen-token replay and revoke
  // the dealer's entire token family — the attacker's rotated session dies too,
  // and the real owner must re-authenticate.
  if (existing.revoked_at !== null) {
    await revokeAllRefreshTokensForDealer(env, existing.dealer_id);
    return unauthorized("Refresh token reuse detected; all sessions revoked");
  }
  if (existing.expires_at < Math.floor(Date.now() / 1000)) {
    return unauthorized("Refresh token invalid or expired");
  }

  const dealer = await getDealerById(env, existing.dealer_id);
  if (!dealer) return unauthorized("Dealer not found");

  // Issue new access + refresh, rotate old.
  const newRefresh = generateRefreshToken();
  const newRefreshHash = await hashRefreshToken(newRefresh);
  const newRefreshId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const refreshTtl = parseInt(env.JWT_REFRESH_TTL_SECONDS, 10);

  await storeRefreshToken(env, {
    id: newRefreshId,
    dealerId: dealer.id,
    tokenHash: newRefreshHash,
    userAgent: request.headers.get("user-agent") ?? null,
    ipAddress: request.headers.get("cf-connecting-ip") ?? null,
    issuedAt: now,
    expiresAt: now + refreshTtl,
  });
  await rotateRefreshToken(env, existing.id, newRefreshId);

  const access = await signAccessToken({
    sub: dealer.id, email: dealer.email, dealer_type: dealer.type,
    verified: dealer.verified, token_epoch: dealer.token_epoch ?? 0,
  }, env);

  const cookies = buildAuthCookies(access.token, newRefresh, env);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const c of cookies) headers.append("set-cookie", c);

  return json({ expires_at: access.expiresAt }, { headers });
};

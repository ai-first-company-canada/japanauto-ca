/**
 * POST /api/auth/logout
 *
 * Revokes the current refresh token (if any) and clears both cookies.
 * Idempotent — safe to call without an active session.
 *
 * Response 204 No Content with cookie-clearing Set-Cookie headers.
 */

import type { Env } from "../../../types/env";
import { buildLogoutCookies, hashRefreshToken } from "../_lib/auth";
import { lookupRefreshToken, revokeRefreshToken, bumpTokenEpoch } from "../_lib/db";

function readRefreshCookie(request: Request): string | null {
  const c = request.headers.get("cookie");
  if (!c) return null;
  const m = /(?:^|;\s*)jc_refresh=([^;]+)/.exec(c);
  return m?.[1] ?? null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = readRefreshCookie(request);
  if (token) {
    try {
      const hash = await hashRefreshToken(token);
      // Revoke this refresh token, and bump the dealer's token_epoch so the
      // current access token dies immediately rather than lingering until exp
      // (audit #11). Epoch is per-dealer: other devices lose their access token
      // too but re-mint it on their next refresh, so this is effectively an
      // immediate current-session logout, not a force-logout-everywhere.
      const row = await lookupRefreshToken(env, hash);
      await revokeRefreshToken(env, hash);
      if (row) await bumpTokenEpoch(env, row.dealer_id);
    } catch { /* best-effort revoke */ }
  }
  const headers = new Headers();
  for (const c of buildLogoutCookies(env)) headers.append("set-cookie", c);
  return new Response(null, { status: 204, headers });
};

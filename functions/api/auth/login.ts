/**
 * POST /api/auth/login
 *
 * Body: LoginInput { email, password }
 *
 * Response 200: { dealer: DealerPublic, expires_at: number }
 *               Sets HttpOnly cookies jc_access + jc_refresh.
 *
 * Errors:
 *   401 unauthorized          — bad credentials (generic message, no enumeration)
 *   429 rate_limited          — 5/min per email or 20/hour per IP
 */

import type { Env } from "../../../types/env";
import { loginInputSchema, zodErrorToApiError, dealerPublicSchema } from "../../../lib/schema";
import { json, jsonError, unauthorized, tooManyRequests } from "../_lib/response";
import {
  verifyPassword, signAccessToken, generateRefreshToken, hashRefreshToken,
  buildAuthCookies,
} from "../_lib/auth";
import { getDealerByEmail, storeRefreshToken } from "../_lib/db";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";

// A syntactically-valid PBKDF2 hash that no password matches. Verifying against
// it on unknown emails makes the no-such-user path run the same ~100k-iteration
// work as the real path, so response time can't be used to enumerate accounts.
const DUMMY_PASSWORD_HASH =
  "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  // Rate limit by IP first (cheap)
  const ipRl = await rateLimit(env, ip, RATE_LIMITS.LOGIN_PER_IP);
  if (!ipRl.allowed) return tooManyRequests(ipRl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "bad_request", "Invalid JSON"); }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    const env_ = zodErrorToApiError(parsed.error);
    return jsonError(422, env_.error, env_.message, env_.issues);
  }
  const { email, password } = parsed.data;

  // Email-bucket rate limit (after parsing valid email)
  const emailRl = await rateLimit(env, email, RATE_LIMITS.LOGIN_PER_EMAIL);
  if (!emailRl.allowed) return tooManyRequests(emailRl.retryAfterSeconds);

  const dealer = await getDealerByEmail(env, email);
  // Generic "Invalid credentials" — no enumeration via message OR timing: on an
  // unknown email, still run a dummy PBKDF2 verify so the response time matches
  // the known-email path (which always runs verifyPassword below).
  if (!dealer) {
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return unauthorized("Invalid credentials");
  }

  const ok = await verifyPassword(password, dealer.password_hash);
  if (!ok) return unauthorized("Invalid credentials");

  // Issue tokens
  const access = await signAccessToken({
    sub: dealer.id, email: dealer.email, dealer_type: dealer.type,
    verified: dealer.verified,
  }, env);
  const refresh = generateRefreshToken();
  const now = Math.floor(Date.now() / 1000);
  const refreshTtl = parseInt(env.JWT_REFRESH_TTL_SECONDS, 10);
  await storeRefreshToken(env, {
    id: crypto.randomUUID(),
    dealerId: dealer.id,
    tokenHash: await hashRefreshToken(refresh),
    userAgent: request.headers.get("user-agent") ?? null,
    ipAddress: ip === "unknown" ? null : ip,
    issuedAt: now,
    expiresAt: now + refreshTtl,
  });

  const cookies = buildAuthCookies(access.token, refresh, env);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const c of cookies) headers.append("set-cookie", c);

  // Strip sensitive fields
  const dealerPublic = dealerPublicSchema.parse({
    ...dealer,
    // omit happens via schema — no need to delete fields manually
  });

  return json({ dealer: dealerPublic, expires_at: access.expiresAt }, { headers });
};

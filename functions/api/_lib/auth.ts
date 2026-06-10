/**
 * functions/api/_lib/auth.ts
 *
 * JWT signing/verification + password hashing using WebCrypto only
 * (no Node deps — runs in Cloudflare Workers runtime).
 *
 * Token format: HMAC-SHA256 JWT.
 *  - Access token (15 min) — `Authorization: Bearer <token>` or cookie.
 *  - Refresh token (30 days) — opaque random, stored hashed in `refresh_tokens`.
 *
 * Password hashing: PBKDF2-SHA256 with 600k iterations + per-user 16-byte salt.
 *  - Format stored: `pbkdf2$600000$<base64-salt>$<base64-hash>`.
 */

import type { Env } from "../../../types/env";
import { unauthorized, forbidden } from "./response";
import { isCrossSiteUnsafe } from "./csrf";
import { getDealerById } from "./db";

const enc = new TextEncoder();
const dec = new TextDecoder();

// ============================================================================
// Base64URL helpers
// ============================================================================

function toB64Url(bytes: ArrayBuffer | Uint8Array): string {
  const bin = String.fromCharCode(...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromB64Url(b64url: string): Uint8Array {
  const pad = b64url.length % 4 ? "=".repeat(4 - (b64url.length % 4)) : "";
  const bin = atob(b64url.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function fromB64UrlText(b64url: string): string {
  return dec.decode(fromB64Url(b64url));
}

// ============================================================================
// JWT
// ============================================================================

export interface AccessTokenPayload {
  sub: string;            // dealer.id
  iss: string;            // env.JWT_ISSUER
  iat: number;            // unix seconds
  exp: number;            // unix seconds
  type: "access";
  email: string;
  dealer_type: "dealer" | "salvage_yard";
  verified: 0 | 1;
  token_epoch: number;    // dealers.token_epoch snapshot; revoked when it drifts (audit #11)
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"],
  );
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, "iat" | "exp" | "type" | "iss">,
  env: Env,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const ttl = parseInt(env.JWT_ACCESS_TTL_SECONDS, 10);
  const full: AccessTokenPayload = {
    ...payload,
    iss: env.JWT_ISSUER,
    iat: now,
    exp: now + ttl,
    type: "access",
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = toB64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = toB64Url(enc.encode(JSON.stringify(full)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await importHmacKey(env.JWT_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = toB64Url(sig);
  return { token: `${signingInput}.${sigB64}`, expiresAt: full.exp };
}

export async function verifyAccessToken(
  token: string, env: Env,
): Promise<AccessTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  // Pin the algorithm: never let the token's own header choose how it's
  // verified (defends against alg-confusion / alg:none if the verifier is ever
  // refactored). We only ever issue HS256.
  let header: { alg?: unknown; typ?: unknown };
  try { header = JSON.parse(fromB64UrlText(headerB64)); }
  catch { return null; }
  if (header.alg !== "HS256" || header.typ !== "JWT") return null;

  const key = await importHmacKey(env.JWT_SECRET);
  const valid = await crypto.subtle.verify(
    "HMAC", key, fromB64Url(sigB64),
    enc.encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return null;

  let payload: AccessTokenPayload;
  try { payload = JSON.parse(fromB64UrlText(payloadB64)) as AccessTokenPayload; }
  catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  if (payload.iss !== env.JWT_ISSUER) return null;
  if (payload.type !== "access") return null;

  return payload;
}

// ============================================================================
// Refresh tokens (opaque random, hashed in D1)
// ============================================================================

export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toB64Url(bytes);
}

export async function hashRefreshToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return toB64Url(buf);
}

// ============================================================================
// Password hashing — PBKDF2-SHA256
// ============================================================================

// Workers runtime hard-caps PBKDF2 at 100,000 iterations per WebCrypto.
// (NotSupportedError: "iteration counts above 100000 are not supported".)
// 100k SHA-256 is comparable to Django's default; verifyPassword reads the
// iteration count from the stored hash, so we can migrate to Argon2 later
// without invalidating existing passwords.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;

export async function hashPassword(plain: string): Promise<string> {
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(plain),
    { name: "PBKDF2" }, false, ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial, PBKDF2_HASH_BYTES * 8,
  );

  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64Url(salt)}$${toB64Url(derived)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1]!, 10);
  const salt = fromB64Url(parts[2]!);
  const expected = fromB64Url(parts[3]!);

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(plain),
    { name: "PBKDF2" }, false, ["deriveBits"],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial, expected.length * 8,
  ));

  // Constant-time compare
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) diff |= derived[i]! ^ expected[i]!;
  return diff === 0;
}

// ============================================================================
// requireDealer middleware (returns either auth context or 401 Response)
// ============================================================================

export interface AuthContext {
  dealerId: string;
  email: string;
  dealerType: "dealer" | "salvage_yard";
  verified: boolean;
}

/**
 * Extract bearer token from Authorization header or jc_access cookie.
 * Returns null if absent.
 */
function extractAccessToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const m = /(?:^|;\s*)jc_access=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

/**
 * Returns AuthContext on success; on failure returns a 401 Response that the
 * handler should immediately return.
 *
 * Usage:
 *   const auth = await requireDealer(request, env);
 *   if (auth instanceof Response) return auth;
 *   // auth.dealerId is now safe to use
 */
export async function requireDealer(
  request: Request, env: Env,
): Promise<AuthContext | Response> {
  // CSRF backstop (primary enforcement: functions/_middleware.ts). A token
  // arriving via cookie on a cross-site unsafe request must not authenticate;
  // Bearer-header requests are exempt — attacker pages cannot set that header.
  const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;
  if (!hasBearer && isCrossSiteUnsafe(request, env)) {
    return forbidden("Cross-site request rejected");
  }

  const token = extractAccessToken(request);
  if (!token) return unauthorized();
  const payload = await verifyAccessToken(token, env);
  if (!payload) return unauthorized("Invalid or expired token");

  // Server-side kill switch (audit #11): the access token is signed and unexpired,
  // but re-check it against the live dealer row. A token_epoch mismatch means the
  // token predates a revocation event (logout, password reset, suspension) and is
  // rejected even before exp. `?? 0` keeps tokens minted before migration 0010
  // (no token_epoch claim) valid against the default-0 column. Claims that gate
  // authorization (verified, dealer_type) are rebuilt from the live row, never
  // trusted from the 15-min-stale token.
  const dealer = await getDealerById(env, payload.sub);
  if (!dealer) return unauthorized("Account not found");
  if ((dealer.token_epoch ?? 0) !== (payload.token_epoch ?? 0)) {
    return unauthorized("Session revoked");
  }
  return {
    dealerId: dealer.id,
    email: dealer.email,
    dealerType: dealer.type,
    verified: dealer.verified === 1,
  };
}

// ============================================================================
// Cookie helpers (HttpOnly, Secure, SameSite=Lax for SSR-friendly auth)
// ============================================================================

export function buildAuthCookies(
  accessToken: string, refreshToken: string, env: Env,
): string[] {
  const accessTtl = parseInt(env.JWT_ACCESS_TTL_SECONDS, 10);
  const refreshTtl = parseInt(env.JWT_REFRESH_TTL_SECONDS, 10);
  const secure = env.ENV === "production" ? "; Secure" : "";
  return [
    `jc_access=${accessToken}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${accessTtl}`,
    `jc_refresh=${refreshToken}; Path=/api/auth; HttpOnly${secure}; SameSite=Lax; Max-Age=${refreshTtl}`,
    // Non-HttpOnly UI hint cookie — value carries no auth, only presence is used
    // by client JS to swap Sign in / Dashboard menu state. Mirrors refresh TTL.
    `jc_session=1; Path=/${secure}; SameSite=Lax; Max-Age=${refreshTtl}`,
  ];
}

export function buildLogoutCookies(env: Env): string[] {
  const secure = env.ENV === "production" ? "; Secure" : "";
  return [
    `jc_access=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`,
    `jc_refresh=; Path=/api/auth; HttpOnly${secure}; SameSite=Lax; Max-Age=0`,
    `jc_session=; Path=/${secure}; SameSite=Lax; Max-Age=0`,
  ];
}

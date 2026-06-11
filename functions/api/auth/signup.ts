/**
 * POST /api/auth/signup
 *
 * Body: DealerCreateInput (zod-validated, includes AMVIC cross-field rule).
 *
 * Response 201: { dealer: DealerPublic, expires_at: number }
 *               Sets HttpOnly cookies jc_access (15m) + jc_refresh (30d).
 *
 * Errors:
 *   422 validation_failed     — zod issues per field
 *   409 conflict              — email or slug already taken
 *   429 rate_limited          — 5 signups/hour per IP
 */

import type { Env } from "../../../types/env";
import { dealerCreateInputSchema, zodErrorToApiError, dealerPublicSchema, LIMITS } from "../../../lib/schema";
import { created, jsonError, conflict, tooManyRequests, internalError } from "../_lib/response";
import {
  hashPassword, signAccessToken, generateRefreshToken, hashRefreshToken,
  buildAuthCookies,
} from "../_lib/auth";
import { storeRefreshToken, getDealerByEmail } from "../_lib/db";
import { rateLimit, RATE_LIMITS, hashIpStable } from "../_lib/rate-limit";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Rate limit by IP
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const rl = await rateLimit(env, ip, RATE_LIMITS.SIGNUP_PER_IP);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  // Parse + validate
  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError(400, "bad_request", "Invalid JSON"); }

  const parsed = dealerCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const env_ = zodErrorToApiError(parsed.error);
    return jsonError(422, env_.error, env_.message, env_.issues);
  }
  const input = parsed.data;

  // Uniqueness pre-check (DB UNIQUE will catch race condition)
  const existing = await getDealerByEmail(env, input.email);
  if (existing) return conflict("Email already registered");

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Insert dealer
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  try {
    await env.DB.prepare(`
      INSERT INTO dealers (
        id, type, name, slug, email, password_hash, phone, website, description,
        address_line1, address_line2, city, province, postal_code,
        lat, lng, business_number, gst_number, amvic_number,
        specializes_in, bio, founded_year,
        verified, subscription_tier, trial_ends_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'free', ?, ?, ?)
    `).bind(
      id, input.type, input.name, input.slug, input.email, passwordHash,
      input.phone ?? null, input.website ?? null, input.description ?? null,
      input.address_line1 ?? null, input.address_line2 ?? null, input.city,
      input.province, input.postal_code ?? null, input.lat ?? null, input.lng ?? null,
      input.business_number ?? null, input.gst_number ?? null, input.amvic_number ?? null,
      input.specializes_in ?? null, input.bio ?? null, input.founded_year ?? null,
      // Free 30-day Pro trial, no card (Feature 5). effectiveTier() reads this.
      now + LIMITS.TRIAL_DAYS * 86400, now, now,
    ).run();
  } catch (e) {
    // UNIQUE constraint races (email/slug) — surface as 409.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return conflict("Email or slug already in use");
    }
    return internalError("Failed to create dealer");
  }

  // Issue tokens
  const access = await signAccessToken({
    sub: id, email: input.email, dealer_type: input.type, verified: 0,
    token_epoch: 0,   // fresh dealer row defaults token_epoch to 0
  }, env);
  const refresh = generateRefreshToken();
  const refreshTtl = parseInt(env.JWT_REFRESH_TTL_SECONDS, 10);
  await storeRefreshToken(env, {
    id: crypto.randomUUID(),
    dealerId: id,
    tokenHash: await hashRefreshToken(refresh),
    userAgent: request.headers.get("user-agent") ?? null,
    // Store a stable hash, never the raw IP (audit #20 — PII minimization).
    ipAddress: ip === "unknown" ? null : await hashIpStable(env, ip),
    issuedAt: now,
    expiresAt: now + refreshTtl,
  });

  // Build response with cookies
  const cookies = buildAuthCookies(access.token, refresh, env);
  const dealerPublic = dealerPublicSchema.parse({
    id, type: input.type, name: input.name, slug: input.slug, email: input.email,
    phone: input.phone ?? null, website: input.website ?? null,
    description: input.description ?? null,
    address_line1: input.address_line1 ?? null, address_line2: input.address_line2 ?? null,
    city: input.city, province: input.province, postal_code: input.postal_code ?? null,
    country: "CA", lat: input.lat ?? null, lng: input.lng ?? null,
    business_number: input.business_number ?? null, gst_number: input.gst_number ?? null,
    amvic_number: input.amvic_number ?? null,
    specializes_in: input.specializes_in ?? null, bio: input.bio ?? null,
    founded_year: input.founded_year ?? null,
    verified: 0, subscription_tier: "free", subscription_status: null,
    created_at: now, updated_at: now,
  });

  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  for (const c of cookies) headers.append("set-cookie", c);

  return created({ dealer: dealerPublic, expires_at: access.expiresAt }, { headers });
};

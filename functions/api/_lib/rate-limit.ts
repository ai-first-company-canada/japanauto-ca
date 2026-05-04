/**
 * functions/api/_lib/rate-limit.ts
 *
 * KV-backed sliding-window rate limiter. Used for:
 *  - anonymous "Show contact" reveals (per anti-spam-policy)
 *  - login attempts (5/min per email + 20/hour per IP)
 *  - listing creation (50/day free tier, 500/day pro tier — per dealers.subscription_tier)
 *  - refresh-token endpoints
 *
 * Key format:
 *   `rl:<bucket>:<identifier>` → JSON [{ts: number, count: number}, ...]
 *
 * Cheap O(window) per request — bound the array length by limit.
 */

import type { Env } from "../../../types/env";

export interface RateLimitConfig {
  limit: number;             // max events
  windowSeconds: number;     // sliding window
  bucket: string;            // namespace prefix (e.g. "contact-reveal", "login")
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number; // 0 when allowed
}

/**
 * Check + record an event for `identifier` under `bucket`. Returns whether
 * the event is allowed and how many events remain in the current window.
 *
 * Note: KV write is eventually consistent — short bursts may slip past
 * during cold-start, but this is acceptable for anti-abuse use cases.
 */
export async function rateLimit(
  env: Env, identifier: string, cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `rl:${cfg.bucket}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - cfg.windowSeconds;

  const raw = await env.RATE_LIMIT.get(key, "json") as number[] | null;
  const events = (raw ?? []).filter((ts) => ts >= windowStart);

  if (events.length >= cfg.limit) {
    const oldest = events[0]!;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, oldest + cfg.windowSeconds - now),
    };
  }

  events.push(now);
  // Bounded write — keep at most `limit` entries.
  const trimmed = events.slice(-cfg.limit);
  await env.RATE_LIMIT.put(key, JSON.stringify(trimmed), {
    expirationTtl: cfg.windowSeconds,
  });

  return {
    allowed: true,
    remaining: cfg.limit - trimmed.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Predefined limiters (referenced by handlers).
 */
export const RATE_LIMITS = {
  CONTACT_REVEAL_PER_IP: {
    bucket: "contact-reveal-ip",
    limit: 30,
    windowSeconds: 3600,    // 30 reveals/hour per IP
  } as RateLimitConfig,
  CONTACT_REVEAL_PER_LISTING: {
    bucket: "contact-reveal-listing",
    limit: 100,
    windowSeconds: 86400,   // 100 reveals/day per listing (sanity cap)
  } as RateLimitConfig,
  LOGIN_PER_EMAIL: {
    bucket: "login-email",
    limit: 5,
    windowSeconds: 60,      // 5 attempts/min per email
  } as RateLimitConfig,
  LOGIN_PER_IP: {
    bucket: "login-ip",
    limit: 20,
    windowSeconds: 3600,    // 20 attempts/hour per IP
  } as RateLimitConfig,
  SIGNUP_PER_IP: {
    bucket: "signup-ip",
    limit: 5,
    windowSeconds: 3600,    // 5 signups/hour per IP (anti-bot)
  } as RateLimitConfig,
  LISTING_CREATE_FREE_TIER: {
    bucket: "listing-create-free",
    limit: 50,
    windowSeconds: 86400,   // 50/day for subscription_tier='free'
  } as RateLimitConfig,
  LISTING_CREATE_PRO_TIER: {
    bucket: "listing-create-pro",
    limit: 500,
    windowSeconds: 86400,   // 500/day for subscription_tier='pro'
  } as RateLimitConfig,
} as const;

/**
 * Hash an IP with a daily-rotating salt. Used for anti-scraping audit
 * (contact_reveals.ip_hash) — the salt makes hashes useless after 24h
 * for cross-day correlation, satisfying privacy-by-design principle.
 */
export async function hashIp(env: Env, ip: string): Promise<string> {
  const enc = new TextEncoder();
  const date = new Date().toISOString().slice(0, 10);    // YYYY-MM-DD UTC
  const buf = await crypto.subtle.digest(
    "SHA-256", enc.encode(`${env.DAILY_IP_HASH_SALT}:${date}:${ip}`),
  );
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

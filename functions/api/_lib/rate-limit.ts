/**
 * functions/api/_lib/rate-limit.ts
 *
 * D1-backed fixed-window rate limiter. Used for:
 *  - anonymous "Show contact" reveals (per anti-spam-policy)
 *  - login attempts (5/min per email + 20/hour per IP)
 *  - listing creation (50/day free tier, 500/day pro tier — per dealers.subscription_tier)
 *  - media direct-upload URL minting, refresh-token endpoints
 *
 * Storage: table `rate_limits` (migration 0008), one row per
 *   `rl:<bucket>:<identifier>`. Check-and-increment is a single
 *   `INSERT ... ON CONFLICT ... RETURNING`, serialized by SQLite's write lock,
 *   so it is ATOMIC — concurrent bursts get distinct post-increment counts and
 *   cannot all slip past the limit. (The previous KV version did get->put with
 *   no compare-and-swap, so parallel requests all read the same count and
 *   bypassed the limit; see migration 0008 header.)
 *
 * Fixed-window trade-off: up to ~2x `limit` can pass across a window boundary
 * (tail of one window + head of the next). That is standard and acceptable for
 * abuse control; the property that mattered — no parallel-burst bypass — holds.
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
 * Atomically check + increment the event counter for `identifier` under
 * `bucket`. Returns whether the event is allowed and how many remain in the
 * current window.
 *
 * The counter lives in D1 (`rate_limits`). The check-and-increment is one
 * statement, so SQLite serializes concurrent writers: two simultaneous requests
 * receive distinct post-increment counts (1 and 2, ...), and the limit cannot be
 * bypassed by a parallel burst. Every attempt — allowed or denied — increments
 * the counter, so spamming a blocked key does not reset the window.
 *
 * Fails closed: if the write/read throws (D1 unavailable), the error propagates
 * to the caller, which returns 5xx rather than silently allowing the request.
 */
export async function rateLimit(
  env: Env, identifier: string, cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `rl:${cfg.bucket}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);
  const windowCutoff = now - cfg.windowSeconds;   // windows starting at/before this have expired

  const row = await env.DB
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start)
       VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET
         count        = CASE WHEN rate_limits.window_start <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= ?3 THEN ?2 ELSE rate_limits.window_start END
       RETURNING count, window_start`,
    )
    .bind(key, now, windowCutoff)
    .first<{ count: number; window_start: number }>();

  // RETURNING always yields exactly one row; if somehow null, fail closed (deny).
  const count = row?.count ?? cfg.limit + 1;
  const windowStart = row?.window_start ?? now;
  const allowed = count <= cfg.limit;

  return {
    allowed,
    remaining: Math.max(0, cfg.limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, windowStart + cfg.windowSeconds - now),
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
  // Per-email hour/day caps catch IP-rotated credential stuffing against ONE
  // account that slips past the 5/min burst limiter; the global ceiling bounds
  // botnet-scale password spraying across many accounts (audit #16).
  LOGIN_PER_EMAIL_HOUR: {
    bucket: "login-email-hour",
    limit: 20,
    windowSeconds: 3600,    // 20 attempts/hour per email
  } as RateLimitConfig,
  LOGIN_PER_EMAIL_DAY: {
    bucket: "login-email-day",
    limit: 100,
    windowSeconds: 86400,   // 100 attempts/day per email
  } as RateLimitConfig,
  LOGIN_GLOBAL: {
    bucket: "login-global",
    limit: 5000,
    windowSeconds: 3600,    // 5000 login attempts/hour site-wide (anti-spray ceiling)
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
  MEDIA_UPLOAD_URL_PER_DEALER: {
    bucket: "media-upload-url-dealer",
    limit: 100,
    windowSeconds: 3600,    // 100 direct-upload URLs/hour per dealer — caps billable CF Images abuse
  } as RateLimitConfig,
  REFRESH_PER_IP: {
    bucket: "refresh-ip",
    limit: 60,
    windowSeconds: 3600,    // 60 refreshes/hour per IP — caps refresh-token brute/rotation abuse (audit #42)
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

/**
 * Hash an IP with a STABLE salt (no daily rotation). Used for refresh_tokens,
 * whose rows live up to 30 days — hashIp()'s daily salt would make a row's
 * stored hash uncorrelatable with the same IP a day later, defeating session
 * forensics (audit #20). We store this instead of the raw IP so a D1 read /
 * backup leak never exposes a dealer's plaintext IP history (PIPEDA/GDPR), while
 * still allowing "are this dealer's sessions all from one IP?" checks. The salt
 * is sourced from JWT_SECRET (a stable, secret, always-present value — enforced
 * >=32 chars) to avoid introducing another required secret; SHA-256 is one-way
 * so this never exposes JWT_SECRET.
 */
export async function hashIpStable(env: Env, ip: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    "SHA-256", enc.encode(`refresh-ip:${env.JWT_SECRET}:${ip}`),
  );
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

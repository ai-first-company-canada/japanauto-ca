/**
 * POST /api/listings/:id/track-contact
 *
 * Anonymous beacon fired when a buyer clicks "Show contact" on a listing.
 * Per ADR-0003: contacts are revealed directly in UI (no relay form);
 * this endpoint just records the reveal for anti-scraping audit and
 * increments listings.contact_count.
 *
 * Body: empty.
 * Response 204 No Content (always — no information leakage).
 *
 * Rate limit: 30/hour per IP, 100/day per listing.
 */

import type { Env } from "../../../../types/env";
import { recordContactReveal } from "../../_lib/db";
import { rateLimit, RATE_LIMITS, hashIp } from "../../_lib/rate-limit";
import { tooManyRequests, noContent } from "../../_lib/response";

async function hashUa(ua: string | null): Promise<string | null> {
  if (!ua) return null;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(ua.slice(0, 500)));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const id = params.id as string;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  // Verify the listing exists and is live BEFORE touching the rate-limiter or
  // the audit table. Without this, sprayed/bogus ids create unbounded
  // per-listing KV rate-limit keys and (pre-fix) orphan contact_reveals rows.
  // Still returns 204 either way — no count/existence leak.
  const exists = await env.DB.prepare(
    `SELECT 1 FROM listings
      WHERE id = ? AND status = 'active'
        AND (expires_at IS NULL OR expires_at > CAST(strftime('%s','now') AS INTEGER))
      LIMIT 1`,
  ).bind(id).first();
  if (!exists) return noContent();

  const ipRl = await rateLimit(env, ip, RATE_LIMITS.CONTACT_REVEAL_PER_IP);
  if (!ipRl.allowed) return tooManyRequests(ipRl.retryAfterSeconds);

  const listingRl = await rateLimit(env, `listing:${id}`,
    RATE_LIMITS.CONTACT_REVEAL_PER_LISTING);
  if (!listingRl.allowed) return tooManyRequests(listingRl.retryAfterSeconds);

  const ipHash = await hashIp(env, ip);
  const uaHash = await hashUa(request.headers.get("user-agent"));

  // Best-effort write — never fail the beacon (would expose the count).
  try {
    await recordContactReveal(env, "listing", id, ipHash, uaHash);
  } catch { /* swallow */ }

  return noContent();
};

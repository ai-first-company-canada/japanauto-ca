/**
 * POST /api/donors/:id/track-contact
 *
 * Anonymous beacon fired when a buyer clicks "Call"/"Show contact" on a donor
 * car (junkyard parts). Mirror of the listing track-contact endpoint: records
 * the reveal for the anti-scraping audit (ADR-0003) and increments
 * donor_cars.contact_count. Previously missing entirely, so donor contact
 * tracking was dead (donor_cars.contact_count stayed 0).
 *
 * Body: empty.
 * Response 204 No Content (always — no information leakage).
 *
 * Rate limit: 30/hour per IP, 100/day per donor.
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

  // Verify the donor exists and is live BEFORE touching the rate-limiter or the
  // audit table (same rationale as the listing beacon). Donors are visible in
  // both 'active' and 'depleted' states. Still returns 204 either way.
  const exists = await env.DB.prepare(
    `SELECT 1 FROM donor_cars WHERE id = ? AND status IN ('active','depleted') LIMIT 1`,
  ).bind(id).first();
  if (!exists) return noContent();

  const ipRl = await rateLimit(env, ip, RATE_LIMITS.CONTACT_REVEAL_PER_IP);
  if (!ipRl.allowed) return tooManyRequests(ipRl.retryAfterSeconds);

  const donorRl = await rateLimit(env, `donor:${id}`,
    RATE_LIMITS.CONTACT_REVEAL_PER_LISTING);
  if (!donorRl.allowed) return tooManyRequests(donorRl.retryAfterSeconds);

  const ipHash = await hashIp(env, ip);
  const uaHash = await hashUa(request.headers.get("user-agent"));

  // Best-effort write — never fail the beacon (would expose the count).
  try {
    await recordContactReveal(env, "donor_car", id, ipHash, uaHash);
  } catch { /* swallow */ }

  return noContent();
};

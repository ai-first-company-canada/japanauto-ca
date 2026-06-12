/**
 * POST /api/listings/:id/boost-social   (auth: owner; entitlement: socialBoost)
 *
 * Feature 3: queue this listing for the external content factory, which turns
 * it into posts/reels on the project's social channels and writes the
 * published links back via PATCH /api/social/jobs/:id.
 *
 * The job stores a SNAPSHOT of the listing at request time — the factory
 * builds content from what the dealer approved when clicking, not from a
 * moving target. The click itself is the consent action (the cabinet button
 * carries the consent wording).
 *
 * Errors: 401 / 403 (not owner, or Free tier — socialBoost is Pro/trial) /
 *         404 / 409 (not active, or a job is already queued) / 429 (10/day)
 */

import type { Env } from "../../../../types/env";
import { json, jsonError, notFound, forbidden, conflict, tooManyRequests, internalError } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, getDealerById, getMediaForEntity } from "../../_lib/db";
import { getEntitlements } from "../../_lib/entitlements";
import { rateLimit, RATE_LIMITS } from "../../_lib/rate-limit";

export const onRequestPost: PagesFunction<Env, "id"> = async ({ request, env, params }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  if (listing.dealer_id !== auth.dealerId) return forbidden();
  if (listing.status !== "active") {
    return conflict("Only active listings can be promoted");
  }

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return notFound();
  const ent = getEntitlements(dealer);
  if (!ent.socialBoost) {
    return forbidden("Social promotion is a Pro feature. Upgrade to Pro to promote listings.");
  }

  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.SOCIAL_BOOST_PER_DEALER);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  // Snapshot — everything the factory needs, resolved NOW.
  const [makeRow, modelRow, photos] = await Promise.all([
    env.DB.prepare(`SELECT name, slug FROM makes WHERE id = ?`).bind(listing.make_id)
      .first<{ name: string; slug: string }>(),
    env.DB.prepare(`SELECT name, slug FROM models WHERE id = ?`).bind(listing.model_id)
      .first<{ name: string; slug: string }>(),
    getMediaForEntity(env, "listing", id),
  ]);
  const cfHash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? "";
  const siteUrl = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const jobId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    job_id: jobId,
    listing_id: listing.id,
    listing_url: `${siteUrl}/used-cars/listing/${listing.slug}/`,
    // The factory MUST append ?utm_source={platform}&utm_medium=social&
    // utm_campaign=boost-{job_id} to listing_url in posts (see the contract
    // doc) so boost traffic shows up in the dealer's stats.
    year: listing.year,
    make: makeRow?.name ?? null,
    model: modelRow?.name ?? null,
    trim: listing.trim,
    price_cad: Math.round(listing.price / 100),
    mileage_km: listing.mileage,
    city: listing.city,
    province: listing.province,
    dealer_name: dealer.name,
    photos: cfHash
      ? photos.map((p) => `https://imagedelivery.net/${cfHash}/${p.image_id}/public`)
      : [],
    snapshot_at: now,
  };

  try {
    await env.DB.prepare(`
      INSERT INTO social_boost_jobs (id, listing_id, dealer_id, status, payload, requested_at, updated_at)
      VALUES (?, ?, ?, 'requested', ?, ?, ?)
    `).bind(jobId, listing.id, auth.dealerId, JSON.stringify(payload), now, now).run();
  } catch (e) {
    // Partial unique index: one active job per listing.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return conflict("This listing is already queued for promotion");
    }
    return internalError("Failed to queue promotion");
  }

  return json({ job: { id: jobId, listing_id: listing.id, status: "requested", requested_at: now } });
};

/**
 * GET    /api/listings/:id
 * PATCH  /api/listings/:id   (auth: owner)
 * DELETE /api/listings/:id   (auth: owner) — sets status='expired', not row deletion
 *
 * NOTE on identifier: `id` here is the dealer-facing UUID. Public-facing pages
 * use slug — see GET /api/listings/by-slug/:slug (separate endpoint, TODO).
 */

import type { Env } from "../../../../types/env";
import {
  listingUpdateInputSchema, zodErrorToApiError, listingSchema,
  listingYearWindow, isListingExpired, LIMITS, type ListingStatus,
} from "../../../../lib/schema";
import {
  json, jsonError, notFound, forbidden, badRequest, internalError, noContent, conflict,
} from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getListingById, getMediaForEntity, getDealerById } from "../../_lib/db";
import {
  enforceActiveCap, activeCapGuard, capExceeded, getEntitlements, type CapGuard,
} from "../../_lib/entitlements";
import { pingIndexNow } from "../../_lib/indexnow";

export const onRequestGet: PagesFunction<Env, "id"> = async ({ request, params, env }) => {
  const id = params.id as string;
  const listing = await getListingById(env, id);
  if (!listing) return notFound();
  // Public callers may read only active listings. draft/sold/expired/flagged
  // rows — and their internal fields (flagged_reason, boost_*, dealer_id,
  // expires_at) — are owner-only (audit #35: anonymous BAC/IDOR otherwise).
  // Active rows past their TTL count as non-public too (audit #8).
  if (listing.status !== "active" || isListingExpired(listing)) {
    const auth = await requireDealer(request, env);
    if (auth instanceof Response) return auth;
    if (listing.dealer_id !== auth.dealerId) return forbidden();
  }
  const photos = await getMediaForEntity(env, "listing", id);
  return json({ listing, photos });
};

/**
 * Owner-initiated status transitions (audit #36/#51). Keys are the current
 * status, values the statuses a PATCH may move it to. sold/expired CAN come
 * back to active, but only through the →active sanitization below (fresh TTL,
 * age-cap recheck, no resurrected boost). flagged is moderation-controlled —
 * dealers cannot self-unflag (and the update schema cannot set it either).
 */
const LEGAL_STATUS_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft:   ["active", "expired"],
  active:  ["sold", "expired"],
  sold:    ["active"],
  expired: ["active"],
  flagged: [],
};

export const onRequestPatch: PagesFunction<Env, "id"> = async (ctx) => {
  const { request, env, params } = ctx;
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getListingById(env, id);
  if (!existing) return notFound();
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = listingUpdateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  // Build dynamic UPDATE — only include keys present in the patch.
  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (fields.length === 0) return json({ listing: existing });

  const setCols = fields.map(([k]) => `${k} = ?`);
  const values: unknown[] = fields.map(([, v]) => v ?? null);

  const now = Math.floor(Date.now() / 1000);
  const nextStatus = parsed.data.status;
  const isStatusChange = nextStatus !== undefined && nextStatus !== existing.status;

  if (isStatusChange && !LEGAL_STATUS_TRANSITIONS[existing.status].includes(nextStatus)) {
    return conflict(`Cannot change listing status from '${existing.status}' to '${nextStatus}'`);
  }

  // Atomic cap backstop (deep-audit COR-3): set when this PATCH activates the
  // row; folded into the UPDATE's WHERE so check + write are one statement.
  let capGuard: CapGuard | null = null;
  let capEnt: ReturnType<typeof getEntitlements> | null = null;

  if (isStatusChange && nextStatus === "active") {
    // Free-tier active-listing cap (Feature 5) — publishing/reviving counts the
    // listing toward the cap; exclude this row so re-activating never self-blocks.
    const dealer = await getDealerById(env, auth.dealerId);
    if (!dealer) return notFound();
    const capped = await enforceActiveCap(env, dealer, "listings", existing.id);
    if (capped) return capped;
    capGuard = activeCapGuard(dealer, "listings", existing.id);
    capEnt = getEntitlements(dealer);

    // Re-entering the public catalog (draft publish or sold/expired revival).
    // The D1 age-cap trigger only fires on UPDATE OF year, so a status-only
    // PATCH would bypass it — re-run the rolling-window check here.
    const effectiveYear = parsed.data.year ?? existing.year;
    const { min, max } = listingYearWindow();
    if (effectiveYear < min || effectiveYear > max) {
      return jsonError(422, "validation_failed",
        "listings.year out of rolling window (currentYear-10 .. currentYear+1)",
        { year: ["Outside the rolling 10-year age cap"] });
    }
    // Fresh TTL — a revived listing must not inherit a stale (possibly already
    // past) expires_at, and a paid boost never survives a lifecycle round-trip.
    const ttlDaysRaw = parseInt(env.LISTING_DEFAULT_TTL_DAYS, 10);
    const ttlDays = Number.isFinite(ttlDaysRaw) ? ttlDaysRaw : LIMITS.LISTING_DEFAULT_TTL_DAYS;
    setCols.push("expires_at = ?", "boost_until = NULL", "boost_paid_cents = 0");
    values.push(now + ttlDays * 86400);
  } else if (isStatusChange && existing.status === "active") {
    // Leaving the catalog (sold/expired): the boost slot is forfeited now, not
    // parked for a future revival (audit #36 — free boost on revive otherwise).
    setCols.push("boost_until = NULL", "boost_paid_cents = 0");
  }

  // Keep sold_at consistent with status transitions. /mark-sold is the primary
  // path, but a direct PATCH of `status` must not leave sold_at out of sync —
  // the Schema.org SoldOut window and "sold N days ago" copy depend on it.
  if (nextStatus === "sold" && existing.status !== "sold") {
    setCols.push("sold_at = ?");
    values.push(now);
  } else if (nextStatus !== undefined && nextStatus !== "sold" && existing.sold_at !== null) {
    setCols.push("sold_at = NULL");
  }

  const setClause = setCols.join(", ");

  try {
    // With capGuard set, cap check + write are one statement (COR-3). A zero
    // changes count here is practically always the cap saying no: existence
    // and ownership were checked above, and rows are never deleted (lifecycle
    // flips statuses) — so answer with the cap 403.
    const res = await env.DB.prepare(
      `UPDATE listings SET ${setClause} WHERE id = ?${capGuard ? ` AND ${capGuard.sql}` : ""}`
    ).bind(...values, id, ...(capGuard?.binds ?? [])).run();
    if (capGuard && capEnt && (res.meta.changes ?? 0) === 0) return capExceeded(capEnt);
  } catch (e) {
    if (e instanceof Error && /UNIQUE.*vin/i.test(e.message)) {
      return conflict("VIN already in use by another listing");
    }
    if (e instanceof Error && /age cap|rolling window/i.test(e.message)) {
      return jsonError(422, "validation_failed", e.message,
        { year: ["Outside the rolling 10-year age cap"] });
    }
    return internalError("Failed to update listing");
  }

  const updated = await getListingById(env, id);

  // Notify IndexNow when the listing is publicly indexable. Captures status
  // transitions into 'active' and updates to already-active listings. A row
  // past its TTL serves as 404, so don't point engines at it (audit #8).
  if (updated?.status === "active" && !isListingExpired(updated)) {
    ctx.waitUntil(pingIndexNow(env, [`${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/used-cars/listing/${updated.slug}/`]));
  }

  return json({ listing: updated });
};

/**
 * Soft delete: set status='expired'. Real DELETE would break Schema.org
 * SoldOut window (docs/rules/listing-lifecycle.md). Use sold endpoint to mark sold.
 */
export const onRequestDelete: PagesFunction<Env, "id"> = async (ctx) => {
  const { request, env, params } = ctx;
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;
  const id = params.id as string;

  const existing = await getListingById(env, id);
  if (!existing) return notFound();
  if (existing.dealer_id !== auth.dealerId) return forbidden();

  await env.DB.prepare(
    `UPDATE listings SET status = 'expired' WHERE id = ?`
  ).bind(id).run();

  // Ping IndexNow so engines re-crawl and pick up the expired state.
  ctx.waitUntil(pingIndexNow(env, [`${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/used-cars/listing/${existing.slug}/`]));

  return noContent();
};

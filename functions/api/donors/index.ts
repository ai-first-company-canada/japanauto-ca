/**
 * GET  /api/donors  — list donors
 * POST /api/donors  — create donor (auth: salvage_yard dealer)
 *
 * GET query params:
 *   dealer_id=me      — current authed dealer's donors (auth required, all statuses)
 *   dealer_id=<id>    — other dealer's donors (public, only status='active')
 *   limit=<n>         — default 50, max 200
 *
 * POST body: DonorCarCreateInput (lib/schema.ts).
 *   compatible_* arrays accepted as native arrays; stored as JSON TEXT.
 * POST response 201: { id, slug, status }
 *
 * Errors:
 *   401 unauthorized       — missing/invalid auth
 *   403 forbidden          — not a salvage_yard dealer (POST)
 *   422 validation_failed  — zod issues
 *   429 rate_limited       — daily creation cap (50 free / 500 pro)
 *   500 internal_error     — DB failure
 */

import type { Env } from "../../../types/env";
import {
  donorCarCreateInputSchema, zodErrorToApiError,
} from "../../../lib/schema";
import {
  json, created, jsonError, badRequest, notFound, conflict, internalError,
  tooManyRequests,
} from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import {
  getDealerById, listDonorsForDealer,
} from "../_lib/db";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";

// ============================================================================
// GET — list donors
// ============================================================================
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const params = url.searchParams;

  const limitRaw = parseInt(params.get("limit") ?? "50", 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 200
    ? limitRaw : 50;

  const dealerIdParam = params.get("dealer_id");

  if (dealerIdParam === "me") {
    const auth = await requireDealer(request, env);
    if (auth instanceof Response) return auth;
    const donors = await listDonorsForDealer(env, auth.dealerId, limit);
    return json({ donors });
  }

  if (dealerIdParam) {
    // Public listing of another dealer's donors — only active status.
    const result = await env.DB.prepare(`
      SELECT
        dc.*,
        mk.slug AS make_slug, mk.name AS make_name,
        md.slug AS model_slug, md.name AS model_name
      FROM donor_cars dc
      LEFT JOIN makes  mk ON mk.id = dc.make_id
      LEFT JOIN models md ON md.id = dc.model_id
      WHERE dc.dealer_id = ? AND dc.status = 'active'
      ORDER BY dc.created_at DESC
      LIMIT ?
    `).bind(dealerIdParam, limit).all();
    return json({ donors: result.results ?? [] });
  }

  return badRequest("Missing dealer_id query parameter");
};

// ============================================================================
// POST — create donor
// ============================================================================
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  if (auth.dealerType !== "salvage_yard") {
    return jsonError(403, "forbidden",
      "Only salvage yards can list donor cars; dealers list used cars instead");
  }

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return notFound("Dealer not found");

  // Reuse the listing-create rate limiter — same intent (anti-spam).
  const rl = await rateLimit(env, auth.dealerId,
    dealer.subscription_tier === "pro" ? RATE_LIMITS.LISTING_CREATE_PRO_TIER : RATE_LIMITS.LISTING_CREATE_FREE_TIER,
  );
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = donorCarCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const input = parsed.data;

  // Resolve the make slug for slug-building. Falls back to "" if the make_id
  // doesn't resolve — FK violation will surface at INSERT time.
  const makeRow = await env.DB.prepare(
    `SELECT slug FROM makes WHERE id = ? LIMIT 1`,
  ).bind(input.make_id).first<{ slug: string }>();
  const modelRow = await env.DB.prepare(
    `SELECT slug FROM models WHERE id = ? LIMIT 1`,
  ).bind(input.model_id).first<{ slug: string }>();

  const id = crypto.randomUUID();
  const slugSuffix = id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const slug = buildDonorSlug({
    year: input.year,
    makeSlug: makeRow?.slug ?? "",
    modelSlug: modelRow?.slug ?? "",
    trim: input.trim ?? null,
    color: input.color_exterior,
    citySlug: input.city_slug,
    suffix: slugSuffix,
  });

  const now = Math.floor(Date.now() / 1000);
  const initialStatus = input.status ?? "draft";
  const compatibleMakes  = input.compatible_makes  ?? [makeRow?.slug ?? ""].filter(Boolean);
  const compatibleModels = input.compatible_models ?? null;
  const compatibleYears  = input.compatible_years  ?? null;
  const compatibleTrims  = input.compatible_trims  ?? null;

  try {
    await env.DB.prepare(`
      INSERT INTO donor_cars (
        id, dealer_id, slug, year, make_id, model_id, trim,
        generation_code, generation_range, city_slug,
        color_exterior, color_exterior_full, tone, color_interior,
        vin, mileage, engine, transmission,
        condition, available_parts_notes,
        compatible_makes, compatible_models, compatible_years, compatible_trims,
        price, price_currency, status,
        view_count, contact_count,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, 'CAD', ?,
        0, 0,
        ?, ?
      )
    `).bind(
      id, auth.dealerId, slug, input.year, input.make_id, input.model_id, input.trim ?? null,
      input.generation_code ?? null, input.generation_range ?? null, input.city_slug,
      input.color_exterior, input.color_exterior_full ?? null, input.tone ?? null,
      input.color_interior ?? null,
      input.vin ?? null, input.mileage ?? null, input.engine ?? null, input.transmission ?? null,
      input.condition ?? "fully_available", input.available_parts_notes ?? null,
      compatibleMakes  ? JSON.stringify(compatibleMakes)  : null,
      compatibleModels ? JSON.stringify(compatibleModels) : null,
      compatibleYears  ? JSON.stringify(compatibleYears)  : null,
      compatibleTrims  ? JSON.stringify(compatibleTrims)  : null,
      input.price ?? null, initialStatus,
      now, now,
    ).run();
  } catch (e) {
    if (e instanceof Error && /UNIQUE.*slug/i.test(e.message)) {
      return conflict("Slug collision; please retry");
    }
    if (e instanceof Error && /FOREIGN KEY/i.test(e.message)) {
      return jsonError(422, "validation_failed",
        "Unknown make_id, model_id, or city_slug",
      );
    }
    if (e instanceof Error && /CHECK constraint/i.test(e.message)) {
      return jsonError(422, "validation_failed", e.message);
    }
    return internalError("Failed to create donor car");
  }

  return created({ id, slug, status: initialStatus });
};

interface SlugInput {
  year: number;
  makeSlug: string;
  modelSlug: string;
  trim: string | null;
  color: string;
  citySlug: string;
  suffix: string;
}
function buildDonorSlug(s: SlugInput): string {
  const safe = (raw: string): string =>
    raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const parts = [String(s.year), safe(s.makeSlug), safe(s.modelSlug)];
  if (s.trim) parts.push(safe(s.trim));
  if (s.color) parts.push(safe(s.color));
  parts.push(safe(s.citySlug), s.suffix);
  return parts.filter(Boolean).join("-").replace(/-+/g, "-").replace(/(^-|-$)/g, "").slice(0, 75);
}

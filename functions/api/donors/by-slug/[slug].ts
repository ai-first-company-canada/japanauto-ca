/**
 * GET /api/donors/by-slug/:slug
 *
 * Phase 3.2 — JSON shape of a single donor car for tooling, smoke tests, and
 * any future client-side consumer (the donor detail HTML page reads from D1
 * directly via `getDonorCarBySlug` rather than calling this endpoint —
 * cross-Function HTTP would double the round trip).
 *
 * 404 — slug not found OR status not in (active, depleted). Draft / expired /
 * flagged donor rows are hidden from public view.
 */

import type { Env } from "../../../../types/env";
import { getDonorCarBySlug, getMediaForEntity } from "../../_lib/db";
import { json, notFound } from "../../_lib/response";

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ params, env }) => {
  const slug = params.slug as string;
  const donor = await getDonorCarBySlug(env, slug);
  if (!donor) return notFound("Donor car not found");

  const photos = await getMediaForEntity(env, "donor_car", donor.id);

  // Parse the JSON-stringified compatibility arrays for client convenience.
  const safeJsonArray = (s: string | null): unknown[] => {
    if (!s) return [];
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; }
    catch { return []; }
  };

  return json({
    donor: {
      id: donor.id,
      slug: donor.slug,
      year: donor.year,
      make: { slug: donor.make_slug, name: donor.make_name },
      model: { slug: donor.model_slug, name: donor.model_name },
      trim: donor.trim,
      generation_code: donor.generation_code,
      generation_range: donor.generation_range,
      color_exterior: donor.color_exterior,
      color_exterior_full: donor.color_exterior_full,
      tone: donor.tone,
      color_interior: donor.color_interior,
      vin: donor.vin,
      mileage: donor.mileage,
      engine: donor.engine,
      transmission: donor.transmission,
      condition: donor.condition,
      available_parts_notes: donor.available_parts_notes,
      compatible_makes: safeJsonArray(donor.compatible_makes),
      compatible_models: safeJsonArray(donor.compatible_models),
      compatible_years: safeJsonArray(donor.compatible_years),
      compatible_trims: safeJsonArray(donor.compatible_trims),
      price: donor.price,
      price_currency: donor.price_currency,
      status: donor.status,
      city: { slug: donor.city_slug, name: donor.city_name, province: donor.city_province },
      created_at: donor.created_at,
      updated_at: donor.updated_at,
    },
    dealer: {
      id: donor.dealer_id,
      name: donor.dealer_name,
      slug: donor.dealer_slug,
      phone: donor.dealer_phone,
      email: donor.dealer_email,
      website: donor.dealer_website,
      address_line1: donor.dealer_address_line1,
      address_line2: donor.dealer_address_line2,
      city: donor.dealer_city,
      province: donor.dealer_province,
      postal_code: donor.dealer_postal_code,
      hours: donor.dealer_hours,
    },
    photos,
  });
};

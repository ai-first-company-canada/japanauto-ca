/**
 * GET /feeds/meta-vehicles.csv?key=<META_FEED_KEY>
 *
 * Meta vehicle-catalog feed (Automotive Inventory Ads / Advantage+ catalog —
 * decision 0015). Meta's scheduler fetches this daily; rows are the ACTIVE
 * listings of Pro-entitled dealers that have at least one photo. Inventory
 * and entitlement churn propagate automatically: sold/expired/downgraded →
 * the row disappears on the next fetch → the ad stops.
 *
 * Auth: constant-time key compare (same digest pattern as factory-auth).
 * Missing META_FEED_KEY secret → 503 fail-closed.
 *
 * Dialect notes:
 *  - carousel images via image[0].url … image[9].url (primary first);
 *  - price as "12345.00 CAD"; mileage.unit KM; state_of_vehicle USED;
 *  - custom_label_0 = dealer id (per-dealer product sets in v2),
 *    custom_label_1 = city slug;
 *  - listing URLs carry utm_campaign=pro-promo so boost traffic is
 *    attributable in dealer stats (shared with the social-boost utm track).
 */

import type { Env } from "../../types/env";
import { rateLimit } from "../api/_lib/rate-limit";

const TRANSMISSION: Record<string, string> = {
  automatic: "AUTOMATIC", cvt: "AUTOMATIC", dct: "AUTOMATIC", manual: "MANUAL",
};
const DRIVETRAIN: Record<string, string> = {
  fwd: "FWD", rwd: "RWD", awd: "AWD", "4wd": "4X4",
};
const FUEL: Record<string, string> = {
  gasoline: "GASOLINE", hybrid: "HYBRID", plugin_hybrid: "HYBRID",
  electric: "ELECTRIC", diesel: "DIESEL",
};
const BODY: Record<string, string> = {
  sedan: "SEDAN", suv: "SUV", coupe: "COUPE", wagon: "WAGON",
  hatchback: "HATCHBACK", convertible: "CONVERTIBLE", minivan: "MINIVAN",
  pickup: "TRUCK", crossover: "CROSSOVER",
};
const MAX_IMAGES = 10;

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function keyMatches(provided: string, expected: string): Promise<boolean> {
  // Hash both sides so the comparison is constant-time regardless of length.
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const ua = new Uint8Array(a), ub = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i]! ^ ub[i]!;
  return diff === 0;
}

interface FeedRow {
  id: string;
  slug: string;
  year: number;
  trim: string | null;
  mileage: number;
  price: number; // cents
  body_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
  drivetrain: string | null;
  color_exterior: string | null;
  description: string | null;
  city: string;
  make_name: string;
  model_name: string;
  dealer_id: string;
  dealer_name: string;
  dealer_city: string;
  dealer_province: string;
  dealer_postal: string | null;
  dealer_addr: string | null;
  image_ids: string; // comma-joined cf_image_ids, primary first
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const expected = env.META_FEED_KEY;
  if (!expected) {
    return new Response("Feed not configured.", { status: 503 });
  }
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key || !(await keyMatches(key, expected))) {
    return new Response("Forbidden.", { status: 403 });
  }

  // Rate-limit even a valid key (deep-audit PERF-2): the feed is an uncached
  // LIMIT-5000 scan with a per-row image subquery; Meta fetches ~once/day, so
  // 20 pulls / 10 min per IP is generous and stops a leaked/shared key from
  // hammering D1. Fail-open on limiter error — the feed staleness that a
  // dropped pull causes is worse than the DoS it would otherwise prevent.
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  try {
    const rl = await rateLimit(env, ip, { bucket: "meta-feed", limit: 20, windowSeconds: 600 });
    if (!rl.allowed) {
      return new Response("Rate limited.", {
        status: 429,
        headers: { "retry-after": String(rl.retryAfterSeconds) },
      });
    }
  } catch { /* limiter unavailable — serve the feed rather than break Meta ingestion */ }

  // Pro entitlement inlined in SQL — mirrors effectiveTier() (entitlements.ts):
  // paid pro with a live status OR an unexpired trial.
  const res = await env.DB.prepare(`
    SELECT l.id, l.slug, l.year, l.trim, l.mileage, l.price,
           l.body_type, l.fuel_type, l.transmission, l.drivetrain,
           l.color_exterior, l.description, l.city,
           mk.name AS make_name, md.name AS model_name,
           d.id AS dealer_id, d.name AS dealer_name, d.city AS dealer_city,
           d.province AS dealer_province, d.postal_code AS dealer_postal,
           d.address_line1 AS dealer_addr,
           (SELECT GROUP_CONCAT(m.cf_image_id)
              FROM (SELECT cf_image_id FROM media
                     WHERE entity_type = 'listing' AND entity_id = l.id
                       AND cf_image_id IS NOT NULL
                     ORDER BY is_primary DESC, display_order ASC
                     LIMIT ${MAX_IMAGES}) m) AS image_ids
    FROM listings l
    JOIN makes mk  ON mk.id = l.make_id
    JOIN models md ON md.id = l.model_id
    JOIN dealers d ON d.id = l.dealer_id
    WHERE l.status = 'active'
      AND (l.expires_at IS NULL OR l.expires_at > unixepoch())
      AND (
        (d.subscription_tier = 'pro' AND d.subscription_status IN ('active','trialing','past_due'))
        OR (d.trial_ends_at IS NOT NULL AND d.trial_ends_at > unixepoch())
      )
    ORDER BY l.created_at DESC
    LIMIT 5000
  `).all<FeedRow>();

  const hash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH;
  const header = [
    "vehicle_id", "title", "description", "url",
    "make", "model", "year", "trim",
    "mileage.value", "mileage.unit",
    "price", "state_of_vehicle", "condition", "availability",
    "exterior_color", "transmission", "drivetrain", "fuel_type", "body_style",
    ...Array.from({ length: MAX_IMAGES }, (_, i) => `image[${i}].url`),
    "dealer_name", "address.addr1", "address.city", "address.region",
    "address.postal_code", "address.country",
    "custom_label_0", "custom_label_1",
  ];

  const lines: string[] = [header.join(",")];
  for (const r of res.results ?? []) {
    const images = (r.image_ids ?? "").split(",").filter(Boolean)
      .map((id) => `https://imagedelivery.net/${hash}/${id}/public`);
    if (images.length === 0) continue; // Meta rejects imageless vehicles

    const title = `${r.year} ${r.make_name} ${r.model_name}${r.trim ? ` ${r.trim}` : ""}`;
    const desc = (r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 4990)
      || `Used ${title} from ${r.dealer_name}, ${r.dealer_city}.`;
    const url = `https://japanauto.ca/used-cars/listing/${r.slug}/` +
      `?utm_source=facebook&utm_medium=catalog_ads&utm_campaign=pro-promo`;

    const cells = [
      r.id, title, desc, url,
      r.make_name, r.model_name, r.year, r.trim ?? "",
      r.mileage, "KM",
      `${(r.price / 100).toFixed(2)} CAD`, "USED", "GOOD", "AVAILABLE",
      r.color_exterior ?? "Unknown",
      r.transmission ? (TRANSMISSION[r.transmission] ?? "OTHER") : "OTHER",
      r.drivetrain ? (DRIVETRAIN[r.drivetrain] ?? "") : "",
      r.fuel_type ? (FUEL[r.fuel_type] ?? "OTHER") : "OTHER",
      r.body_type ? (BODY[r.body_type] ?? "OTHER") : "OTHER",
      ...Array.from({ length: MAX_IMAGES }, (_, i) => images[i] ?? ""),
      r.dealer_name, r.dealer_addr ?? "", r.dealer_city, r.dealer_province,
      r.dealer_postal ?? "", "CA",
      r.dealer_id, r.city,
    ];
    lines.push(cells.map(csvCell).join(","));
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // Meta fetches on its own schedule; never let an edge cache serve a
      // stale inventory snapshot for more than a few minutes.
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
};

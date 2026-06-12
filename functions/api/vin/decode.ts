/**
 * POST /api/vin/decode   (auth: any dealer)
 *
 * Tier-1 VIN enrichment: resolves a VIN through the free NHTSA vPIC API,
 * normalizes the result onto our catalog (make_id/model_id via the D1 makes/
 * models tables) and enums, extracts the engine + factory-equipment list, and
 * caches the normalized payload forever in vin_decode_cache (VIN data is
 * immutable). Powers form autofill ("Decode VIN" button) and the
 * "Factory equipment & safety" sections on detail pages.
 *
 * Degrades gracefully: vPIC down -> 502; the forms treat any failure as
 * "fill manually" and listing creation is never blocked by this endpoint.
 *
 * Body: { vin } (17 chars, ISO 3779 checksum — same validator as listings)
 * Response 200: VinDecodePayload (lib/schema.ts)
 */

import type { Env } from "../../../types/env";
import {
  vinDecodeInputSchema, zodErrorToApiError,
  type VinDecodePayload, type BodyType, type FuelType, type Transmission, type Drivetrain,
  BODY_TYPES, FUEL_TYPES,
} from "../../../lib/schema";
import { json, jsonError, badRequest, tooManyRequests } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";

/** vPIC fields → friendly equipment labels (emitted when the value confirms presence). */
const EQUIPMENT_LABELS: Array<[field: string, label: string]> = [
  ["ABS", "ABS"],
  ["ESC", "Electronic stability control"],
  ["TractionControl", "Traction control"],
  ["DaytimeRunningLight", "Daytime running lights"],
  ["SemiautomaticHeadlampBeamSwitching", "Automatic high beams"],
  ["AdaptiveDrivingBeam", "Adaptive driving beam"],
  ["AdaptiveCruiseControl", "Adaptive cruise control"],
  ["ForwardCollisionWarning", "Forward collision warning"],
  ["CIB", "Automatic emergency braking"],
  ["PedestrianAutomaticEmergencyBraking", "Pedestrian emergency braking"],
  ["LaneDepartureWarning", "Lane departure warning"],
  ["LaneKeepSystem", "Lane keep assist"],
  ["BlindSpotMon", "Blind spot monitor"],
  ["RearCrossTrafficAlert", "Rear cross-traffic alert"],
  ["RearVisibilitySystem", "Backup camera"],
  ["ParkAssist", "Park assist"],
  ["KeylessIgnition", "Keyless ignition"],
];

function mapBodyType(raw: string): BodyType | null {
  const s = raw.toLowerCase();
  if (s.includes("sport utility")) return "suv";
  if (s.includes("crossover")) return "crossover";
  if (s.includes("hatchback")) return "hatchback";
  if (s.includes("wagon")) return "wagon";
  if (s.includes("coupe")) return "coupe";
  if (s.includes("convertible")) return "convertible";
  if (s.includes("minivan") || s.includes("van")) return "minivan";
  if (s.includes("pickup")) return "pickup";
  if (s.includes("sedan")) return "sedan";
  return BODY_TYPES.find((b) => s.includes(b)) ?? null;
}

function mapFuel(primary: string, electrification: string): FuelType | null {
  const e = electrification.toLowerCase();
  if (e.includes("phev") || e.includes("plug")) return "plugin_hybrid";
  if (e.includes("hev") || e.includes("hybrid")) return "hybrid";
  const s = primary.toLowerCase();
  if (s.includes("electric")) return "electric";
  if (s.includes("diesel")) return "diesel";
  if (s.includes("gasoline") || s.includes("flexible")) return "gasoline";
  return FUEL_TYPES.find((f) => s.includes(f)) ?? null;
}

function mapTransmission(raw: string): Transmission | null {
  const s = raw.toLowerCase();
  if (s.includes("cvt") || s.includes("continuously")) return "cvt";
  if (s.includes("dual")) return "dct";
  if (s.includes("manual")) return "manual";
  if (s.includes("automatic")) return "automatic";
  return null;
}

function mapDrivetrain(raw: string): Drivetrain | null {
  const s = raw.toLowerCase();
  if (s.includes("awd") || s.includes("all")) return "awd";
  if (s.includes("4wd") || s.includes("4x4")) return "4wd";
  if (s.includes("fwd") || s.includes("front")) return "fwd";
  if (s.includes("rwd") || s.includes("rear")) return "rwd";
  return null; // "4x2" is ambiguous (FWD car or RWD truck) — don't guess
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.VIN_DECODE_PER_DEALER);
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds);

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = vinDecodeInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }
  const vin = parsed.data.vin;

  // Cache first — VIN data is immutable, one vPIC hit per VIN ever.
  const cached = await env.DB.prepare(
    `SELECT payload FROM vin_decode_cache WHERE vin = ? LIMIT 1`,
  ).bind(vin).first<{ payload: string }>();
  if (cached) return json(JSON.parse(cached.payload) as VinDecodePayload);

  const vpicRes = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
    { headers: { accept: "application/json" } },
  ).catch(() => null);
  if (!vpicRes || !vpicRes.ok) {
    return jsonError(502, "upstream_error", "VIN decoder is temporarily unavailable — fill the form manually");
  }
  const vpic = await vpicRes.json() as { Results?: Array<Record<string, string>> };
  const r = vpic.Results?.[0];
  if (!r || !r.Make) {
    return jsonError(502, "upstream_error", "VIN decoder returned no data — fill the form manually");
  }

  const val = (k: string): string | null => {
    const v = (r[k] ?? "").trim();
    return v && v !== "Not Applicable" ? v : null;
  };
  const num = (k: string): number | null => {
    const v = val(k);
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  // Map make/model onto OUR catalog via D1 (exact name match, case-insensitive).
  // No match -> nulls; the form simply doesn't autofill those two fields.
  const makeRaw = val("Make");
  const modelRaw = val("Model");
  let makeRow: { id: number; slug: string } | null = null;
  let modelRow: { id: number; slug: string } | null = null;
  if (makeRaw) {
    makeRow = await env.DB.prepare(
      `SELECT id, slug FROM makes WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    ).bind(makeRaw).first<{ id: number; slug: string }>() ?? null;
    if (makeRow && modelRaw) {
      modelRow = await env.DB.prepare(
        `SELECT id, slug FROM models WHERE make_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
      ).bind(makeRow.id, modelRaw).first<{ id: number; slug: string }>() ?? null;
    }
  }

  const cylinders = num("EngineCylinders");
  const displacement = num("DisplacementL");
  const engineCode = val("EngineModel");
  const hp = num("EngineHP");
  const hasEngine = cylinders !== null || displacement !== null || engineCode !== null;
  const engineLabel = hasEngine
    ? [
        displacement !== null ? `${displacement}L` : null,
        cylinders !== null ? `${cylinders}-cyl` : null,
        engineCode,
        hp !== null ? `${hp} hp` : null,
      ].filter(Boolean).join(" ")
    : null;

  const equipment: string[] = [];
  for (const [field, label] of EQUIPMENT_LABELS) {
    if (val(field) === "Standard") equipment.push(label);
  }
  if (val("TPMS")) equipment.push("Tire pressure monitoring");
  if (val("AirBagLocFront")) equipment.push("Front airbags");
  if (val("AirBagLocSide")) equipment.push("Side airbags");
  if (val("AirBagLocCurtain")) equipment.push("Curtain airbags");

  const payload: VinDecodePayload = {
    vin,
    year: num("ModelYear"),
    make_raw: makeRaw,
    model_raw: modelRaw,
    trim_raw: val("Trim"),
    series: val("Series"),
    plant_country: val("PlantCountry"),
    make_id: makeRow?.id ?? null,
    make_slug: makeRow?.slug ?? null,
    model_id: modelRow?.id ?? null,
    model_slug: modelRow?.slug ?? null,
    body_type: val("BodyClass") ? mapBodyType(val("BodyClass")!) : null,
    fuel_type: mapFuel(val("FuelTypePrimary") ?? "", val("ElectrificationLevel") ?? ""),
    transmission: val("TransmissionStyle") ? mapTransmission(val("TransmissionStyle")!) : null,
    drivetrain: val("DriveType") ? mapDrivetrain(val("DriveType")!) : null,
    doors: num("Doors"),
    engine: hasEngine ? { cylinders, displacement_l: displacement, code: engineCode, hp } : null,
    engine_label: engineLabel,
    equipment,
  };

  await env.DB.prepare(
    `INSERT INTO vin_decode_cache (vin, payload, decoded_at) VALUES (?, ?, ?)
     ON CONFLICT(vin) DO NOTHING`,
  ).bind(vin, JSON.stringify(payload), Math.floor(Date.now() / 1000)).run();

  return json(payload);
};

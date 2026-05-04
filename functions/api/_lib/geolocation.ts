/**
 * functions/api/_lib/geolocation.ts
 *
 * City resolution per ADR-0004 + ADR-0006 + ADR-0007.
 *
 * Order of precedence:
 *   1. `jc_city` cookie — explicit user choice (always wins).
 *   2. request.cf.city + request.cf.region — looked up via city_aliases → CMA.
 *   3. Unresolved → null (homepage shows choose-city UI; no auto-fallback).
 *
 * The list of valid CMAs is the set of `cities.status='active'` rows.
 */

import type { Env } from "../../../types/env";
import { resolveCityAlias, listActiveCities } from "./db";

export type ResolutionMethod = "cookie" | "auto" | "unresolved";

export interface CityResolution {
  city: string | null;       // CMA slug (e.g. 'toronto') or null
  province: string | null;   // ISO code, may differ from CMA's province (Gatineau-QC → Ottawa)
  method: ResolutionMethod;

  // Display fields used by edge HTML rewriter (ADR-0004 NO FOUC) and by Astro
  // pages that render geo-aware copy. `resolved` mirrors `method !== "unresolved"`
  // for cheap branching in HTMLRewriter.
  resolved: boolean;
  slug: string | null;       // alias of `city` for clarity at call sites
  name: string | null;       // 'Calgary'
  short: string | null;      // 'Calgary, AB'
  amvic: boolean;
  count: number;             // listings count in CMA (Phase 2: real D1 query)
  dealers: number;           // dealer count in CMA
}

/**
 * Phase 1.1 hardcoded counts. Phase 2 replaces with real D1 query against
 * the listings + dealers tables (cached in KV).
 */
const FALLBACK_COUNTS: Record<string, { count: number; dealers: number; amvic: boolean }> = {
  toronto:   { count: 1284, dealers: 152, amvic: false },
  montreal:  { count: 938,  dealers: 98,  amvic: false },
  vancouver: { count: 871,  dealers: 89,  amvic: false },
  calgary:   { count: 612,  dealers: 64,  amvic: true },
  edmonton:  { count: 487,  dealers: 51,  amvic: true },
  ottawa:    { count: 412,  dealers: 47,  amvic: false },
};

/** CMA display names — used to enrich CityResolution without a D1 hit. */
const CMA_DISPLAY: Record<string, { name: string; province: string }> = {
  toronto:   { name: "Toronto",   province: "ON" },
  montreal:  { name: "Montreal",  province: "QC" },
  vancouver: { name: "Vancouver", province: "BC" },
  calgary:   { name: "Calgary",   province: "AB" },
  edmonton:  { name: "Edmonton",  province: "AB" },
  ottawa:    { name: "Ottawa",    province: "ON" },
};

function buildResolution(
  cmaSlug: string | null,
  province: string | null,
  method: ResolutionMethod,
): CityResolution {
  if (!cmaSlug) {
    return {
      city: null, province, method,
      resolved: false,
      slug: null, name: null, short: null,
      amvic: false, count: 0, dealers: 0,
    };
  }
  const display = CMA_DISPLAY[cmaSlug];
  const counts = FALLBACK_COUNTS[cmaSlug] ?? { count: 0, dealers: 0, amvic: false };
  const displayProvince = province ?? display?.province ?? null;
  return {
    city: cmaSlug,
    province: displayProvince,
    method,
    resolved: true,
    slug: cmaSlug,
    name: display?.name ?? cmaSlug,
    short: display ? `${display.name}, ${displayProvince ?? display.province}` : cmaSlug,
    amvic: counts.amvic,
    count: counts.count,
    dealers: counts.dealers,
  };
}

/** Read jc_city cookie; trust only if it matches an active CMA slug. */
function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const m = re.exec(cookie);
  return m?.[1] ?? null;
}

/**
 * Resolve user.city from request. Returns CMA slug or null if no auto-pick possible.
 * Caches the active-cities list in KV per request batch (15 min TTL) to avoid
 * D1 hit on every request.
 */
export async function resolveCity(
  request: Request, env: Env,
): Promise<CityResolution> {
  const cf = (request as Request & { cf?: { city?: string; region?: string } }).cf;
  const cookieCity = readCookie(request, "jc_city");
  const cookieProvince = readCookie(request, "jc_province");

  // 1. Cookie wins — but validate against active CMAs to avoid stale/spoofed values.
  if (cookieCity) {
    const active = await getCachedActiveCmaSlugs(env);
    if (active.has(cookieCity)) {
      return buildResolution(cookieCity, cookieProvince, "cookie");
    }
  }

  // 2. cf.city + cf.region → CMA via city_aliases.
  const rawCity = cf?.city?.toLowerCase();
  const rawProvince = cf?.region; // ISO code on Cloudflare for CA
  if (rawCity && rawProvince) {
    const cma = await resolveCityAlias(env, rawCity, rawProvince);
    if (cma) {
      const active = await getCachedActiveCmaSlugs(env);
      if (active.has(cma)) {
        return buildResolution(cma, rawProvince, "auto");
      }
    }
  }

  // 3. Unresolved — homepage will show choose-city UI.
  return buildResolution(null, null, "unresolved");
}

const CACHE_KEY = "active-cma-slugs:v1";
const CACHE_TTL = 15 * 60;

async function getCachedActiveCmaSlugs(env: Env): Promise<Set<string>> {
  const cached = await env.CACHE.get(CACHE_KEY, "json") as string[] | null;
  if (cached) return new Set(cached);

  const cities = await listActiveCities(env);
  const slugs = cities.map((c) => c.slug);
  // Best-effort write; ignore failures.
  env.CACHE.put(CACHE_KEY, JSON.stringify(slugs), { expirationTtl: CACHE_TTL })
    .catch(() => undefined);
  return new Set(slugs);
}

/**
 * Build Set-Cookie header values for an explicit city choice.
 * Used when user clicks a city in choose-city UI or override sheet.
 */
export function buildCityCookies(city: string, province: string): string[] {
  const oneYear = 31_536_000;
  return [
    `jc_city=${city}; Path=/; SameSite=Lax; Max-Age=${oneYear}`,
    `jc_province=${province}; Path=/; SameSite=Lax; Max-Age=${oneYear}`,
  ];
}

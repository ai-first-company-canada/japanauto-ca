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
      return { city: cookieCity, province: cookieProvince, method: "cookie" };
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
        return { city: cma, province: rawProvince, method: "auto" };
      }
    }
  }

  // 3. Unresolved — homepage will show choose-city UI.
  return { city: null, province: null, method: "unresolved" };
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

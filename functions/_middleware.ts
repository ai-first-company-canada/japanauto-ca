/**
 * functions/_middleware.ts
 *
 * Runs on every request before route-specific handlers (and before serving
 * static assets from Astro's dist/). Responsibilities:
 *
 *   1. Resolve user.city from cf.city + city_aliases (ADR-0004 / ADR-0006).
 *   2. Inject city into request as a `data.geo` blob for downstream handlers.
 *   3. Add baseline security headers to all responses.
 *   4. Handle CORS preflight for /api/* (whitelist: japanauto.ca + Pages preview).
 *   5. Detect & flag obvious bots (UA-based) — does NOT block, just tags
 *      `data.isBot` so handlers can choose lighter responses (e.g. skip
 *      analytics writes).
 *
 * Multiple middlewares can be chained as an array export; we keep one for
 * simplicity. Pages auto-discovers `_middleware.ts` in functions/ root.
 *
 * Reference: https://developers.cloudflare.com/pages/functions/middleware/
 */

import type { Env } from "../types/env";
import { resolveCity, type CityResolution } from "./api/_lib/geolocation";

/**
 * Pages Functions data bag — used to pass geolocation + bot detection
 * to downstream handlers via `context.data`.
 *
 * Handlers retrieve via:
 *   const geo = context.data.geo as CityResolution | undefined;
 */
export interface MiddlewareData {
  geo?: CityResolution;
  isBot?: boolean;
}

/**
 * Allowed Origin headers for CORS. Production = exact match;
 * preview/dev = pattern match against Pages preview domains.
 */
function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false;
  const allowed = [
    "https://japanauto.ca",
    "https://www.japanauto.ca",
  ];
  if (allowed.includes(origin)) return true;
  // Pages preview: https://<hash>.japanauto.pages.dev
  if (env.ENV !== "production" && /^https:\/\/[a-z0-9-]+\.japanauto\.pages\.dev$/.test(origin)) {
    return true;
  }
  if (env.ENV === "dev" && origin.startsWith("http://localhost:")) return true;
  return false;
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), camera=(), microphone=(), payment=(self)",
  // CSP intentionally relaxed; tightened in Phase 2 after Astro asset map is finalised.
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: https://imagedelivery.net; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.stripe.com; " +
    "frame-src https://js.stripe.com https://hooks.stripe.com; " +
    "frame-ancestors 'self';",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
};

/** Lightweight bot UA detection. Not a security feature — used for analytics gating only. */
const BOT_UA_RE = /(googlebot|bingbot|yandex|duckduckbot|baiduspider|slurp|petalbot|facebot|twitterbot|linkedinbot|applebot|gptbot|claude|perplexity|chatgpt-user)/i;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  const md = data as MiddlewareData;

  // 1. Resolve city (only for non-API HTML — saves D1 hits on /api/* and assets).
  const isApi = url.pathname.startsWith("/api/");
  const isAsset = /\.(css|js|svg|png|jpg|jpeg|webp|avif|ico|woff2?|map|xml|txt)$/i.test(url.pathname);
  if (!isAsset) {
    md.geo = await resolveCity(request, env);
  }

  // 2. Bot tag (cheap UA sniff)
  const ua = request.headers.get("user-agent") ?? "";
  md.isBot = BOT_UA_RE.test(ua);

  // 3. CORS preflight for /api/*
  if (isApi && request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (isAllowedOrigin(origin, env)) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin!,
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-allow-credentials": "true",
          "access-control-max-age": "86400",
          "vary": "Origin",
        },
      });
    }
    return new Response(null, { status: 403 });
  }

  // 4. Forward to route handler / static asset.
  const response = await next();

  // 5. Apply security headers + per-request CORS to API responses.
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

  if (isApi) {
    const origin = request.headers.get("origin");
    if (isAllowedOrigin(origin, env)) {
      headers.set("access-control-allow-origin", origin!);
      headers.set("access-control-allow-credentials", "true");
      headers.set("vary", "Origin");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

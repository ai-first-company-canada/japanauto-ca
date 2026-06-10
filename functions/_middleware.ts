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
import { type CityResolution } from "./api/_lib/geolocation";
import { verifyAccessToken } from "./api/_lib/auth";
import { isAllowedOrigin, isCrossSiteUnsafe } from "./api/_lib/csrf";
import { forbidden } from "./api/_lib/response";
import { getDealerById } from "./api/_lib/db";

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
  dealerId?: string;
}

/**
 * Auth-guarded path predicate for /dealer/* routes.
 *
 * Public auth pages (login, signup, logout, forgot-password, reset-password/[token],
 * verify-email/[token]) are exempt — visiting them while logged out is the whole
 * point. Everything else under /dealer/ requires a valid jc_access JWT.
 */
function isDealerProtected(pathname: string): boolean {
  if (!pathname.startsWith("/dealer/")) return false;
  const trimmed = pathname.replace(/\/$/, "");
  const exempt = new Set([
    "/dealer/login",
    "/dealer/signup",
    "/dealer/logout",
    "/dealer/forgot-password",
  ]);
  if (exempt.has(trimmed)) return false;
  if (pathname.startsWith("/dealer/reset-password/")) return false;
  if (pathname.startsWith("/dealer/verify-email/")) return false;
  return true;
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), camera=(), microphone=(), payment=(self)",
  // CSP (audit #18). script-src/style-src still carry 'unsafe-inline': the site
  // renders many legitimate inline scripts both at build time (Astro SSG) and at
  // runtime (functions/_lib/page-shell.ts), and a shared CSP header can't drop
  // 'unsafe-inline' for them without a full migration — adding a hash/nonce makes
  // browsers IGNORE 'unsafe-inline' (CSP3), so a half-migration would break every
  // inline script across 900+ pages. That migration (Astro build-time hashes for
  // SSG + a per-request nonce threaded through page-shell for dynamic routes) is
  // tracked separately. Until then these directives are pure hardening that does
  // NOT depend on inline policy and closes real amplifiers:
  //   object-src 'none'  — no <object>/<embed> plugin script execution
  //   base-uri 'self'    — block <base> injection that hijacks every relative URL
  //   form-action 'self' — injected forms can't POST to attacker origins
  // Verified safe: no dist page uses <base>, and all 897 forms submit same-origin.
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: https://imagedelivery.net; " +
    "script-src 'self' 'unsafe-inline' https://js.stripe.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src 'self' https://api.stripe.com; " +
    "frame-src https://js.stripe.com https://hooks.stripe.com; " +
    "object-src 'none'; base-uri 'self'; form-action 'self'; " +
    "frame-ancestors 'self';",
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
};

/** Lightweight bot UA detection. Not a security feature — used for analytics gating only. */
const BOT_UA_RE = /(googlebot|bingbot|yandex|duckduckbot|baiduspider|slurp|petalbot|facebot|twitterbot|linkedinbot|applebot|gptbot|claude|perplexity|chatgpt-user)/i;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  const md = data as MiddlewareData;

  // 0. Preview-host bot guard — keep Cloudflare Pages preview URLs
  //    (*.pages.dev) out of search engine + AI crawler indexes. The canonical
  //    site is japanauto.ca; canonical link + this guard together prevent
  //    duplicate-content penalties at .ca cutover.
  const isPreviewHost = /\.pages\.dev$/i.test(url.hostname);
  if (isPreviewHost && url.pathname === "/robots.txt") {
    return new Response(
      "# Preview host — not for indexing. Production: https://japanauto.ca/\nUser-agent: *\nDisallow: /\n",
      {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-robots-tag": "noindex, nofollow",
        },
      },
    );
  }

  // 0b. CSRF guard (audit #9) — reject cross-site unsafe-method API requests
  //     before any handler or D1 work runs. Cookie-authed mutations are the
  //     target; non-browser clients (no Origin/Sec-Fetch-Site: curl, Stripe
  //     webhook) pass through. Logic + second layer in api/_lib/csrf.ts.
  const isApi = url.pathname.startsWith("/api/");
  if (isApi && isCrossSiteUnsafe(request, env)) {
    return forbidden("Cross-site request rejected");
  }

  // 1. City resolution removed from the hot path (audit #24): the city-first URL
  //    architecture bakes city into every page at SSG/render time, so no handler
  //    reads context.data.geo. Resolving it here cost an uncached D1 alias lookup
  //    + KV read on every HTML request for a value that was then discarded. The
  //    MiddlewareData.geo field stays for any future lazy consumer.

  // 2. Bot tag (cheap UA sniff)
  const ua = request.headers.get("user-agent") ?? "";
  md.isBot = BOT_UA_RE.test(ua);

  // 2b. Auth guard for /dealer/* paths (except auth pages themselves).
  //     Redirects to /dealer/login?next=<path> when access token is missing
  //     or invalid. JWT signature + expiry are verified here so downstream
  //     handlers can rely on md.dealerId.
  if (isDealerProtected(url.pathname)) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const accessMatch = /(?:^|;\s*)jc_access=([^;]+)/.exec(cookieHeader);
    const accessToken = accessMatch?.[1];
    const loginUrl = `${url.origin}/dealer/login/?next=${encodeURIComponent(url.pathname)}`;

    if (!accessToken) {
      return Response.redirect(loginUrl, 302);
    }
    const payload = await verifyAccessToken(accessToken, env);
    if (!payload) {
      return Response.redirect(loginUrl, 302);
    }
    // Session kill-switch (audit #11): reject a signed-but-stale token whose
    // epoch no longer matches the live dealer row (post logout/reset/suspend).
    const dealer = await getDealerById(env, payload.sub);
    if (!dealer || (dealer.token_epoch ?? 0) !== (payload.token_epoch ?? 0)) {
      return Response.redirect(loginUrl, 302);
    }
    md.dealerId = payload.sub;
  }

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

  // 4. Forward to route handler / static asset. Wrap in try/catch (audit #23):
  //    several db.ts read helpers call zod `.parse()` (throws, not safeParse) on
  //    raw D1 rows, so any schema/data drift throws out of next(). Without this
  //    boundary the platform 500 carries none of the SECURITY_HEADERS/CORS
  //    applied below and breaks the JSON ApiError contract the rest of the API
  //    guarantees. Catch it and emit a clean envelope that still gets headered.
  let response: Response;
  try {
    response = await next();
  } catch (err) {
    console.error("[middleware] unhandled error in next():", err);
    response = new Response(
      JSON.stringify({ error: "internal_error", message: "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  // 5. Apply security headers + per-request CORS to API responses.
  //    `new Headers(response.headers)` collapses multiple Set-Cookie entries
  //    into one comma-joined value (Workers Headers iteration semantics), so
  //    we lift them via getSetCookie() and re-append them individually.
  const setCookies = response.headers.getSetCookie();
  const headers = new Headers(response.headers);
  if (setCookies.length > 0) {
    headers.delete("set-cookie");
    for (const c of setCookies) headers.append("set-cookie", c);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);

  if (isApi) {
    const origin = request.headers.get("origin");
    if (isAllowedOrigin(origin, env)) {
      headers.set("access-control-allow-origin", origin!);
      headers.set("access-control-allow-credentials", "true");
      headers.set("vary", "Origin");
    }
  }

  // 6. Edge HTML rewriting removed (2026-05-19): each page now bakes in its
  //    own city via Astro props (URL-as-city architecture). The data-state
  //    branching is gone from src/pages/index.astro, and data-geo / data-geo-href
  //    markers (where they remain) fall back to static SSG values.
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

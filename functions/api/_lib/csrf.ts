/**
 * functions/api/_lib/csrf.ts
 *
 * Cross-site request forgery guard for cookie-authenticated /api/* mutations.
 *
 * Auth rides in the HttpOnly `jc_access`/`jc_refresh` cookies (SameSite=Lax).
 * Lax already blocks cookie-bearing cross-site fetch/XHR and form POSTs in
 * modern browsers, but leaves gaps: Chrome's Lax+POST grace window for fresh
 * cookies, same-site sibling contexts, and legacy browsers. This module
 * closes them by vetting the browser's own attestation headers on every
 * unsafe-method request:
 *
 *   1. `Sec-Fetch-Site: same-origin|none` -> allow. Fetch metadata cannot be
 *      set by page JS, so it is the strongest signal; `none` means a
 *      user-initiated navigation (address bar / bookmark), not forgeable.
 *   2. Otherwise judge by `Origin` (browsers attach it to every POST,
 *      same-origin included): must equal the request's own origin or sit in
 *      the explicit allowlist (apex/www + Pages preview hosts).
 *   3. Neither header present -> allow: non-browser client (curl, Stripe
 *      webhook delivery). Those carry no victim cookies, so CSRF cannot apply.
 *
 * Enforced in two layers: functions/_middleware.ts rejects for all /api/*
 * unsafe methods (covers /api/auth/refresh and /api/auth/logout, which
 * authenticate by cookie outside requireDealer), and requireDealer()
 * re-checks cookie-sourced tokens in case the middleware is ever bypassed
 * or refactored. (Audit finding #9.)
 */

import type { Env } from "../../../types/env";

const UNSAFE_METHOD_RE = /^(POST|PUT|PATCH|DELETE)$/;

/**
 * Allowed Origin headers for CORS + CSRF. Production = exact match;
 * preview/dev = pattern match against Pages preview domains.
 */
export function isAllowedOrigin(origin: string | null, env: Env): boolean {
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

/**
 * True when an unsafe-method request comes from another site and must be
 * rejected before any cookie-authenticated handler runs.
 */
export function isCrossSiteUnsafe(request: Request, env: Env): boolean {
  if (!UNSAFE_METHOD_RE.test(request.method.toUpperCase())) return false;

  const sfs = request.headers.get("sec-fetch-site");
  if (sfs === "same-origin" || sfs === "none") return false;

  // same-site / cross-site / SFS-less legacy browsers: judge by Origin. The
  // equality branch is what lets the pages.dev host work — its ENV is
  // "production", which disables the preview allowlist entry, but a
  // same-origin POST always carries its own host as Origin.
  const origin = request.headers.get("origin");
  if (origin) {
    if (origin === new URL(request.url).origin) return false;
    return !isAllowedOrigin(origin, env);
  }

  // No Origin on an unsafe method: non-browser client — allow, unless fetch
  // metadata explicitly said same-site/cross-site above.
  return sfs !== null;
}

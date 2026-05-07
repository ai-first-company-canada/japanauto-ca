/**
 * functions/api/_lib/response.ts
 *
 * Standardised JSON response helpers. Use these instead of `new Response(...)`
 * directly in handlers — they bake in correct Content-Type and CORS headers.
 */

import type { ApiError } from "../../../lib/schema";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
} as const;

/**
 * Merge JSON defaults onto caller-supplied headers without dropping multi-value
 * entries (specifically `set-cookie`). Spreading a `Headers` instance with
 * `{...headers}` produces an empty object — it has no own enumerable keys —
 * which is how every cookie this API ever set was silently swallowed.
 */
function mergeHeaders(init: HeadersInit | undefined): Headers {
  const out = new Headers(init);
  for (const [k, v] of Object.entries(JSON_HEADERS)) {
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

/** 200 OK with JSON body. */
export function json<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: mergeHeaders(init.headers),
  });
}

/** 201 Created. */
export function created<T>(data: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 201,
    statusText: init.statusText,
    headers: mergeHeaders(init.headers),
  });
}

/** 204 No Content. */
export function noContent(init: ResponseInit = {}): Response {
  return new Response(null, { status: 204, ...init });
}

/** Error envelope shortcut. */
export function jsonError(
  status: number,
  error: string,
  message?: string,
  issues?: Record<string, string[]>,
): Response {
  const body: ApiError = { error, ...(message && { message }), ...(issues && { issues }) };
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export const badRequest = (message?: string) => jsonError(400, "bad_request", message);
export const unauthorized = (message = "Authentication required") =>
  jsonError(401, "unauthorized", message);
export const forbidden = (message = "Forbidden") => jsonError(403, "forbidden", message);
export const notFound = (message = "Not found") => jsonError(404, "not_found", message);
export const conflict = (message?: string) => jsonError(409, "conflict", message);
export const tooManyRequests = (retryAfterSec?: number) => {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (retryAfterSec) headers["retry-after"] = String(retryAfterSec);
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429, headers,
  });
};
export const internalError = (message = "Internal server error") =>
  jsonError(500, "internal_error", message);
export const notImplemented = (message = "Not implemented") =>
  jsonError(501, "not_implemented", message);

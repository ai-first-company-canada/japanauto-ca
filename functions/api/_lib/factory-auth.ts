/**
 * functions/api/_lib/factory-auth.ts
 *
 * Service-token guard for the content-factory pull API (Feature 3). The
 * external factory project authenticates with `Authorization: Bearer
 * <SOCIAL_FACTORY_TOKEN>` — same static-secret pattern as the Cloudflare
 * Images token. Comparison is timing-safe (hash both sides, compare digests).
 *
 * Returns null when authorized, or the error Response to return as-is.
 */

import type { Env } from "../../../types/env";
import { jsonError, unauthorized } from "./response";

export async function requireFactory(request: Request, env: Env): Promise<Response | null> {
  if (!env.SOCIAL_FACTORY_TOKEN) {
    return jsonError(503, "not_configured",
      "Social factory API is not configured — set the SOCIAL_FACTORY_TOKEN secret");
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return unauthorized("Factory token required");

  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(token)),
    crypto.subtle.digest("SHA-256", enc.encode(env.SOCIAL_FACTORY_TOKEN)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i]! ^ bv[i]!;
  if (diff !== 0) return unauthorized("Invalid factory token");
  return null;
}

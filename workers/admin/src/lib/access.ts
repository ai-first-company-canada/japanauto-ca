/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Access JWT verification — the admin Worker's only auth layer
 * beyond Access itself (defense in depth).
 *
 * Access injects `Cf-Access-Jwt-Assertion` (RS256 JWT) into every request it
 * lets through. We verify it against the team's published JWKS and pin the
 * email claim to ADMIN_EMAILS. Everything fails CLOSED: missing config,
 * missing header, unknown kid, bad signature, wrong aud/iss, expired token,
 * or an email outside the allowlist all deny.
 */

export interface AdminEnv {
  DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS: string;
}

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

// Module-global JWKS cache; Workers isolates recycle often enough that a
// 1-hour TTL is plenty (Access rotates keys ~every 6 weeks, old keys linger).
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function decodeJson(b64url: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
  } catch {
    return null;
  }
}

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(
    `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`,
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = await res.json<{ keys?: Jwk[] }>();
  const keys = (body.keys ?? []).filter((k) => k.kty === "RSA" && k.n && k.e);
  if (keys.length === 0) throw new Error("JWKS: no RSA keys");
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Returns the verified admin email, or a deny Response. Never throws.
 */
export async function requireAdmin(
  request: Request,
  env: AdminEnv,
): Promise<string | Response> {
  const deny = (status: number, msg: string) =>
    new Response(msg, { status, headers: { "content-type": "text/plain" } });

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAILS) {
    return deny(503, "Admin not configured (Access vars unset) — fail closed.");
  }

  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return deny(403, "No Access token.");

  const parts = jwt.split(".");
  if (parts.length !== 3) return deny(403, "Malformed token.");
  const header = decodeJson(parts[0]!);
  const payload = decodeJson(parts[1]!);
  if (!header || !payload) return deny(403, "Malformed token.");
  if (header.alg !== "RS256") return deny(403, "Unexpected alg.");

  let keys: Jwk[];
  try {
    keys = await getJwks(env.ACCESS_TEAM_DOMAIN);
  } catch {
    return deny(503, "JWKS unavailable — fail closed.");
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return deny(403, "Unknown signing key.");

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]!),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return deny(403, "Signature check failed.");
  }
  if (!valid) return deny(403, "Bad signature.");

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp <= now) return deny(403, "Token expired.");

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (iss !== `https://${env.ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`) {
    return deny(403, "Wrong issuer.");
  }

  const aud = payload.aud;
  const audOk = Array.isArray(aud)
    ? aud.includes(env.ACCESS_AUD)
    : aud === env.ACCESS_AUD;
  if (!audOk) return deny(403, "Wrong audience.");

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const allowed = env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email)) return deny(403, "Not an admin.");

  return email;
}

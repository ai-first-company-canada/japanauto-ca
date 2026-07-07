/**
 * functions/api/_lib/tokens.ts
 *
 * Verification-token minting for email flows (WS-2). The token contract is
 * shared with the admin panel's "Generate reset link" and MUST stay in sync
 * (workers/admin/src/pages/dealers.ts + password-reset/confirm.ts):
 *
 *   token       = base64url(32 random bytes) — shown/sent exactly once
 *   token_hash  = hex(SHA-256(token)) in verification_tokens
 *   single-use  = consumed_at guard on the consume side
 *
 * Minting supersedes any outstanding token of the same purpose atomically
 * (env.DB.batch) — a mis-sent earlier link must not stay live for its
 * remaining TTL.
 */

import type { Env } from "../../../types/env";
import type { VerificationPurpose } from "../../../lib/schema";

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a fresh single-use token for (dealer, purpose), atomically superseding
 * any live ones. Returns the RAW token — the only copy that ever exists; the
 * DB stores the hash. Caller puts it in a link and forgets it.
 */
export async function mintVerificationToken(
  env: Env, dealerId: string, purpose: VerificationPurpose, ttlSeconds: number,
): Promise<string> {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE verification_tokens SET consumed_at = ?
      WHERE dealer_id = ? AND purpose = ? AND consumed_at IS NULL
    `).bind(now, dealerId, purpose),
    env.DB.prepare(`
      INSERT INTO verification_tokens (id, dealer_id, purpose, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), dealerId, purpose, await sha256Hex(token), now + ttlSeconds, now),
  ]);
  return token;
}

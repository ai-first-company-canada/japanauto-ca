/**
 * functions/api/_lib/stripe-verify.ts
 *
 * Stripe webhook signature verification, extracted from the webhook endpoint
 * (WS-5/T4) so it is unit-testable and reusable by the billing event handlers
 * (WS-1). Bodies are byte-identical to the originals in
 * functions/api/stripe/webhook.ts — behaviour must not drift; the tests in
 * tests/stripe-verify.test.ts pin the contract (incl. the strict `>` on the
 * 300s tolerance boundary, which Stripe's retry cadence relies on).
 *
 * Reference: https://docs.stripe.com/webhooks/signatures
 */

export const TOLERANCE_SECONDS = 300;

export function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe-Signature header. Returns true iff a v1 sig matches within tolerance. */
export async function verifyStripeSignature(
  header: string, rawBody: string, secret: string, nowSec: number,
): Promise<boolean> {
  // Header: "t=<unix>,v1=<hex>[,v1=<hex>...]"
  let t = 0;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, val] = part.split("=", 2);
    if (k === "t") t = parseInt(val ?? "", 10);
    else if (k === "v1" && val) v1.push(val);
  }
  if (!t || v1.length === 0) return false;
  if (Math.abs(nowSec - t) > TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const expected = hex(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${t}.${rawBody}`),
  ));
  return v1.some((s) => timingSafeEqual(s, expected));
}

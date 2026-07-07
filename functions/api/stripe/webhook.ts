/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events for:
 *  - checkout.session.completed   → finalise boost order, extend listings.boost_until.
 *  - customer.subscription.*      → sync dealers.subscription_status / tier.
 *  - charge.refunded              → mark boost_orders.status='refunded'.
 *  - payment_intent.payment_failed → log + email dealer.
 *
 * STATUS: signature verification is LIVE; event PROCESSING is still a skeleton.
 *
 * Authentication: Stripe signs the body. We verify the `Stripe-Signature`
 * header against STRIPE_WEBHOOK_SECRET (HMAC-SHA256 over `${t}.${rawBody}`,
 * constant-time, with a 5-minute timestamp tolerance) BEFORE parsing or acting
 * on anything — so the day the DB mutations below are wired in, they are
 * already gated to genuine Stripe events (deep-audit SEC-1/REG-3). Fail-closed:
 * no secret → 503; bad/expired signature → 400.
 *
 * Reference: https://docs.stripe.com/webhooks/signatures
 */

import type { Env } from "../../../types/env";
import { jsonError, notImplemented, json } from "../_lib/response";

const TOLERANCE_SECONDS = 300;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Stripe-Signature header. Returns true iff a v1 sig matches within tolerance. */
async function verifyStripeSignature(
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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never accept unverifiable events. (Billing is not wired yet;
    // once STRIPE_WEBHOOK_SECRET is set this endpoint goes live.)
    return jsonError(503, "not_configured", "Stripe webhook is not configured");
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return jsonError(400, "bad_request", "Missing Stripe-Signature header");

  // Raw body is required for HMAC verification — read it before any parsing.
  const rawBody = await request.text();
  const now = Math.floor(Date.now() / 1000);
  if (!(await verifyStripeSignature(sig, rawBody, secret, now))) {
    return jsonError(400, "invalid_signature", "Signature verification failed");
  }

  // Signature is valid past this point. Event PROCESSING is still unimplemented:
  //  parse JSON, switch on event.type (checkout.session.completed → boost_orders
  //  + listings.boost_until; customer.subscription.* → dealers.subscription_*;
  //  charge.refunded → boost_orders.status), then return 200. Wire that in with
  //  the Stripe billing work — the verification gate above already protects it.
  void rawBody;
  return notImplemented("Stripe webhook — signature verified; event handling TODO");
};

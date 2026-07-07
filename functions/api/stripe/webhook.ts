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
import { verifyStripeSignature } from "../_lib/stripe-verify";

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

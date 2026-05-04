/**
 * POST /api/stripe/webhook
 *
 * Handles Stripe webhook events for:
 *  - checkout.session.completed   → finalise boost order, extend listings.boost_until.
 *  - customer.subscription.*      → sync dealers.subscription_status / tier.
 *  - charge.refunded              → mark boost_orders.status='refunded'.
 *  - payment_intent.payment_failed → log + email dealer.
 *
 * STATUS: skeleton.
 *
 * Authentication: Stripe signs the body. Verify via `Stripe-Signature` header
 * + STRIPE_WEBHOOK_SECRET (HMAC-SHA256). MUST verify before parsing JSON.
 *
 * Reference: https://docs.stripe.com/webhooks/signatures
 */

import type { Env } from "../../../types/env";
import { jsonError, notImplemented, json } from "../_lib/response";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return jsonError(400, "bad_request", "Missing Stripe-Signature header");

  // Read raw body — required for HMAC verification.
  const _rawBody = await request.text();

  // TODO:
  //  1. Verify HMAC signature against env.STRIPE_WEBHOOK_SECRET (constant-time compare).
  //  2. Parse JSON, switch on event.type:
  //     - checkout.session.completed:
  //         - Look up boost_orders by client_reference_id.
  //         - UPDATE listings SET boost_until = MAX(boost_until, now) + duration*86400,
  //                                 boost_paid_cents = boost_paid_cents + amount.
  //         - UPDATE boost_orders SET applied_at = now, expires_at = ..., status='paid'.
  //     - customer.subscription.{created,updated,deleted}:
  //         - UPDATE dealers SET subscription_status = ?, subscription_tier = ?.
  //     - charge.refunded:
  //         - UPDATE boost_orders SET status='refunded'.
  //     - default: log + 200 OK.
  //  3. Return 200 OK to acknowledge.

  if (sig === "skeleton") {
    void _rawBody;
    return notImplemented("Stripe webhook handler — TODO");
  }

  // For now, return 200 to avoid Stripe retries during dev. SAFE because
  // we haven't wired any subscription logic yet.
  return json({ ok: true, note: "skeleton" });
};

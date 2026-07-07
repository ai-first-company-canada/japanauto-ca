/**
 * POST /api/stripe/checkout — mint a hosted Checkout session for Pro (WS-1).
 *
 * Body: { plan: "monthly" | "yearly" }. Response: { checkout_url }.
 * Dark until the owner configures STRIPE_SECRET_KEY + both price ids → 503.
 *
 * Trial interplay (ADR-0012: "the two never fight"): our no-card trial lives
 * in dealers.trial_ends_at and is NEVER written by Stripe. If the dealer
 * upgrades mid-trial with >48h+slack left, we pass subscription_data
 * [trial_end] = trial_ends_at — card now, first charge when OUR trial ends,
 * effectiveTier stays pro seamlessly (Stripe `trialing` ∈ LIVE_PAID). Less
 * than Stripe's 48h Checkout minimum left → charge immediately.
 */

import type { Env } from "../../../types/env";
import { z } from "zod";
import { json, jsonError, badRequest } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getDealerById } from "../_lib/db";
import { rateLimit, RATE_LIMITS } from "../_lib/rate-limit";
import { stripeRequest, billingConfigured, StripeError } from "../_lib/stripe";

const bodySchema = z.object({ plan: z.enum(["monthly", "yearly"]) });

// Stripe requires Checkout trial_end ≥ 48h out; add slack for clock skew.
const MIN_TRIAL_CARRYOVER_S = 48 * 3600 + 3600;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  if (!billingConfigured(env)) {
    return jsonError(503, "not_configured", "Billing is not configured yet");
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("plan must be 'monthly' or 'yearly'");

  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.STRIPE_CHECKOUT_PER_DEALER);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", `Too many attempts — try again in ${rl.retryAfterSeconds}s.`);
  }

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return jsonError(404, "not_found", "Dealer not found");

  const site = env.PUBLIC_SITE_URL.replace(/\/$/, "");
  const now = Math.floor(Date.now() / 1000);

  try {
    // Reuse-forever Stripe customer (one per dealer).
    let customerId = dealer.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeRequest<{ id: string }>(env, "/customers", {
        email: dealer.email,
        name: dealer.name,
        "metadata[dealer_id]": dealer.id,
      });
      customerId = customer.id;
      await env.DB.prepare(
        `UPDATE dealers SET stripe_customer_id = ?, updated_at = ? WHERE id = ? AND stripe_customer_id IS NULL`,
      ).bind(customerId, now, dealer.id).run();
    }

    const params: Record<string, string> = {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]":
        (parsed.data.plan === "monthly" ? env.STRIPE_PRICE_PRO_MONTHLY : env.STRIPE_PRICE_PRO_YEARLY)!,
      "line_items[0][quantity]": "1",
      client_reference_id: dealer.id,
      "subscription_data[metadata][dealer_id]": dealer.id,
      "automatic_tax[enabled]": "true",
      billing_address_collection: "required",
      "tax_id_collection[enabled]": "true",
      "customer_update[address]": "auto",
      // payment_method_types deliberately unset — dashboard governs (card + ACSS).
      success_url: `${site}/dealer/dashboard/?billing=success`,
      cancel_url: `${site}/dealers/pricing/?billing=cancelled`,
    };
    if (dealer.trial_ends_at !== null && dealer.trial_ends_at > now + MIN_TRIAL_CARRYOVER_S) {
      params["subscription_data[trial_end]"] = String(dealer.trial_ends_at);
    }

    const session = await stripeRequest<{ url: string }>(env, "/checkout/sessions", params);
    return json({ checkout_url: session.url });
  } catch (e) {
    if (e instanceof StripeError && e.status === 503) {
      return jsonError(503, "not_configured", "Billing is not configured yet");
    }
    console.error("stripe-checkout failed:", e instanceof Error ? e.message : e);
    return jsonError(502, "stripe_error", "Could not start checkout — try again shortly");
  }
};

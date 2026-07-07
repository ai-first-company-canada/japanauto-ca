/**
 * POST /api/stripe/portal — mint a Customer Portal session (WS-1).
 * Self-serve cancel / payment method / invoices; PCI stays on Stripe.
 * 409 for dealers who never checked out; 503 while billing is dark.
 */

import type { Env } from "../../../types/env";
import { json, jsonError } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getDealerById } from "../_lib/db";
import { stripeRequest, StripeError } from "../_lib/stripe";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  if (!env.STRIPE_SECRET_KEY) {
    return jsonError(503, "not_configured", "Billing is not configured yet");
  }

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return jsonError(404, "not_found", "Dealer not found");
  if (!dealer.stripe_customer_id) {
    return jsonError(409, "not_a_customer", "No billing profile yet — upgrade first");
  }

  try {
    const session = await stripeRequest<{ url: string }>(env, "/billing_portal/sessions", {
      customer: dealer.stripe_customer_id,
      return_url: `${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/dealer/dashboard/`,
    });
    return json({ portal_url: session.url });
  } catch (e) {
    console.error("stripe-portal failed:", e instanceof Error ? e.message : e);
    return jsonError(502, "stripe_error", "Could not open the billing portal — try again shortly");
  }
};

/**
 * POST /api/boost/checkout
 *
 * Creates a Stripe Checkout session for a one-time boost-plan purchase
 * on a specific listing. On webhook success, listings.boost_until and
 * boost_paid_cents are updated; a row is inserted into boost_orders.
 *
 * STATUS: skeleton — Stripe wiring TODO.
 *
 * Body: BoostOrderCreateInput { listing_id, amount_cents, duration_days }
 *
 * Response 200: { checkout_url: string, order_id: string }
 */

import type { Env } from "../../../types/env";
import { boostOrderCreateInputSchema, zodErrorToApiError } from "../../../lib/schema";
import { jsonError, notImplemented, badRequest, forbidden, notFound } from "../_lib/response";
import { requireDealer } from "../_lib/auth";
import { getListingById } from "../_lib/db";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = boostOrderCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  const listing = await getListingById(env, parsed.data.listing_id);
  if (!listing) return notFound("Listing not found");
  if (listing.dealer_id !== auth.dealerId) return forbidden();
  if (listing.status !== "active") {
    return jsonError(422, "validation_failed",
      "Listing must be active to be boosted", { status: ["Listing is not active"] });
  }

  // TODO:
  //  1. Insert pending row into boost_orders (status='paid' set after webhook).
  //  2. Stripe.checkout.sessions.create({
  //       mode: 'payment',
  //       line_items: [{
  //         price_data: { currency: 'cad', unit_amount: amount_cents,
  //           product_data: { name: `Boost — ${listing.title}` } },
  //         quantity: 1,
  //       }],
  //       client_reference_id: order_id,
  //       metadata: { listing_id, dealer_id, duration_days },
  //       success_url: `${env.PUBLIC_SITE_URL}/dashboard/boost/success?id={CHECKOUT_SESSION_ID}`,
  //       cancel_url:  `${env.PUBLIC_SITE_URL}/dashboard/boost/cancel`,
  //     });
  //  3. Return { checkout_url, order_id }.
  //  4. Webhook (POST /api/stripe/webhook) handler does the actual UPDATE
  //     on boost_until + boost_paid_cents and flips boost_orders.status='paid'.

  return notImplemented("Boost checkout — Stripe integration TODO");
};

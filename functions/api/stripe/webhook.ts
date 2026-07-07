/**
 * POST /api/stripe/webhook — Stripe event intake (WS-1 on top of SEC-1/REG-3).
 *
 * Verification (LIVE since b7ed6d2): HMAC over the raw body via
 * _lib/stripe-verify (constant-time, 300s tolerance). Fail-closed: no secret
 * → 503; bad signature → 400. Nothing below runs unverified.
 *
 * Idempotency + atomicity: the FIRST statement of every mutating batch is a
 * plain INSERT into stripe_events (PK = event id) and the dealer mutations
 * ride in the SAME env.DB.batch(). Duplicate delivery → PK conflict → whole
 * batch rolls back → 200 {received, duplicate:true}. Any other failure →
 * nothing written → 500 → Stripe retries cleanly.
 *
 * Handled:
 *   checkout.session.completed (mode=subscription) → adopt customer/sub ids,
 *     tier=pro, unfreeze; (mode=payment → record only; boost flow is separate)
 *   customer.subscription.created|updated → mirror status/period_end (guarded
 *     against out-of-order retries by stripe_last_event_created); live status
 *     → unfreeze frozen rows (4th ADR-0012 gate)
 *   customer.subscription.deleted → canceled/free; grace+freeze then belongs
 *     to the sweeper (workers/expire-sweeper sweepOverCapFreeze)
 *   invoice.paid / invoice.payment_failed → record + log (status transitions
 *     arrive via subscription.updated; dunning email: TODO(resend))
 *   everything else → record, 200 (never 4xx a genuine Stripe event).
 */

import type { Env } from "../../../types/env";
import { jsonError, json } from "../_lib/response";
import { verifyStripeSignature } from "../_lib/stripe-verify";
import {
  mapStripeSubscriptionStatus, resolveSubscriptionPeriodEnd, type StripeSubscription,
} from "../_lib/stripe";
import { LIVE_PAID_SUBSCRIPTION_STATUSES } from "../../../lib/schema";

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

const PAYLOAD_CAP = 64 * 1024; // stripe_events.payload_json audit-trail cap

function isDuplicate(e: unknown): boolean {
  return e instanceof Error && /UNIQUE|PRIMARY KEY/i.test(e.message);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return jsonError(503, "not_configured", "Stripe webhook is not configured");
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) return jsonError(400, "bad_request", "Missing Stripe-Signature header");

  const rawBody = await request.text();
  const now = Math.floor(Date.now() / 1000);
  if (!(await verifyStripeSignature(sig, rawBody, secret, now))) {
    return jsonError(400, "invalid_signature", "Signature verification failed");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
    if (!event?.id || !event?.type) throw new Error("not an event");
  } catch {
    return jsonError(400, "bad_request", "Body is not a Stripe event");
  }

  const eventInsert = env.DB.prepare(`
    INSERT INTO stripe_events (id, type, created, processed_at, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `).bind(event.id, event.type, event.created ?? now, now, rawBody.slice(0, PAYLOAD_CAP));

  const unfreezeFor = (dealerId: string) => [
    env.DB.prepare(`UPDATE listings SET frozen_at = NULL, updated_at = ? WHERE dealer_id = ? AND frozen_at IS NOT NULL`)
      .bind(now, dealerId),
    env.DB.prepare(`UPDATE donor_cars SET frozen_at = NULL, updated_at = ? WHERE dealer_id = ? AND frozen_at IS NOT NULL`)
      .bind(now, dealerId),
  ];

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as {
          mode?: string; customer?: string; subscription?: string; client_reference_id?: string;
        };
        if (s.mode !== "subscription") {
          // One-time payments (listing boost) are a separate flow — record only.
          await env.DB.batch([eventInsert]);
          console.log(`stripe-webhook: recorded non-subscription checkout ${event.id} (mode=${s.mode})`);
          return json({ received: true });
        }
        const dealerId = s.client_reference_id;
        if (!dealerId) {
          await env.DB.batch([eventInsert]);
          console.error(`stripe-webhook: checkout ${event.id} without client_reference_id`);
          return json({ received: true });
        }
        await env.DB.batch([
          eventInsert,
          env.DB.prepare(`
            UPDATE dealers SET stripe_customer_id = COALESCE(stripe_customer_id, ?),
                               stripe_subscription_id = ?,
                               subscription_tier = 'pro',
                               updated_at = ?
            WHERE id = ?
          `).bind(s.customer ?? null, s.subscription ?? null, now, dealerId),
          ...unfreezeFor(dealerId),
        ]);
        return json({ received: true });
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as StripeSubscription;
        const dealerId = await resolveDealerId(env, sub);
        if (!dealerId) {
          await env.DB.batch([eventInsert]);
          console.error(`stripe-webhook: ${event.type} ${event.id}: no dealer for sub ${sub.id}`);
          return json({ received: true });
        }
        const { status, known } = mapStripeSubscriptionStatus(sub.status);
        if (!known) {
          console.error(`stripe-webhook: unknown subscription status '${sub.status}' → stored as 'unpaid'`);
        }
        const periodEnd = resolveSubscriptionPeriodEnd(sub);
        const statements = [
          eventInsert,
          // Guard: an out-of-order retry with an OLDER event.created must not
          // overwrite newer state.
          env.DB.prepare(`
            UPDATE dealers SET subscription_status = ?, subscription_tier = 'pro',
                               stripe_subscription_id = ?, subscription_period_end = ?,
                               stripe_last_event_created = ?, updated_at = ?
            WHERE id = ? AND COALESCE(stripe_last_event_created, 0) <= ?
          `).bind(status, sub.id, periodEnd, event.created ?? now, now, dealerId, event.created ?? now),
        ];
        if ((LIVE_PAID_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
          statements.push(...unfreezeFor(dealerId));
        }
        await env.DB.batch(statements);
        return json({ received: true });
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as unknown as StripeSubscription;
        const dealerId = await resolveDealerId(env, sub);
        if (!dealerId) {
          await env.DB.batch([eventInsert]);
          console.error(`stripe-webhook: deleted ${event.id}: no dealer for sub ${sub.id}`);
          return json({ received: true });
        }
        await env.DB.batch([
          eventInsert,
          env.DB.prepare(`
            UPDATE dealers SET subscription_status = 'canceled', subscription_tier = 'free',
                               subscription_period_end = ?, stripe_last_event_created = ?, updated_at = ?
            WHERE id = ? AND COALESCE(stripe_last_event_created, 0) <= ?
          `).bind(sub.ended_at ?? now, event.created ?? now, now, dealerId, event.created ?? now),
        ]);
        return json({ received: true });
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        // Status transitions arrive via subscription.updated; record + log.
        // TODO(resend): dealer dunning email on payment_failed once the
        // sending domain is verified — import sendEmail from ../_lib/email.
        await env.DB.batch([eventInsert]);
        if (event.type === "invoice.payment_failed") {
          console.error(`stripe-webhook: invoice.payment_failed ${event.id}`);
        }
        return json({ received: true });
      }

      default: {
        await env.DB.batch([eventInsert]);
        return json({ received: true });
      }
    }
  } catch (e) {
    if (isDuplicate(e)) return json({ received: true, duplicate: true });
    console.error(`stripe-webhook: ${event.type} ${event.id} failed:`, e instanceof Error ? e.message : e);
    return jsonError(500, "internal_error", "Event processing failed — Stripe will retry");
  }
};

/** metadata.dealer_id first (we set it at Checkout), then id-based fallbacks. */
async function resolveDealerId(env: Env, sub: StripeSubscription): Promise<string | null> {
  if (sub.metadata?.dealer_id) return sub.metadata.dealer_id;
  const row = await env.DB.prepare(
    `SELECT id FROM dealers WHERE stripe_subscription_id = ? OR stripe_customer_id = ? LIMIT 1`,
  ).bind(sub.id, sub.customer ?? "").first<{ id: string }>();
  return row?.id ?? null;
}

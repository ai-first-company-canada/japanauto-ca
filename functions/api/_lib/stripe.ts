/**
 * functions/api/_lib/stripe.ts
 *
 * Minimal Stripe REST client for Pages Functions (WS-1). No SDK by policy
 * (deps: astro+zod only) — Stripe's API is plain form-encoded POSTs and the
 * workerd-compatible path is a bare fetch.
 *
 * API version is PINNED: "2025-03-31.basil" moved `current_period_end` onto
 * subscription ITEMS — resolveSubscriptionPeriodEnd() reads the item first
 * and falls back to the legacy top-level field, so a future repin can't
 * silently null out subscription_period_end (grace math depends on it).
 *
 * Signature verification lives separately in ./stripe-verify.ts (WS-5/T4).
 */

import type { Env } from "../../../types/env";
import { SUBSCRIPTION_STATUSES } from "../../../lib/schema";

export const STRIPE_API_VERSION = "2025-03-31.basil";

export class StripeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "StripeError";
  }
}

/**
 * POST https://api.stripe.com/v1<path>. `params` is a flat map whose keys use
 * Stripe's bracket notation ("line_items[0][price]", "metadata[dealer_id]").
 * Non-2xx → StripeError with Stripe's error.message (safe to log, not to echo
 * verbatim to end users).
 */
export async function stripeRequest<T>(
  env: Env, path: string, params: Record<string, string>,
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeError(503, "STRIPE_SECRET_KEY not configured");
  const body = new URLSearchParams(params);
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION,
    },
    body: body.toString(),
  });
  const json = await res.json<T & { error?: { message?: string } }>();
  if (!res.ok) {
    throw new StripeError(res.status, json?.error?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

/** True when both the secret key and both price ids are present. */
export function billingConfigured(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO_MONTHLY && env.STRIPE_PRICE_PRO_YEARLY);
}

/**
 * Map a Stripe subscription status onto our CHECK-constrained column set.
 * Unknown statuses (e.g. `paused`, or anything Stripe adds later) map to
 * 'unpaid' — writing them verbatim would violate the dealers CHECK (0001) and
 * roll back the whole webhook batch, bricking event processing. Caller logs.
 */
export function mapStripeSubscriptionStatus(s: string): {
  status: (typeof SUBSCRIPTION_STATUSES)[number]; known: boolean;
} {
  const known = (SUBSCRIPTION_STATUSES as readonly string[]).includes(s);
  return { status: known ? (s as (typeof SUBSCRIPTION_STATUSES)[number]) : "unpaid", known };
}

/** Subscription-shaped webhook payload subset we rely on. */
export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  ended_at?: number | null;
  current_period_end?: number | null; // pre-basil location
  items?: { data?: Array<{ current_period_end?: number | null }> };
  metadata?: Record<string, string>;
}

/** current_period_end moved to items in basil — read new location, fall back. */
export function resolveSubscriptionPeriodEnd(sub: StripeSubscription): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
}

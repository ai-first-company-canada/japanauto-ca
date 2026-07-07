/**
 * tests/stripe-billing.test.ts (WS-1)
 *
 * Pure parts of the billing pipeline: status mapping (CHECK-constraint
 * safety), period-end resolution across the basil API move, and the grace
 * window in getEntitlements. The full webhook flow is exercised live via
 * `stripe listen` (runbook, Billing operations); these pin the pieces a
 * refactor could silently bend.
 */

import { describe, it, expect } from "vitest";
import {
  mapStripeSubscriptionStatus, resolveSubscriptionPeriodEnd, STRIPE_API_VERSION,
} from "../functions/api/_lib/stripe";
import { getEntitlements } from "../functions/api/_lib/entitlements";
import { LIMITS } from "../lib/schema";

const NOW = 1_800_000_000;
const GRACE_S = LIMITS.DOWNGRADE_GRACE_DAYS * 86400;

describe("mapStripeSubscriptionStatus", () => {
  it("passes through every known status", () => {
    for (const s of ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"]) {
      expect(mapStripeSubscriptionStatus(s)).toEqual({ status: s, known: true });
    }
  });
  it("maps unknown statuses (paused, future ones) to 'unpaid' — the dealers CHECK must never roll back a webhook batch", () => {
    expect(mapStripeSubscriptionStatus("paused")).toEqual({ status: "unpaid", known: false });
    expect(mapStripeSubscriptionStatus("some_future_status")).toEqual({ status: "unpaid", known: false });
  });
});

describe("resolveSubscriptionPeriodEnd — basil moved the field onto items", () => {
  const base = { id: "sub_1", status: "active", customer: "cus_1" };
  it("prefers items.data[0].current_period_end", () => {
    expect(resolveSubscriptionPeriodEnd({
      ...base, current_period_end: 111, items: { data: [{ current_period_end: 222 }] },
    })).toBe(222);
  });
  it("falls back to the legacy top-level field", () => {
    expect(resolveSubscriptionPeriodEnd({ ...base, current_period_end: 111 })).toBe(111);
    expect(resolveSubscriptionPeriodEnd({ ...base, current_period_end: 111, items: { data: [] } })).toBe(111);
  });
  it("null when neither exists (grace must not fire off a phantom 0)", () => {
    expect(resolveSubscriptionPeriodEnd(base)).toBeNull();
  });
  it("API version stays pinned (repinning requires re-checking the field move)", () => {
    expect(STRIPE_API_VERSION).toBe("2025-03-31.basil");
  });
});

describe("getEntitlements — downgrade grace window", () => {
  const dealer = (trial: number | null, periodEnd: number | null, status: string | null = null) => ({
    id: "d1", subscription_tier: (status ? "pro" : "free") as "free" | "pro",
    subscription_status: status, trial_ends_at: trial, subscription_period_end: periodEnd,
  });

  it("inGrace right after the paid period lapses, with graceEndsAt = lapse + 7d", () => {
    const e = getEntitlements(dealer(null, NOW - 86_400), NOW);
    expect(e.tier).toBe("free");
    expect(e.inGrace).toBe(true);
    expect(e.graceEndsAt).toBe(NOW - 86_400 + GRACE_S);
  });

  it("takes the LATER of trial end and period end", () => {
    const e = getEntitlements(dealer(NOW - 3 * 86_400, NOW - 10 * 86_400), NOW);
    expect(e.inGrace).toBe(true);
    expect(e.graceEndsAt).toBe(NOW - 3 * 86_400 + GRACE_S);
  });

  it("not inGrace: past the window, never-paid-never-trialed, or still pro", () => {
    expect(getEntitlements(dealer(null, NOW - GRACE_S - 86_400), NOW).inGrace).toBe(false);
    expect(getEntitlements(dealer(null, null), NOW).inGrace).toBe(false);
    const pro = getEntitlements(dealer(null, NOW + 30 * 86_400, "active"), NOW);
    expect(pro.tier).toBe("pro");
    expect(pro.inGrace).toBe(false);
    // live trial → pro → no grace even though period_end is in the past
    expect(getEntitlements(dealer(NOW + 86_400, NOW - 86_400), NOW).inGrace).toBe(false);
  });
});

/**
 * tests/entitlements.test.ts (WS-5/T3)
 *
 * Full effectiveTier matrix + getEntitlements flags. This is the regression
 * guard for COR-4 (the status set lives in LIVE_PAID_SUBSCRIPTION_STATUSES)
 * and for all four entitlement gates (listing cap, market analytics, social
 * boost, fb promotion). Time is injected via nowSec — no fake timers.
 */

import { describe, it, expect } from "vitest";
import { effectiveTier, getEntitlements } from "../functions/api/_lib/entitlements";
import { LIVE_PAID_SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUSES, LIMITS } from "../lib/schema";

const NOW = 1_800_000_000;

function dealer(
  tier: "free" | "pro", status: string | null, trialEndsAt: number | null,
): Parameters<typeof effectiveTier>[0] {
  return { id: "d1", subscription_tier: tier, subscription_status: status, trial_ends_at: trialEndsAt };
}

describe("effectiveTier — paid statuses", () => {
  it.each([
    ["active", "pro"],
    ["trialing", "pro"],
    ["past_due", "pro"],
    ["canceled", "free"],
    ["unpaid", "free"],
    ["incomplete", "free"],
    ["incomplete_expired", "free"],
  ] as const)("(pro, %s, no trial) → %s", (status, expected) => {
    expect(effectiveTier(dealer("pro", status, null), NOW)).toBe(expected);
  });

  it("covers every status in SUBSCRIPTION_STATUSES (matrix completeness)", () => {
    // If a status is ever added to the schema, this forces the matrix update.
    expect([...SUBSCRIPTION_STATUSES].sort()).toEqual(
      ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"].sort(),
    );
    expect([...LIVE_PAID_SUBSCRIPTION_STATUSES].sort()).toEqual(["active", "past_due", "trialing"]);
  });

  it("(pro, null status) → free; (free, active) → free — tier must be pro AND status live", () => {
    expect(effectiveTier(dealer("pro", null, null), NOW)).toBe("free");
    expect(effectiveTier(dealer("free", "active", null), NOW)).toBe("free");
  });
});

describe("effectiveTier — trial", () => {
  it("live trial grants pro regardless of tier column", () => {
    expect(effectiveTier(dealer("free", null, NOW + 86_400), NOW)).toBe("pro");
  });
  it("expired and exactly-now trials do not (strict >)", () => {
    expect(effectiveTier(dealer("free", null, NOW - 1), NOW)).toBe("free");
    expect(effectiveTier(dealer("free", null, NOW), NOW)).toBe("free");
  });
  it("canceled paid + live trial → still pro via trial", () => {
    expect(effectiveTier(dealer("pro", "canceled", NOW + 10), NOW)).toBe("pro");
  });
  it("(free, null, null) → free", () => {
    expect(effectiveTier(dealer("free", null, null), NOW)).toBe("free");
  });
});

describe("getEntitlements", () => {
  it("paid status suppresses the onTrial flag even with a live trial_ends_at", () => {
    const e = getEntitlements(dealer("pro", "active", NOW + 10), NOW);
    expect(e.tier).toBe("pro");
    expect(e.onTrial).toBe(false);
    expect(e.trialDaysLeft).toBe(0);
  });

  it("trialDaysLeft: ceil with a floor of 1", () => {
    expect(getEntitlements(dealer("free", null, NOW + 1), NOW).trialDaysLeft).toBe(1);
    expect(getEntitlements(dealer("free", null, NOW + 86_401), NOW).trialDaysLeft).toBe(2);
  });

  it("free caps listings at FREE_MAX_ACTIVE_LISTINGS; pro is uncapped", () => {
    expect(getEntitlements(dealer("free", null, null), NOW).maxActiveListings)
      .toBe(LIMITS.FREE_MAX_ACTIVE_LISTINGS);
    expect(getEntitlements(dealer("pro", "active", null), NOW).maxActiveListings)
      .toBe(Number.POSITIVE_INFINITY);
  });

  it("pro-only gates: marketAnalytics/socialBoost/fbPromotion; textImprover for both", () => {
    const free = getEntitlements(dealer("free", null, null), NOW);
    expect(free.marketAnalytics).toBe(false);
    expect(free.socialBoost).toBe(false);
    expect(free.fbPromotion).toBe(false);
    expect(free.textImprover).toBe(true);

    const pro = getEntitlements(dealer("free", null, NOW + 86_400), NOW); // via trial
    expect(pro.marketAnalytics).toBe(true);
    expect(pro.socialBoost).toBe(true);
    expect(pro.fbPromotion).toBe(true);
    expect(pro.textImprover).toBe(true);
  });
});

/**
 * tests/cap-guard.test.ts (WS-3/COR-3)
 *
 * Pins activeCapGuard()'s SQL shape and bind order — the predicate every
 * status='active' write folds into its own statement. The SQL semantics
 * (5th insert passes, 6th blocked, -1 bypasses) are additionally exercised
 * against real SQLite in scripts/verify-cap-guard.mjs; here we pin the
 * composition so a refactor can't silently reorder binds.
 */

import { describe, it, expect } from "vitest";
import { activeCapGuard, capExceeded, getEntitlements } from "../functions/api/_lib/entitlements";

const NOW = 1_800_000_000;
const freeDealer = {
  id: "d1", subscription_tier: "free" as const, subscription_status: null, trial_ends_at: null,
};
const proDealer = {
  id: "d2", subscription_tier: "pro" as const, subscription_status: "active", trial_ends_at: null,
};

describe("activeCapGuard", () => {
  it("free dealer, no exclude: cap 5, binds [cap, dealer, cap]", () => {
    const g = activeCapGuard(freeDealer, "listings");
    expect(g.sql).toBe(
      "(? < 0 OR (SELECT COUNT(*) FROM listings WHERE dealer_id = ? AND status = 'active') < ?)",
    );
    expect(g.binds).toEqual([5, "d1", 5]);
  });

  it("free dealer with excludeId: id != ? folded in, binds [cap, dealer, exclude, cap]", () => {
    const g = activeCapGuard(freeDealer, "donor_cars", "row-9");
    expect(g.sql).toBe(
      "(? < 0 OR (SELECT COUNT(*) FROM donor_cars WHERE dealer_id = ? AND status = 'active' AND id != ?) < ?)",
    );
    expect(g.binds).toEqual([5, "d1", "row-9", 5]);
  });

  it("pro dealer: cap -1 short-circuits the predicate to TRUE", () => {
    const g = activeCapGuard(proDealer, "listings");
    expect(g.binds[0]).toBe(-1);
    expect(g.binds[g.binds.length - 1]).toBe(-1);
  });

  it("capExceeded: 403 with the same message the advisory pre-check uses", async () => {
    const resp = capExceeded(getEntitlements(freeDealer, NOW));
    expect(resp.status).toBe(403);
    const body = await resp.json() as { message: string };
    expect(body.message).toMatch(/Free plan allows 5 active listings/);
  });
});

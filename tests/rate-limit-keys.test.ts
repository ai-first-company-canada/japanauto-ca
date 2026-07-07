/**
 * tests/rate-limit-keys.test.ts (WS-5/T5)
 *
 * String-snapshot pins for the D1 rate-limit key format and the PERF-1
 * view-dedupe identifier. These are literal snapshots ON PURPOSE (not built
 * via the same helper): a format change silently resets every in-flight
 * window — for view-dedupe that voids up to a day of view idempotency.
 */

import { describe, it, expect } from "vitest";
import { rateLimitKey, RATE_LIMITS, hashIp, hashIpStable } from "../functions/api/_lib/rate-limit";
import { viewDedupeIdentifier } from "../functions/api/_lib/db";
import type { Env } from "../types/env";

describe("rate-limit key format", () => {
  it("rl:<bucket>:<identifier> — literal snapshot", () => {
    expect(rateLimitKey("login-email", "x@y.z")).toBe("rl:login-email:x@y.z");
  });

  it("view-dedupe full key — literal snapshot of the PERF-1 contract", () => {
    const h = "a".repeat(64);
    expect(rateLimitKey("view-dedupe", viewDedupeIdentifier(h, "listing", "abc")))
      .toBe(`rl:view-dedupe:${"a".repeat(64)}:listing:abc`);
    expect(viewDedupeIdentifier(h, "donor_car", "id-1")).toBe(`${"a".repeat(64)}:donor_car:id-1`);
  });

  it("every RATE_LIMITS bucket name is unique (shared-window collisions)", () => {
    const buckets = Object.values(RATE_LIMITS).map((c) => c.bucket);
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});

describe("IP hashing", () => {
  const env = { DAILY_IP_HASH_SALT: "test-salt", JWT_SECRET: "k".repeat(32) } as unknown as Env;

  it("hashIp: 64 hex chars, deterministic within a run, distinct per IP", async () => {
    const a1 = await hashIp(env, "1.2.3.4");
    const a2 = await hashIp(env, "1.2.3.4");
    const b = await hashIp(env, "5.6.7.8");
    expect(a1).toMatch(/^[0-9a-f]{64}$/);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

  it("hashIpStable: domain-separated from hashIp (different salts/prefixes)", async () => {
    const stable = await hashIpStable(env, "1.2.3.4");
    const daily = await hashIp(env, "1.2.3.4");
    expect(stable).toMatch(/^[0-9a-f]{64}$/);
    expect(stable).not.toBe(daily);
  });
});

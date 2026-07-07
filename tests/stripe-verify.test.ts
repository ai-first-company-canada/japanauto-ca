/**
 * tests/stripe-verify.test.ts (WS-5/T4)
 *
 * Pins verifyStripeSignature (functions/api/_lib/stripe-verify.ts) — the gate
 * every billing mutation (WS-1) sits behind. Signatures are generated in-test
 * with WebCrypto HMAC; no real Stripe secret involved.
 *
 * Contract highlights fixed here:
 *  - tolerance is STRICTLY > 300s (abs delta of exactly 300 passes) — Stripe
 *    retry cadence depends on this; a "fix" to >= would silently break it;
 *  - multiple v1 entries: ANY valid one passes (`some`).
 */

import { describe, it, expect } from "vitest";
import { verifyStripeSignature, TOLERANCE_SECONDS } from "../functions/api/_lib/stripe-verify";

const NOW = 1_800_000_000;
const SECRET = "whsec_test_5upersecretvalue";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

async function sign(secret: string, t: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyStripeSignature", () => {
  it("accepts a valid t + v1 signature", async () => {
    const header = `t=${NOW},v1=${await sign(SECRET, NOW, BODY)}`;
    expect(await verifyStripeSignature(header, BODY, SECRET, NOW)).toBe(true);
  });

  it("rejects a signature made with a different secret", async () => {
    const header = `t=${NOW},v1=${await sign("whsec_other", NOW, BODY)}`;
    expect(await verifyStripeSignature(header, BODY, SECRET, NOW)).toBe(false);
  });

  it("rejects when the body was tampered with", async () => {
    const header = `t=${NOW},v1=${await sign(SECRET, NOW, BODY)}`;
    expect(await verifyStripeSignature(header, BODY + "x", SECRET, NOW)).toBe(false);
  });

  it("rejects timestamps outside tolerance in both directions", async () => {
    const past = NOW - (TOLERANCE_SECONDS + 1);
    const future = NOW + (TOLERANCE_SECONDS + 1);
    expect(await verifyStripeSignature(`t=${past},v1=${await sign(SECRET, past, BODY)}`, BODY, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(`t=${future},v1=${await sign(SECRET, future, BODY)}`, BODY, SECRET, NOW)).toBe(false);
  });

  it("accepts exactly-at-tolerance (strict >; abs delta 300 passes)", async () => {
    const t = NOW - TOLERANCE_SECONDS;
    const header = `t=${t},v1=${await sign(SECRET, t, BODY)}`;
    expect(await verifyStripeSignature(header, BODY, SECRET, NOW)).toBe(true);
  });

  it("rejects headers missing t= or v1=", async () => {
    expect(await verifyStripeSignature(`v1=${await sign(SECRET, NOW, BODY)}`, BODY, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature(`t=${NOW}`, BODY, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature("", BODY, SECRET, NOW)).toBe(false);
  });

  it("accepts when any one of several v1 entries is valid (`some`)", async () => {
    const good = await sign(SECRET, NOW, BODY);
    const header = `t=${NOW},v1=${"0".repeat(64)},v1=${good}`;
    expect(await verifyStripeSignature(header, BODY, SECRET, NOW)).toBe(true);
  });

  it("rejects garbage-only v1 of matching length (timing-safe compare)", async () => {
    const header = `t=${NOW},v1=${"0".repeat(64)}`;
    expect(await verifyStripeSignature(header, BODY, SECRET, NOW)).toBe(false);
  });
});

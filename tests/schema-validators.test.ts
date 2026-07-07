/**
 * tests/schema-validators.test.ts (WS-5/T2)
 *
 * Pins the pure validators in lib/schema.ts that real partner input hits at
 * signup/listing time: VIN (ISO 3779 checksum), dealer hours, postal code,
 * phone (incl. the +1555 ban the prod throwaway-verification recipe relies
 * on), slugs, listing TTL and the rolling year window. These fix CONTRACTS —
 * a red test here means a behaviour change, not a test to update casually.
 */

import { describe, it, expect } from "vitest";
import {
  isValidVinChecksum,
  vinSchema,
  dealerHoursEntrySchema,
  dealerHoursSchema,
  postalCodeSchema,
  phoneSchema,
  normalizePhone,
  slugSchema,
  isListingExpired,
  listingYearWindow,
} from "../lib/schema";

describe("VIN (vinSchema + isValidVinChecksum)", () => {
  it("accepts the all-ones vector (weighted sum 89, 89 % 11 = 1 = position 9)", () => {
    expect(isValidVinChecksum("11111111111111111")).toBe(true);
    expect(vinSchema.safeParse("11111111111111111").success).toBe(true);
  });

  it("accepts a real-world VIN with check digit X", () => {
    expect(isValidVinChecksum("1M8GDM9AXKP042788")).toBe(true);
    expect(vinSchema.safeParse("1M8GDM9AXKP042788").success).toBe(true);
  });

  it("uppercases lowercase input before validating", () => {
    const r = vinSchema.safeParse("1m8gdm9axkp042788");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("1M8GDM9AXKP042788");
  });

  it("rejects a single-character mutation via checksum", () => {
    expect(isValidVinChecksum("21111111111111111")).toBe(false);
    const r = vinSchema.safeParse("21111111111111111");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/checksum/i);
  });

  it("rejects forbidden letters I/O/Q", () => {
    expect(vinSchema.safeParse("1I111111111111111").success).toBe(false);
    expect(isValidVinChecksum("1I111111111111111")).toBe(false);
  });

  it("rejects wrong lengths (16 and 18)", () => {
    expect(vinSchema.safeParse("1111111111111111").success).toBe(false);
    expect(vinSchema.safeParse("111111111111111111").success).toBe(false);
    expect(isValidVinChecksum("1111111111111111")).toBe(false);
  });
});

describe("dealer hours (dealerHoursEntrySchema / dealerHoursSchema)", () => {
  const entry = (open: string | null, close: string | null, dow: number[] = [1]) =>
    dealerHoursEntrySchema.safeParse({ dow, open, close });

  it("accepts a normal day and the 23:59 edge", () => {
    expect(entry("09:00", "17:30").success).toBe(true);
    expect(entry("09:00", "23:59").success).toBe(true);
  });

  it("rejects 24:00, 09:60 and missing leading zero", () => {
    expect(entry("09:00", "24:00").success).toBe(false);
    expect(entry("09:60", "17:00").success).toBe(false);
    expect(entry("9:00", "17:00").success).toBe(false);
  });

  it("requires open strictly before close", () => {
    expect(entry("17:00", "17:00").success).toBe(false);
    expect(entry("18:00", "09:00").success).toBe(false);
  });

  it("allows Closed (both null) but not half-null", () => {
    expect(entry(null, null).success).toBe(true);
    expect(entry(null, "17:00").success).toBe(false);
    expect(entry("09:00", null).success).toBe(false);
  });

  it("bounds dow to 0..6, non-empty", () => {
    expect(entry("09:00", "17:00", [7]).success).toBe(false);
    expect(entry("09:00", "17:00", []).success).toBe(false);
    expect(entry("09:00", "17:00", [0, 6]).success).toBe(true);
  });

  it("caps the week at 7 entries", () => {
    const e = { dow: [1], open: "09:00", close: "17:00" };
    expect(dealerHoursSchema.safeParse(Array(7).fill(e)).success).toBe(true);
    expect(dealerHoursSchema.safeParse(Array(8).fill(e)).success).toBe(false);
  });
});

describe("postal code (postalCodeSchema)", () => {
  it("accepts and normalizes valid forms", () => {
    expect(postalCodeSchema.safeParse("T2P 1J9").success).toBe(true);
    const lower = postalCodeSchema.safeParse("t2p1j9");
    expect(lower.success).toBe(true);
    if (lower.success) expect(lower.data).toBe("T2P 1J9");
    const dashed = postalCodeSchema.safeParse("A1A-1A1");
    expect(dashed.success).toBe(true);
    if (dashed.success) expect(dashed.data).toBe("A1A 1A1");
  });

  it("rejects forbidden first letters and short input", () => {
    expect(postalCodeSchema.safeParse("D1A 1A1").success).toBe(false);
    expect(postalCodeSchema.safeParse("Z1A 1A1").success).toBe(false);
    expect(postalCodeSchema.safeParse("A1A 1A").success).toBe(false);
  });
});

describe("phone (phoneSchema + normalizePhone)", () => {
  it("normalizes national formats to E.164", () => {
    expect(normalizePhone("(403) 555-1234")).toBe("+14035551234");
    expect(normalizePhone("4035551234")).toBe("+14035551234");
    const r = phoneSchema.safeParse("(403) 555-1234");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("+14035551234");
  });

  it("bans the +1555 fiction prefix (prod throwaway-recipe contract)", () => {
    const r = phoneSchema.safeParse("+15556661234");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toMatch(/fiction/i);
  });

  it("rejects non-NANP area/exchange codes and foreign numbers", () => {
    expect(phoneSchema.safeParse("+11235551234").success).toBe(false); // area code must be [2-9]
    expect(phoneSchema.safeParse("+441632960961").success).toBe(false);
  });
});

describe("slug (slugSchema)", () => {
  it("accepts kebab-case", () => {
    expect(slugSchema.safeParse("toyota-corolla").success).toBe(true);
  });

  it("rejects uppercase, leading dash, double dash and >75 chars", () => {
    expect(slugSchema.safeParse("Toyota").success).toBe(false);
    expect(slugSchema.safeParse("-a").success).toBe(false);
    expect(slugSchema.safeParse("a--b").success).toBe(false);
    expect(slugSchema.safeParse("a".repeat(76)).success).toBe(false);
    expect(slugSchema.safeParse("a".repeat(75)).success).toBe(true);
  });
});

describe("isListingExpired — readers gate TTL themselves (audit #8)", () => {
  const now = 1_800_000_000;
  it("null expires_at never expires", () => {
    expect(isListingExpired({ expires_at: null }, now)).toBe(false);
  });
  it("past and exactly-now are expired (<= contract), future is not", () => {
    expect(isListingExpired({ expires_at: now - 1 }, now)).toBe(true);
    expect(isListingExpired({ expires_at: now }, now)).toBe(true); // <= — flips at the boundary
    expect(isListingExpired({ expires_at: now + 1 }, now)).toBe(false);
  });
});

describe("listingYearWindow — rolling 10-year window + 1 lookahead", () => {
  it("computes {2016, 2027} for an injected 2026 date", () => {
    expect(listingYearWindow(new Date("2026-07-06T12:00:00Z"))).toEqual({ min: 2016, max: 2027 });
  });
});

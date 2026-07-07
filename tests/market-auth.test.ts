/**
 * tests/market-auth.test.ts (WS-5/T6)
 *
 * Pins the market-sync auth ladder (workers/expire-sweeper/src/market-auth.ts):
 * rung ORDER and exact header composition. The daily market_stats sync degrades
 * through these rungs — reordering or header drift silently changes which
 * Postgres role reads the scraper project's view (contract §3, 2026-06-12).
 *
 * Imports ONLY market-auth.ts (self-contained by design) so the root typecheck
 * never pulls the rest of the worker into the Pages compilation unit.
 */

import { describe, it, expect } from "vitest";
import { buildMarketAuthAttempts } from "../workers/expire-sweeper/src/market-auth";

const SECRET = "sb_secret_abc";
const ANON = "anon_key_def";
const JWT = "jwt.role.japanauto_sync";

describe("buildMarketAuthAttempts", () => {
  it("all three secrets → exactly three rungs, in degradation order, exact headers", () => {
    const a = buildMarketAuthAttempts({
      MARKET_SUPABASE_SECRET_KEY: SECRET,
      MARKET_SUPABASE_ANON_KEY: ANON,
      MARKET_SYNC_JWT: JWT,
    });
    expect(a.map((x) => x.label)).toEqual([
      "jwt-role (least privilege)",
      "legacy anon+jwt",
      "sb-secret only",
    ]);
    expect(a[0]!.headers).toEqual({ apikey: SECRET, Authorization: `Bearer ${JWT}` });
    expect(a[1]!.headers).toEqual({ apikey: ANON, Authorization: `Bearer ${JWT}` });
    expect(a[2]!.headers).toEqual({ apikey: SECRET });
  });

  it("secret key only → single sb-secret rung", () => {
    const a = buildMarketAuthAttempts({ MARKET_SUPABASE_SECRET_KEY: SECRET });
    expect(a.map((x) => x.label)).toEqual(["sb-secret only"]);
    expect(a[0]!.headers).toEqual({ apikey: SECRET });
  });

  it("anon + jwt only → single legacy rung", () => {
    const a = buildMarketAuthAttempts({ MARKET_SUPABASE_ANON_KEY: ANON, MARKET_SYNC_JWT: JWT });
    expect(a.map((x) => x.label)).toEqual(["legacy anon+jwt"]);
    expect(a[0]!.headers).toEqual({ apikey: ANON, Authorization: `Bearer ${JWT}` });
  });

  it("jwt without any apikey → no rungs (gateway always needs apikey)", () => {
    expect(buildMarketAuthAttempts({ MARKET_SYNC_JWT: JWT })).toEqual([]);
  });

  it("no secrets → no rungs (sync becomes a logged no-op)", () => {
    expect(buildMarketAuthAttempts({})).toEqual([]);
  });
});

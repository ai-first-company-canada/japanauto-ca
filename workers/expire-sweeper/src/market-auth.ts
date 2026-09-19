/**
 * workers/expire-sweeper/src/market-auth.ts
 *
 * Auth-ladder construction for the daily market-stats sync (contract §3, JWT
 * handover 2026-06-12), extracted from syncMarketStats (WS-5/T6) so the rung
 * order and header composition are unit-testable from the root test suite.
 *
 * Deliberately self-contained: imports nothing from index.ts/reports.ts so the
 * root tsconfig can typecheck tests importing this file without pulling the
 * whole worker (ExportedHandler types etc.) into the Pages typecheck.
 *
 * Rung order is the degradation contract the daily sync depends on:
 *   1. jwt-role              — secret apikey + japanauto_sync JWT (only while
 *                              MARKET_SUPABASE_SECRET_KEY is still set)
 *   2. legacy anon+jwt       — anon apikey + JWT. THE production rung: least
 *                              privilege, verified live 2026-09-17 (200 stats
 *                              view / 403 listings). No secret key required.
 *   3. sb-secret only        — secret apikey, service role. Retired once
 *                              MARKET_SUPABASE_SECRET_KEY is deleted (OPS-5).
 */

export interface MarketAuthEnv {
  MARKET_SUPABASE_SECRET_KEY?: string;
  MARKET_SUPABASE_ANON_KEY?: string;
  MARKET_SYNC_JWT?: string;
}

export interface AuthAttempt {
  label: string;
  headers: Record<string, string>;
}

export function buildMarketAuthAttempts(env: MarketAuthEnv): AuthAttempt[] {
  const { MARKET_SUPABASE_SECRET_KEY, MARKET_SUPABASE_ANON_KEY, MARKET_SYNC_JWT } = env;
  const attempts: AuthAttempt[] = [];
  if (MARKET_SUPABASE_SECRET_KEY && MARKET_SYNC_JWT) {
    attempts.push({
      label: "jwt-role (least privilege)",
      headers: { apikey: MARKET_SUPABASE_SECRET_KEY, Authorization: `Bearer ${MARKET_SYNC_JWT}` },
    });
  }
  if (MARKET_SUPABASE_ANON_KEY && MARKET_SYNC_JWT) {
    attempts.push({
      label: "legacy anon+jwt",
      headers: { apikey: MARKET_SUPABASE_ANON_KEY, Authorization: `Bearer ${MARKET_SYNC_JWT}` },
    });
  }
  if (MARKET_SUPABASE_SECRET_KEY) {
    attempts.push({ label: "sb-secret only", headers: { apikey: MARKET_SUPABASE_SECRET_KEY } });
  }
  return attempts;
}

/// <reference types="@cloudflare/workers-types" />

import { sendReports, type ReportsEnv } from "./reports";

interface Env {
  DB: D1Database;
  // Dealer e-mail reports (decision 0016): both absent → logged no-op.
  RESEND_API_KEY?: string;        // wrangler secret put RESEND_API_KEY
  REPORTS_UNSUB_SECRET?: string;  // shared with /api/reports/unsubscribe on Pages
  REPORTS_FROM?: string;          // optional var override
  MARKET_SUPABASE_URL?: string;       // https://<project>.supabase.co — non-secret, set in [vars]
  // Auth: the scraper project migrated to ES256 JWT signing keys, so the
  // originally-designed self-minted HS256 JWT (role japanauto_sync) cannot
  // validate there. Fallback: a Secret API key (sb_secret_…) sent as the
  // apikey header — broader rights than designed (service_role), accepted
  // because it lives only in Cloudflare secrets. Set via:
  //   npx wrangler secret put MARKET_SUPABASE_SECRET_KEY
  MARKET_SUPABASE_SECRET_KEY?: string;
  // Legacy pair kept for the day the scraper project mints role-scoped keys:
  MARKET_SUPABASE_ANON_KEY?: string;  // anon key (PostgREST apikey header)
  MARKET_SYNC_JWT?: string;           // JWT with {"role":"japanauto_sync"}
}

const MARKET_SYNC_CRON = "45 9 * * *"; // daily 09:45 UTC ≈ 03:45 Calgary, after the scraper's nightly cadence

interface ViewRow {
  city_slug: string;
  make_slug: string;
  model_slug: string;
  anchor_year: number;
  mileage_bucket: string;
  source: string;
  n_active: number;
  price_p25: number | null;
  price_p50: number | null;
  price_p75: number | null;
  n_delisted: number;
  median_days_listed: number | null;
  computed_on: string;
}

/**
 * Pulls the scraper project's japanauto_market_stats view via PostgREST and
 * replaces the D1 market_stats snapshot in one transactional batch (D1 batch
 * = implicit transaction, so readers never observe a half-synced table).
 * Money: the view emits whole CAD dollars; D1 stores cents (app invariant).
 */
async function syncMarketStats(env: Env): Promise<void> {
  const { MARKET_SUPABASE_URL, MARKET_SUPABASE_SECRET_KEY, MARKET_SUPABASE_ANON_KEY, MARKET_SYNC_JWT } = env;
  // sb_secret keys are NOT JWTs — they go in `apikey` alone (a Bearer header
  // with a non-JWT would make PostgREST reject the request outright).
  let headers: Record<string, string>;
  if (MARKET_SUPABASE_SECRET_KEY) {
    headers = { apikey: MARKET_SUPABASE_SECRET_KEY };
  } else if (MARKET_SUPABASE_ANON_KEY && MARKET_SYNC_JWT) {
    headers = { apikey: MARKET_SUPABASE_ANON_KEY, Authorization: `Bearer ${MARKET_SYNC_JWT}` };
  } else {
    console.log("market-sync: secrets not configured — skipping");
    return;
  }
  if (!MARKET_SUPABASE_URL) {
    console.log("market-sync: MARKET_SUPABASE_URL not configured — skipping");
    return;
  }

  // PostgREST limit/offset pagination is only deterministic with an explicit
  // total order — without it Postgres may duplicate/skip rows across pages
  // (caught in adversarial review). Order over the full target PK; advance by
  // the rows actually received (a project-level max-rows cap can shrink a
  // "full" page); terminate only on an empty page.
  const PAGE = 1000;
  const ORDER = "city_slug.asc,make_slug.asc,model_slug.asc,anchor_year.asc,mileage_bucket.asc,source.asc";
  const rows: ViewRow[] = [];
  for (let offset = 0; ; ) {
    const url = `${MARKET_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/japanauto_market_stats` +
      `?select=*&order=${ORDER}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`market-sync: PostgREST ${res.status} at offset ${offset}: ${(await res.text()).slice(0, 200)}`);
    }
    const page = await res.json<ViewRow[]>();
    if (page.length === 0) break;
    rows.push(...page);
    offset += page.length;
    if (offset > 100_000) throw new Error("market-sync: runaway pagination — aborting");
  }

  if (rows.length === 0) {
    // An empty view almost certainly means an upstream problem (role grant,
    // empty rescrape). Keep yesterday's snapshot rather than blanking the UI.
    console.log("market-sync: view returned 0 rows — keeping previous snapshot");
    return;
  }

  // The D1 CHECK on mileage_bucket would abort a whole batch on one drifted
  // label — skip-and-log instead, so an upstream rename degrades gracefully.
  const KNOWN_BUCKETS = new Set(["all", "0-100k", "100-200k", "200k+"]);
  const usable = rows.filter((r) => KNOWN_BUCKETS.has(r.mileage_bucket));
  if (usable.length < rows.length) {
    console.log(`market-sync: skipped ${rows.length - usable.length} rows with unknown mileage_bucket`);
  }

  const now = Math.floor(Date.now() / 1000);
  const cents = (d: number | null) => (d == null ? null : Math.round(d * 100));

  // D1 hard-caps 100 bound parameters per statement (NOT SQLite's 999 — and
  // local miniflare won't enforce it, so only prod would fail; caught in
  // adversarial review): 7 rows × 14 cols = 98 params. Upsert in batches of
  // ≤40 statements, then drop rows the run didn't touch — readers briefly see
  // a fresh/stale row mix instead of an empty table, which is fine for a
  // daily snapshot and avoids one giant batch hitting per-invocation caps.
  const ROWS_PER_STMT = 7;
  const STMTS_PER_BATCH = 40;
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < usable.length; i += ROWS_PER_STMT) {
    const chunk = usable.slice(i, i + ROWS_PER_STMT);
    const placeholders = chunk.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const binds: unknown[] = [];
    for (const r of chunk) {
      binds.push(
        r.city_slug, r.make_slug, r.model_slug, r.anchor_year, r.mileage_bucket,
        r.source ?? "marketplace",
        r.n_active ?? 0, cents(r.price_p25), cents(r.price_p50), cents(r.price_p75),
        r.n_delisted ?? 0,
        r.median_days_listed == null ? null : Math.round(r.median_days_listed),
        r.computed_on ?? null, now,
      );
    }
    statements.push(env.DB.prepare(`
      INSERT OR REPLACE INTO market_stats (
        city_slug, make_slug, model_slug, anchor_year, mileage_bucket, source,
        n_active, price_p25_cents, price_p50_cents, price_p75_cents,
        n_delisted, median_days_listed, computed_on, synced_at
      ) VALUES ${placeholders}
    `).bind(...binds));
  }
  for (let i = 0; i < statements.length; i += STMTS_PER_BATCH) {
    await env.DB.batch(statements.slice(i, i + STMTS_PER_BATCH));
  }
  const { meta } = await env.DB.prepare(
    `DELETE FROM market_stats WHERE synced_at < ?`,
  ).bind(now).run();
  console.log(
    `market-sync: upserted ${usable.length} rows (${statements.length} statements), removed ${meta.changes} stale`,
  );
}

async function sweepExpired(env: Env, cron: string): Promise<void> {
  const { meta } = await env.DB.prepare(
    `UPDATE listings
        SET status = 'expired', updated_at = unixepoch()
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND expires_at <= unixepoch()`,
  ).run();
  console.log(
    `expire-sweeper: ${meta.changes} listing(s) marked expired (cron "${cron}")`,
  );

  // PII retention (LAUNCH-CHECKLIST §3b): expired refresh tokens carry raw
  // ip_address/user_agent — drop them 30 days past expiry (rotated_to FK is
  // ON DELETE SET NULL, so chains are safe); consumed/expired verification
  // tokens and 90-day-old contact reveals have no reason to live longer.
  // rate_limits keys embed raw IPs/emails — sweep windows older than 2× the
  // largest window (24h) so one-off visitor keys don't accumulate forever.
  // Featured slots whose paid window lapsed flip to 'ended' so the (city,
  // make) exclusivity pair frees up automatically on non-payment (ADR-0013).
  const [rt, vt, cr, rl, fs] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM refresh_tokens WHERE expires_at < unixepoch() - 2592000`),
    env.DB.prepare(`DELETE FROM verification_tokens WHERE consumed_at IS NOT NULL OR expires_at < unixepoch()`),
    env.DB.prepare(`DELETE FROM contact_reveals WHERE revealed_at < unixepoch() - 7776000`),
    env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < unixepoch() - 172800`),
    env.DB.prepare(`UPDATE featured_slots SET status = 'ended', updated_at = unixepoch()
                    WHERE status IN ('active','paused') AND active_until <= unixepoch()`),
  ]);
  const cleaned = (rt.meta.changes ?? 0) + (vt.meta.changes ?? 0) + (cr.meta.changes ?? 0)
    + (rl.meta.changes ?? 0) + (fs.meta.changes ?? 0);
  if (cleaned > 0) {
    console.log(
      `retention: removed ${rt.meta.changes} refresh_tokens, ${vt.meta.changes} verification_tokens, ` +
      `${cr.meta.changes} contact_reveals, ${rl.meta.changes} rate_limits; ended ${fs.meta.changes} lapsed slots`,
    );
  }
}

const SWEEP_CRON = "0 */6 * * *";
const WEEKLY_REPORT_CRON = "0 14 * * 1";   // Mondays 14:00 UTC ≈ 08:00 Calgary
const MONTHLY_REPORT_CRON = "30 14 1 * *"; // 1st of month, 14:30 UTC

export default {
  async scheduled(controller, env, _ctx) {
    // Exact-match dispatch both ways; an unmatched cron (e.g. a trigger string
    // reformatted in the dashboard) fails loudly instead of silently running
    // the wrong job.
    if (controller.cron === MARKET_SYNC_CRON) {
      await syncMarketStats(env);
    } else if (controller.cron === SWEEP_CRON) {
      await sweepExpired(env, controller.cron);
    } else if (controller.cron === WEEKLY_REPORT_CRON) {
      await sendReports(env as ReportsEnv, "weekly");
    } else if (controller.cron === MONTHLY_REPORT_CRON) {
      await sendReports(env as ReportsEnv, "monthly");
    } else {
      throw new Error(`unknown cron "${controller.cron}" — update the dispatch in src/index.ts`);
    }
  },
} satisfies ExportedHandler<Env>;

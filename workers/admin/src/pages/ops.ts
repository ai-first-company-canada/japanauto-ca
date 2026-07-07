/// <reference types="@cloudflare/workers-types" />
/**
 * /ops — operational health + unblock tools: row counts across every table,
 * market-sync freshness (the expire-sweeper cron pulls Supabase → market_stats
 * daily), rate-limit clearing (a partner locked out of login/signup), stale
 * pending-media purge (mint-time claims that were never finalized, migration
 * 0009), and the admin audit trail itself.
 */

import type { AdminEnv } from "../lib/access";
import { audit } from "../lib/audit";
import { actionBtn, badge, esc, fmtAgo, fmtTs, page, redirect } from "../lib/html";

/** Code-constant allowlist — table names are NEVER taken from input. */
const COUNT_TABLES = [
  "dealers",
  "listings",
  "donor_cars",
  "media",
  "refresh_tokens",
  "verification_tokens",
  "rate_limits",
  "social_boost_jobs",
  "featured_slots",
  "market_stats",
  "entity_stats_daily",
  "pending_media_uploads",
  "ops_heartbeats",
] as const;

/** Staleness thresholds per cron job (mirror scripts/check-cron-heartbeats.mjs). */
const HEARTBEAT_THRESHOLDS_S: Record<string, number> = {
  "expire-sweep":    13 * 3600,
  "market-sync":     26 * 3600,
  "reports-weekly":   8 * 86400,
  "reports-monthly": 32 * 86400,
};

/** The market sync runs daily; >36h without a row means a missed run + slack. */
const MARKET_STALE_AFTER_S = 36 * 3600;

/** Pending media claims older than this are orphans (mint without finalize). */
const PENDING_MEDIA_TTL_S = 86400;

interface RateLimitRow {
  key: string;
  count: number;
  window_start: number;
}

interface AuditRow {
  at: number;
  admin_email: string;
  action: string;
  target: string | null;
  details: string | null;
}

export async function opsPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  // (a) Row counts — one batch, one round-trip; order mirrors COUNT_TABLES.
  const countResults = await env.DB.batch<{ n: number }>(
    COUNT_TABLES.map((t) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`)),
  );
  const kpis = COUNT_TABLES.map((t, i) => {
    const n = countResults[i]?.results?.[0]?.n ?? 0;
    return `<div class="kpi"><span>${esc(t)}</span><b>${n.toLocaleString("en-US")}</b></div>`;
  }).join("");

  // (b) Market sync freshness — MAX(synced_at) over the whole snapshot table.
  const marketSummary = await env.DB.prepare(`
    SELECT MAX(synced_at) AS last_sync, COUNT(*) AS n_rows, MAX(computed_on) AS last_computed
    FROM market_stats
  `).first<{ last_sync: number | null; n_rows: number; last_computed: string | null }>();
  const marketBySource = await env.DB.prepare(`
    SELECT source, COUNT(*) AS n FROM market_stats GROUP BY source ORDER BY source
  `).all<{ source: string; n: number }>();

  const lastSync = marketSummary?.last_sync ?? null;
  const marketFresh = lastSync !== null && now - lastSync <= MARKET_STALE_AFTER_S;
  const sourceBits = (marketBySource.results ?? [])
    .map((s) => `${esc(s.source)}: <b>${s.n.toLocaleString("en-US")}</b>`)
    .join(" · ");

  // (b2) Cron heartbeats (OPS-4, migration 0023) — tolerate a pre-0023 DB
  // like the audit block below does.
  let heartbeatBody: string;
  try {
    const hb = await env.DB.prepare(`
      SELECT job_name, last_ok_at, last_error, last_error_at FROM ops_heartbeats ORDER BY job_name
    `).all<{ job_name: string; last_ok_at: number | null; last_error: string | null; last_error_at: number | null }>();
    const hbRows = (hb.results ?? []).map((h) => {
      const threshold = HEARTBEAT_THRESHOLDS_S[h.job_name] ?? 26 * 3600;
      const fresh = h.last_ok_at !== null && now - h.last_ok_at <= threshold;
      const err = h.last_error
        ? `<span style="font-size:12px;color:#a02020">[${fmtAgo(h.last_error_at)}] ${esc(h.last_error.slice(0, 160))}</span>`
        : `<span style="color:#9aa1a9">—</span>`;
      return `<tr>
        <td style="font:12px ui-monospace,monospace">${esc(h.job_name)}</td>
        <td>${fresh ? badge("ok", "ok") : badge("stale", "bad")}</td>
        <td>${fmtAgo(h.last_ok_at)}</td>
        <td>${err}</td>
      </tr>`;
    }).join("");
    heartbeatBody = `<table>
      <tr><th>Job</th><th>Status</th><th>Last ok</th><th>Last error</th></tr>
      ${hbRows || `<tr><td colspan="4" style="text-align:center;color:#9aa1a9;padding:24px">No heartbeats yet — first cron run after the 0023 deploy pending.</td></tr>`}
    </table>`;
  } catch {
    heartbeatBody = `<p style="color:#9aa1a9">Heartbeats unavailable — migration 0023 pending.</p>`;
  }

  // (c) Rate-limit counters — fixed-window rows (0008), newest window first.
  const rl = await env.DB.prepare(`
    SELECT "key", "count", window_start FROM rate_limits
    ORDER BY window_start DESC LIMIT 100
  `).all<RateLimitRow>();
  const rlRows = (rl.results ?? []).map((r) => `<tr>
      <td style="font:12px ui-monospace,monospace;word-break:break-all">${esc(r.key)}</td>
      <td style="text-align:right"><b>${r.count}</b></td>
      <td>${fmtAgo(r.window_start)}</td>
      <td>${actionBtn("/ops/action", { do: "rl_clear", key: r.key }, "Clear", { danger: true })}</td>
    </tr>`).join("");

  // (d) Orphaned pending-media claims (minted >24h ago, never finalized).
  const stalePending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM pending_media_uploads WHERE created_at < ?`,
  ).bind(now - PENDING_MEDIA_TTL_S).first<{ n: number }>();
  const staleN = stalePending?.n ?? 0;

  // (e) Audit trail — tolerate a DB that hasn't run migration 0017 yet.
  let auditBody: string;
  try {
    const log = await env.DB.prepare(`
      SELECT at, admin_email, action, target, details FROM admin_audit_log
      ORDER BY at DESC LIMIT 50
    `).all<AuditRow>();
    const auditRows = (log.results ?? []).map((a) => {
      const details = a.details && a.details.length > 120
        ? a.details.slice(0, 120) + "…" : a.details;
      return `<tr>
        <td style="white-space:nowrap">${fmtTs(a.at)}</td>
        <td>${esc(a.admin_email)}</td>
        <td>${badge(a.action, "muted")}</td>
        <td style="font:12px ui-monospace,monospace;word-break:break-all">${esc(a.target ?? "—")}</td>
        <td style="font-size:12px;color:#5a6068;word-break:break-all">${esc(details ?? "")}</td>
      </tr>`;
    }).join("");
    auditBody = `<table>
      <tr><th>At</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr>
      ${auditRows || `<tr><td colspan="5" style="text-align:center;color:#9aa1a9;padding:24px">No audit entries yet.</td></tr>`}
    </table>`;
  } catch {
    auditBody = `<p style="color:#9aa1a9">Audit log unavailable — migration 0017 pending.</p>`;
  }

  const body = `
    <h1>Ops</h1>

    <h2>Tables</h2>
    <div class="kpis">${kpis}</div>

    <h2>Market sync</h2>
    <p>
      ${marketFresh ? badge("fresh", "ok") : badge("stale", "bad")}
      last sync <b>${fmtAgo(lastSync)}</b> (${fmtTs(lastSync)})
      · ${(marketSummary?.n_rows ?? 0).toLocaleString("en-US")} rows
      · computed_on ${esc(marketSummary?.last_computed ?? "—")}<br>
      <span style="font-size:12px;color:#5a6068">${sourceBits || "no sources yet"}</span>
    </p>

    <h2>Cron heartbeats</h2>
    ${heartbeatBody}

    <h2>Rate limits <span style="color:#9aa1a9;font-weight:400">(${rl.results?.length ?? 0}, newest window first)</span></h2>
    <table>
      <tr><th>Key</th><th style="text-align:right">Count</th><th>Window start</th><th></th></tr>
      ${rlRows || `<tr><td colspan="4" style="text-align:center;color:#9aa1a9;padding:24px">No rate-limit counters.</td></tr>`}
    </table>

    <h2>Pending media uploads</h2>
    <p>
      <b>${staleN.toLocaleString("en-US")}</b> claim${staleN === 1 ? "" : "s"} older than 24&nbsp;h
      (minted, never finalized — safe to purge; a finalize consumes its row).
      ${actionBtn("/ops/action", { do: "purge_media" }, "Purge stale", { danger: true })}
    </p>

    <h2>Admin audit log <span style="color:#9aa1a9;font-weight:400">(last 50)</span></h2>
    ${auditBody}`;

  return page({ title: "Ops", path: "/ops", adminEmail, msg: url.searchParams.get("msg"), body });
}

export async function opsAction(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const action = String(form.get("do") ?? "");
  const now = Math.floor(Date.now() / 1000);

  switch (action) {
    case "rl_clear": {
      // Exact-key delete only — never a pattern; the key is a bound param.
      const key = String(form.get("key") ?? "").trim();
      if (!key || key.length > 512) return redirect("/ops", "Bad rate-limit key");
      const res = await env.DB.prepare(`DELETE FROM rate_limits WHERE "key" = ?`)
        .bind(key).run();
      if ((res.meta.changes ?? 0) === 0) {
        return redirect("/ops", "Rate-limit key not found (already cleared?)");
      }
      // The key tail embeds raw IPs/emails — the append-only audit log keeps
      // only the bucket prefix (PII stance, audit #20); the operator saw the
      // full key in the UI when clicking Clear.
      const bucket = key.split(":").slice(0, 2).join(":") + ":<redacted>";
      await audit(env, adminEmail, "ops.rl_clear", bucket, { bucket });
      return redirect("/ops", `Rate limit cleared: ${key}`);
    }
    case "purge_media": {
      const res = await env.DB.prepare(
        `DELETE FROM pending_media_uploads WHERE created_at < ?`,
      ).bind(now - PENDING_MEDIA_TTL_S).run();
      const deleted = res.meta.changes ?? 0;
      await audit(env, adminEmail, "ops.pending_media_purge", null, { deleted });
      return redirect("/ops", `Purged ${deleted} stale pending upload${deleted === 1 ? "" : "s"}`);
    }
    default:
      return redirect("/ops", "Unknown action");
  }
}

/**
 * scripts/check-cron-heartbeats.mjs (deep-audit OPS-4, WS-4)
 *
 * Reads ops_heartbeats (migration 0023, written by workers/expire-sweeper)
 * and fails when a REQUIRED cron job's last successful run is older than its
 * staleness threshold. Runs in deploy.yml's 3-hourly schedule AFTER the Pages
 * deploy: a stale heartbeat must not block the catalog redeploy, but it turns
 * the scheduled run red — and GitHub emails the repo owner about failed
 * scheduled workflows. Detection latency ≤ ~3h (the schedule cadence).
 *
 * Exit codes: 0 = healthy / table not created yet / D1 unreachable (WARN);
 *             1 = a REQUIRED job is stale.
 *
 * reports-* stay non-required until Resend is live: their "ok" beat means
 * "job ran", not "mail was sent" (they no-op without secrets).
 */

import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THRESHOLDS_S = {
  "expire-sweep":    13 * 3600,   // 6h cadence → 2 missed runs + slack
  "market-sync":     26 * 3600,   // daily 09:45 UTC + slack
  "reports-weekly":   8 * 86400,
  "reports-monthly": 32 * 86400,
};
const REQUIRED = ["expire-sweep", "market-sync"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iso = (s) => (s ? new Date(s * 1000).toISOString() : "never");

let rows;
try {
  const out = execFileSync("npx", [
    "wrangler", "d1", "execute", "japanauto-prod", "--remote", "--json",
    "--command", "SELECT job_name, last_ok_at, last_error, last_error_at FROM ops_heartbeats",
  ], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  rows = JSON.parse(out)[0]?.results ?? [];
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/no such table/i.test(msg)) {
    console.warn("WARN: ops_heartbeats missing — migration 0023 not applied yet");
  } else {
    console.warn("WARN: heartbeat check skipped (D1 unreachable / no auth):", msg.split("\n")[0]);
  }
  process.exit(0);
}

const byName = new Map(rows.map((r) => [r.job_name, r]));
const now = Math.floor(Date.now() / 1000);
let stale = false;

for (const [job, threshold] of Object.entries(THRESHOLDS_S)) {
  const required = REQUIRED.includes(job);
  const r = byName.get(job);
  if (!r || r.last_ok_at == null) {
    // First run after the worker deploy hasn't happened yet — warn, don't fail.
    console.log(`::warning::cron '${job}' has no ok-heartbeat yet (worker deployed recently?)`);
    continue;
  }
  const age = now - r.last_ok_at;
  if (age > threshold) {
    const line = `cron '${job}' stale: last ok ${iso(r.last_ok_at)} (${Math.round(age / 3600)}h ago)` +
      (r.last_error ? `; last_error [${iso(r.last_error_at)}]: ${r.last_error}` : "");
    if (required) { console.log(`::error::${line}`); stale = true; }
    else console.log(`::warning::${line}`);
  } else if (r.last_error_at != null && r.last_error_at > r.last_ok_at - 86400 && r.last_error_at <= now) {
    if (r.last_error_at > r.last_ok_at) {
      console.log(`::warning::cron '${job}' failed at ${iso(r.last_error_at)} after its last ok: ${r.last_error}`);
    } else if (now - r.last_error_at < 86400) {
      console.log(`::warning::cron '${job}' recovered, but failed within the last 24h: ${r.last_error}`);
    }
  }
}

if (!stale) console.log("cron heartbeats: healthy");
process.exit(stale ? 1 : 0);

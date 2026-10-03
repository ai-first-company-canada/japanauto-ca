#!/usr/bin/env node
/**
 * scripts/export-market-data.mjs — build-time snapshot of asking-price stats
 * for the public market capsule (Calgary pilot, owner decisions 2026-09-16 and
 * 2026-10-03: market data is public, dealer and private segments side by side,
 * Calgary only until the pilot is validated).
 *
 * Reads prod D1 `market_stats` (mileage_bucket 'all') for PILOT_CITIES and
 * writes src/data/market-live.json, which src/lib/market.ts reads at SSG time.
 * Committed like catalog-live.json so builds stay reproducible without auth.
 *
 * Segments are never blended: `dealer` = autotrader rows with seller_kind
 * 'dealer'; `private` = marketplace rows (private online listings; both of its
 * seller_kind rows are summed, keeping the larger row's prices — same rule as
 * GUIDES-TOOLS/market_export.py). autotrader+private rows are junk (n 0–1).
 *
 * Each upstream row aggregates model year ±1 (anchor_year = window centre), so
 * prices describe a 3-year window. The exact per-model-year count is recovered
 * by deconvolution: n(a) = c(a-1) + c(a) + c(a+1), solved upward.
 * Cell: [n_window, p25, p50, p75, n_exact] in whole dollars.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PILOT_CITIES = ["calgary"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SQL = `
SELECT city_slug c, make_slug mk, model_slug md, anchor_year y, source s, seller_kind k,
       n_active n, price_p25_cents/100 p25, price_p50_cents/100 p50, price_p75_cents/100 p75,
       computed_on
FROM market_stats
WHERE mileage_bucket = 'all'
  AND city_slug IN (${PILOT_CITIES.map((c) => `'${c}'`).join(",")})
  AND ((source = 'autotrader' AND seller_kind = 'dealer') OR source = 'marketplace')
`.replace(/\s+/g, " ").trim();

function runSql(sql) {
  const out = execFileSync("npx", [
    "wrangler", "d1", "execute", "japanauto-prod", "--remote", "--json",
    "--command", sql,
  ], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

/** {anchor: n_window} → {modelYear: exact count}; throws if not a ±1 window. */
function exactCounts(window) {
  const years = Object.keys(window).map(Number);
  const lo = Math.min(...years), hi = Math.max(...years);
  const c = {};
  const get = (y) => c[y] ?? 0;
  for (let y = lo - 1; y <= hi + 2; y++) c[y + 1] = (window[y] ?? 0) - get(y) - get(y - 1);
  for (let y = lo - 1; y <= hi + 1; y++) {
    if (get(y) < 0) throw new Error(`inconsistent ±1-year window at ${y}`);
  }
  return c;
}

const rows = runSql(SQL);
const cells = new Map(); // key city|make|model|seg → {year: row}
const computedOn = { dealer: null, private: null };
for (const r of rows) {
  const seg = r.s === "autotrader" ? "dealer" : "private";
  if (r.computed_on && (!computedOn[seg] || r.computed_on > computedOn[seg])) computedOn[seg] = r.computed_on;
  const key = `${r.c}|${r.mk}|${r.md}|${seg}`;
  if (!cells.has(key)) cells.set(key, {});
  const byYear = cells.get(key);
  const prev = byYear[r.y];
  if (!prev) byYear[r.y] = { ...r };
  else if (r.n > prev.n) byYear[r.y] = { ...r, n: r.n + prev.n };
  else prev.n += r.n;
}

const cities = {};
let skipped = 0;
for (const [key, byYear] of cells) {
  const [city, make, model, seg] = key.split("|");
  let exact;
  try {
    exact = exactCounts(Object.fromEntries(Object.entries(byYear).map(([y, r]) => [y, r.n])));
  } catch (e) {
    skipped++;
    console.warn(`[market] skip ${key}: ${e.message}`);
    continue;
  }
  const out = {};
  for (const [y, r] of Object.entries(byYear)) {
    if (!r.n) continue;
    out[y] = [r.n, r.p25, r.p50, r.p75, Math.max(0, exact[y] ?? 0)];
  }
  ((cities[city] ??= {})[`${make}:${model}`] ??= {})[seg] = out;
}

const data = { exported_at: new Date().toISOString(), computed_on: computedOn, cities };
writeFileSync(join(root, "src/data/market-live.json"), JSON.stringify(data) + "\n");
const models = Object.values(cities).reduce((a, m) => a + Object.keys(m).length, 0);
console.log(`[market] ${rows.length} rows → ${models} city×model entries (${skipped} skipped) → src/data/market-live.json`);

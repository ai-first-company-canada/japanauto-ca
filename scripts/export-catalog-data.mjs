#!/usr/bin/env node
/**
 * scripts/export-catalog-data.mjs — build-time snapshot of live inventory.
 *
 * Pulls every publicly-visible listing from prod D1 into
 * src/data/catalog-live.json, which getCatalogForModelCity() (catalog-stubs.ts)
 * reads at SSG time. This is what killed the fabricated demo catalog
 * (LAUNCH-CHECKLIST §1): pages now show real rows or an honest empty state.
 *
 * Freshness model: catalog pages are static — they refresh on every deploy
 * (`npm run predeploy` runs this script first). Listing DETAIL pages are
 * Pages Functions and always live; only the catalog grid can lag a deploy.
 *
 * The JSON is committed: builds stay reproducible without wrangler auth (CI).
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SQL = `
SELECT l.slug, l.year, l.trim, l.mileage, l.price,
       l.drivetrain, l.transmission, l.city, l.created_at,
       l.color_exterior,
       CASE WHEN l.boost_until IS NOT NULL AND l.boost_until > unixepoch()
            THEN 1 ELSE 0 END AS is_boosted,
       mk.slug AS make_slug, md.slug AS model_slug, md.name AS model_name,
       d.name AS dealer_name
FROM listings l
JOIN makes  mk ON mk.id = l.make_id
JOIN models md ON md.id = l.model_id
JOIN dealers d ON d.id = l.dealer_id
WHERE l.status = 'active'
  AND (l.expires_at IS NULL OR l.expires_at > unixepoch())
ORDER BY is_boosted DESC, l.created_at DESC
`.replace(/\s+/g, " ").trim();

// Real seller directory for /dealers/ and the parts featured-yards rail —
// replaces the 12 fabricated dealer profiles + 18 fabricated junkyards
// (LAUNCH-CHECKLIST §1). Donor/listing counts are real aggregates.
const DEALERS_SQL = `
SELECT d.slug, d.name, d.city, d.province, d.type, d.specializes_in,
       (SELECT COUNT(*) FROM listings l
         WHERE l.dealer_id = d.id AND l.status = 'active'
           AND (l.expires_at IS NULL OR l.expires_at > unixepoch())) AS listing_count,
       (SELECT COUNT(*) FROM donor_cars dc
         WHERE dc.dealer_id = d.id AND dc.status = 'active') AS donor_count
FROM dealers d
ORDER BY listing_count + donor_count DESC, d.created_at ASC
`.replace(/\s+/g, " ").trim();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function runSql(sql) {
  const out = execFileSync("npx", [
    "wrangler", "d1", "execute", "japanauto-prod", "--remote", "--json",
    "--command", sql,
  ], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out)[0]?.results ?? [];
}

const rows = runSql(SQL);
const dealers = runSql(DEALERS_SQL);

const payload = {
  exported_at: new Date().toISOString(),
  listings: rows,
  dealers,
};
const dest = join(root, "src/data/catalog-live.json");
writeFileSync(dest, JSON.stringify(payload, null, 1) + "\n");
console.log(`export-catalog-data: ${rows.length} live listing(s), ${dealers.length} dealer(s) → src/data/catalog-live.json`);

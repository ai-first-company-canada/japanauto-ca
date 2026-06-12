/// <reference types="@cloudflare/workers-types" />
/**
 * Weekly / monthly dealer e-mail reports (decision 0016).
 *
 * Cadence (cron-dispatched from index.ts):
 *   weekly  — Mondays, covering the previous 7 days;
 *   monthly — the 1st, covering the previous calendar month.
 *
 * Audience: every dealer with reports_opt_out = 0, ALL tiers — the data set
 * matches the tier (free: own stats + an honest Pro teaser computed from real
 * sold data, never fabricated; pro/trial: + market position + traffic-source
 * split + the 30%-to-ads line). The e-mail is deliberately print-friendly:
 * a manager should be able to print it and hand it to their boss.
 *
 * Delivery: Resend HTTP API. No RESEND_API_KEY → logged no-op (fail closed).
 * Idempotency: report_runs (period, dealer_id) reserved before send.
 * CASL: every mail carries a one-click unsubscribe link signed with
 * REPORTS_UNSUB_SECRET (verified by /api/reports/unsubscribe on the site).
 */

export interface ReportsEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  REPORTS_UNSUB_SECRET?: string;
  REPORTS_FROM?: string;        // var; default below
  REPORTS_SENDER_LINE?: string; // CASL s.6(2) sender identification (name + MAILING address)
}

const FROM_DEFAULT = "japanauto.ca <reports@japanauto.ca>";
const SITE = "https://japanauto.ca";

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

export interface Period {
  key: string;        // 'weekly-2026-06-15' | 'monthly-2026-06'
  label: string;      // human heading
  fromSec: number;    // unix inclusive
  toSec: number;      // unix exclusive
  fromDay: string;    // 'YYYY-MM-DD' inclusive (entity_stats_daily keys)
  toDay: string;      // 'YYYY-MM-DD' exclusive
}

export function weeklyPeriod(now: Date): Period {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Anchor to the most recent Monday ≤ now: a re-run on any other weekday
  // reproduces the SAME key and window, so report_runs dedupes it
  // (review 2026-06-12 — run-date keys could double-send).
  to.setUTCDate(to.getUTCDate() - ((to.getUTCDay() + 6) % 7));
  const from = new Date(to.getTime() - 7 * 86400000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return {
    key: `weekly-${d(to)}`,
    label: `Weekly report · ${d(from)} – ${d(new Date(to.getTime() - 86400000))}`,
    fromSec: Math.floor(from.getTime() / 1000),
    toSec: Math.floor(to.getTime() / 1000),
    fromDay: d(from),
    toDay: d(to),
  };
}

export function monthlyPeriod(now: Date): Period {
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prev = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1));
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const ym = prev.toISOString().slice(0, 7);
  return {
    key: `monthly-${ym}`,
    label: `Monthly report · ${ym}`,
    fromSec: Math.floor(prev.getTime() / 1000),
    toSec: Math.floor(first.getTime() / 1000),
    fromDay: d(prev),
    toDay: d(first),
  };
}

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

interface DealerRow {
  id: string; email: string; name: string; type: string; city: string;
  subscription_tier: string; subscription_status: string | null;
  trial_ends_at: number | null;
}

interface LotRow {
  id: string; slug: string; title: string; status: string;
  kind: "listing" | "donor";
  price: number | null; year: number; make_slug: string; model_slug: string;
  city: string; mileage: number;
  created_at: number; sold_at: number | null;
  views: number; contacts: number; views_social: number; views_paid: number;
}

/** Mirror of functions/api/_lib/entitlements.ts effectiveTier — keep in sync. */
function effectiveTier(d: DealerRow, now: number): "free" | "pro" {
  const paid = d.subscription_tier === "pro" && d.subscription_status !== null
    && ["active", "trialing", "past_due"].includes(d.subscription_status);
  return paid || (d.trial_ends_at !== null && d.trial_ends_at > now) ? "pro" : "free";
}

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const cad = (cents: number) => "CA$" + Math.round(cents / 100).toLocaleString("en-US");

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Honest free-tier teaser: REAL Pro results for the dealer's own makes.
// Renders only with sample >= 3; otherwise the caller falls back to a
// number-free pitch (fabricating numbers is banned project-wide).
// ---------------------------------------------------------------------------
async function proTeaser(
  env: ReportsEnv, period: Period, makeSlugs: string[], now: number,
): Promise<string | null> {
  if (makeSlugs.length === 0) return null;
  const marks = makeSlugs.map(() => "?").join(",");
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n,
           CAST(AVG((l.sold_at - l.created_at) / 86400.0) AS REAL) AS avg_days
    FROM listings l
    JOIN dealers d ON d.id = l.dealer_id
    JOIN makes mk ON mk.id = l.make_id
    WHERE l.status = 'sold'
      AND l.sold_at >= ? AND l.sold_at < ?
      AND mk.slug IN (${marks})
      AND (
        (d.subscription_tier = 'pro' AND d.subscription_status IN ('active','trialing','past_due'))
        OR (d.trial_ends_at IS NOT NULL AND d.trial_ends_at > ?)
      )
  `).bind(period.fromSec, period.toSec, ...makeSlugs, now)
    .first<{ n: number; avg_days: number | null }>();
  if (!row || row.n < 3 || row.avg_days == null) return null;
  return `Dealers on Pro sold <b>${row.n}</b> cars of the same makes as yours this period, ` +
    `averaging <b>${Math.max(1, Math.round(row.avg_days))} days</b> on market.`;
}

// ---------------------------------------------------------------------------
// Per-dealer report HTML (table-based — e-mail clients, then print)
// ---------------------------------------------------------------------------

function lotTable(lots: LotRow[], pro: boolean): string {
  const shown = lots.slice(0, 40);
  const rows = shown.map((l) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">
        <a href="${SITE}${l.kind === "donor" ? "/parts/listing/" : "/used-cars/listing/"}${esc(l.slug)}/" style="color:#0a4ec2;text-decoration:none">${esc(l.title)}</a><br>
        <span style="color:#888;font-size:11px">${esc(l.status)}${l.price != null && l.price > 0 ? ` · ${cad(l.price)}` : ""}</span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right"><b>${l.views}</b></td>
      ${pro ? `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#555">${l.views_social} / ${l.views_paid}</td>` : ""}
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${l.contacts}</td>
    </tr>`).join("");
  return `
  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <tr>
      <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #1a1c1f;font-size:11px;text-transform:uppercase">Listing</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #1a1c1f;font-size:11px;text-transform:uppercase">Views</th>
      ${pro ? `<th style="text-align:right;padding:6px 8px;border-bottom:2px solid #1a1c1f;font-size:11px;text-transform:uppercase">Social / Ads</th>` : ""}
      <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #1a1c1f;font-size:11px;text-transform:uppercase">Contacts</th>
    </tr>
    ${rows || `<tr><td colspan="${pro ? 4 : 3}" style="padding:12px 8px;color:#888">No listings had activity this period.</td></tr>`}
  </table>
  ${lots.length > shown.length ? `<p style="font-size:11px;color:#888;margin:6px 0 0">Showing top ${shown.length} of ${lots.length} lots by views — totals above cover everything.</p>` : ""}`;
}

interface MarketHint { slug: string; line: string }

export async function buildDealerReport(
  env: ReportsEnv, dealer: DealerRow, period: Period, unsubUrl: string, now: number,
): Promise<{ subject: string; html: string } | null> {
  const tier = effectiveTier(dealer, now);
  const onTrialNow = dealer.trial_ends_at !== null && dealer.trial_ends_at > now
    && !(dealer.subscription_tier === "pro" && dealer.subscription_status !== null);

  const lots = (await env.DB.prepare(`
    SELECT l.id, l.slug, 'listing' AS kind,
           (l.year || ' ' || mk.name || ' ' || md.name || COALESCE(' ' || l.trim, '')) AS title,
           l.status, l.price, l.year, l.mileage, l.city,
           mk.slug AS make_slug, md.slug AS model_slug,
           l.created_at, l.sold_at,
           COALESCE(s.views, 0) AS views, COALESCE(s.contacts, 0) AS contacts,
           COALESCE(s.views_social, 0) AS views_social, COALESCE(s.views_paid, 0) AS views_paid
    FROM listings l
    JOIN makes mk ON mk.id = l.make_id
    JOIN models md ON md.id = l.model_id
    LEFT JOIN (
      SELECT entity_id,
             SUM(views) AS views, SUM(contacts) AS contacts,
             SUM(views_social) AS views_social, SUM(views_paid) AS views_paid
      FROM entity_stats_daily
      WHERE entity_type = 'listing' AND day >= ? AND day < ?
      GROUP BY entity_id
    ) s ON s.entity_id = l.id
    WHERE l.dealer_id = ?
    ORDER BY COALESCE(s.views, 0) DESC, l.created_at DESC
    LIMIT 60
  `).bind(period.fromDay, period.toDay, dealer.id).all<LotRow>()).results ?? [];

  // Yards: same query shape over donor_cars, folded into the same table.
  const donors = (await env.DB.prepare(`
    SELECT dc.id, dc.slug, 'donor' AS kind,
           (dc.year || ' ' || mk.name || ' ' || md.name || ' (donor)') AS title,
           dc.status, dc.price, dc.year, 0 AS mileage, dc.city_slug AS city,
           mk.slug AS make_slug, md.slug AS model_slug,
           dc.created_at, NULL AS sold_at,
           COALESCE(s.views, 0) AS views, COALESCE(s.contacts, 0) AS contacts,
           COALESCE(s.views_social, 0) AS views_social, COALESCE(s.views_paid, 0) AS views_paid
    FROM donor_cars dc
    JOIN makes mk ON mk.id = dc.make_id
    JOIN models md ON md.id = dc.model_id
    LEFT JOIN (
      SELECT entity_id,
             SUM(views) AS views, SUM(contacts) AS contacts,
             SUM(views_social) AS views_social, SUM(views_paid) AS views_paid
      FROM entity_stats_daily
      WHERE entity_type = 'donor_car' AND day >= ? AND day < ?
      GROUP BY entity_id
    ) s ON s.entity_id = dc.id
    WHERE dc.dealer_id = ?
    ORDER BY COALESCE(s.views, 0) DESC
    LIMIT 60
  `).bind(period.fromDay, period.toDay, dealer.id).all<LotRow>()).results ?? [];

  const all = [...lots, ...donors];
  if (all.length === 0) return null; // nothing to report — don't spam empty mail

  // KPI totals come from UNBOUNDED aggregates — the LIMIT-60 lists above feed
  // only the table; a sold car outside the top-60 must still count (review).
  const agg = await env.DB.prepare(`
    SELECT COALESCE(SUM(s.views), 0) AS views, COALESCE(SUM(s.contacts), 0) AS contacts,
           COALESCE(SUM(s.views_social), 0) AS social, COALESCE(SUM(s.views_paid), 0) AS paid
    FROM entity_stats_daily s
    WHERE s.day >= ?1 AND s.day < ?2
      AND s.entity_id IN (
        SELECT id FROM listings WHERE dealer_id = ?3
        UNION SELECT id FROM donor_cars WHERE dealer_id = ?3
      )
  `).bind(period.fromDay, period.toDay, dealer.id)
    .first<{ views: number; contacts: number; social: number; paid: number }>();
  const tot = agg ?? { views: 0, contacts: 0, social: 0, paid: 0 };

  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM listings   WHERE dealer_id = ?1 AND created_at >= ?2 AND created_at < ?3)
    + (SELECT COUNT(*) FROM donor_cars WHERE dealer_id = ?1 AND created_at >= ?2 AND created_at < ?3) AS created
  `).bind(dealer.id, period.fromSec, period.toSec).first<{ created: number }>();
  const created = counts?.created ?? 0;

  const sold = (await env.DB.prepare(`
    SELECT (l.year || ' ' || mk.name || ' ' || md.name || COALESCE(' ' || l.trim, '')) AS title,
           l.created_at, l.sold_at
    FROM listings l JOIN makes mk ON mk.id = l.make_id JOIN models md ON md.id = l.model_id
    WHERE l.dealer_id = ? AND l.sold_at IS NOT NULL AND l.sold_at >= ? AND l.sold_at < ?
    ORDER BY l.sold_at DESC LIMIT 10
  `).bind(dealer.id, period.fromSec, period.toSec)
    .all<{ title: string; created_at: number; sold_at: number }>()).results ?? [];

  // Truly silent period → skip the e-mail entirely (caller releases the slot).
  if (tot.views + tot.contacts + created + sold.length === 0) return null;

  // Pro: market position for active lots (market_stats may legitimately miss).
  const hints: MarketHint[] = [];
  if (tier === "pro") {
    for (const l of lots.filter((x) => x.status === "active").slice(0, 12)) {
      const m = await env.DB.prepare(`
        SELECT price_p50_cents, n_active FROM market_stats
        WHERE city_slug = ? AND make_slug = ? AND model_slug = ?
          AND anchor_year = ? AND mileage_bucket = 'all'
        ORDER BY n_active DESC LIMIT 1
      `).bind(l.city.toLowerCase(), l.make_slug, l.model_slug, l.year)
        .first<{ price_p50_cents: number | null; n_active: number }>();
      if (!m?.price_p50_cents || m.price_p50_cents <= 0 || l.price == null || l.price <= 0) continue;
      const diff = Math.round((l.price - m.price_p50_cents) / m.price_p50_cents * 100);
      const pos = Math.abs(diff) < 2 ? "at the market median"
        : `${Math.abs(diff)}% ${diff > 0 ? "above" : "below"} the market median`;
      hints.push({ slug: l.slug, line: `${esc(l.title)}: your asking price is <b>${pos}</b> (${m.n_active} similar listed, all mileages, public asking prices)` });
    }
  }

  // Free: honest teaser from real Pro outcomes, or a number-free pitch.
  let teaser: string | null = null;
  if (tier === "free") {
    teaser = await proTeaser(env, period, [...new Set(lots.map((l) => l.make_slug))], now);
  }

  const kpi = (label: string, value: string) => `
    <td style="padding:10px 14px;background:#f6f7f8;border-radius:8px">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#666">${label}</div>
      <div style="font-size:22px;font-weight:700">${value}</div>
    </td>`;

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fff;color:#1a1c1f;font-family:-apple-system,Segoe UI,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto">
    <div style="font-size:15px;font-weight:800;margin-bottom:2px">japanauto<span style="color:#e4574c">.ca</span></div>
    <h1 style="font-size:19px;margin:4px 0 2px">${esc(period.label)}</h1>
    <div style="color:#666;font-size:13px;margin-bottom:16px">${esc(dealer.name)} · ${tier === "pro" ? "Pro" : "Free"} plan</div>

    <table style="border-collapse:separate;border-spacing:6px;width:100%;margin:0 -6px 14px"><tr>
      ${kpi("Views", String(tot.views))}
      ${kpi("Contacts", String(tot.contacts))}
      ${tier === "pro" ? kpi("From social", String(tot.social)) + kpi("From ads", String(tot.paid)) : ""}
      ${kpi("New lots", String(created))}
      ${kpi("Sold", String(sold.length))}
    </tr></table>

    ${sold.length > 0 ? `<p style="font-size:13px;margin:0 0 14px">Sold this period: ${sold.map((l) =>
      `${esc(l.title)} (${Math.max(1, Math.round(((l.sold_at - l.created_at) / 86400)))} days on market)`).join("; ")}.</p>` : ""}

    ${lotTable(all, tier === "pro")}

    ${hints.length > 0 ? `
      <h2 style="font-size:14px;margin:18px 0 6px">Market position (private to you)</h2>
      <ul style="font-size:13px;line-height:20px;padding-left:18px;margin:0">${hints.map((h) => `<li>${h.line}</li>`).join("")}</ul>` : ""}

    ${tier === "pro" ? `
      <p style="font-size:12px;color:#555;margin:16px 0 0;border-top:1px solid #eee;padding-top:12px">
        ${onTrialNow
          ? `Your Pro trial at work: your live listings run in japanauto's Facebook catalog ads and social posts at our expense — on the paid plan, <b>30% of the subscription</b> keeps funding promotion of your own cars.`
          : `Your Pro plan at work: <b>30% of your subscription</b> funds Facebook promotion of your live listings (carousel catalog ads), and social posts of your cars run on japanauto channels.`}
        Traffic they bring shows in the “From social / From ads” columns above.</p>` : `
      <div style="margin:16px 0 0;border:1px solid #e4574c;border-radius:8px;padding:12px 14px">
        ${teaser ? `<p style="font-size:13px;margin:0 0 6px">${teaser}</p>` : ""}
        <p style="font-size:13px;margin:0">On <b>Pro</b>, 30% of the subscription goes straight into Facebook
        ads for your own cars, your lots get social-media posts, and you see private market pricing
        for every listing. <a href="${SITE}/dealer/dashboard/" style="color:#0a4ec2">Upgrade in your dashboard →</a></p>
      </div>`}

    <p style="font-size:11px;color:#999;margin-top:22px;border-top:1px solid #eee;padding-top:10px">
      You receive this because you have a dealer account on japanauto.ca.
      <a href="${esc(unsubUrl)}" style="color:#999">Unsubscribe from reports</a>.<br>
      ${esc(env.REPORTS_SENDER_LINE ?? "japanauto.ca · Calgary, AB, Canada · support@japanauto.ca")}</p>
  </div></body></html>`;

  const subject = `${period.key.startsWith("weekly") ? "Your week" : "Your month"} on japanauto.ca — ` +
    `${tot.views} views, ${tot.contacts} contacts${sold.length ? `, ${sold.length} sold` : ""}`;
  return { subject, html };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function sendReports(env: ReportsEnv, kind: "weekly" | "monthly"): Promise<void> {
  if (!env.RESEND_API_KEY || !env.REPORTS_UNSUB_SECRET) {
    console.log("reports: RESEND_API_KEY/REPORTS_UNSUB_SECRET not configured — skipping");
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const period = kind === "weekly" ? weeklyPeriod(new Date()) : monthlyPeriod(new Date());

  const dealers = (await env.DB.prepare(`
    SELECT id, email, name, type, city, subscription_tier, subscription_status, trial_ends_at
    FROM dealers WHERE reports_opt_out = 0 ORDER BY created_at LIMIT 500
  `).all<DealerRow>()).results ?? [];

  let sent = 0, skipped = 0, failed = 0;
  for (const dealer of dealers) {
    // Reserve the (period, dealer) slot — a retried cron run skips sent rows.
    const reserve = await env.DB.prepare(
      `INSERT OR IGNORE INTO report_runs (period, dealer_id, sent_at) VALUES (?, ?, ?)`,
    ).bind(period.key, dealer.id, now).run();
    if ((reserve.meta.changes ?? 0) === 0) { skipped++; continue; }

    try {
      const sig = await hmacHex(env.REPORTS_UNSUB_SECRET, `reports-unsub:v1:${dealer.id}`);
      const unsubUrl = `${SITE}/api/reports/unsubscribe?d=${encodeURIComponent(dealer.id)}&s=${sig}`;
      const report = await buildDealerReport(env, dealer, period, unsubUrl, now);
      if (!report) { // nothing to say — release the reservation, maybe next period
        await env.DB.prepare(`DELETE FROM report_runs WHERE period = ? AND dealer_id = ?`)
          .bind(period.key, dealer.id).run();
        skipped++;
        continue;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.REPORTS_FROM ?? FROM_DEFAULT,
          to: [dealer.email],
          subject: report.subject,
          html: report.html,
        }),
      });
      if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      sent++;
    } catch (e) {
      failed++;
      console.error(`reports: dealer ${dealer.id} failed:`, e instanceof Error ? e.message : e);
      // Release so the next run retries this dealer.
      await env.DB.prepare(`DELETE FROM report_runs WHERE period = ? AND dealer_id = ?`)
        .bind(period.key, dealer.id).run();
    }
  }
  console.log(`reports(${period.key}): sent ${sent}, skipped ${skipped}, failed ${failed}`);
}

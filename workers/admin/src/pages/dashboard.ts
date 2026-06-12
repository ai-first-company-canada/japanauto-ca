/// <reference types="@cloudflare/workers-types" />
/**
 * / — KPI overview the owner glances at daily: dealer/tier split, inventory,
 * 7-day signups + traffic, social-boost pipeline, market-data freshness,
 * featured-slot revenue. Read-only — no actions, no audit writes; one
 * D.B.batch() round-trip plus a tolerant audit-log read (migration 0017 may
 * not be applied yet).
 */

import type { AdminEnv } from "../lib/access";
import { badge, esc, fmtAgo, fmtCad, fmtTs, page } from "../lib/html";

interface DealerKpis {
  total: number;
  pro: number;
  verified_n: number;
  new_7d: number;
}

interface InventoryKpis {
  total: number;
  active: number;
}

interface TrafficKpis {
  views: number;
  contacts: number;
}

interface SocialRow {
  status: string;
  n: number;
}

interface MarketKpis {
  n_rows: number;
  last_sync: number | null;
  sources: string | null;
}

interface SlotKpis {
  n: number;
  paid_cents: number;
}

interface SignupRow {
  name: string;
  email: string;
  city: string;
  created_at: number;
}

interface AuditRow {
  at: number;
  admin_email: string;
  action: string;
  target: string | null;
}

/** Statuses we surface on the card — 'cancelled' is noise at a glance. */
const SOCIAL_STATUSES = ["requested", "in_production", "published"] as const;

/** One KPI card (.kpis grid in html.ts). Call sites esc() every dynamic value. */
function kpi(label: string, value: string, sub?: string): string {
  return `<div class="kpi"><span>${esc(label)}</span><b>${value}</b>${
    sub ? `<div style="font-size:12px;color:#5a6068;margin-top:2px">${sub}</div>` : ""
  }</div>`;
}

function num(n: number | null | undefined): string {
  return esc((n ?? 0).toLocaleString("en-US"));
}

export async function dashboardPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  // Single batch round-trip; every statement is a tiny aggregate. The pro
  // CASE is a mirror of functions/api/_lib/entitlements.ts effectiveTier()
  // (paid live status OR unexpired trial) — duplicated in SQL because the
  // admin Worker doesn't share the Pages bundle. Keep in sync (dealers.ts
  // carries the same mirror in TS).
  const [dealersQ, listingsQ, donorsQ, trafficQ, socialQ, marketQ, slotsQ, signupsQ] =
    await env.DB.batch([
      env.DB.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN (subscription_tier = 'pro'
                                       AND subscription_status IN ('active','trialing','past_due'))
                                   OR (trial_ends_at IS NOT NULL AND trial_ends_at > ?1)
                                 THEN 1 ELSE 0 END), 0) AS pro,
               COALESCE(SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END), 0) AS verified_n,
               COALESCE(SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END), 0) AS new_7d
        FROM dealers
      `).bind(now, weekAgo),
      env.DB.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active
        FROM listings
      `),
      env.DB.prepare(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active
        FROM donor_cars
      `),
      env.DB.prepare(`
        SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(contacts), 0) AS contacts
        FROM entity_stats_daily WHERE day >= date('now', '-7 day')
      `),
      env.DB.prepare(`
        SELECT status, COUNT(*) AS n FROM social_boost_jobs GROUP BY status LIMIT 10
      `),
      env.DB.prepare(`
        SELECT COUNT(*) AS n_rows, MAX(synced_at) AS last_sync,
               GROUP_CONCAT(DISTINCT source) AS sources
        FROM market_stats
      `),
      env.DB.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(contract_paid_cents), 0) AS paid_cents
        FROM featured_slots WHERE status = 'active'
      `),
      env.DB.prepare(`
        SELECT name, email, city, created_at FROM dealers
        ORDER BY created_at DESC LIMIT 5
      `),
    ]);

  // Aggregates always return exactly one row; the `?? {}` is belt-and-braces.
  const dealers = (dealersQ?.results?.[0] ?? {}) as Partial<DealerKpis>;
  const listings = (listingsQ?.results?.[0] ?? {}) as Partial<InventoryKpis>;
  const donors = (donorsQ?.results?.[0] ?? {}) as Partial<InventoryKpis>;
  const traffic = (trafficQ?.results?.[0] ?? {}) as Partial<TrafficKpis>;
  const market = (marketQ?.results?.[0] ?? {}) as Partial<MarketKpis>;
  const slots = (slotsQ?.results?.[0] ?? {}) as Partial<SlotKpis>;

  // GROUP BY rows → fixed allowlisted map; unknown statuses (schema drift)
  // are simply not displayed rather than trusted into the markup.
  const social: Record<(typeof SOCIAL_STATUSES)[number], number> = {
    requested: 0, in_production: 0, published: 0,
  };
  for (const r of (socialQ?.results ?? []) as SocialRow[]) {
    if ((SOCIAL_STATUSES as readonly string[]).includes(r.status)) {
      social[r.status as (typeof SOCIAL_STATUSES)[number]] = r.n;
    }
  }

  const sources = market.sources ? market.sources.split(",").join(", ") : "no sources";

  const cards = [
    kpi("Dealers", num(dealers.total),
      `${num(dealers.pro)} pro · ${num((dealers.total ?? 0) - (dealers.pro ?? 0))} free · ${num(dealers.verified_n)} verified`),
    kpi("Signups 7d", num(dealers.new_7d)),
    kpi("Active listings", num(listings.active), `of ${num(listings.total)} total`),
    kpi("Donor cars", num(donors.total), `${num(donors.active)} active`),
    kpi("Views 7d", num(traffic.views)),
    kpi("Contacts 7d", num(traffic.contacts)),
    kpi("Social boost", num(social.requested),
      `requested · ${num(social.in_production)} in production · ${num(social.published)} published`),
    kpi("Market stats", num(market.n_rows),
      `synced ${esc(fmtAgo(market.last_sync))} · ${esc(sources)}`),
    kpi("Featured slots", num(slots.n), `active · ${esc(fmtCad(slots.paid_cents ?? 0))} contracted`),
  ].join("");

  const signupRows = ((signupsQ?.results ?? []) as SignupRow[]).map((d) => `<tr>
    <td><div style="font-weight:600">${esc(d.name)}</div>
        <div style="font-size:12px;color:#5a6068">${esc(d.email)}</div></td>
    <td>${esc(d.city)}</td>
    <td style="white-space:nowrap">${esc(fmtTs(d.created_at).slice(0, 10))} <span style="font-size:12px;color:#9aa1a9">${esc(fmtAgo(d.created_at))}</span></td>
  </tr>`).join("");

  // admin_audit_log lands with migration 0017 — the dashboard must not 500
  // on an environment where it hasn't been applied yet.
  let auditHtml: string;
  try {
    const res = await env.DB.prepare(`
      SELECT at, admin_email, action, target FROM admin_audit_log
      ORDER BY at DESC LIMIT 10
    `).all<AuditRow>();
    const rows = (res.results ?? []).map((r) => `<tr>
      <td style="white-space:nowrap">${esc(fmtTs(r.at))} <span style="font-size:12px;color:#9aa1a9">${esc(fmtAgo(r.at))}</span></td>
      <td>${esc(r.admin_email)}</td>
      <td>${badge(r.action)}</td>
      <td style="font:12px ui-monospace,monospace">${esc(r.target ?? "—")}</td>
    </tr>`).join("");
    auditHtml = `<table>
      <tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th></tr>
      ${rows || `<tr><td colspan="4" style="text-align:center;color:#9aa1a9;padding:24px">No admin actions yet.</td></tr>`}
    </table>`;
  } catch {
    auditHtml = `<p style="color:#8a5a00;background:#fdf3e0;padding:10px 14px;border-radius:8px;font-size:13px">audit log: migration 0017 pending</p>`;
  }

  const body = `
    <h1>Dashboard</h1>
    <div class="kpis">${cards}</div>
    <h2>Latest signups</h2>
    <table>
      <tr><th>Dealer</th><th>City</th><th>Joined</th></tr>
      ${signupRows || `<tr><td colspan="3" style="text-align:center;color:#9aa1a9;padding:24px">No dealers yet.</td></tr>`}
    </table>
    <h2>Recent admin actions</h2>
    ${auditHtml}`;

  return page({ title: "Dashboard", path: "/", adminEmail, msg: url.searchParams.get("msg"), body });
}

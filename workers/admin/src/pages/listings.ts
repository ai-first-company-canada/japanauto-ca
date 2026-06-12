/// <reference types="@cloudflare/workers-types" />
/**
 * /listings — inventory browser + moderation for both catalogs: used-car
 * listings and donor cars (?kind=listing|donor). Donors are view-only in v1;
 * listings get two guarded transitions: Expire (active|flagged → expired) and
 * Restore (flagged → active). The from-state is enforced inside the UPDATE's
 * WHERE clause so a stale tab can never clobber a sold/draft row — zero
 * changes just reports "no change".
 */

import type { AdminEnv } from "../lib/access";
import { audit } from "../lib/audit";
import { actionBtn, badge, esc, fmtAgo, fmtCad, page, redirect } from "../lib/html";

interface InvRow {
  id: string;
  slug: string;
  year: number;
  trim: string | null;
  status: string;
  price: number | null; // cents; donors are usually NULL ("call for price")
  view_count: number;
  contact_count: number;
  created_at: number;
  make_name: string;
  model_name: string;
  dealer_email: string;
}

// Status allowlists mirror the CHECK constraints (0001 listings, 0005 donor_cars).
const LISTING_STATUSES = ["draft", "active", "flagged", "sold", "expired"] as const;
const DONOR_STATUSES = ["draft", "active", "depleted", "expired", "flagged"] as const;

function statusTone(s: string): "ok" | "warn" | "bad" | "muted" {
  if (s === "active") return "ok";
  if (s === "flagged") return "bad";
  if (s === "draft") return "warn";
  return "muted"; // sold / expired / depleted
}

export async function listingsPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  // Unknown query values silently fall back to defaults — GET is read-only.
  const kind = url.searchParams.get("kind") === "donor" ? "donor" : "listing";
  const statuses: readonly string[] = kind === "donor" ? DONOR_STATUSES : LISTING_STATUSES;
  const rawStatus = url.searchParams.get("status") ?? "all";
  const status = statuses.includes(rawStatus) ? rawStatus : "all";

  // Two near-identical queries instead of one parameterized table name —
  // SQL strings stay static, only values are bound.
  const sql = kind === "donor"
    ? `SELECT dc.id, dc.slug, dc.year, dc.trim, dc.status, dc.price,
              dc.view_count, dc.contact_count, dc.created_at,
              mk.name AS make_name, md.name AS model_name, d.email AS dealer_email
       FROM donor_cars dc
       JOIN makes mk ON mk.id = dc.make_id
       JOIN models md ON md.id = dc.model_id
       JOIN dealers d ON d.id = dc.dealer_id
       ${status !== "all" ? "WHERE dc.status = ?1" : ""}
       ORDER BY dc.created_at DESC
       LIMIT 200`
    : `SELECT l.id, l.slug, l.year, l.trim, l.status, l.price,
              l.view_count, l.contact_count, l.created_at,
              mk.name AS make_name, md.name AS model_name, d.email AS dealer_email
       FROM listings l
       JOIN makes mk ON mk.id = l.make_id
       JOIN models md ON md.id = l.model_id
       JOIN dealers d ON d.id = l.dealer_id
       ${status !== "all" ? "WHERE l.status = ?1" : ""}
       ORDER BY l.created_at DESC
       LIMIT 200`;
  const res = await env.DB.prepare(sql)
    .bind(...(status !== "all" ? [status] : []))
    .all<InvRow>();

  const publicBase = kind === "donor"
    ? "https://japanauto.ca/parts/listing/"
    : "https://japanauto.ca/used-cars/listing/";

  const rows = (res.results ?? []).map((r) => {
    const actions = kind === "listing"
      ? `<td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">
          ${r.status === "active" || r.status === "flagged"
            ? actionBtn("/listings/action", { id: r.id, do: "expire", ret: status }, "Expire", { danger: true }) : ""}
          ${r.status === "flagged"
            ? actionBtn("/listings/action", { id: r.id, do: "restore", ret: status }, "Restore") : ""}
        </td>`
      : "";
    return `<tr>
      <td>
        <div style="font-weight:600">${r.year} ${esc(r.make_name)} ${esc(r.model_name)}${r.trim ? ` ${esc(r.trim)}` : ""}</div>
        <div style="font-size:11px;color:#9aa1a9">${esc(r.slug)}</div>
      </td>
      <td style="font-size:12px">${esc(r.dealer_email)}</td>
      <td>${badge(r.status, statusTone(r.status))}</td>
      <td style="text-align:right">${fmtCad(r.price)}</td>
      <td style="text-align:right">${r.view_count} / ${r.contact_count}</td>
      <td>${fmtAgo(r.created_at)}</td>
      <td><a href="${esc(`${publicBase}${r.slug}/`)}" target="_blank" rel="noopener">view ↗</a></td>
      ${actions}
    </tr>`;
  }).join("");

  const kindToggle = ([["listing", "Used cars"], ["donor", "Donor cars"]] as const)
    .map(([k, label]) => {
      const active = k === kind;
      return `<a href="/listings?kind=${k}" style="padding:6px 12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;color:${active ? "#fff;background:#1a1c1f" : "#3a3f45"}">${esc(label)}</a>`;
    }).join("");

  const options = ["all", ...statuses]
    .map((s) => `<option value="${esc(s)}"${s === status ? " selected" : ""}>${esc(s)}</option>`)
    .join("");

  const cols = kind === "listing" ? 8 : 7;
  const body = `
    <h1>${kind === "donor" ? "Donor cars" : "Listings"} <span style="color:#9aa1a9;font-weight:400">(${res.results?.length ?? 0})</span></h1>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <span style="display:flex;gap:2px;background:#fff;border-radius:10px;padding:3px;box-shadow:0 1px 2px rgba(0,0,0,.06)">${kindToggle}</span>
      <form method="get" action="/listings" class="inline">
        <input type="hidden" name="kind" value="${esc(kind)}">
        <select name="status">${options}</select>
        <button type="submit">Filter</button>
      </form>
      ${kind === "donor" ? `<span style="font-size:12px;color:#9aa1a9">view-only in v1 — moderate via the yard's dealer account</span>` : ""}
    </div>
    <table>
      <tr><th>Vehicle</th><th>Dealer</th><th>Status</th><th style="text-align:right">Price</th>
          <th style="text-align:right">Views / contacts</th><th>Created</th><th>Public</th>
          ${kind === "listing" ? "<th>Actions</th>" : ""}</tr>
      ${rows || `<tr><td colspan="${cols}" style="text-align:center;color:#9aa1a9;padding:24px">No ${kind === "donor" ? "donor cars" : "listings"}${status !== "all" ? ` with status '${esc(status)}'` : " yet"}.</td></tr>`}
    </table>`;

  return page({ title: "Listings", path: "/listings", adminEmail, msg: url.searchParams.get("msg"), body });
}

export async function listingsAction(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("do") ?? "");
  const now = Math.floor(Date.now() / 1000);

  // Bounce back to the status filter the operator was on (allowlisted).
  const ret = String(form.get("ret") ?? "all");
  const back = (LISTING_STATUSES as readonly string[]).includes(ret)
    ? `/listings?status=${ret}` : "/listings";

  const listing = await env.DB.prepare(
    `SELECT id, slug, status FROM listings WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; slug: string; status: string }>();
  if (!listing) return redirect(back, "Listing not found");

  switch (action) {
    case "expire": {
      // From-state guard lives in the WHERE clause: only active|flagged may
      // expire, so concurrent tabs / stale pages can't touch sold or draft.
      const res = await env.DB.prepare(
        `UPDATE listings SET status = 'expired', updated_at = ?
         WHERE id = ? AND status IN ('active', 'flagged')`,
      ).bind(now, id).run();
      if (res.meta.changes === 0) {
        return redirect(back, `${listing.slug}: no change (status is ${listing.status})`);
      }
      await audit(env, adminEmail, "listing.expire", id, { slug: listing.slug });
      return redirect(back, `${listing.slug}: expired`);
    }
    case "restore": {
      // Restore is a moderation undo, ONLY valid from flagged — never a way
      // to resurrect sold/expired inventory.
      const res = await env.DB.prepare(
        `UPDATE listings SET status = 'active', updated_at = ?
         WHERE id = ? AND status = 'flagged'`,
      ).bind(now, id).run();
      if (res.meta.changes === 0) {
        return redirect(back, `${listing.slug}: no change (status is ${listing.status}, only flagged restores)`);
      }
      await audit(env, adminEmail, "listing.restore", id, { slug: listing.slug });
      return redirect(back, `${listing.slug}: restored to active`);
    }
    default:
      return redirect(back, "Unknown action");
  }
}

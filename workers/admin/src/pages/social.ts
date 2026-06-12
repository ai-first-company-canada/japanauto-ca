/// <reference types="@cloudflare/workers-types" />
/**
 * /social — social-boost queue oversight (migration 0015, contract in
 * docs/architecture/social-boost.md). The external content factory drives the
 * lifecycle through the pull API; the operator mostly observes — the single
 * mutation here is Cancel, for a stuck/stale job or a dealer asking to
 * withdraw the consent given at Promote time.
 */

import type { AdminEnv } from "../lib/access";
import { audit } from "../lib/audit";
import { actionBtn, badge, esc, fmtAgo, page, redirect } from "../lib/html";

const STATUSES = ["requested", "in_production", "published", "cancelled"] as const;
type JobStatus = (typeof STATUSES)[number];

const TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  requested: "warn", // waiting for the factory to poll it
  in_production: "warn", // claimed, posts being produced
  published: "ok",
  cancelled: "muted",
};

interface JobRow {
  id: string;
  listing_id: string;
  status: string;
  payload: string;
  result_links: string | null;
  requested_at: number;
  published_at: number | null;
  dealer_email: string;
}

/**
 * payload is the JSON listing snapshot written by boost-social.ts (year/make/
 * model/trim, listing_url, …). It crosses a project boundary, so parse
 * defensively and degrade to 'n/a' — never let a malformed row break the page.
 */
function parsePayload(raw: string): { vehicle: string; listingUrl: string | null } {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const vehicle = [
      typeof p.year === "number" ? String(p.year) : "",
      typeof p.make === "string" ? p.make : "",
      typeof p.model === "string" ? p.model : "",
    ].filter(Boolean).join(" ");
    const listingUrl =
      typeof p.listing_url === "string" && /^https?:\/\//.test(p.listing_url)
        ? p.listing_url
        : null;
    return { vehicle: vehicle || "n/a", listingUrl };
  } catch {
    return { vehicle: "n/a", listingUrl: null };
  }
}

/** result_links: JSON array of published post URLs written back by the factory. */
function parseLinks(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
      .slice(0, 20);
  } catch {
    return [];
  }
}

export async function socialPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  // ?status= filter — allowlisted; anything unknown falls back to 'all', so
  // the value only ever reaches SQL (as a bound param) when it IS in the enum.
  const rawFilter = url.searchParams.get("status") ?? "all";
  const filter: JobStatus | "all" = (STATUSES as readonly string[]).includes(rawFilter)
    ? (rawFilter as JobStatus)
    : "all";

  const [jobsRes, countsRes] = await Promise.all([
    env.DB.prepare(`
      SELECT j.id, j.listing_id, j.status, j.payload, j.result_links,
             j.requested_at, j.published_at, d.email AS dealer_email
      FROM social_boost_jobs j
      JOIN dealers d ON d.id = j.dealer_id
      ${filter === "all" ? "" : "WHERE j.status = ?1"}
      ORDER BY j.requested_at DESC
      LIMIT 200
    `).bind(...(filter === "all" ? [] : [filter])).all<JobRow>(),
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM social_boost_jobs GROUP BY status`,
    ).all<{ status: string; n: number }>(),
  ]);

  const counts = new Map((countsRes.results ?? []).map((r) => [r.status, r.n]));
  const countsLine = STATUSES
    .map((s) => `${esc(s.replace("_", " "))} ${counts.get(s) ?? 0}`)
    .join(" · ");

  const tabFilters: ReadonlyArray<JobStatus | "all"> = ["all", ...STATUSES];
  const tabs = tabFilters.map((s) => {
    const active = filter === s;
    const href = s === "all" ? "/social" : `/social?status=${s}`;
    return `<a href="${href}" style="padding:4px 10px;border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;${active ? "background:#1a1c1f;color:#fff" : "color:#3a3f45"}">${esc(s.replace("_", " "))}</a>`;
  }).join("");

  const rows = (jobsRes.results ?? []).map((j) => {
    const { vehicle, listingUrl } = parsePayload(j.payload);
    const links = parseLinks(j.result_links);
    const postLinks = links.length
      ? links.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">post ${i + 1}</a>`).join(", ")
      : "—";
    const cancellable = j.status === "requested" || j.status === "in_production";
    return `<tr>
      <td>
        <div style="font-weight:600">${esc(vehicle)}</div>
        ${listingUrl
          ? `<a href="${esc(listingUrl)}" target="_blank" rel="noopener" style="font-size:12px">listing ↗</a>`
          : `<span style="font-size:12px;color:#9aa1a9">no listing url</span>`}
      </td>
      <td style="font-size:12px">${esc(j.dealer_email)}</td>
      <td>${badge(j.status.replace("_", " "), TONE[j.status] ?? "muted")}</td>
      <td>${fmtAgo(j.requested_at)}</td>
      <td>${postLinks}${j.published_at ? `<div style="font-size:11px;color:#9aa1a9">published ${fmtAgo(j.published_at)}</div>` : ""}</td>
      <td style="white-space:nowrap">
        ${cancellable ? actionBtn("/social/action", { id: j.id, do: "cancel" }, "Cancel", { danger: true }) : ""}
      </td>
    </tr>`;
  }).join("");

  const body = `
    <h1>Social boost <span style="color:#9aa1a9;font-weight:400">(${jobsRes.results?.length ?? 0})</span></h1>
    <p style="font-size:12px;color:#5a6068;margin:0 0 10px">${countsLine}</p>
    <div style="display:flex;gap:2px;background:#fff;border-radius:10px;padding:3px;width:max-content;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)">${tabs}</div>
    <table>
      <tr><th>Vehicle</th><th>Dealer</th><th>Status</th><th>Requested</th><th>Published</th><th></th></tr>
      ${rows || `<tr><td colspan="6" style="text-align:center;color:#9aa1a9;padding:24px">No jobs${filter === "all" ? " yet" : ` with status '${esc(filter)}'`}.</td></tr>`}
    </table>`;

  return page({ title: "Social boost", path: "/social", adminEmail, msg: url.searchParams.get("msg"), body });
}

export async function socialAction(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("do") ?? "");
  const now = Math.floor(Date.now() / 1000);

  if (action !== "cancel") return redirect("/social", "Unknown action");

  const job = await env.DB.prepare(
    `SELECT id, listing_id, status FROM social_boost_jobs WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; listing_id: string; status: string }>();
  if (!job) return redirect("/social", "Job not found");

  // Cancel only from a non-terminal state — the WHERE guard makes this
  // race-free against a concurrent factory PATCH (a published job stays
  // published, see 0015's lifecycle). result_links are deliberately left
  // untouched: cancellation withdraws the queue entry, not history.
  const res = await env.DB.prepare(`
    UPDATE social_boost_jobs SET status = 'cancelled', updated_at = ?
    WHERE id = ? AND status IN ('requested', 'in_production')
  `).bind(now, id).run();
  if (!res.meta.changes) {
    return redirect("/social", `Job is already ${job.status} — terminal states are immutable`);
  }

  await audit(env, adminEmail, "social.cancel", id, { listing_id: job.listing_id });
  return redirect("/social", `Job cancelled (listing ${job.listing_id})`);
}

/// <reference types="@cloudflare/workers-types" />
/**
 * /slots — featured city×brand slot contracts (ADR-0013). These are manual
 * B2B deals (invoice, not self-serve): the operator records a signed contract
 * here instead of poking featured_slots with raw SQL. Slots are created
 * 'pending' (creative review gate), then activated / paused / ended from the
 * table. The exclusivity invariant — at most one live slot per (city, make) —
 * is enforced here at the app layer because SQLite can't express a UNIQUE
 * over overlapping time windows (see the comment next to featured_slots in
 * migration 0001 and billing.md).
 */

import type { AdminEnv } from "../lib/access";
import { audit, auditMark } from "../lib/audit";
import { actionBtn, badge, esc, fmtCad, fmtTs, page, redirect } from "../lib/html";

/**
 * Tier-1 CMA slugs and their provinces — slots are only sold where the site
 * is live. Keep in sync with the cities seed (migration 0002); the cities
 * table itself has Tier 2/3 'planned' rows we must NOT offer here.
 */
const CITY_PROVINCE: Record<string, string> = {
  toronto: "ON",
  montreal: "QC",
  vancouver: "BC",
  calgary: "AB",
  edmonton: "AB",
  ottawa: "ON",
};

/** Provinces covered by the 6 live CMAs (subset of the schema CHECK list). */
const PROVINCES = ["AB", "BC", "ON", "QC"];

/**
 * Status machine: pending→active, active⇄paused, {active,paused}→ended.
 * `from` doubles as the SQL WHERE guard so a stale tab can't skip a state.
 */
const TRANSITIONS: Record<string, { to: string; from: string[] }> = {
  activate: { to: "active", from: ["pending", "paused"] },
  pause: { to: "paused", from: ["active"] },
  end: { to: "ended", from: ["active", "paused"] },
};

const STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "muted"> = {
  pending: "warn",
  active: "ok",
  paused: "muted",
  ended: "muted",
};

interface SlotRow {
  id: string;
  city: string;
  province: string;
  status: string;
  promo_title: string;
  active_from: number;
  active_until: number;
  contract_paid_cents: number;
  created_at: number;
  make_name: string;
  make_slug: string;
  model_name: string | null;
  dealer_name: string;
  dealer_email: string;
}

interface MakeOpt {
  slug: string;
  name: string;
}

/** Labeled form control (control HTML is built by us; labels go through esc). */
function field(label: string, control: string): string {
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#5a6068">${esc(label)}${control}</label>`;
}

export async function slotsPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const [slotsRes, makesRes] = await Promise.all([
    env.DB.prepare(`
      SELECT s.id, s.city, s.province, s.status, s.promo_title,
             s.active_from, s.active_until, s.contract_paid_cents, s.created_at,
             m.name AS make_name, m.slug AS make_slug,
             mo.name AS model_name,
             d.name AS dealer_name, d.email AS dealer_email
      FROM featured_slots s
      JOIN makes m ON m.id = s.make_id
      LEFT JOIN models mo ON mo.id = s.model_id
      JOIN dealers d ON d.id = s.dealer_id
      ORDER BY s.created_at DESC
      LIMIT 200
    `).all<SlotRow>(),
    env.DB.prepare(
      `SELECT slug, name FROM makes ORDER BY display_order LIMIT 50`,
    ).all<MakeOpt>(),
  ]);

  const rows = (slotsRes.results ?? []).map((s) => {
    // Buttons follow TRANSITIONS — render only what the guard would allow.
    const actions: string[] = [];
    if (s.status === "pending" || s.status === "paused") {
      actions.push(actionBtn("/slots/action", { id: s.id, do: "activate" }, "Activate"));
    }
    if (s.status === "active") {
      actions.push(actionBtn("/slots/action", { id: s.id, do: "pause" }, "Pause"));
    }
    if (s.status === "active" || s.status === "paused") {
      actions.push(actionBtn("/slots/action", { id: s.id, do: "end" }, "End", { danger: true }));
    }
    return `<tr>
      <td>
        <div style="font-weight:600">${esc(s.city)} × ${esc(s.make_name)}</div>
        <div style="font-size:12px;color:#5a6068">${s.model_name ? esc(s.model_name) : "all models"} · ${esc(s.province)}</div>
      </td>
      <td>
        <div style="font-weight:600">${esc(s.dealer_name)}</div>
        <div style="font-size:12px;color:#5a6068">${esc(s.dealer_email)}</div>
      </td>
      <td>${badge(s.status, STATUS_TONE[s.status] ?? "muted")}</td>
      <td style="white-space:nowrap;font-size:12px">${fmtTs(s.active_from)}<br>– ${fmtTs(s.active_until)}</td>
      <td style="text-align:right">${fmtCad(s.contract_paid_cents)}</td>
      <td style="font-size:12px">${esc(s.promo_title)}</td>
      <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">${actions.join("")}</td>
    </tr>`;
  }).join("");

  const makeOptions = (makesRes.results ?? [])
    .map((m) => `<option value="${esc(m.slug)}">${esc(m.name)}</option>`)
    .join("");
  const cityOptions = Object.keys(CITY_PROVINCE)
    .map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)
    .join("");
  // Default ON so it matches the default city (toronto) out of the box.
  const provinceOptions = PROVINCES
    .map((p) => `<option value="${esc(p)}"${p === "ON" ? " selected" : ""}>${esc(p)}</option>`)
    .join("");

  const body = `
    <h1>Featured slots <span style="color:#9aa1a9;font-weight:400">(${slotsRes.results?.length ?? 0})</span></h1>
    <table>
      <tr><th>City × make</th><th>Dealer</th><th>Status</th><th>Window</th><th style="text-align:right">Contract</th><th>Promo</th><th>Actions</th></tr>
      ${rows || `<tr><td colspan="7" style="text-align:center;color:#9aa1a9;padding:24px">No slot contracts yet.</td></tr>`}
    </table>

    <h2>New slot contract</h2>
    <p style="font-size:12px;color:#5a6068;margin:4px 0 10px">
      Created as <b>pending</b> — activate after creative review (ADR-0013).
      Featured is exclusive: one live slot per city × brand.
    </p>
    <form method="post" action="/slots/create" style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,.06);display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">
      ${field("Dealer email", `<input type="email" name="dealer_email" required placeholder="dealer@example.com">`)}
      ${field("Make", `<select name="make" required>${makeOptions}</select>`)}
      ${field("Model slug (blank = all models)", `<input name="model" placeholder="corolla">`)}
      ${field("City (CMA)", `<select name="city" required>${cityOptions}</select>`)}
      ${field("Province (must match city)", `<select name="province" required>${provinceOptions}</select>`)}
      ${field("Months (1–12, 30d each)", `<input type="number" name="months" min="1" max="12" step="1" value="1" required>`)}
      ${field("Monthly price (CAD)", `<input type="number" name="monthly_cad" min="1" max="100000" step="1" placeholder="2995" required>`)}
      ${field("Promo MSRP (CAD, optional)", `<input type="number" name="msrp_cad" min="0" max="1000000" step="1" placeholder="32990">`)}
      ${field("Promo title (max 80)", `<input name="promo_title" maxlength="80" required placeholder="New 2026 Toyota Corolla LE">`)}
      ${field("Promo URL (https://)", `<input type="url" name="promo_url" required placeholder="https://dealer.example.com/corolla">`)}
      <label style="grid-column:1/-1;display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#5a6068">Disclosure (max 160)
        <input name="disclosure" maxlength="160" required placeholder="Sponsored by Maple Toyota — official Toyota dealer in Calgary">
      </label>
      <div style="grid-column:1/-1"><button type="submit">Create slot (pending)</button></div>
    </form>`;

  return page({ title: "Featured slots", path: "/slots", adminEmail, msg: url.searchParams.get("msg"), body });
}

export async function slotsCreate(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const now = Math.floor(Date.now() / 1000);

  // --- Parse + validate every field against explicit rules before any DB write.
  const dealerEmail = String(form.get("dealer_email") ?? "").trim().slice(0, 120);
  const makeSlug = String(form.get("make") ?? "").trim().toLowerCase().slice(0, 40);
  const modelSlug = String(form.get("model") ?? "").trim().toLowerCase().slice(0, 60);
  const city = String(form.get("city") ?? "").trim().toLowerCase().slice(0, 40);
  const province = String(form.get("province") ?? "").trim().toUpperCase().slice(0, 2);
  const monthsRaw = String(form.get("months") ?? "").trim();
  const monthlyRaw = String(form.get("monthly_cad") ?? "").trim();
  const msrpRaw = String(form.get("msrp_cad") ?? "").trim();
  const promoTitle = String(form.get("promo_title") ?? "").trim();
  const promoUrl = String(form.get("promo_url") ?? "").trim();
  const disclosure = String(form.get("disclosure") ?? "").trim();

  if (!dealerEmail) return redirect("/slots", "Dealer email is required");

  const expectedProvince = CITY_PROVINCE[city];
  if (!expectedProvince) return redirect("/slots", `Unknown city '${city}' — pick one of the 6 live CMAs`);
  if (!PROVINCES.includes(province)) return redirect("/slots", `Unknown province '${province}'`);
  if (province !== expectedProvince) {
    return redirect("/slots", `Province ${province} does not match ${city} (expected ${expectedProvince})`);
  }

  const months = monthsRaw === "" ? 1 : Number(monthsRaw);
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    return redirect("/slots", "Months must be a whole number 1–12");
  }
  const monthlyCad = Number(monthlyRaw);
  if (!Number.isInteger(monthlyCad) || monthlyCad < 1 || monthlyCad > 100000) {
    return redirect("/slots", "Monthly price must be whole CAD dollars (1–100,000)");
  }
  // promo_msrp_cents is NOT NULL CHECK 0..100,000,000 in 0001 — optional in
  // the form, 0 when the contract has no MSRP creative yet.
  const msrpCad = msrpRaw === "" ? 0 : Number(msrpRaw);
  if (!Number.isInteger(msrpCad) || msrpCad < 0 || msrpCad > 1000000) {
    return redirect("/slots", "MSRP must be whole CAD dollars (0–1,000,000)");
  }

  if (!promoTitle || promoTitle.length > 80) return redirect("/slots", "Promo title is required, max 80 chars");
  if (!promoUrl.startsWith("https://") || promoUrl.length > 300) {
    return redirect("/slots", "Promo URL must start with https:// (max 300 chars)");
  }
  if (!disclosure || disclosure.length > 160) return redirect("/slots", "Disclosure is required, max 160 chars");

  // --- Resolve references (all by bound param, never trusted as ids directly).
  const dealer = await env.DB.prepare(
    `SELECT id, email FROM dealers WHERE email = ? COLLATE NOCASE LIMIT 1`,
  ).bind(dealerEmail).first<{ id: string; email: string }>();
  if (!dealer) return redirect("/slots", `No dealer with email ${dealerEmail}`);

  const make = await env.DB.prepare(
    `SELECT id, slug FROM makes WHERE slug = ? LIMIT 1`,
  ).bind(makeSlug).first<{ id: number; slug: string }>();
  if (!make) return redirect("/slots", `Unknown make '${makeSlug}'`);

  let modelId: number | null = null;
  if (modelSlug) {
    const model = await env.DB.prepare(
      `SELECT id FROM models WHERE make_id = ? AND slug = ? LIMIT 1`,
    ).bind(make.id, modelSlug).first<{ id: number }>();
    if (!model) return redirect("/slots", `'${modelSlug}' is not a ${makeSlug} model`);
    modelId = model.id;
  }

  // --- ONE ACTIVE SLOT invariant (billing.md): featured = exclusive city×brand.
  // On create, any non-ended slot for the pair blocks — a pending or paused
  // contract still owns the exclusivity window.
  const clash = await env.DB.prepare(`
    SELECT id, status FROM featured_slots
    WHERE city = ? AND make_id = ? AND status IN ('pending','active','paused')
    LIMIT 1
  `).bind(city, make.id).first<{ id: string; status: string }>();
  if (clash) {
    return redirect("/slots", `Conflict: ${city} × ${makeSlug} already has a ${clash.status} slot — end it first`);
  }

  const id = crypto.randomUUID();
  // The window stamped here is provisional — first activation re-stamps it to
  // start AT activation, so creative-review days never burn paid time
  // (security review 2026-06-12). Duration is carried as (until - from).
  const activeUntil = now + months * 30 * 86400;
  const contractCents = months * monthlyCad * 100;

  try {
    await env.DB.prepare(`
      INSERT INTO featured_slots
        (id, dealer_id, make_id, model_id, city, province,
         promo_title, promo_msrp_cents, promo_image_id, promo_url, disclosure,
         active_from, active_until, contract_paid_cents, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(
      id, dealer.id, make.id, modelId, city, province,
      promoTitle, msrpCad * 100, promoUrl, disclosure,
      now, activeUntil, contractCents, now, now,
    ).run();
  } catch (e) {
    // ux_featured_slots_live (0017): the clash SELECT above is advisory; this
    // partial unique index is the atomic enforcement against double-submit.
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      return redirect("/slots", `Conflict: ${city} × ${makeSlug} already has a live slot (index)`);
    }
    throw e;
  }

  const ok = await audit(env, adminEmail, "slot.create", id, {
    city, make: makeSlug, model: modelSlug || null, dealer: dealer.email,
    months, contract_paid_cents: contractCents,
  });
  return redirect("/slots", auditMark(`${city} × ${makeSlug}: pending slot created for ${dealer.email} (${fmtCad(contractCents)} / ${months}mo)`, ok));
}

export async function slotsAction(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("do") ?? "");
  const now = Math.floor(Date.now() / 1000);

  const t = TRANSITIONS[action];
  if (!t || !id) return redirect("/slots", "Unknown slot action");

  const slot = await env.DB.prepare(`
    SELECT s.id, s.city, s.status, s.make_id, s.active_from, s.active_until, m.slug AS make
    FROM featured_slots s JOIN makes m ON m.id = s.make_id
    WHERE s.id = ? LIMIT 1
  `).bind(id).first<{
    id: string; city: string; status: string; make_id: number;
    active_from: number; active_until: number; make: string;
  }>();
  if (!slot) return redirect("/slots", "Slot not found");

  // Activation re-checks exclusivity: a paused slot may resume only if no
  // other slot grabbed (city, make) ACTIVE in the meantime. (Advisory — the
  // ux_featured_slots_live index already prevents two live rows per pair.)
  if (action === "activate") {
    const clash = await env.DB.prepare(`
      SELECT id FROM featured_slots
      WHERE city = ? AND make_id = ? AND status = 'active' AND id != ?
      LIMIT 1
    `).bind(slot.city, slot.make_id, id).first<{ id: string }>();
    if (clash) {
      return redirect("/slots", `Cannot activate: another active slot already holds ${slot.city} × ${slot.make}`);
    }
  }

  let res;
  if (action === "activate" && slot.status === "pending") {
    // FIRST activation starts the paid clock NOW — review days don't burn
    // contracted time. Duration was fixed at create as (until - from).
    const duration = Math.max(86400, slot.active_until - slot.active_from);
    res = await env.DB.prepare(
      `UPDATE featured_slots SET status = 'active', active_from = ?, active_until = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).bind(now, now + duration, now, id).run();
  } else if (action === "activate") {
    // Resuming from pause keeps the window (paused time burns — the pause is
    // the dealer's call); a lapsed window cannot be resurrected.
    if (slot.active_until <= now) {
      return redirect("/slots", `Window lapsed ${fmtTs(slot.active_until)} — create a new contract instead`);
    }
    res = await env.DB.prepare(
      `UPDATE featured_slots SET status = 'active', updated_at = ?
       WHERE id = ? AND status = 'paused' AND active_until > ?`,
    ).bind(now, id, now).run();
  } else {
    // Status guard in WHERE — a double-submit or stale tab changes 0 rows.
    const guards = t.from.map(() => "?").join(", ");
    res = await env.DB.prepare(
      `UPDATE featured_slots SET status = ?, updated_at = ? WHERE id = ? AND status IN (${guards})`,
    ).bind(t.to, now, id, ...t.from).run();
  }
  if (!res.meta.changes) {
    return redirect("/slots", `Cannot ${action} a ${slot.status} slot (allowed from: ${t.from.join(", ")})`);
  }

  const ok = await audit(env, adminEmail, `slot.${action}`, id, { city: slot.city, make: slot.make });
  return redirect("/slots", auditMark(`${slot.city} × ${slot.make}: slot ${t.to}`, ok));
}

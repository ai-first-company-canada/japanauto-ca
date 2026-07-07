/// <reference types="@cloudflare/workers-types" />
/**
 * /dealers — every account, effective tier, inventory counts, last sign-in;
 * actions: verify toggle, +30d trial, manual tier switch (until Stripe),
 * one-time password-reset link (no email service yet — the operator hands
 * the link to the dealer; token contract documented in
 * functions/api/auth/password-reset.ts).
 */

import type { AdminEnv } from "../lib/access";
import { audit, auditMark } from "../lib/audit";
import { actionBtn, badge, esc, fmtAgo, fmtTs, page, redirect } from "../lib/html";

interface DealerRow {
  id: string;
  email: string;
  name: string;
  type: string;
  city: string;
  province: string;
  verified: number;
  subscription_tier: string;
  subscription_status: string | null;
  trial_ends_at: number | null;
  created_at: number;
  listings_active: number;
  listings_total: number;
  donors_total: number;
  last_login: number | null;
}

/**
 * Mirror of functions/api/_lib/entitlements.ts effectiveTier() — duplicated
 * because the admin Worker doesn't share the Pages bundle. KEEP IN SYNC with
 * LIVE_PAID_SUBSCRIPTION_STATUSES in lib/schema.ts (COR-4).
 */
function effectiveTier(d: DealerRow, now: number): "free" | "pro" {
  const paidPro = d.subscription_tier === "pro" && d.subscription_status !== null
    && ["active", "trialing", "past_due"].includes(d.subscription_status);
  const onTrial = d.trial_ends_at !== null && d.trial_ends_at > now;
  return paidPro || onTrial ? "pro" : "free";
}

export async function dealersPage(
  url: URL, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  // Escape LIKE metacharacters so '%'/'_' in the search box don't act as
  // wildcards (the pattern itself is a bound param — no SQLi either way).
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const res = await env.DB.prepare(`
    SELECT d.id, d.email, d.name, d.type, d.city, d.province, d.verified,
           d.subscription_tier, d.subscription_status, d.trial_ends_at, d.created_at,
           (SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id AND l.status = 'active') AS listings_active,
           (SELECT COUNT(*) FROM listings l WHERE l.dealer_id = d.id) AS listings_total,
           (SELECT COUNT(*) FROM donor_cars dc WHERE dc.dealer_id = d.id) AS donors_total,
           (SELECT MAX(rt.issued_at) FROM refresh_tokens rt WHERE rt.dealer_id = d.id) AS last_login
    FROM dealers d
    ${q ? "WHERE d.email LIKE ?1 ESCAPE '\\' OR d.name LIKE ?1 ESCAPE '\\' OR d.id LIKE ?1 ESCAPE '\\'" : ""}
    ORDER BY d.created_at DESC
    LIMIT 200
  `).bind(...(q ? [like] : [])).all<DealerRow>();

  const now = Math.floor(Date.now() / 1000);
  const rows = (res.results ?? []).map((d) => {
    const tier = effectiveTier(d, now);
    const trialLeft = d.trial_ends_at && d.trial_ends_at > now
      ? Math.ceil((d.trial_ends_at - now) / 86400) : 0;
    return `<tr>
      <td>
        <div style="font-weight:600">${esc(d.name)}</div>
        <div style="font-size:12px;color:#5a6068">${esc(d.email)}</div>
        <div style="font-size:11px;color:#9aa1a9">${esc(d.city)}, ${esc(d.province)} · ${esc(d.type)} · joined ${fmtTs(d.created_at).slice(0, 10)}</div>
      </td>
      <td>${badge(tier === "pro" ? (trialLeft ? `pro · trial ${trialLeft}d` : "pro") : "free", tier === "pro" ? "ok" : "muted")}
          ${d.verified ? badge("verified", "ok") : badge("unverified", "warn")}</td>
      <td style="text-align:right"><b>${d.listings_active}</b> active<br>
          <span style="font-size:12px;color:#5a6068">${d.listings_total} listings · ${d.donors_total} donors</span></td>
      <td>${fmtAgo(d.last_login)}</td>
      <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap">
        ${actionBtn("/dealers/action", { id: d.id, do: d.verified ? "unverify" : "verify" }, d.verified ? "Unverify" : "Verify")}
        ${actionBtn("/dealers/action", { id: d.id, do: "trial30" }, "+30d trial")}
        ${actionBtn("/dealers/action", { id: d.id, do: "tier", value: tier === "pro" ? "free" : "pro" }, tier === "pro" ? "→ free" : "→ pro")}
        ${actionBtn("/dealers/action", { id: d.id, do: "resetlink" }, "Reset link")}
      </td>
    </tr>`;
  }).join("");

  const body = `
    <h1>Dealers <span style="color:#9aa1a9;font-weight:400">(${res.results?.length ?? 0})</span></h1>
    <form method="get" action="/dealers" style="margin-bottom:12px">
      <input type="search" name="q" value="${esc(q)}" placeholder="email / name / id" style="width:260px">
      <button type="submit">Search</button>
    </form>
    <table>
      <tr><th>Dealer</th><th>Tier</th><th style="text-align:right">Inventory</th><th>Last sign-in</th><th>Actions</th></tr>
      ${rows || `<tr><td colspan="5" style="text-align:center;color:#9aa1a9;padding:24px">No dealers${q ? " matching the search" : " yet"}.</td></tr>`}
    </table>`;

  return page({ title: "Dealers", path: "/dealers", adminEmail, msg: url.searchParams.get("msg"), body });
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function dealersAction(
  request: Request, env: AdminEnv, adminEmail: string,
): Promise<Response> {
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("do") ?? "");
  const now = Math.floor(Date.now() / 1000);

  const dealer = await env.DB.prepare(
    `SELECT id, email, trial_ends_at FROM dealers WHERE id = ? LIMIT 1`,
  ).bind(id).first<{ id: string; email: string; trial_ends_at: number | null }>();
  if (!dealer) return redirect("/dealers", "Dealer not found");

  switch (action) {
    case "verify":
    case "unverify": {
      const v = action === "verify" ? 1 : 0;
      await env.DB.prepare(`UPDATE dealers SET verified = ?, updated_at = ? WHERE id = ?`)
        .bind(v, now, id).run();
      const ok = await audit(env, adminEmail, `dealer.${action}`, id, { email: dealer.email });
      return redirect("/dealers", auditMark(`${dealer.email}: ${action === "verify" ? "verified" : "verification removed"}`, ok));
    }
    case "trial30": {
      const base = Math.max(dealer.trial_ends_at ?? 0, now);
      const until = base + 30 * 86400;
      await env.DB.prepare(`UPDATE dealers SET trial_ends_at = ?, updated_at = ? WHERE id = ?`)
        .bind(until, now, id).run();
      const ok = await audit(env, adminEmail, "dealer.trial_extend", id, { email: dealer.email, until });
      return redirect("/dealers", auditMark(`${dealer.email}: trial extended to ${new Date(until * 1000).toISOString().slice(0, 10)}`, ok));
    }
    case "tier": {
      const value = String(form.get("value") ?? "");
      if (value !== "free" && value !== "pro") return redirect("/dealers", "Bad tier");
      // Manual switch until Stripe wires up: 'pro' needs a live status for
      // effectiveTier(); '→ free' must ALSO end an unexpired trial, otherwise
      // the demotion is a silent no-op for trialing dealers (security review).
      await env.DB.prepare(
        `UPDATE dealers SET subscription_tier = ?, subscription_status = ?,
                trial_ends_at = CASE WHEN ? = 'free' THEN NULL ELSE trial_ends_at END,
                updated_at = ? WHERE id = ?`,
      ).bind(value, value === "pro" ? "active" : null, value, now, id).run();
      const ok = await audit(env, adminEmail, "dealer.tier_set", id, { email: dealer.email, tier: value });
      return redirect("/dealers", auditMark(
        `${dealer.email}: tier → ${value}${value === "free" ? " (trial cleared)" : ""}`, ok));
    }
    case "resetlink": {
      const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
      // A new link supersedes any outstanding one — a mis-sent earlier link
      // must not stay live for its remaining TTL (security review).
      await env.DB.prepare(`
        UPDATE verification_tokens SET consumed_at = ?
        WHERE dealer_id = ? AND purpose = 'password_reset' AND consumed_at IS NULL
      `).bind(now, id).run();
      await env.DB.prepare(`
        INSERT INTO verification_tokens (id, dealer_id, purpose, token_hash, expires_at, created_at)
        VALUES (?, ?, 'password_reset', ?, ?, ?)
      `).bind(crypto.randomUUID(), id, await sha256Hex(token), now + 3600, now).run();
      const ok = await audit(env, adminEmail, "dealer.reset_link", id, { email: dealer.email, ttl: "1h" });
      const link = `https://japanauto.ca/dealer/reset-password/?token=${token}`;
      const body = `
        <h1>Password reset link</h1>
        ${ok ? "" : `<div class="msg" style="background:#fdeaea;color:#a02020">⚠ AUDIT WRITE FAILED — apply migration 0017.</div>`}
        <p>For <b>${esc(dealer.email)}</b> — valid <b>1 hour</b>, single use, supersedes any earlier link. It is shown ONCE; select &amp; copy it now and send it to the dealer yourself.</p>
        <div class="tokenbox">${esc(link)}</div>
        <p style="margin-top:12px"><a href="/dealers">← Back to dealers</a></p>`;
      return page({ title: "Reset link", path: "/dealers", adminEmail, body });
    }
    default:
      return redirect("/dealers", "Unknown action");
  }
}

/// <reference types="@cloudflare/workers-types" />
/**
 * Server-rendered HTML helpers for the admin panel. No framework, no client
 * JS beyond a copy-to-clipboard one-liner; every dynamic value goes through
 * esc(). The panel is behind Cloudflare Access — but render it as if it were
 * public anyway.
 */

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtCad(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return "CA$" + Math.round(cents / 100).toLocaleString("en-US");
}

export function fmtTs(unix: number | null | undefined): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export function fmtAgo(unix: number | null | undefined): string {
  if (!unix) return "—";
  const d = Math.floor(Date.now() / 1000) - unix;
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function badge(text: string, tone: "ok" | "warn" | "bad" | "muted" = "muted"): string {
  const colors = {
    ok: "background:#e7f5ec;color:#176939",
    warn: "background:#fdf3e0;color:#8a5a00",
    bad: "background:#fdeaea;color:#a02020",
    muted: "background:#eef0f2;color:#5a6068",
  } as const;
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;${colors[tone]}">${esc(text)}</span>`;
}

const NAV: Array<[string, string]> = [
  ["/", "Dashboard"],
  ["/dealers", "Dealers"],
  ["/listings", "Listings"],
  ["/slots", "Featured slots"],
  ["/social", "Social boost"],
  ["/ops", "Ops"],
];

export function page(opts: {
  title: string;
  path: string;
  adminEmail: string;
  msg?: string | null;
  body: string;
}): Response {
  const nav = NAV.map(([href, label]) => {
    const active = opts.path === href || (href !== "/" && opts.path.startsWith(href));
    return `<a href="${href}" style="padding:6px 12px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;color:${active ? "#fff;background:#1a1c1f" : "#3a3f45"}">${esc(label)}</a>`;
  }).join("");

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(opts.title)} — japanauto admin</title>
<style>
  body{font:14px/1.45 -apple-system,system-ui,sans-serif;margin:0;background:#f6f7f8;color:#1a1c1f}
  main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
  table{border-collapse:collapse;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;text-align:left;color:#5a6068;padding:10px 12px;border-bottom:1px solid #e4e7ea;background:#fafbfc}
  td{padding:9px 12px;border-bottom:1px solid #eef0f2;vertical-align:top}
  tr:last-child td{border-bottom:0}
  h1{font-size:20px;margin:18px 0 12px}
  h2{font-size:15px;margin:22px 0 8px}
  form.inline{display:inline}
  button{font:600 12px/1 -apple-system,system-ui,sans-serif;padding:6px 10px;border-radius:7px;border:1px solid #cdd2d8;background:#fff;cursor:pointer}
  button:hover{background:#f0f2f4}
  button.danger{border-color:#e3b3b3;color:#a02020}
  input,select{font:13px -apple-system,system-ui,sans-serif;padding:7px 9px;border:1px solid #cdd2d8;border-radius:7px;background:#fff}
  .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0}
  .kpi{background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  .kpi b{display:block;font-size:22px;margin-top:2px}
  .kpi span{font-size:11px;color:#5a6068;text-transform:uppercase;letter-spacing:.04em}
  .msg{background:#e7f5ec;color:#176939;padding:10px 14px;border-radius:8px;margin:12px 0;font-weight:600;font-size:13px}
  .tokenbox{background:#1a1c1f;color:#d7e6d9;padding:12px 14px;border-radius:8px;font:12px ui-monospace,monospace;word-break:break-all}
  a{color:#0a4ec2}
</style>
</head><body>
<div style="background:#1a1c1f;padding:10px 16px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
  <span style="color:#fff;font-weight:800;font-size:14px;margin-right:10px">japanauto<span style="color:#e4574c">/admin</span></span>
  <nav style="display:flex;gap:2px;background:#fff;border-radius:10px;padding:3px">${nav}</nav>
  <span style="margin-left:auto;color:#9aa1a9;font-size:12px">${esc(opts.adminEmail)}</span>
</div>
<main>
${opts.msg ? `<div class="msg">${esc(opts.msg)}</div>` : ""}
${opts.body}
</main>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      // The panel renders dealer-controlled strings to the operator — esc()
      // discipline plus a strict no-script CSP (the panel ships ZERO JS, so a
      // future esc() slip can't execute anything). Security review 2026-06-12.
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; " +
        "form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

/** POST helper: single-button action form (same-origin enforced in router). */
export function actionBtn(
  path: string,
  fields: Record<string, string>,
  label: string,
  opts: { danger?: boolean; confirm?: string } = {},
): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return `<form class="inline" method="post" action="${esc(path)}">${inputs}<button type="submit" class="${opts.danger ? "danger" : ""}">${esc(label)}</button></form>`;
}

export function redirect(to: string, msg?: string): Response {
  const loc = msg ? `${to}${to.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}` : to;
  return new Response(null, { status: 303, headers: { location: loc } });
}

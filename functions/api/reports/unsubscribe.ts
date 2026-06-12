/**
 * GET /api/reports/unsubscribe?d=<dealer_id>&s=<hmac>
 *
 * One-click opt-out from the weekly/monthly e-mail reports (decision 0016,
 * CASL requirement). The link is minted by the cron worker with
 * HMAC-SHA256(REPORTS_UNSUB_SECRET, dealer_id) — no session needed, the
 * signature alone authorizes flipping reports_opt_out for exactly that
 * dealer. Idempotent; the response is a tiny standalone HTML page.
 */

import type { Env } from "../../../types/env";

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function html(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — japanauto.ca</title></head>` +
    `<body style="font-family:-apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0"><div style="text-align:center;max-width:420px;padding:24px">` +
    `<div style="font-weight:800;font-size:16px;margin-bottom:12px">japanauto<span style="color:#e4574c">.ca</span></div>` +
    `<p style="font-size:15px;line-height:22px">${body}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" } },
  );
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const secret = env.REPORTS_UNSUB_SECRET;
  if (!secret) return html("Unavailable", "Report settings are temporarily unavailable.", 503);

  const url = new URL(request.url);
  const dealerId = url.searchParams.get("d") ?? "";
  const sig = url.searchParams.get("s") ?? "";
  if (!dealerId || !sig || !timingSafeEq(sig, await hmacHex(secret, `reports-unsub:v1:${dealerId}`))) {
    return html("Invalid link", "This unsubscribe link is invalid.", 400);
  }

  await env.DB.prepare(
    `UPDATE dealers SET reports_opt_out = 1, updated_at = unixepoch() WHERE id = ?`,
  ).bind(dealerId).run();

  return html(
    "Unsubscribed",
    "You won't receive weekly/monthly reports anymore. " +
    "Your statistics remain available any time in the dealer dashboard. " +
    "Changed your mind? Write to support@japanauto.ca.",
  );
};

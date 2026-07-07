/**
 * functions/api/_lib/email.ts
 *
 * Transactional email for Pages Functions via Resend's HTTP API (WS-2,
 * decision 0020). No SDK — a bare fetch, same pattern as the reports sender
 * in workers/expire-sweeper/src/reports.ts. One secret: RESEND_API_KEY on the
 * PAGES project (the worker has its own copy for reports — two places!).
 *
 * Dark-until-configured is a feature, not a bug: every caller must branch on
 * emailConfigured(env) and degrade honestly (password-reset request → the old
 * 501 + admin reset-link fallback; signup verify → silent skip). sendEmail
 * never throws — a failed email must never take down signup or reset.
 *
 * Billing (WS-1) imports sendEmail/renderTransactionalEmail from here for
 * grace/dunning mail — do not grow a second sender.
 */

import type { Env } from "../../../types/env";

const FROM_DEFAULT = "japanauto.ca <no-reply@japanauto.ca>";

export function emailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY);
}

export interface TransactionalMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send one transactional email. Returns false (and logs a structured,
 * PII-safe line OPS-4 can grep) on ANY failure — never throws.
 * `kind` labels the flow for that log line ("pw-reset" | "verify-email" | ...).
 */
export async function sendEmail(env: Env, kind: string, msg: TransactionalMessage): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.error("email-send-failed", JSON.stringify({ kind, status: "not_configured" }));
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: msg.from ?? env.AUTH_EMAIL_FROM ?? FROM_DEFAULT,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      // Never log the body/token — status + recipient only (the email is in D1 anyway).
      console.error("email-send-failed", JSON.stringify({ kind, status: res.status, to: msg.to }));
      return false;
    }
    return true;
  } catch (e) {
    console.error("email-send-failed", JSON.stringify({
      kind, status: "fetch_error", message: e instanceof Error ? e.message : String(e),
    }));
    return false;
  }
}

/**
 * Minimal plain transactional template: header, body, sender identification.
 * Facts only — a link, its TTL, who sent it (invariant: no fabricated copy).
 * Transactional mail needs no CASL unsubscribe, but must identify the sender.
 */
export function renderTransactionalEmail(opts: { heading: string; bodyHtml: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a">
    <p style="font-size:13px;color:#666;margin:0 0 16px">japanauto.ca</p>
    <h1 style="font-size:19px;margin:0 0 12px">${opts.heading}</h1>
    ${opts.bodyHtml}
    <p style="font-size:11px;color:#999;margin-top:22px;border-top:1px solid #eee;padding-top:10px">
      japanauto.ca · Calgary, AB, Canada · support@japanauto.ca</p>
  </div></body></html>`;
}

/**
 * POST /api/auth/password-reset — request a reset e-mail (WS-2, ADV-2).
 *
 * Anti-enumeration is the whole design (decision 0020):
 *  - the response is ALWAYS `200 { ok: true }` once past validation/limits;
 *  - every D1 lookup and the send happen inside ctx.waitUntil, so neither the
 *    body nor the response TIMING reveals whether the account exists.
 *
 * Token contract shared with ./confirm.ts and the admin panel's reset-link
 * (workers/admin/src/pages/dealers.ts): base64url(32B), sha256 hash stored,
 * purpose='password_reset', TTL 1h, single-use, supersedes earlier tokens.
 *
 * Dark mode: without RESEND_API_KEY this stays the previous 501 — the
 * forgot-password page shows its support/info fallback and the admin
 * reset-link path (docs/runbook.md) remains the manual fallback.
 *
 * Abuse: 5/h per IP + 3/h per target email (bombing cap).
 */

import type { Env } from "../../../../types/env";
import { passwordResetRequestSchema, zodErrorToApiError } from "../../../../lib/schema";
import { json, jsonError, badRequest, notImplemented } from "../../_lib/response";
import { rateLimit, RATE_LIMITS } from "../../_lib/rate-limit";
import { emailConfigured, sendEmail, renderTransactionalEmail } from "../../_lib/email";
import { mintVerificationToken } from "../../_lib/tokens";
import { getDealerByEmail } from "../../_lib/db";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  let body: unknown;
  try { body = await request.json(); }
  catch { return badRequest("Invalid JSON"); }

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    const err = zodErrorToApiError(parsed.error);
    return jsonError(422, err.error, err.message, err.issues);
  }

  if (!emailConfigured(env)) {
    // Honest dark mode — same copy the UI already falls back on.
    return notImplemented("Password reset by email is not available yet — contact support@japanauto.ca");
  }

  const email = parsed.data.email; // zod lowercases
  const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const perIp = await rateLimit(env, ip, RATE_LIMITS.PW_RESET_REQUEST_PER_IP);
  if (!perIp.allowed) {
    return jsonError(429, "rate_limited", `Too many requests — try again in ${perIp.retryAfterSeconds}s.`);
  }
  const perEmail = await rateLimit(env, email, RATE_LIMITS.PW_RESET_REQUEST_PER_EMAIL);
  if (!perEmail.allowed) {
    return jsonError(429, "rate_limited", `Too many requests — try again in ${perEmail.retryAfterSeconds}s.`);
  }

  // All account-dependent work is deferred — constant body AND timing.
  ctx.waitUntil((async () => {
    try {
      const dealer = await getDealerByEmail(env, email);
      if (!dealer) return; // silently done — no oracle
      const token = await mintVerificationToken(env, dealer.id, "password_reset", 3600);
      const link = `${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/dealer/reset-password/?token=${token}`;
      await sendEmail(env, "pw-reset", {
        to: email,
        subject: "Reset your japanauto.ca password",
        html: renderTransactionalEmail({
          heading: "Reset your password",
          bodyHtml: `
            <p>Someone (hopefully you) requested a password reset for the japanauto.ca
            dealer account under this address.</p>
            <p style="margin:18px 0"><a href="${link}"
              style="background:#0a4ec2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Choose a new password</a></p>
            <p>The link works <b>once</b> and expires in <b>1 hour</b>. If you didn't
            request this, ignore this email — your password is unchanged.</p>`,
        }),
      });
    } catch (e) {
      console.error("email-send-failed", JSON.stringify({
        kind: "pw-reset", status: "handler_error", message: e instanceof Error ? e.message : String(e),
      }));
    }
  })());

  return json({ ok: true });
};

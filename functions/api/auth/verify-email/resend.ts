/**
 * POST /api/auth/verify-email/resend — re-send the verification email (WS-2).
 *
 * Authenticated only, and only to the account's OWN address — an open resend
 * endpoint would be an email-bombing primitive against arbitrary addresses.
 * 3/day per dealer. Dark without RESEND_API_KEY (503 not_configured — the
 * cabinet nudge simply won't offer it then).
 */

import type { Env } from "../../../../types/env";
import { json, jsonError } from "../../_lib/response";
import { requireDealer } from "../../_lib/auth";
import { getDealerById } from "../../_lib/db";
import { rateLimit, RATE_LIMITS } from "../../_lib/rate-limit";
import { emailConfigured, sendEmail, renderTransactionalEmail } from "../../_lib/email";
import { mintVerificationToken } from "../../_lib/tokens";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const auth = await requireDealer(request, env);
  if (auth instanceof Response) return auth;

  if (!emailConfigured(env)) {
    return jsonError(503, "not_configured", "Email sending is not configured yet");
  }

  const dealer = await getDealerById(env, auth.dealerId);
  if (!dealer) return jsonError(404, "not_found", "Dealer not found");
  if (dealer.email_verified_at !== null) return json({ ok: true, already: true });

  const rl = await rateLimit(env, auth.dealerId, RATE_LIMITS.EMAIL_VERIFY_RESEND_PER_DEALER);
  if (!rl.allowed) {
    return jsonError(429, "rate_limited", `Too many re-sends — try again in ${rl.retryAfterSeconds}s.`);
  }

  const token = await mintVerificationToken(env, dealer.id, "email_verify", 86400);
  const link = `${env.PUBLIC_SITE_URL.replace(/\/$/, "")}/dealer/verify-email/?token=${token}`;
  ctx.waitUntil(sendEmail(env, "verify-email", {
    to: dealer.email,
    subject: "Confirm your email — japanauto.ca",
    html: renderTransactionalEmail({
      heading: "Confirm your email",
      bodyHtml: `
        <p>Click below to confirm this address for your japanauto.ca dealer account.</p>
        <p style="margin:18px 0"><a href="${link}"
          style="background:#0a4ec2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Confirm email</a></p>
        <p>The link works <b>once</b> and expires in <b>24 hours</b>.</p>`,
    }),
  }).then(() => undefined));

  return json({ ok: true });
};

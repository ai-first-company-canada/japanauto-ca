# 0020 — Transactional email: Resend over HTTP, dark-until-configured

- **Status:** accepted, implemented (code live; sending dark until owner sets secrets)
- **Date:** 2026-07-07
- **Context:** deep-audit ADV-2 (password-reset request was a 501 stub) + SEC-3
  (verify-email no-op); OPUS-PLAN WS-2

## Decision

1. **Transport: Resend HTTP API via bare `fetch`, no SDK** — same pattern the
   reports worker already uses. One sender for Pages lives in
   `functions/api/_lib/email.ts` (`sendEmail`/`renderTransactionalEmail`/
   `emailConfigured`); billing (WS-1) and any future flow import it — no second
   sender gets written.
2. **Dark-until-configured is the contract.** `RESEND_API_KEY` absent →
   password-reset request answers the previous honest 501 (UI shows the
   support fallback; admin panel reset-link remains the manual path), signup's
   verify-send silently skips, resend endpoint answers 503. No flow may fail
   or block on missing email config — partner onboarding beats verification.
3. **Anti-enumeration:** the reset request, once past validation and rate
   limits, ALWAYS answers `200 {ok:true}` and defers every account-dependent
   step (D1 lookup, token mint, send) into `ctx.waitUntil` — neither body nor
   timing reveals account existence.
4. **`email_verified_at` (migration 0022) is separate from `dealers.verified`.**
   `verified` stays the admin-granted public "Verified seller" trust badge;
   an email click must never hand it out. Nothing is gated on unverified email
   at launch — the dashboard shows a nudge + authenticated re-send (3/day).
5. **Token mechanics reuse the existing contract** (shared with admin
   reset-link and `password-reset/confirm.ts`): base64url(32B) raw token,
   sha256 hash in `verification_tokens`, single-use consume-first guard,
   supersede-on-mint (atomic `DB.batch`). Reset TTL 1h; verify TTL 24h.
6. **From addresses:** transactional default `no-reply@japanauto.ca`
   (override: `AUTH_EMAIL_FROM` var); reports keep `reports@japanauto.ca`
   (worker's `REPORTS_FROM`). Transactional mail carries sender identification
   (CASL) but needs no unsubscribe link.
7. **Observability floor:** every failed send logs one greppable line —
   `email-send-failed {kind, status}` — no token, no body. OPS-4 alerting can
   build on it later.

## Rate limits

| Flow | Limit |
|---|---|
| reset request | 5/h per IP + 3/h per target email |
| reset confirm (pre-existing) | 10/h per IP |
| verify consume | 10/h per IP |
| verify re-send | 3/day per dealer, authenticated, own address only |

## Owner steps to light it up (docs/runbook.md § Email)

Resend account → domain `japanauto.ca` + SPF/DKIM DNS in the Cloudflare zone
(possible BEFORE the domain is attached to Pages) → `RESEND_API_KEY` in TWO
places (Pages project **and** workers/expire-sweeper) → confirm
`support@japanauto.ca` actually delivers (Email Routing). Until cutover,
links in emails point at the not-yet-attached `https://japanauto.ca` —
recommended sequence: DNS verification now, secrets at cutover.

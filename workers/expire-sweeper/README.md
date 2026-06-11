# japanauto-expire-sweeper

Minimal Cron Worker that completes audit finding #8 (AUDIT-JapanAuto-2026-06-09).

Public listing reads already filter `(expires_at IS NULL OR expires_at > unixepoch)`
(fixed read-side 2026-06-10), but rows past their TTL stayed `status='active'`
forever — dealer dashboards showed them as active and analytics counts were
skewed. Cloudflare Pages Functions can't run `scheduled()` handlers, so this
lives as a separate Worker.

Every 6 hours (`0 */6 * * *` UTC) it runs:

```sql
UPDATE listings
   SET status = 'expired', updated_at = unixepoch()
 WHERE status = 'active'
   AND expires_at IS NOT NULL
   AND expires_at <= unixepoch();
```

against the same prod D1 the Pages project uses (`japanauto-prod`,
`b0d65b95-2f43-403d-9237-0d4cac6e186a`). The `idx_listings_status_expires
(status, expires_at)` index covers the predicate.

## Deploy

**Not covered by the Pages `npm run deploy`** — that only deploys `dist/` +
`functions/`. After any change here, deploy the Worker explicitly:

```bash
cd workers/expire-sweeper
npx wrangler deploy
```

(`npx` resolves wrangler from the repo root's node_modules.)

## Verify / debug

- Logs: Cloudflare dashboard → Workers & Pages → japanauto-expire-sweeper →
  Logs (observability is enabled), or `npx wrangler tail japanauto-expire-sweeper`.
  Each run logs `expire-sweeper: N listing(s) marked expired`.
- Manual trigger against prod: the D1 binding has `remote = true`, so
  `npx wrangler dev --test-scheduled` + `curl http://localhost:8787/__scheduled`
  runs the sweep against the **real prod DB** (idempotent — it only flips rows
  whose TTL already passed). There is no way to manually fire a deployed cron.

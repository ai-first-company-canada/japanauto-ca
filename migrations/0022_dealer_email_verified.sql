-- 0022: email-confirmation timestamp, SEPARATE from the public dealers.verified
-- badge (WS-2 / deep-audit ADV-2/SEC-3, decision 0020). `verified` stays an
-- admin-granted "Verified seller" trust badge (workers/admin `verify` action);
-- clicking an email link must never hand that badge out, so email confirmation
-- gets its own column. NULL = not confirmed yet.
-- IF-NOT-EXISTS is not available for ADD COLUMN; this DB has a journal-drift
-- history (REG-4) — verify the journal against PRAGMA table_info(dealers)
-- before applying (docs/runbook.md, migration procedure).
ALTER TABLE dealers ADD COLUMN email_verified_at INTEGER;

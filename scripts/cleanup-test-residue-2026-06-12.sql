-- One-shot prod cleanup before launch (LAUNCH-CHECKLIST §1, dry-run 2026-06-12).
-- Every row below was verified as test residue by the read-only sweep:
-- 7/7 dealers are May test signups (diag-*, e2e-test-*, keyboard-mash names),
-- the single listing is the May e2e sold Camry, all 15 refresh_tokens belong
-- to those dealers, and the 2 pending_media_uploads are orphans of the
-- already-deleted 2026-06-12 browser-E2E dealer.
--
-- Run:  cd ~/sites/japanauto && npx wrangler d1 execute japanauto-prod --remote --file scripts/cleanup-test-residue-2026-06-12.sql
-- Then: node scripts/export-catalog-data.mjs   (refresh the build snapshot)

DELETE FROM refresh_tokens WHERE dealer_id IN (
  'f64c7176-8385-4df0-a511-cbabd6a99bf8','d1e0382e-3aa8-4d17-a0bd-a4c2e600453b',
  'f92d3055-b5de-4814-a3e6-c50dae3ba517','eaf20601-01a5-4cff-98df-a86c37a9e56c',
  'c7781873-4324-45f6-8134-19909e66e8d3','58aebb8f-9792-45b0-b1d0-0843be8f00ca',
  '0e3bd549-fd42-4878-8129-83b82fd03906');

DELETE FROM listings WHERE id = 'de116539-53a1-4bd4-a7a2-21a21d52e317';

DELETE FROM dealers WHERE id IN (
  'f64c7176-8385-4df0-a511-cbabd6a99bf8','d1e0382e-3aa8-4d17-a0bd-a4c2e600453b',
  'f92d3055-b5de-4814-a3e6-c50dae3ba517','eaf20601-01a5-4cff-98df-a86c37a9e56c',
  'c7781873-4324-45f6-8134-19909e66e8d3','58aebb8f-9792-45b0-b1d0-0843be8f00ca',
  '0e3bd549-fd42-4878-8129-83b82fd03906');

DELETE FROM pending_media_uploads WHERE dealer_id = '0d799d49-7c5c-4653-9da9-035f6cfb4d2d';

SELECT (SELECT COUNT(*) FROM dealers)               AS dealers,
       (SELECT COUNT(*) FROM listings)              AS listings,
       (SELECT COUNT(*) FROM refresh_tokens)        AS refresh_tokens,
       (SELECT COUNT(*) FROM pending_media_uploads) AS pending_media;

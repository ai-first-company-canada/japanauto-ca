-- Launch dry-run 2026-06-12: purge ALL prod test residue (verified read-only
-- first: 7/7 dealers are May test signups, 1/1 listings is the May e2e sold
-- Camry, 15/15 refresh_tokens belong to those dealers, 2 pending_media_uploads
-- are orphans from the June-12 browser-E2E photo test. donor_cars, media,
-- verification_tokens, contact_reveals, featured_slots, boost_orders,
-- social_boost_jobs: already empty.
--
-- Run:  npx wrangler d1 execute japanauto-prod --remote \
--         --file scripts/cleanup-test-data-2026-06-12.sql
-- Then verify zeros:
--   npx wrangler d1 execute japanauto-prod --remote --command \
--     "SELECT (SELECT COUNT(*) FROM dealers) d, (SELECT COUNT(*) FROM listings) l,
--             (SELECT COUNT(*) FROM refresh_tokens) rt,
--             (SELECT COUNT(*) FROM pending_media_uploads) pmu"

DELETE FROM refresh_tokens WHERE dealer_id IN (
  'f64c7176-8385-4df0-a511-cbabd6a99bf8',  -- diagfinal@japanauto.ca
  'd1e0382e-3aa8-4d17-a0bd-a4c2e600453b',  -- 1231dsfasdfas@tyyy.com
  'f92d3055-b5de-4814-a3e6-c50dae3ba517',  -- targetwizard@icloud.com 'Wgedrgweg'
  'eaf20601-01a5-4cff-98df-a86c37a9e56c',  -- diag5@japanauto.ca
  'c7781873-4324-45f6-8134-19909e66e8d3',  -- test@tesr.ru
  '58aebb8f-9792-45b0-b1d0-0843be8f00ca',  -- phase2c1-test
  '0e3bd549-fd42-4878-8129-83b82fd03906'   -- e2e-test-1778199779
);

DELETE FROM listings WHERE id = 'de116539-53a1-4bd4-a7a2-21a21d52e317'; -- May e2e sold Camry

DELETE FROM dealers WHERE id IN (
  'f64c7176-8385-4df0-a511-cbabd6a99bf8',
  'd1e0382e-3aa8-4d17-a0bd-a4c2e600453b',
  'f92d3055-b5de-4814-a3e6-c50dae3ba517',
  'eaf20601-01a5-4cff-98df-a86c37a9e56c',
  'c7781873-4324-45f6-8134-19909e66e8d3',
  '58aebb8f-9792-45b0-b1d0-0843be8f00ca',
  '0e3bd549-fd42-4878-8129-83b82fd03906'
);

-- Orphans from the 2026-06-12 browser E2E (dealer/listing already cascade-deleted).
-- The two Cloudflare Images assets (719f5c82-…, 06d096c2-…) can be removed from
-- the CF Images dashboard at leisure — they are unreferenced.
DELETE FROM pending_media_uploads WHERE dealer_id = '0d799d49-7c5c-4653-9da9-035f6cfb4d2d';

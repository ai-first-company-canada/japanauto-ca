-- scripts/audit-prod-testdata.sql (WS-6/T1) — prod-D1 test-data inventory.
-- SELECT-only, always safe. Run before the domain cutover (and after any
-- throwaway verification) — attaching japanauto.ca opens indexing instantly,
-- so anything these queries surface would be indexed forever.
--
--   npx wrangler d1 execute japanauto-prod --remote --json --file scripts/audit-prod-testdata.sql
--
-- For every hit: clean up following scripts/cleanup-test-data-2026-06-12.sql
-- (DELETE refresh_tokens → listings → dealers; FK cascade takes children).
-- NB: contact_reveals has NO foreign keys (polymorphic since 0005) — cascade
-- never touches it; delete explicitly and re-check with query 4.

-- 1. Every dealer (expect only the real partners, or zero rows pre-onboarding)
SELECT id, email, name, city, created_at FROM dealers ORDER BY created_at;

-- 2. Suspicious patterns (regression against the 2026-06-12 cleanup set)
SELECT id, email FROM dealers
WHERE email LIKE 'diag%' OR email LIKE '%e2e-test%'
   OR email LIKE '%@tesr.ru' OR email LIKE '%test%' OR name LIKE '%test%';

-- 3. Listings not owned by real partners (join shows the owner)
SELECT l.id, l.slug, l.status, d.email FROM listings l JOIN dealers d ON d.id = l.dealer_id;

-- 4. Residue counts across every child table (incl. FK-less contact_reveals)
SELECT (SELECT COUNT(*) FROM dealers)               AS dealers,
       (SELECT COUNT(*) FROM listings)              AS listings,
       (SELECT COUNT(*) FROM donor_cars)            AS donor_cars,
       (SELECT COUNT(*) FROM refresh_tokens)        AS refresh_tokens,
       (SELECT COUNT(*) FROM pending_media_uploads) AS pending_media,
       (SELECT COUNT(*) FROM featured_slots)        AS featured_slots,
       (SELECT COUNT(*) FROM contact_reveals)       AS contact_reveals,
       (SELECT COUNT(*) FROM verification_tokens)   AS verification_tokens,
       (SELECT COUNT(*) FROM media)                 AS media,
       (SELECT COUNT(*) FROM boost_orders)          AS boost_orders,
       (SELECT COUNT(*) FROM social_boost_jobs)     AS social_boost_jobs;

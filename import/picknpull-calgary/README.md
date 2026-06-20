# Import — Pick-n-Pull Calgary (partner yard onboarding)

Staging for bulk-loading a partner salvage_yard's donor inventory.

**Provenance / rights:** facts (VIN, year/make/model from the VIN plate) are the
yard's own business data; photos are the yard's own on-site photos (taken by the
operator). We do NOT copy picknpull.com corporate photos or description text.

## How a car is captured
The partner sends two photos per vehicle:
1. The car (their own on-site photo).
2. The VIN plate (manufacturer's label).

From those we derive every field below. `vin` is checksum-validated and decoded
via NHTSA vPIC (`DecodeVinValues`) for authoritative year/make/model/body.

## Files
- `donors.csv` — one row per donor. Source-of-truth facts; the importer resolves
  `make_id`/`model_id` from the slugs, generates `id`/`slug`, and injects
  `dealer_id` at load time.
- `photos/<VIN>_car.jpg`, `photos/<VIN>_vin.jpg` — the two photos per car, keyed
  by VIN. `_car` is uploaded to Cloudflare Images as the donor's primary photo;
  `_vin` is kept for our records only (not published).

## Column notes
- `make_slug`/`model_slug` must exist in `makes`/`models` (FK RESTRICT). Filtered
  to the Japanese-brand whitelist — non-Japanese VINs are skipped.
- `transmission` ∈ manual|automatic|cvt|dct (donor_cars CHECK).
- `condition` defaults `fully_available` at intake (self-serve, untracked).
- `available_parts_notes` states the self-serve model honestly — never a
  fabricated per-part list (yard does not track parts).
- `mileage`, `trim`, `color_interior` left blank unless an extra photo provides
  them — optional for a crush-in-30-days self-serve donor.
- `price` blank = "call for price" (NULL).

## Catalog gaps
- **Mazda CX-7** (`JM3ER293070142094`): ✅ RESOLVED 2026-06-19 — added to the
  catalog via migration `0020_seed_mazda_cx7.sql` + `src/data/models-stubs.ts` +
  `src/data/catalog-stubs.ts` (ADR-0017). NOTE: migration 0020 must be APPLIED to
  the target D1 (local for test, remote at deploy) before this donor inserts.
- Rule for the importer: if `make_slug`/`model_slug` is not in the catalog, HALT
  that row and report it — never auto-create catalog models silently.

## Load sequence (later)
1. Create the salvage_yard dealer account (real bcrypt hash, city=calgary).
2. Run the importer over `donors.csv` → INSERT donor_cars with that dealer_id.
3. Upload `photos/<VIN>_car.jpg` to Cloudflare Images → media row (is_primary=1).
4. Verify on a throwaway request, then activate.

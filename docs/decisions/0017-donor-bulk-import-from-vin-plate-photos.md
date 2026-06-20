# 0017 — Donor bulk-import from owner-provided VIN-plate photos

- **Status:** accepted
- **Date:** 2026-06-19
- **Commits:** (pending)

## Context

A partner self-service salvage yard ("pull-your-own") holds a large, fast-rotating
donor inventory (vehicles are crushed ~30 days after intake) and does not want to
hand-enter each car. That inventory is also published on a third-party corporate
site (the chain's national website). The tempting shortcut — scrape that site —
is wrong on two counts: (1) the photos and description prose there are the
corporate operator's copyrighted content, which the local yard cannot license to
us, and automated access violates that site's ToS; (2) republishing it would put
misattributed/fabricated inventory in our index the moment the domain cuts over
(attaching the domain = immediate indexing — see LAUNCH-CHECKLIST), the exact
failure class `audit:launch` and ADR-0007 exist to prevent.

The yard does, however, own the *facts* about its own cars and can photograph them
on site.

## Decision

Onboard partner yard inventory from **owner-supplied material only**:

- Per vehicle the yard sends (a) its own on-site photo of the car and (b) a photo
  of the manufacturer's VIN plate.
- We read the VIN (checksum-validated) and decode year/make/model/body via NHTSA
  vPIC (`DecodeVinValues`) — authoritative, free, first-party. Facts are not
  copyrightable; this is the yard's own data.
- We NEVER scrape the third-party corporate site, copy its photos, or reuse its
  description text.
- Self-serve donors are represented honestly: **no fabricated per-part list** (the
  yard does not track parts); `available_parts_notes` states the pull-your-own,
  non-running, short-dwell reality. `mileage` is left null (cars are non-running).
- Records are staged in `import/<yard>/donors.csv` keyed by VIN; the importer
  resolves `make_id`/`model_id` from the catalog and injects `dealer_id` at load.
- **Catalog-gap rule:** if a VIN decodes to a make/model not in our catalog, the
  importer HALTS that row and reports it — it never silently auto-creates catalog
  models. Adding a model is a content decision that generates public pages (e.g.
  Mazda CX-7 required migration 0020 + the `models-stubs`/`catalog-stubs` companions).
- Only **Japanese-brand** VINs are imported (brand nationality, not assembly
  country — USA/Mexico/Canada-built Japanese makes qualify).

## Consequences

Partner onboarding scales to large yards without manual data entry, with a clean
provenance story for due diligence: every donor traces to an owner-supplied VIN
plate + owner photo, decoded by a government API — no third-party content, no
fabrication. Cost: each make/model not already in the catalog is a gated content
decision (new public pages), and donor pages inherit the existing
empty-state/noindex handling for low-inventory combos. Photo upload to Cloudflare
Images and prod insertion remain explicit, post-account-creation steps.

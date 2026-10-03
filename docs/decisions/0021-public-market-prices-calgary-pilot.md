# 0021 — Public market asking prices (Calgary pilot) supersede the cabinet-only invariant

- **Status:** accepted, implemented
- **Date:** 2026-10-03 (owner decisions 2026-09-16 "option B" and 2026-10-03)
- **Supersedes:** the HARD PRIVACY INVARIANT in `docs/architecture/market-analytics.md`
  and the "never feeds a public surface" rule in `infra-ops.md` / migration
  headers 0016, 0019 — for the scope below only.

## Decision

1. **Aggregates only, Calgary only.** Public pages may show, per city × model ×
   model year: dealer median and 25th–75th percentile asking price, the exact
   dealer listing count, and the private-online-listing median. Calgary is the
   only city until the pilot is validated (`PILOT_CITIES` in
   `scripts/export-market-data.mjs`). No raw lots, no per-listing figures.
2. **Segments are never blended.** Dealer = `autotrader`/`dealer`; private =
   `marketplace` rows, labelled "private sellers" / "private online listings"
   (the platform is not named publicly).
3. **Honesty rules on every surface:** asking prices, not sale prices; each
   year covers model year ±1 (upstream aggregation); trim, kilometres and
   condition not accounted for; a price needs ≥ 5 listings in its window and
   ≥ 1 car of that exact year; no row newer than current year − 2 (dealer rows
   include new cars); dates shown per segment.
4. **Build-time snapshot.** `export-market-data.mjs` (in `predeploy`) writes the
   committed `src/data/market-live.json`; `src/lib/market.ts` is the only
   reader. SSG pages never query D1 for this.
5. **SEO:** a city × model page with a price table is indexable even with no
   listings (`src/lib/indexability.ts`); it carries `Dataset` JSON-LD.

The cabinet-only rules still hold for everything else in `market_stats`
(days-listed, delisted counts, mileage buckets, other cities, the per-listing
stats API and Pro report hints).

## Why
Differentiation (no Canadian competitor shows dealer vs private asks side by
side) and GEO citability: dated, sourced price figures are what answer engines
quote. Owner accepted the trade-off that private asks sit below dealer retail;
the guides explain what the dealer premium buys.

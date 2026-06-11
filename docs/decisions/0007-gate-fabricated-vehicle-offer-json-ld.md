# 0007 — Gate fabricated Vehicle/Offer JSON-LD on isDemo + LAUNCH audit mode

- **Status:** accepted
- **Date:** 2026-06-11
- **Commits:** f929cb5

## Context

Every /[city]/[make]/[model]/ page emits an ItemList of Vehicle nodes with Offer{price, priceCurrency:CAD, availability:InStock, seller:AutoDealer} and url pointing at /used-cars/listing/<slug>/. Pre-launch this catalog comes from getCatalogForModelCity(), a pseudo-random stub (the page shows a 'Sample preview' banner), and the listing URLs 404 in production. That is structured data for non-existent products/offers with fabricated prices and availability across ~540 city x make x model pages, which violates Google structured-data policy and invites a manual action (audit #6). The data will become real once wired to D1.

## Decision

Mark stub catalog data with CatalogPageData.isDemo=true and emit the Vehicle/Offer ItemList, the featured NewVehicle Offer, and the 'Sample preview' banner only when !isDemo, so the markup auto-revives honestly once real D1 listings exist. The demo banner stamps a data-demo-content machine marker. Add a LAUNCH=1 mode to seo-audit.py (npm run audit:launch) that hard-fails if any page carries data-demo-content, robots.txt is blocking, or the sitemap is missing. Pre-launch the markup is harmless because staging is crawl-blocked (middleware robots.txt for *.pages.dev) and japanauto.ca is not yet attached.

## Consequences

No fabricated structured data can ship at launch: the same isDemo flag that drives the preview banner suppresses the markup, and the launch gate makes shipping demo content a CI failure. When real listings land in D1, removing isDemo automatically re-enables honest markup. Trade-off: catalog pages carry no Vehicle/Offer rich-result eligibility until real inventory exists, deferring some SEO upside in exchange for policy safety.

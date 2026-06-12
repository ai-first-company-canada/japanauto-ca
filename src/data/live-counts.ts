/**
 * src/data/live-counts.ts — real inventory aggregates for every public count.
 *
 * LAUNCH-CHECKLIST §1: the site used to render invented volumes everywhere
 * (homepage city cards, brand hubs, "N LISTED" cross-links, FAQ copy). All of
 * those now read these aggregates over catalog-live.json — the same build-time
 * prod-D1 snapshot the catalog grid uses. Zero is rendered as honest
 * "dealers onboarding" copy at each call site, never as a made-up number.
 */

import { LIVE_LISTINGS } from './catalog-stubs';

function countBy(key: (r: (typeof LIVE_LISTINGS)[number]) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of LIVE_LISTINGS) {
    const k = key(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

const byCity = countBy((r) => r.city);
const byBrand = countBy((r) => r.make_slug);
const byCityBrand = countBy((r) => `${r.city}/${r.make_slug}`);
const byCityModel = countBy((r) => `${r.city}/${r.make_slug}/${r.model_slug}`);
const byBrandModel = countBy((r) => `${r.make_slug}/${r.model_slug}`);

function distinctDealers(filter: (r: (typeof LIVE_LISTINGS)[number]) => boolean): number {
  return new Set(LIVE_LISTINGS.filter(filter).map((r) => r.dealer_name)).size;
}

export const liveCounts = {
  national: LIVE_LISTINGS.length,
  nationalDealers: distinctDealers(() => true),
  city: (city: string) => byCity.get(city) ?? 0,
  cityDealers: (city: string) => distinctDealers((r) => r.city === city),
  brand: (make: string) => byBrand.get(make) ?? 0,
  brandDealers: (make: string) => distinctDealers((r) => r.make_slug === make),
  cityBrand: (city: string, make: string) => byCityBrand.get(`${city}/${make}`) ?? 0,
  cityModel: (city: string, make: string, model: string) =>
    byCityModel.get(`${city}/${make}/${model}`) ?? 0,
  brandModel: (make: string, model: string) => byBrandModel.get(`${make}/${model}`) ?? 0,
};

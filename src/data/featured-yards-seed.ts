/**
 * src/data/featured-yards-seed.ts — REAL featured junkyards (name is historic).
 *
 * The Phase-3.1 placeholder yards ("Foothills Auto Wreckers" etc.) were
 * fabricated local businesses rendered into cards AND AutoPartsStore JSON-LD —
 * asserting nonexistent entities to search engines. LAUNCH-CHECKLIST §1
 * replaced them (2026-06-12) with real salvage_yard accounts from the
 * build-time prod-D1 snapshot (catalog-live.json). Yards appear here once
 * they have at least one active donor car; until then the carousels render
 * an honest onboarding state and no AutoPartsStore markup is emitted.
 */

import catalogLive from './catalog-live.json';

export interface FeaturedYardSeed {
  slug: string;
  name: string;
  city: string;        // display name
  citySlug: string;
  province: string;
  count: number;       // real active donor count
  brands: string;      // comma-separated specialization, may be ''
}

interface LiveDealer {
  slug: string; name: string; city: string; province: string; type: string;
  listing_count: number; donor_count: number; specializes_in?: string | null;
}

function displayCity(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

const YARDS: FeaturedYardSeed[] = ((catalogLive as { dealers?: LiveDealer[] }).dealers ?? [])
  .filter((d) => d.type === 'salvage_yard' && d.donor_count > 0)
  .map((d) => ({
    slug: d.slug,
    name: d.name,
    city: displayCity(d.city),
    citySlug: d.city,
    province: d.province,
    count: d.donor_count,
    brands: (d.specializes_in ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(', '),
  }));

export function featuredYardsForCity(citySlug: string): FeaturedYardSeed[] {
  return YARDS.filter((y) => y.citySlug === citySlug);
}

/** National hub: top yards by donor volume, at most one per CMA. */
export function featuredYardsNational(): FeaturedYardSeed[] {
  const seen = new Set<string>();
  const picks: FeaturedYardSeed[] = [];
  for (const y of [...YARDS].sort((a, b) => b.count - a.count)) {
    if (seen.has(y.citySlug)) continue;
    seen.add(y.citySlug);
    picks.push(y);
  }
  return picks;
}

/**
 * src/data/featured-yards-seed.ts — Phase 3.1 placeholder featured-junkyard data.
 *
 * Junkyards self-onboard via /dealer/signup?type=salvage_yard (Phase 3.3).
 * Until they do, the parts hub still has to render *something* for the
 * "Featured junkyards" carousel and for Schema.org `AutoPartsStore` markup.
 * These placeholder names are clearly Calgary-flavoured Cloud-Design picks
 * (parts-data.jsx) extended to the other 5 Tier-1 CMAs with neutral
 * geographic-feature names so they read as illustrative, not real.
 *
 * Andrew should replace each entry with a real onboarded salvage_yard once
 * 3.3 ships. The seed is intentionally narrow (3 per CMA) — featured slot
 * monetization is NOT in MVP per ADR-0008; this is just to populate the UI.
 */

import { TIER_1_CITY_SLUGS, type Tier1CitySlug } from '../../lib/schema';

export interface FeaturedYardSeed {
  name: string;
  city: string;
  province: string;
  count: number;       // donor count (placeholder)
  brands: string;      // comma-separated brand names
}

const SEEDS: Record<Tier1CitySlug, FeaturedYardSeed[]> = {
  toronto: [
    { name: 'Lakeshore Auto Recyclers', city: 'Toronto', province: 'ON', count: 162, brands: 'Toyota, Honda, Lexus' },
    { name: 'Don Valley Salvage',       city: 'Toronto', province: 'ON', count: 138, brands: 'Honda, Acura, Mazda' },
    { name: 'Scarborough JDM Imports',  city: 'Toronto', province: 'ON', count: 91,  brands: 'Toyota, Nissan, Subaru' },
  ],
  montreal: [
    { name: 'Saint-Laurent Pieces Auto', city: 'Montreal', province: 'QC', count: 124, brands: 'Toyota, Honda' },
    { name: 'Laval Auto Recycle',        city: 'Montreal', province: 'QC', count: 96,  brands: 'Mazda, Subaru, Mitsubishi' },
    { name: 'Riviere des Prairies Salvage', city: 'Montreal', province: 'QC', count: 72, brands: 'Nissan, Infiniti' },
  ],
  vancouver: [
    { name: 'Pacific JDM Recyclers',    city: 'Vancouver', province: 'BC', count: 145, brands: 'Toyota, Honda, Subaru' },
    { name: 'Burrard Auto Salvage',     city: 'Vancouver', province: 'BC', count: 108, brands: 'Lexus, Acura' },
    { name: 'Lower Mainland Auto Wreckers', city: 'Vancouver', province: 'BC', count: 87, brands: 'Mazda, Nissan' },
  ],
  calgary: [
    { name: 'Foothills Auto Wreckers',  city: 'Calgary', province: 'AB', count: 183, brands: 'Toyota, Honda, Subaru' },
    { name: 'Riverbend Auto Recyclers', city: 'Calgary', province: 'AB', count: 124, brands: 'Toyota, Mazda' },
    { name: 'North Star Salvage',       city: 'Calgary', province: 'AB', count: 98,  brands: 'Honda, Nissan, Subaru' },
  ],
  edmonton: [
    { name: 'North Saskatchewan Salvage', city: 'Edmonton', province: 'AB', count: 132, brands: 'Toyota, Honda' },
    { name: 'Sherwood Park Auto Recyclers', city: 'Edmonton', province: 'AB', count: 89, brands: 'Subaru, Mazda' },
    { name: 'Capital Region JDM',         city: 'Edmonton', province: 'AB', count: 76, brands: 'Nissan, Infiniti, Lexus' },
  ],
  ottawa: [
    { name: 'Rideau Auto Salvage',     city: 'Ottawa', province: 'ON', count: 104, brands: 'Toyota, Honda' },
    { name: 'Gatineau Pieces Auto',    city: 'Ottawa', province: 'ON', count: 71,  brands: 'Mazda, Subaru' },
    { name: 'Capital Wreckers',        city: 'Ottawa', province: 'ON', count: 58,  brands: 'Nissan, Lexus, Acura' },
  ],
};

export function featuredYardsForCity(citySlug: string): FeaturedYardSeed[] {
  return SEEDS[citySlug as Tier1CitySlug] ?? [];
}

/**
 * National hub: pick the top yard from each CMA so the carousel always renders
 * a national mix without overlapping with the city-specific carousel.
 */
export function featuredYardsNational(): FeaturedYardSeed[] {
  return TIER_1_CITY_SLUGS.map((slug) => SEEDS[slug][0]!);
}

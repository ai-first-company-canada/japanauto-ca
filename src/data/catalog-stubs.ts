/**
 * src/data/catalog-stubs.ts — LIVE catalog data (the name is historic).
 *
 * Phase-1.3 shipped a pseudo-random demo generator here; the LAUNCH-CHECKLIST
 * §1 replacement (2026-06-12) wired it to real inventory: listings come from
 * src/data/catalog-live.json, a build-time snapshot of prod D1 produced by
 * scripts/export-catalog-data.mjs (refreshed on every `npm run predeploy`).
 *
 * Honesty rules: nothing here is invented — a combo with no live rows renders
 * an empty state, never sample cars. The featured slot stays a house ad
 * (real brand site, ADR-0013). Listing detail pages are Pages Functions and
 * always live; only this grid refreshes per-deploy.
 */

import { BRAND_CONTENT } from './brand-content';
import catalogLive from './catalog-live.json';

export type ListingVariant = 'sedan' | 'suv' | 'hatch' | 'wagon';
export type ListingTone =
  | 'pearl' | 'midnight' | 'crimson' | 'silver' | 'graphite'
  | 'sand' | 'forest' | 'bronze';

export interface CatalogListing {
  slug: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  km: number;
  drive: string;          // 'AWD' | 'FWD' | 'RWD' | '' when the dealer left it out
  transmission: string;   // 'Auto' | 'CVT' | 'Manual' | 'DCT' | ''
  price: number;          // whole CAD dollars (D1 stores cents)
  listed: string;
  dealer: string;
  badge?: string;
  reduced?: number;
  variant: ListingVariant;
  tone: ListingTone;
}

export interface FeaturedData {
  kind: 'house';
  make: string;
  model: string;
  href: string;
  variant: 'sedan' | 'suv';
  tone: 'pearl' | 'midnight' | 'crimson' | 'silver' | 'graphite';
}

export interface CatalogPageData {
  featured: FeaturedData | null;
  boosted: CatalogListing[];
  organic: CatalogListing[];
  totalCount: number;
  dealerCount: number;
  remaining: number;
  /** Always false since the live-data wiring — kept for template guards. */
  isDemo: false;
}

interface LiveRow {
  slug: string;
  year: number;
  trim: string | null;
  mileage: number;
  price: number;            // cents
  drivetrain: string | null;
  transmission: string | null;
  city: string;             // city slug (listings.city stores slugs)
  created_at: number;
  color_exterior: string | null;
  is_boosted: number;
  make_slug: string;
  model_slug: string;
  model_name: string;
  dealer_name: string;
}

export const LIVE_LISTINGS: LiveRow[] = (catalogLive as { listings: LiveRow[] }).listings;

const MODEL_VARIANTS: Record<string, { variant: ListingVariant; tones: ListingTone[] }> = {
  'camry':         { variant: 'sedan', tones: ['pearl','silver','midnight','graphite'] },
  'corolla':       { variant: 'sedan', tones: ['pearl','silver','crimson','sand'] },
  'civic':         { variant: 'sedan', tones: ['silver','midnight','pearl','crimson'] },
  'accord':        { variant: 'sedan', tones: ['midnight','pearl','silver','graphite'] },
  'altima':        { variant: 'sedan', tones: ['pearl','midnight','silver','graphite'] },
  'sentra':        { variant: 'sedan', tones: ['silver','crimson','pearl','sand'] },
  'mazda3':        { variant: 'hatch', tones: ['crimson','pearl','midnight','silver'] },
  'impreza':       { variant: 'hatch', tones: ['silver','midnight','pearl','crimson'] },
  'mirage':        { variant: 'hatch', tones: ['silver','crimson','pearl'] },
  'rav4':          { variant: 'suv',   tones: ['graphite','midnight','sand','pearl'] },
  'cr-v':          { variant: 'suv',   tones: ['midnight','pearl','silver','graphite'] },
  'cx-5':          { variant: 'suv',   tones: ['crimson','midnight','pearl','silver'] },
  'cx-30':         { variant: 'suv',   tones: ['crimson','silver','pearl'] },
  'cx-9':          { variant: 'suv',   tones: ['midnight','silver','pearl'] },
  'cx-7':          { variant: 'suv',   tones: ['silver','midnight','pearl','crimson'] },
  'rogue':         { variant: 'suv',   tones: ['pearl','midnight','silver','graphite'] },
  'pathfinder':    { variant: 'suv',   tones: ['midnight','silver','graphite','pearl'] },
  'murano':        { variant: 'suv',   tones: ['midnight','pearl','silver'] },
  'forester':      { variant: 'suv',   tones: ['forest','silver','graphite','pearl'] },
  'crosstrek':     { variant: 'suv',   tones: ['forest','crimson','silver','sand'] },
  'ascent':        { variant: 'suv',   tones: ['midnight','silver','graphite'] },
  'outlander':     { variant: 'suv',   tones: ['midnight','pearl','silver'] },
  'rvr':           { variant: 'suv',   tones: ['silver','crimson','pearl'] },
  'eclipse-cross': { variant: 'suv',   tones: ['crimson','silver','pearl'] },
  'mdx':           { variant: 'suv',   tones: ['midnight','silver','pearl','graphite'] },
  'rdx':           { variant: 'suv',   tones: ['silver','midnight','crimson'] },
  'qx50':          { variant: 'suv',   tones: ['midnight','pearl','silver'] },
  'qx60':          { variant: 'suv',   tones: ['silver','midnight','pearl'] },
  'qx80':          { variant: 'suv',   tones: ['midnight','silver','graphite'] },
  'rx':            { variant: 'suv',   tones: ['pearl','silver','midnight','graphite'] },
  'nx':            { variant: 'suv',   tones: ['midnight','silver','crimson','pearl'] },
  'gx':            { variant: 'suv',   tones: ['midnight','silver','graphite'] },
  'highlander':    { variant: 'suv',   tones: ['midnight','pearl','silver','graphite'] },
  'pilot':         { variant: 'suv',   tones: ['midnight','silver','pearl','graphite'] },
  '4runner':       { variant: 'suv',   tones: ['silver','midnight','sand','graphite'] },
  'tacoma':        { variant: 'suv',   tones: ['silver','midnight','crimson','sand'] },
  'tundra':        { variant: 'suv',   tones: ['silver','midnight','graphite'] },
  'frontier':      { variant: 'suv',   tones: ['silver','midnight','crimson'] },
  'ridgeline':     { variant: 'suv',   tones: ['midnight','silver','pearl'] },
  'sienna':        { variant: 'wagon', tones: ['pearl','silver','midnight'] },
  'odyssey':       { variant: 'wagon', tones: ['silver','midnight','pearl'] },
  'outback':       { variant: 'wagon', tones: ['forest','silver','midnight','sand'] },
  'prius':         { variant: 'hatch', tones: ['silver','pearl','midnight'] },
  'hr-v':          { variant: 'suv',   tones: ['silver','crimson','pearl'] },
  'es':            { variant: 'sedan', tones: ['pearl','silver','midnight','graphite'] },
  'is':            { variant: 'sedan', tones: ['midnight','silver','pearl'] },
  'tlx':           { variant: 'sedan', tones: ['silver','midnight','pearl'] },
  'integra':       { variant: 'sedan', tones: ['silver','crimson','pearl'] },
  'q50':           { variant: 'sedan', tones: ['midnight','silver','pearl'] },
  'mx-5':          { variant: 'sedan', tones: ['crimson','silver','pearl'] },
  'wrx':           { variant: 'sedan', tones: ['silver','crimson','midnight','pearl'] },
};

const FEATURED_TONES: ReadonlyArray<FeaturedData['tone']> =
  ['pearl', 'midnight', 'crimson', 'silver', 'graphite'];

/** Real exterior color → illustration tone; falls back to the model palette. */
const TONE_BY_COLOR: Array<[RegExp, ListingTone]> = [
  [/white|pearl|ivory/i, 'pearl'],
  [/black|midnight/i, 'midnight'],
  [/red|crimson|ruby|burgundy/i, 'crimson'],
  [/silver|gr[ae]y/i, 'silver'],
  [/charcoal|graphite|gunmetal/i, 'graphite'],
  [/beige|tan|sand|gold|champagne/i, 'sand'],
  [/green|emerald/i, 'forest'],
  [/brown|bronze|copper/i, 'bronze'],
];

const DRIVE_LABEL: Record<string, string> = { fwd: 'FWD', rwd: 'RWD', awd: 'AWD', '4wd': '4WD' };
const TRANSMISSION_LABEL: Record<string, string> = {
  automatic: 'Auto', cvt: 'CVT', manual: 'Manual', dct: 'DCT',
};

function pseudoRandom(seed: string, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % max;
}

function listedLabel(createdAt: number): string {
  const days = Math.max(0, Math.floor((Date.now() / 1000 - createdAt) / 86400));
  if (days === 0) return 'Listed today';
  if (days === 1) return 'Listed yesterday';
  return `Listed ${days} days ago`;
}

function toCatalogListing(r: LiveRow, makeName: string): CatalogListing {
  const mv = MODEL_VARIANTS[r.model_slug] ?? {
    variant: 'sedan' as ListingVariant,
    tones: ['silver', 'pearl', 'midnight'] as ListingTone[],
  };
  let tone: ListingTone | undefined;
  if (r.color_exterior) {
    tone = TONE_BY_COLOR.find(([re]) => re.test(r.color_exterior!))?.[1];
  }
  return {
    slug: r.slug,
    year: r.year,
    make: makeName,
    model: r.model_name,
    trim: r.trim ?? '',
    km: r.mileage,
    drive: r.drivetrain ? (DRIVE_LABEL[r.drivetrain] ?? r.drivetrain.toUpperCase()) : '',
    transmission: r.transmission ? (TRANSMISSION_LABEL[r.transmission] ?? r.transmission) : '',
    price: Math.round(r.price / 100),
    listed: listedLabel(r.created_at),
    dealer: r.dealer_name,
    variant: mv.variant,
    tone: tone ?? mv.tones[0]!,
  };
}

/** Latest live listings for a city feed (rows arrive boosted-first, then newest). */
export function getRecentListingsForCity(city: string, limit = 8): CatalogListing[] {
  return LIVE_LISTINGS
    .filter((r) => r.city === city)
    .slice(0, limit)
    .map((r) => toCatalogListing(r, BRAND_CONTENT[r.make_slug]?.name ?? r.make_slug));
}

/** Latest live listings nationally (homepage feed). */
export function getRecentListingsNational(limit = 8): CatalogListing[] {
  return LIVE_LISTINGS
    .slice(0, limit)
    .map((r) => toCatalogListing(r, BRAND_CONTENT[r.make_slug]?.name ?? r.make_slug));
}

/** Real "from CA$X" floor for a (city, make, model) — null when no inventory. */
export function minPriceForCityModel(city: string, make: string, model: string): number | null {
  let min: number | null = null;
  for (const r of LIVE_LISTINGS) {
    if (r.city !== city || r.make_slug !== make || r.model_slug !== model) continue;
    const dollars = Math.round(r.price / 100);
    if (min === null || dollars < min) min = dollars;
  }
  return min;
}

export function getCatalogForModelCity(
  make: string,
  model: string,
  modelName: string,
  city: string,
): CatalogPageData {
  const brand = BRAND_CONTENT[make];
  const rows = LIVE_LISTINGS.filter(
    (r) => r.make_slug === make && r.model_slug === model && r.city === city,
  );

  const cards = rows.map((r) => toCatalogListing(r, brand?.name ?? make));
  const boosted = cards.filter((_, i) => rows[i]!.is_boosted === 1);
  const organic = cards.filter((_, i) => rows[i]!.is_boosted !== 1);
  const dealerCount = new Set(rows.map((r) => r.dealer_name)).size;

  // House ad on every page: real brand, real official site, nothing invented.
  const mv = MODEL_VARIANTS[model];
  const seed = `${make}-${model}-${city}`;
  const featured: FeaturedData | null = brand ? {
    kind: 'house',
    make: brand.name,
    model: modelName,
    href: brand.officialSite,
    variant: mv?.variant === 'suv' || mv?.variant === 'wagon' ? 'suv' : 'sedan',
    tone: FEATURED_TONES[pseudoRandom(`${seed}-featured`, FEATURED_TONES.length)]!,
  } : null;

  return {
    featured,
    boosted,
    organic,
    totalCount: rows.length,
    dealerCount,
    remaining: 0,
    isDemo: false,
  };
}

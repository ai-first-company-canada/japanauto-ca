/**
 * src/data/catalog-stubs.ts — Phase 1.3 placeholder catalog data.
 *
 * Pseudo-random listing generator per (make, model, city) combo.
 * Featured slot is sparse: only on 5 hot combos. Boosted count scales with
 * city size. Phase 2 replaces with D1 query (cached in KV per page key).
 */

import { CITY_FACTORS } from './models-stubs';

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
  drive: 'AWD' | 'FWD' | 'RWD';
  transmission: 'CVT' | 'Auto' | 'Manual';
  price: number;
  listed: string;
  dealer: string;
  badge?: string;
  reduced?: number;
  variant: ListingVariant;
  tone: ListingTone;
}

export interface FeaturedData {
  make: string;
  model: string;
  year: number;
  msrp: number;
  dealer: string;
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
  /**
   * True while listings come from this pseudo-random stub. Gates Vehicle/Offer
   * JSON-LD and the "Sample preview" banner in the city-model template, and
   * stamps `data-demo-content` into the HTML so the LAUNCH=1 seo-audit gate
   * can refuse to ship fabricated inventory. Must become false (or derived
   * per-row) when this is replaced with the real D1 query.
   */
  isDemo: boolean;
}

const FEATURED_COMBOS: Record<string, FeaturedData> = {
  'toronto-toyota-camry': {
    make: 'Toyota', model: 'Camry', year: 2026, msrp: 34900,
    dealer: 'Toyota Downtown Toronto', variant: 'sedan', tone: 'pearl',
  },
  'calgary-toyota-corolla': {
    make: 'Toyota', model: 'Corolla', year: 2026, msrp: 26900,
    dealer: 'Country Hills Toyota', variant: 'sedan', tone: 'silver',
  },
  'vancouver-honda-cr-v': {
    make: 'Honda', model: 'CR-V', year: 2026, msrp: 38900,
    dealer: 'Pacific Honda', variant: 'suv', tone: 'midnight',
  },
  'toronto-honda-civic': {
    make: 'Honda', model: 'Civic', year: 2026, msrp: 28900,
    dealer: 'Honda Downtown Toronto', variant: 'sedan', tone: 'crimson',
  },
  'montreal-mazda-cx-5': {
    make: 'Mazda', model: 'CX-5', year: 2026, msrp: 36900,
    dealer: 'Mazda Centre-Ville', variant: 'suv', tone: 'crimson',
  },
};

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

const TRIMS_BY_BRAND: Record<string, string[]> = {
  toyota:     ['LE', 'XLE', 'SE', 'XSE', 'Limited'],
  honda:      ['LX', 'EX', 'EX-L', 'Touring', 'Sport'],
  nissan:     ['S', 'SV', 'SL', 'SR', 'Platinum'],
  mazda:      ['GX', 'GS', 'GT', 'Signature'],
  subaru:     ['Convenience', 'Touring', 'Sport', 'Limited', 'Premier'],
  lexus:      ['Premium', 'Luxury', 'F-Sport', 'Executive'],
  acura:      ['Tech', 'A-Spec', 'Platinum Elite'],
  infiniti:   ['Pure', 'Luxe', 'Essential', 'Sensory'],
  mitsubishi: ['ES', 'SE', 'GT', 'SEL'],
};

const DEALERS = [
  'Maple Auto Group', 'North Star Motors', 'Cypress Imports',
  'Eastside Pre-Owned', 'Summit Japanese Auto', 'Westview Cars',
  'Granite Motors', 'Riverbend Auto', 'Pacific Heights Auto',
  'Crescent Imports', 'Northgate Pre-Owned', 'Highland Motors',
];

function pseudoRandom(seed: string, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % max;
}

function generateListing(
  seed: string,
  idx: number,
  make: string,
  model: string,
  modelName: string,
  currentYear: number,
  citySlug: string,
): CatalogListing {
  const yearOffset = pseudoRandom(`${seed}-${idx}-year`, 8);
  const year = currentYear - yearOffset;
  const kmBase = (yearOffset + 1) * 12000 + pseudoRandom(`${seed}-${idx}-km`, 25000);
  const km = Math.round(kmBase / 100) * 100;
  const trims = TRIMS_BY_BRAND[make] ?? ['Base'];
  const trim = trims[pseudoRandom(`${seed}-${idx}-trim`, trims.length)]!;
  const variants = MODEL_VARIANTS[model] ?? {
    variant: 'sedan' as ListingVariant,
    tones: ['silver', 'pearl', 'midnight'] as ListingTone[],
  };
  const tone = variants.tones[pseudoRandom(`${seed}-${idx}-tone`, variants.tones.length)]!;
  const transmission: 'CVT' | 'Auto' | 'Manual' =
    pseudoRandom(`${seed}-${idx}-trans`, 10) > 6 ? 'Auto' : 'CVT';
  const drive: 'AWD' | 'FWD' | 'RWD' = ['camry', 'corolla', 'civic', 'sentra'].includes(model)
    ? (pseudoRandom(`${seed}-${idx}-drive`, 10) > 5 ? 'AWD' : 'FWD')
    : 'AWD';
  const priceBase = 18000 + (currentYear - year) * -1500 + pseudoRandom(`${seed}-${idx}-price`, 8000);
  const price = Math.max(8000, Math.round(priceBase / 100) * 100);
  const dealer = DEALERS[pseudoRandom(`${seed}-${idx}-dealer`, DEALERS.length)]!;
  const daysAgo = pseudoRandom(`${seed}-${idx}-days`, 30);
  const listed =
    daysAgo === 0 ? 'Listed today' :
    daysAgo === 1 ? 'Listed yesterday' :
    `Listed ${daysAgo} days ago`;
  const trimSlug = trim.toLowerCase().replace(/\s+/g, '');
  const slug = `${year}-${make}-${model}-${trimSlug}-${citySlug}-${seed.slice(0, 4)}${idx}`;

  return {
    slug,
    year,
    make: make.charAt(0).toUpperCase() + make.slice(1),
    model: modelName,
    trim,
    km,
    drive,
    transmission,
    price,
    listed,
    dealer,
    badge: idx < 1 ? 'New today' : undefined,
    variant: variants.variant,
    tone,
  };
}

export function getCatalogForModelCity(
  make: string,
  model: string,
  modelName: string,
  city: string,
): CatalogPageData {
  const factor = CITY_FACTORS[city] ?? 0.5;
  const baseTotal = 8;
  const totalCount = Math.max(
    4,
    Math.round(baseTotal * factor * 1.5) + pseudoRandom(`${make}-${model}-${city}-total`, 6),
  );
  const dealerCount = Math.max(2, Math.round(totalCount * 0.6));

  const seed = `${make}-${model}-${city}`;
  const featured = FEATURED_COMBOS[`${city}-${make}-${model}`] ?? null;

  const boostedCount = factor > 0.7 ? 2 : factor > 0.4 ? 1 : 0;

  const allListings: CatalogListing[] = [];
  const visibleCount = Math.min(totalCount, 14);
  for (let i = 0; i < visibleCount; i++) {
    allListings.push(generateListing(seed, i, make, model, modelName, 2026, city));
  }
  const boosted = allListings.slice(0, boostedCount);
  const organic = allListings.slice(boostedCount);
  const remaining = Math.max(0, totalCount - allListings.length);

  return { featured, boosted, organic, totalCount, dealerCount, remaining, isDemo: true };
}

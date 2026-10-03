/**
 * src/lib/market.ts — public asking-price stats for answer capsules.
 *
 * Source: src/data/market-live.json (scripts/export-market-data.mjs, a
 * build-time snapshot of prod D1 market_stats). Calgary only — the pilot
 * scope set by the owner (2026-09-16); other cities get capsules without
 * prices until the pilot is validated.
 *
 * Rules carried over from the Buyer's Guides work:
 *  - dealer and private segments are never blended;
 *  - prices describe a model year ±1 window (how upstream aggregates), so the
 *    footnote says so; the per-year count is the exact deconvolved number;
 *  - new cars sit in the dealer rows, so the table stops two model years back;
 *  - a price is shown only when its window holds ≥ MIN_N listings.
 */
import market from '../data/market-live.json';
import { LISTING_YEAR_MIN } from './model-copy';

type Cell = [nWindow: number, p25: number | null, p50: number | null, p75: number | null, nExact: number];
type Segments = { dealer?: Record<string, Cell>; private?: Record<string, Cell> };

// JSON imports widen tuples to number[]; the export script guarantees the shape.
const DATA = market as unknown as {
  cities: Record<string, Record<string, Segments>>;
  computed_on: { dealer: string | null; private: string | null };
};
const CITIES = DATA.cities;
export const MARKET_COMPUTED_ON = DATA.computed_on;

export const MIN_N = 5;
const CURRENT_YEAR = new Date().getUTCFullYear();
/** Newest model year shown: older than two years, so dealer rows hold used cars only. */
export const MARKET_YEAR_MAX = CURRENT_YEAR - 2;

export interface PriceRow {
  year: number;
  dealer: { p25: number; p50: number; p75: number; nWindow: number; nExact: number };
  private: { p50: number; nWindow: number } | null;
}

export interface ModelMarket {
  rows: PriceRow[];            // newest first
  dealerCars: number;          // exact count of dealer listings across the shown year range
  yearFrom: number;
  yearTo: number;
}

/** Price table for one city × model, or null when there isn't enough data. */
export function modelMarket(city: string, make: string, model: string): ModelMarket | null {
  const seg = CITIES[city]?.[`${make}:${model}`];
  if (!seg?.dealer) return null;
  const from = Math.max(LISTING_YEAR_MIN, 2015);
  const rows: PriceRow[] = [];
  let dealerCars = 0;
  for (let y = MARKET_YEAR_MAX; y >= from; y--) {
    const d = seg.dealer[String(y)];
    if (d) dealerCars += d[4];
    // nExact 0 = the window has cars but none of this exact year: skip, or
    // the table would show a price for a year nobody is selling.
    if (!d || d[0] < MIN_N || d[4] < 1 || d[1] == null || d[2] == null || d[3] == null) continue;
    const p = seg.private?.[String(y)];
    rows.push({
      year: y,
      dealer: { p25: d[1], p50: d[2], p75: d[3], nWindow: d[0], nExact: d[4] },
      private: p && p[0] >= MIN_N && p[2] != null ? { p50: p[2], nWindow: p[0] } : null,
    });
  }
  if (rows.length < 2) return null;
  return { rows: rows.slice(0, 8), dealerCars, yearFrom: from, yearTo: MARKET_YEAR_MAX };
}

/** True when a city × model page has a real price table (drives indexability). */
export function hasMarketTable(city: string, make: string, model: string): boolean {
  return modelMarket(city, make, model) !== null;
}

/** Dealer listing counts per model for a city × make, most listed first. */
export function brandMarket(city: string, make: string, models: { slug: string; name: string }[]) {
  return models
    .map((m) => ({ ...m, market: modelMarket(city, make, m.slug) }))
    .filter((m): m is typeof m & { market: ModelMarket } => m.market !== null)
    .sort((a, b) => b.market.dealerCars - a.market.dealerCars);
}

export const fmtCad = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Province facts for capsules. Verified 2026-10-03 against provincial sources
 * (ontario.ca RST on private sales, ICBC PST tiers, AMVIC/OMVIC/VSA/OPC sites).
 */
export const PROVINCE_FACTS: Record<string, { regulator: string; tax: string }> = {
  AB: {
    regulator: 'AMVIC (Alberta Motor Vehicle Industry Council)',
    tax: 'Alberta has no provincial sales tax: a dealer adds 5% GST, and a private sale carries no sales tax.',
  },
  ON: {
    regulator: 'OMVIC (Ontario Motor Vehicle Industry Council)',
    tax: 'A dealer charges 13% HST; on a private sale you pay 13% retail sales tax when you register the car at ServiceOntario.',
  },
  BC: {
    regulator: 'the Vehicle Sales Authority of British Columbia (VSA)',
    tax: 'A dealer charges 5% GST plus PST (7% under $55,000, higher above); a private sale carries 12% PST, paid when you register.',
  },
  QC: {
    regulator: 'the Office de la protection du consommateur (OPC)',
    tax: 'A dealer charges 5% GST and 9.975% QST; on a private sale you pay QST when you register the car with the SAAQ.',
  },
};

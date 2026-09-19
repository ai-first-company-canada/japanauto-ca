/**
 * src/data/price-generations.ts — generation + price-band map for the car-value
 * tool (Calgary pilot, owner decisions 2026-09-16).
 *
 * Why generations: an exact model year splits Calgary's sample into cells of
 * ~5 listings, so stats are grouped by generation. But a car still loses ~8–12%
 * a year inside one generation, so any generation longer than ~4 model years is
 * cut into PRICE BANDS — at a facelift where there was one, otherwise by age.
 * The band, not the generation, is the unit a percentile is computed over.
 *
 * Years are CANADIAN model years. Gaps are real (e.g. no 2021 MDX, no 2020–2021
 * Frontier in Canada) — a listing whose year falls in a gap is a data error.
 * The scraper collects 2015–2026 only (DATA_WINDOW); older generations are kept
 * so a 2015 listing resolves and the map survives a wider window later.
 *
 * TRIM_SENSITIVE lists trims/variants priced like a different car. They are
 * excluded from the base band stats and shown separately when n allows.
 *
 * Deliberately separate from generations.ts (parts-page SEO copy): different
 * consumer, different granularity. Verified against OEM/press sources 2026-09-16
 * for the uncertain boundaries (CX-5 2026, ES 2026, RAV4 2026, Highlander EV 2027,
 * Frontier CA gap, Mirage/Q50/QX50 end dates).
 */

export const DATA_WINDOW = { from: 2015, to: 2026 } as const;

/** [yearStart, yearEnd] inclusive; yearEnd null = still in production. */
export type Band = [number, number | null, string?];

export interface PriceGeneration {
  code: string;
  yearStart: number;
  yearEnd: number | null;
  /** Contiguous, non-overlapping, covering the generation. Omitted = one band. */
  bands?: Band[];
  note?: string;
}

export const PRICE_GENERATIONS: Record<string, PriceGeneration[]> = {
  // ─── Toyota ────────────────────────────────────────────────────────────────
  'toyota:camry': [
    { code: 'XV80', yearStart: 2025, yearEnd: null, note: 'Hybrid-only' },
    { code: 'XV70', yearStart: 2018, yearEnd: 2024, bands: [[2018, 2020], [2021, 2024, 'facelift']] },
    { code: 'XV50', yearStart: 2012, yearEnd: 2017, bands: [[2012, 2014], [2015, 2017, 'major facelift']] },
  ],
  'toyota:corolla': [
    { code: 'E210', yearStart: 2020, yearEnd: null, bands: [[2020, 2022], [2023, null, 'facelift']],
      note: 'Sedan; hatchback E210 from 2019. Corolla Cross and GR Corolla are separate models' },
    { code: 'E170', yearStart: 2014, yearEnd: 2019, bands: [[2014, 2016], [2017, 2019, 'facelift']] },
  ],
  'toyota:rav4': [
    { code: 'XA60', yearStart: 2026, yearEnd: null, note: 'Hybrid/PHEV only' },
    { code: 'XA50', yearStart: 2019, yearEnd: 2025, bands: [[2019, 2021], [2022, 2025, 'refresh']] },
    { code: 'XA40', yearStart: 2013, yearEnd: 2018, bands: [[2013, 2015], [2016, 2018, 'facelift + hybrid']] },
  ],
  'toyota:highlander': [
    { code: 'XU70', yearStart: 2020, yearEnd: 2026,
      bands: [[2020, 2022], [2023, 2026, '2.4T replaces V6']],
      note: '2027 Highlander is a BEV — treat as a separate market; Grand Highlander is a separate model' },
    { code: 'XU50', yearStart: 2014, yearEnd: 2019, bands: [[2014, 2016], [2017, 2019, 'facelift']] },
  ],
  'toyota:prius': [
    { code: 'XW60', yearStart: 2023, yearEnd: null },
    { code: 'XW50', yearStart: 2016, yearEnd: 2022, bands: [[2016, 2018], [2019, 2022, 'facelift + AWD-e']] },
    { code: 'XW30', yearStart: 2010, yearEnd: 2015, bands: [[2010, 2011], [2012, 2015, 'facelift']] },
  ],
  'toyota:sienna': [
    { code: 'XL40', yearStart: 2021, yearEnd: null, bands: [[2021, 2023], [2024, null]], note: 'Hybrid-only' },
    { code: 'XL30', yearStart: 2011, yearEnd: 2020, bands: [[2011, 2014], [2015, 2017, 'facelift'], [2018, 2020, 'facelift']] },
  ],
  'toyota:tacoma': [
    { code: 'N300', yearStart: 2024, yearEnd: null },
    { code: 'N200-3', yearStart: 2016, yearEnd: 2023, bands: [[2016, 2019], [2020, 2023, 'facelift']] },
    { code: 'N200-2', yearStart: 2005, yearEnd: 2015, bands: [[2005, 2011], [2012, 2015, 'facelift']] },
  ],
  'toyota:4runner': [
    { code: 'N300', yearStart: 2025, yearEnd: null },
    { code: 'N280', yearStart: 2010, yearEnd: 2024,
      bands: [[2010, 2013], [2014, 2019, 'facelift'], [2020, 2024, 'TSS-P + CarPlay']],
      note: '15-year generation — never price it as one band' },
  ],

  // ─── Honda ─────────────────────────────────────────────────────────────────
  'honda:civic': [
    { code: '11th', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null, 'facelift + hybrid']] },
    { code: '10th', yearStart: 2016, yearEnd: 2021, bands: [[2016, 2018], [2019, 2021, 'facelift']] },
    { code: '9th', yearStart: 2012, yearEnd: 2015, bands: [[2012, 2013], [2014, 2015, 'facelift']] },
  ],
  'honda:accord': [
    { code: '11th', yearStart: 2023, yearEnd: null },
    { code: '10th', yearStart: 2018, yearEnd: 2022, bands: [[2018, 2020], [2021, 2022, 'facelift']] },
    { code: '9th', yearStart: 2013, yearEnd: 2017, bands: [[2013, 2015], [2016, 2017, 'facelift']] },
  ],
  'honda:cr-v': [
    { code: '6th', yearStart: 2023, yearEnd: null },
    { code: '5th', yearStart: 2017, yearEnd: 2022, bands: [[2017, 2019], [2020, 2022, 'facelift']] },
    { code: '4th', yearStart: 2012, yearEnd: 2016, bands: [[2012, 2014], [2015, 2016, 'facelift + CVT']] },
  ],
  'honda:pilot': [
    { code: '4th', yearStart: 2023, yearEnd: null },
    { code: '3rd', yearStart: 2016, yearEnd: 2022, bands: [[2016, 2018], [2019, 2022, 'facelift']] },
    { code: '2nd', yearStart: 2009, yearEnd: 2015 },
  ],
  'honda:odyssey': [
    { code: '5th', yearStart: 2018, yearEnd: null,
      bands: [[2018, 2020], [2021, 2024, 'facelift'], [2025, null, 'facelift']] },
    { code: '4th', yearStart: 2011, yearEnd: 2017, bands: [[2011, 2013], [2014, 2017, 'facelift']] },
  ],
  'honda:hr-v': [
    { code: '2nd', yearStart: 2023, yearEnd: null, note: 'Civic-based; not the JDM/EU e:HEV HR-V' },
    { code: '1st', yearStart: 2016, yearEnd: 2022, bands: [[2016, 2018], [2019, 2022, 'facelift']] },
  ],
  'honda:ridgeline': [
    { code: '2nd', yearStart: 2017, yearEnd: null, bands: [[2017, 2020], [2021, null, 'facelift']] },
    { code: '1st', yearStart: 2006, yearEnd: 2014, note: 'No 2015–2016 model years' },
  ],

  // ─── Nissan ────────────────────────────────────────────────────────────────
  'nissan:altima': [
    { code: 'L34', yearStart: 2019, yearEnd: null, bands: [[2019, 2022], [2023, null, 'facelift']],
      note: 'Announced to end after 2026 MY' },
    { code: 'L33', yearStart: 2013, yearEnd: 2018, bands: [[2013, 2015], [2016, 2018, 'facelift']] },
  ],
  'nissan:rogue': [
    { code: 'T33', yearStart: 2021, yearEnd: null, bands: [[2021, 2023], [2024, null, 'facelift']] },
    { code: 'T32', yearStart: 2014, yearEnd: 2020, bands: [[2014, 2016], [2017, 2020, 'facelift']],
      note: 'Rogue Sport (Qashqai) is NOT this model' },
  ],
  'nissan:sentra': [
    { code: 'B19', yearStart: 2026, yearEnd: null },
    { code: 'B18', yearStart: 2020, yearEnd: 2025, bands: [[2020, 2022], [2023, 2025]] },
    { code: 'B17', yearStart: 2013, yearEnd: 2019, bands: [[2013, 2015], [2016, 2019, 'facelift']] },
  ],
  'nissan:pathfinder': [
    { code: 'R53', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null]], note: 'No 2021 model year' },
    { code: 'R52', yearStart: 2013, yearEnd: 2020, bands: [[2013, 2016], [2017, 2020, 'facelift']] },
  ],
  'nissan:murano': [
    { code: 'Z53', yearStart: 2025, yearEnd: null },
    { code: 'Z52', yearStart: 2015, yearEnd: 2024, bands: [[2015, 2018], [2019, 2024, 'facelift']] },
  ],
  'nissan:frontier': [
    { code: 'D41', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null, 'facelift']] },
    { code: 'D40', yearStart: 2005, yearEnd: 2019, bands: [[2005, 2014], [2015, 2019]],
      note: 'Canada: no 2020–2021 model years (US-only V6 update)' },
  ],

  // ─── Mazda ─────────────────────────────────────────────────────────────────
  'mazda:mazda3': [
    { code: 'BP', yearStart: 2019, yearEnd: null, bands: [[2019, 2022], [2023, null]] },
    { code: 'BM', yearStart: 2014, yearEnd: 2018, bands: [[2014, 2016], [2017, 2018, 'facelift']] },
  ],
  'mazda:cx-5': [
    { code: 'KL', yearStart: 2026, yearEnd: null, note: '3rd gen, arrived spring 2026' },
    { code: 'KF', yearStart: 2017, yearEnd: 2025, bands: [[2017, 2021], [2022, 2025, 'facelift']] },
    { code: 'KE', yearStart: 2013, yearEnd: 2016, bands: [[2013, 2015], [2016, 2016, 'facelift']] },
  ],
  'mazda:cx-30': [
    { code: 'DM', yearStart: 2020, yearEnd: null, bands: [[2020, 2023], [2024, null]] },
  ],
  'mazda:cx-9': [
    { code: 'TC', yearStart: 2016, yearEnd: 2023, bands: [[2016, 2019], [2020, 2023, 'refresh']],
      note: 'Discontinued; CX-90 (2024+) is a separate model' },
    { code: 'TB', yearStart: 2007, yearEnd: 2015 },
  ],
  'mazda:mx-5': [
    { code: 'ND', yearStart: 2016, yearEnd: null,
      bands: [[2016, 2018], [2019, 2023, '181 hp engine'], [2024, null, 'facelift']] },
    { code: 'NC', yearStart: 2006, yearEnd: 2015 },
  ],

  // ─── Subaru ────────────────────────────────────────────────────────────────
  'subaru:outback': [
    { code: 'BU', yearStart: 2026, yearEnd: null },
    { code: 'BT', yearStart: 2020, yearEnd: 2025, bands: [[2020, 2022], [2023, 2025, 'facelift']] },
    { code: 'BS', yearStart: 2015, yearEnd: 2019, bands: [[2015, 2017], [2018, 2019, 'facelift']] },
  ],
  'subaru:forester': [
    { code: 'SL', yearStart: 2025, yearEnd: null },
    { code: 'SK', yearStart: 2019, yearEnd: 2024, bands: [[2019, 2021], [2022, 2024, 'facelift']] },
    { code: 'SJ', yearStart: 2014, yearEnd: 2018, bands: [[2014, 2016], [2017, 2018, 'facelift']] },
  ],
  'subaru:crosstrek': [
    { code: 'GU', yearStart: 2024, yearEnd: null },
    { code: 'GT', yearStart: 2018, yearEnd: 2023, bands: [[2018, 2020], [2021, 2023, 'facelift + 2.5L']] },
    { code: 'GP', yearStart: 2013, yearEnd: 2017, bands: [[2013, 2015], [2016, 2017, 'facelift']],
      note: 'Sold as XV Crosstrek until 2015' },
  ],
  'subaru:impreza': [
    { code: 'GU', yearStart: 2024, yearEnd: null, note: 'Hatchback only' },
    { code: 'GK/GT', yearStart: 2017, yearEnd: 2023, bands: [[2017, 2019], [2020, 2023, 'facelift']] },
    { code: 'GJ/GP', yearStart: 2012, yearEnd: 2016 },
  ],
  'subaru:ascent': [
    { code: 'WM', yearStart: 2019, yearEnd: null, bands: [[2019, 2022], [2023, null, 'facelift']] },
  ],
  'subaru:wrx': [
    { code: 'VB', yearStart: 2022, yearEnd: null },
    { code: 'VA', yearStart: 2015, yearEnd: 2021, bands: [[2015, 2017], [2018, 2021, 'facelift']] },
  ],

  // ─── Lexus ─────────────────────────────────────────────────────────────────
  'lexus:rx': [
    { code: 'AL30', yearStart: 2023, yearEnd: null },
    { code: 'AL20', yearStart: 2016, yearEnd: 2022, bands: [[2016, 2019], [2020, 2022, 'facelift']] },
    { code: 'AL10', yearStart: 2010, yearEnd: 2015 },
  ],
  'lexus:nx': [
    { code: 'AZ20', yearStart: 2022, yearEnd: null },
    { code: 'AZ10', yearStart: 2015, yearEnd: 2021, bands: [[2015, 2017], [2018, 2021, 'facelift']] },
  ],
  'lexus:es': [
    { code: 'XZ20', yearStart: 2026, yearEnd: null, note: 'Hybrid + BEV only' },
    { code: 'XZ10', yearStart: 2019, yearEnd: 2025, bands: [[2019, 2021], [2022, 2025, 'facelift']] },
    { code: 'XV60', yearStart: 2013, yearEnd: 2018, bands: [[2013, 2015], [2016, 2018, 'facelift']] },
  ],
  'lexus:is': [
    { code: 'XE30', yearStart: 2014, yearEnd: null,
      bands: [[2014, 2016], [2017, 2020, 'facelift'], [2021, 2023, 'major refresh'], [2024, null]],
      note: 'One generation since 2014 — bands carry all the pricing weight' },
  ],
  'lexus:gx': [
    { code: 'J250', yearStart: 2024, yearEnd: null },
    { code: 'J150', yearStart: 2010, yearEnd: 2023,
      bands: [[2010, 2013], [2014, 2019, 'facelift'], [2020, 2023, 'facelift']] },
  ],

  // ─── Acura ─────────────────────────────────────────────────────────────────
  'acura:mdx': [
    { code: 'YD4', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null, 'facelift']],
      note: 'No 2021 model year' },
    { code: 'YD3', yearStart: 2014, yearEnd: 2020, bands: [[2014, 2016], [2017, 2020, 'facelift']] },
  ],
  'acura:rdx': [
    { code: 'TC1', yearStart: 2019, yearEnd: null, bands: [[2019, 2021], [2022, null, 'facelift']] },
    { code: 'TB3', yearStart: 2013, yearEnd: 2018, bands: [[2013, 2015], [2016, 2018, 'facelift']] },
  ],
  'acura:tlx': [
    { code: 'UB5', yearStart: 2021, yearEnd: null, bands: [[2021, 2023], [2024, null, 'facelift']] },
    { code: 'UB1', yearStart: 2015, yearEnd: 2020, bands: [[2015, 2017], [2018, 2020, 'facelift']] },
  ],
  'acura:integra': [
    { code: 'DE', yearStart: 2023, yearEnd: null, note: 'Pre-2002 Integra is a different market — exclude' },
  ],

  // ─── Infiniti ──────────────────────────────────────────────────────────────
  'infiniti:qx50': [
    { code: 'J55', yearStart: 2019, yearEnd: 2025, bands: [[2019, 2021], [2022, 2025]], note: 'Production ended 2025' },
    { code: 'J50', yearStart: 2014, yearEnd: 2017, note: 'Renamed EX37; no 2018 model year' },
  ],
  'infiniti:qx60': [
    { code: 'L51', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null]] },
    { code: 'L50', yearStart: 2014, yearEnd: 2020, bands: [[2014, 2016], [2017, 2020, 'facelift']],
      note: 'Sold as JX35 in 2013; no 2021 model year' },
  ],
  'infiniti:q50': [
    { code: 'V37', yearStart: 2014, yearEnd: 2024,
      bands: [[2014, 2017], [2018, 2020, 'facelift'], [2021, 2024]], note: 'Discontinued after 2024' },
  ],
  'infiniti:qx80': [
    { code: 'Z63', yearStart: 2025, yearEnd: null },
    { code: 'Z62', yearStart: 2014, yearEnd: 2024,
      bands: [[2014, 2017], [2018, 2020, 'facelift'], [2021, 2024, 'interior refresh']] },
  ],

  // ─── Mitsubishi ────────────────────────────────────────────────────────────
  'mitsubishi:outlander': [
    { code: 'GN', yearStart: 2022, yearEnd: null, bands: [[2022, 2024], [2025, null]],
      note: 'PHEV of this gen from 2023' },
    { code: 'GF', yearStart: 2014, yearEnd: 2021, bands: [[2014, 2015], [2016, 2018, 'facelift'], [2019, 2021]] },
  ],
  'mitsubishi:rvr': [
    { code: 'GA', yearStart: 2011, yearEnd: null,
      bands: [[2011, 2015], [2016, 2019, 'facelift'], [2020, 2022, 'facelift'], [2023, null]],
      note: 'One generation since 2011 — bands carry all the pricing weight' },
  ],
  'mitsubishi:mirage': [
    { code: 'A0', yearStart: 2014, yearEnd: 2024,
      bands: [[2014, 2016], [2017, 2020, 'facelift + G4 sedan'], [2021, 2024, 'facelift']],
      note: 'Discontinued in Canada after 2024' },
  ],
  'mitsubishi:eclipse-cross': [
    { code: 'GK', yearStart: 2018, yearEnd: null, bands: [[2018, 2021], [2022, null, 'facelift']],
      note: 'Not the 1990–2012 Eclipse coupe' },
  ],
};

export type TrimKind = 'offroad' | 'performance' | 'electrified';

/** Trims priced like a different car: kept out of base band stats. Regexes match the normalized trim string. */
export const TRIM_SENSITIVE: Record<string, { label: string; match: RegExp; kind: TrimKind }[]> = {
  'toyota:4runner':   [{ label: 'TRD Pro', match: /trd\s*pro/i, kind: 'offroad' },
                       { label: 'Trailhunter', match: /trailhunter/i, kind: 'offroad' }],
  'toyota:tacoma':    [{ label: 'TRD Pro', match: /trd\s*pro/i, kind: 'offroad' },
                       { label: 'Trailhunter', match: /trailhunter/i, kind: 'offroad' }],
  'toyota:rav4':      [{ label: 'Prime / Plug-in', match: /prime|plug-?in|phev/i, kind: 'electrified' },
                       { label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'toyota:prius':     [{ label: 'Prime', match: /prime|plug-?in/i, kind: 'electrified' }],
  'toyota:camry':     [{ label: 'Hybrid', match: /hybrid/i, kind: 'electrified' },
                       { label: 'TRD', match: /\btrd\b/i, kind: 'performance' }],
  'toyota:corolla':   [{ label: 'Hybrid', match: /hybrid/i, kind: 'electrified' },
                       { label: 'GR Corolla', match: /\bgr\b/i, kind: 'performance' }],
  'toyota:highlander':[{ label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'honda:civic':      [{ label: 'Type R', match: /type\s*r/i, kind: 'performance' },
                       { label: 'Si', match: /\bsi\b/i, kind: 'performance' },
                       { label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'honda:accord':     [{ label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'honda:cr-v':       [{ label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'honda:pilot':      [{ label: 'TrailSport', match: /trail\s*sport/i, kind: 'offroad' }],
  'honda:ridgeline':  [{ label: 'TrailSport', match: /trail\s*sport/i, kind: 'offroad' }],
  'nissan:frontier':  [{ label: 'PRO-4X', match: /pro-?4x/i, kind: 'offroad' }],
  'nissan:pathfinder':[{ label: 'Rock Creek', match: /rock\s*creek/i, kind: 'offroad' }],
  'mazda:mazda3':     [{ label: 'Turbo', match: /turbo|2\.5\s*t/i, kind: 'performance' }],
  'mazda:cx-5':       [{ label: 'Turbo', match: /turbo|2\.5\s*t/i, kind: 'performance' }],
  'mazda:mx-5':       [{ label: 'RF', match: /\brf\b/i, kind: 'performance' }],
  'subaru:wrx':       [{ label: 'STI', match: /\bsti\b/i, kind: 'performance' }],
  'subaru:outback':   [{ label: 'Wilderness', match: /wilderness/i, kind: 'offroad' },
                       { label: 'XT (turbo)', match: /\bxt\b|onyx|turbo/i, kind: 'performance' }],
  'subaru:forester':  [{ label: 'Wilderness', match: /wilderness/i, kind: 'offroad' },
                       { label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'subaru:crosstrek': [{ label: 'Wilderness', match: /wilderness/i, kind: 'offroad' },
                       { label: 'Hybrid', match: /hybrid/i, kind: 'electrified' }],
  'lexus:is':         [{ label: 'IS 500 F Sport Performance', match: /\b500\b/i, kind: 'performance' },
                       { label: 'IS 350', match: /\b350\b/i, kind: 'performance' }],
  'lexus:rx':         [{ label: 'RX 500h', match: /\b500h\b/i, kind: 'performance' },
                       { label: 'RX 450h+', match: /450h\+/i, kind: 'electrified' }],
  'lexus:nx':         [{ label: 'NX 450h+', match: /450h\+/i, kind: 'electrified' }],
  'lexus:gx':         [{ label: 'Overtrail', match: /overtrail/i, kind: 'offroad' }],
  'lexus:es':         [{ label: 'ES 300h / hybrid', match: /300h|350h|hybrid/i, kind: 'electrified' }],
  'acura:integra':    [{ label: 'Type S', match: /type\s*s/i, kind: 'performance' }],
  'acura:tlx':        [{ label: 'Type S', match: /type\s*s/i, kind: 'performance' }],
  'acura:mdx':        [{ label: 'Type S', match: /type\s*s/i, kind: 'performance' }],
  'infiniti:q50':     [{ label: 'Red Sport 400', match: /red\s*sport|400/i, kind: 'performance' }],
  'mitsubishi:outlander': [{ label: 'PHEV', match: /phev|plug-?in/i, kind: 'electrified' }],
};

export interface PriceBandRef {
  generation: string;
  bandStart: number;
  bandEnd: number | null;
}

/** Resolve a listing's year to its price band. null = unknown model or a year in a production gap. */
export function priceBandFor(makeSlug: string, modelSlug: string, year: number): PriceBandRef | null {
  const gens = PRICE_GENERATIONS[`${makeSlug}:${modelSlug}`];
  if (!gens) return null;
  for (const g of gens) {
    const bands: Band[] = g.bands ?? [[g.yearStart, g.yearEnd]];
    for (const [from, to] of bands) {
      if (year >= from && (to === null || year <= to)) {
        return { generation: g.code, bandStart: from, bandEnd: to };
      }
    }
  }
  return null;
}

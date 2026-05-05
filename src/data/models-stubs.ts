/**
 * src/data/models-stubs.ts — Phase 1.2 placeholder model catalog.
 *
 * Counts are baseline-Toronto; getModelsForCity() scales them by CITY_FACTORS
 * (city.count / 1284 — Toronto reference) so a smaller CMA shows proportionally
 * fewer listings without per-city stub data duplication.
 *
 * Phase 2 replaces this file with a D1 query against the listings table
 * (cached in KV per (brand, city) key, 15-min TTL).
 */

export interface ModelStub {
  slug: string;
  name: string;
  baseCount: number;
}

export const MODELS_BY_BRAND: Record<string, ModelStub[]> = {
  toyota: [
    { slug: 'camry',      name: 'Camry',      baseCount: 24 },
    { slug: 'corolla',    name: 'Corolla',    baseCount: 22 },
    { slug: 'rav4',       name: 'RAV4',       baseCount: 19 },
    { slug: 'highlander', name: 'Highlander', baseCount: 12 },
    { slug: 'prius',      name: 'Prius',      baseCount: 9 },
    { slug: 'sienna',     name: 'Sienna',     baseCount: 6 },
    { slug: 'tacoma',     name: 'Tacoma',     baseCount: 5 },
    { slug: '4runner',    name: '4Runner',    baseCount: 4 },
  ],
  honda: [
    { slug: 'civic',     name: 'Civic',     baseCount: 22 },
    { slug: 'accord',    name: 'Accord',    baseCount: 18 },
    { slug: 'cr-v',      name: 'CR-V',      baseCount: 16 },
    { slug: 'pilot',     name: 'Pilot',     baseCount: 9 },
    { slug: 'odyssey',   name: 'Odyssey',   baseCount: 5 },
    { slug: 'hr-v',      name: 'HR-V',      baseCount: 8 },
    { slug: 'ridgeline', name: 'Ridgeline', baseCount: 4 },
  ],
  nissan: [
    { slug: 'altima',     name: 'Altima',     baseCount: 14 },
    { slug: 'rogue',      name: 'Rogue',      baseCount: 16 },
    { slug: 'sentra',     name: 'Sentra',     baseCount: 11 },
    { slug: 'pathfinder', name: 'Pathfinder', baseCount: 7 },
    { slug: 'murano',     name: 'Murano',     baseCount: 6 },
    { slug: 'frontier',   name: 'Frontier',   baseCount: 4 },
  ],
  mazda: [
    { slug: 'mazda3', name: 'Mazda3',     baseCount: 12 },
    { slug: 'cx-5',   name: 'CX-5',       baseCount: 14 },
    { slug: 'cx-30',  name: 'CX-30',      baseCount: 8 },
    { slug: 'cx-9',   name: 'CX-9',       baseCount: 5 },
    { slug: 'mx-5',   name: 'MX-5 Miata', baseCount: 3 },
  ],
  subaru: [
    { slug: 'outback',   name: 'Outback',   baseCount: 11 },
    { slug: 'forester',  name: 'Forester',  baseCount: 12 },
    { slug: 'crosstrek', name: 'Crosstrek', baseCount: 9 },
    { slug: 'impreza',   name: 'Impreza',   baseCount: 5 },
    { slug: 'ascent',    name: 'Ascent',    baseCount: 4 },
    { slug: 'wrx',       name: 'WRX',       baseCount: 3 },
  ],
  lexus: [
    { slug: 'rx', name: 'RX', baseCount: 9 },
    { slug: 'nx', name: 'NX', baseCount: 8 },
    { slug: 'es', name: 'ES', baseCount: 6 },
    { slug: 'is', name: 'IS', baseCount: 4 },
    { slug: 'gx', name: 'GX', baseCount: 3 },
  ],
  acura: [
    { slug: 'mdx',     name: 'MDX',     baseCount: 7 },
    { slug: 'rdx',     name: 'RDX',     baseCount: 8 },
    { slug: 'tlx',     name: 'TLX',     baseCount: 5 },
    { slug: 'integra', name: 'Integra', baseCount: 3 },
  ],
  infiniti: [
    { slug: 'qx50', name: 'QX50', baseCount: 5 },
    { slug: 'qx60', name: 'QX60', baseCount: 6 },
    { slug: 'q50',  name: 'Q50',  baseCount: 4 },
    { slug: 'qx80', name: 'QX80', baseCount: 3 },
  ],
  mitsubishi: [
    { slug: 'outlander',      name: 'Outlander',      baseCount: 6 },
    { slug: 'rvr',            name: 'RVR',            baseCount: 4 },
    { slug: 'eclipse-cross',  name: 'Eclipse Cross',  baseCount: 3 },
    { slug: 'mirage',         name: 'Mirage',         baseCount: 2 },
  ],
};

export const CITY_FACTORS: Record<string, number> = {
  toronto:   1.000,
  montreal:  0.731,
  vancouver: 0.678,
  calgary:   0.477,
  edmonton:  0.379,
  ottawa:    0.321,
};

export interface ModelWithCount extends ModelStub {
  count: number;
}

export function getModelsForCity(brandSlug: string, citySlug: string): ModelWithCount[] {
  const models = MODELS_BY_BRAND[brandSlug] ?? [];
  const factor = CITY_FACTORS[citySlug] ?? 0.5;
  return models.map((m) => ({
    ...m,
    count: Math.max(2, Math.round(m.baseCount * factor)),
  }));
}

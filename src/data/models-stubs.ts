/**
 * src/data/models-stubs.ts — the model catalog (slugs + display names).
 *
 * Since the live-data wiring (LAUNCH-CHECKLIST §1, 2026-06-12) counts come
 * from real inventory (live-counts.ts over catalog-live.json); the historic
 * baseCount/CITY_FACTORS scaling is gone. MODELS_BY_BRAND remains the source
 * of truth for which model pages exist (getStaticPaths).
 */

import { liveCounts } from './live-counts';

export interface ModelStub {
  slug: string;
  name: string;
  /** Historic demo field — no longer rendered anywhere. */
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

export interface ModelWithCount extends ModelStub {
  count: number;
}

export function getModelsForCity(brandSlug: string, citySlug: string): ModelWithCount[] {
  const models = MODELS_BY_BRAND[brandSlug] ?? [];
  return models.map((m) => ({
    ...m,
    count: liveCounts.cityModel(citySlug, brandSlug, m.slug),
  }));
}

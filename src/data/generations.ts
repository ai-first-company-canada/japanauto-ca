/**
 * src/data/generations.ts — Phase 3.1 generation map for /parts/[make]/[model]/* pages.
 *
 * Keyed by `${makeSlug}:${modelSlug}`. Each entry is an ordered list of
 * generations (newest first) the SEO/GEO content should mention.
 *
 * If a model has no entry, the page renders one fallback "All years" generation
 * block — the page still produces SEO content + FAQ + cross-links, just without
 * generation-specific labelling.
 *
 * Phase 4 expands coverage. Toyota Corolla / Camry are seeded for the launch
 * SEO push (highest-traffic queries on parts long-tail).
 */

export interface Generation {
  code: string;        // e.g. 'E170'
  range: string;       // e.g. '2014–2018'
  yearStart: number;
  yearEnd: number;
  note?: string;       // shown under the generation header
}

export const GENERATIONS_BY_MAKE_MODEL: Record<string, Generation[]> = {
  'toyota:corolla': [
    { code: 'E210', range: '2019–2024', yearStart: 2019, yearEnd: 2024,
      note: 'Most parts interchangeable within generation' },
    { code: 'E170', range: '2014–2018', yearStart: 2014, yearEnd: 2018,
      note: 'Most parts interchangeable within generation; 2ZR-FE engine cross-compatible with E140' },
    { code: 'E140', range: '2009–2013', yearStart: 2009, yearEnd: 2013,
      note: '2ZR-FE engine shared with E170' },
  ],
  'toyota:camry': [
    { code: 'XV70', range: '2018–2024', yearStart: 2018, yearEnd: 2024,
      note: 'Most parts interchangeable within generation' },
    { code: 'XV50', range: '2012–2017', yearStart: 2012, yearEnd: 2017,
      note: '2AR-FE engine shared with XV40' },
    { code: 'XV40', range: '2007–2011', yearStart: 2007, yearEnd: 2011,
      note: '2AR-FE engine shared with XV50 from 2010' },
  ],
};

const FALLBACK_GENERATIONS: Generation[] = [
  { code: 'all', range: 'All years', yearStart: 1990, yearEnd: 2030,
    note: 'Compatibility depends on year, trim, and engine — confirm with junkyard' },
];

export function generationsFor(makeSlug: string, modelSlug: string): Generation[] {
  const key = `${makeSlug}:${modelSlug}`;
  return GENERATIONS_BY_MAKE_MODEL[key] ?? FALLBACK_GENERATIONS;
}

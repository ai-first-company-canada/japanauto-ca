/**
 * src/data/parts-model-copy.ts — Phase 3.1 per-model intro + compatibility copy
 * for /parts/[make]/[model]/* pages.
 *
 * Returns:
 *   * intro paragraphs (placed under the H2)
 *   * compatibility paragraphs (used in the "How <model> parts compatibility works" block)
 *
 * Falls back to a generation-aware template when no override exists.
 * Phase 4 SEO Guru replaces overrides from briefs in
 * `_archives/cloud-design/05-seo-content/parts/<make>-<model>.md`.
 */

import { GENERATIONS_BY_MAKE_MODEL, type Generation } from './generations';

export interface ModelCopy {
  intro: string[];
  compatibility: string[];
}

function template(makeName: string, modelName: string, generations: Generation[]): ModelCopy {
  const list = generations.map((g) => `${g.code} (${g.range})`).join(', ');
  const summary = generations.length > 0
    ? `${makeName} ${modelName} generations covered on japanauto.ca include the ${list}.`
    : `Most parts within a single model year of the ${makeName} ${modelName} are interchangeable; cross-year compatibility depends on the model generation.`;
  return {
    intro: [
      `We track ${makeName} ${modelName} donor cars at salvage yards across Canada. Most parts are interchangeable within a generation: ${summary}`,
      `Body panels, interior trim, and most electronics match within these generation groups. Engines often span more than one generation, making engine-internal parts among the most cross-compatible.`,
    ],
    compatibility: [
      `${makeName} ${modelName} parts compatibility largely follows generation boundaries. Body panels, lights, interior trim, and most electronics from one model year will fit any donor car within the same generation, including across trim levels.`,
      `When you call a junkyard about a specific part, give them: your year, make, model, trim, and (for body parts) color. They’ll match it against their donor cars and confirm compatibility before you commit.`,
    ],
  };
}

const overrides: Record<string, ModelCopy> = {
  'toyota:corolla': {
    intro: [
      'We track Toyota Corolla donor cars across Canadian junkyards. Most parts are interchangeable within a generation: Corolla generations include the E140 (2009–2013), E170 (2014–2018), and E210 (2019–2024).',
      'Body panels, interior trim, and most electronics match within these generation groups. The 1.8L 2ZR-FE engine spans both E140 and E170 generations, making it one of the most cross-compatible engines in the Toyota lineup.',
    ],
    compatibility: [
      'Toyota Corolla parts compatibility largely follows generation boundaries. Body panels, lights, interior trim, and most electronics from a 2015 Corolla (E170 generation) will fit any 2014–2018 Corolla, including LE, SE, and iM trims. The 1.8L 2ZR-FE engine is one notable exception — it’s used across both E140 (2009–2013) and E170 (2014–2018) generations, and many engine-internal parts cross-reference.',
      'When you call a junkyard about a specific part, give them: your year, make, model, trim, and (for body parts) color. They’ll match it against their donor cars and confirm compatibility before you commit.',
    ],
  },
  'toyota:camry': {
    intro: [
      'We track Toyota Camry donor cars at Canadian salvage yards. Camry generations include the XV40 (2007–2011), XV50 (2012–2017), and XV70 (2018–2024).',
      'Body panels, interior trim, electronics, and lighting match within these generation groups. The 2.5L 2AR-FE engine bridges XV40 and XV50, while the newer 2.5L A25A-FKS appeared with XV70.',
    ],
    compatibility: [
      'Toyota Camry parts compatibility follows generation boundaries. Body panels and interior from a 2014 Camry (XV50) will fit any 2012–2017 Camry across LE, SE, and XLE trims. SE-specific sport bumper covers and 18" wheels are not interchangeable with LE/XLE.',
      'When calling about a part, name the year, trim, and color (for body parts). Hybrid Camry models share most non-powertrain parts with their gas equivalents, but high-voltage components are hybrid-specific.',
    ],
  },
};

export function modelCopyFor(makeSlug: string, modelSlug: string, makeName: string, modelName: string): ModelCopy {
  const key = `${makeSlug}:${modelSlug}`;
  if (overrides[key]) return overrides[key]!;
  const gens = GENERATIONS_BY_MAKE_MODEL[key] ?? [];
  return template(makeName, modelName, gens);
}

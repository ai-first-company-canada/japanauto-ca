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
import { allGenerationsText, faceliftYears } from '../lib/model-copy';

export interface ModelCopy {
  intro: string[];
  compatibility: string[];
}

function template(makeName: string, modelName: string, generations: Generation[], makeSlug: string, modelSlug: string): ModelCopy {
  const list = generations.length > 0
    ? generations.map((g) => `${g.code} (${g.range})`).join(', ')
    : allGenerationsText(makeSlug, modelSlug);
  const facelifts = faceliftYears(makeSlug, modelSlug);
  const summary = list
    ? `The generations that matter for ${modelName} parts are ${list}.`
    : `Compatibility follows the model generation, so confirm your year range with the yard first.`;
  const faceliftNote = facelifts.length > 0
    ? ` Note the mid-generation facelift${facelifts.length === 1 ? '' : 's'} (${facelifts.join(', ')}): bumpers, grilles and lights often changed then.`
    : '';
  return {
    intro: [
      `We list ${makeName} ${modelName} donor cars at salvage yards across Canada. ${summary}`,
      `Body panels, interior trim and most electronics match inside one generation. Engines are the exception, since an engine family often spans two generations, which makes engine internals some of the easiest ${modelName} parts to cross-reference.`,
    ],
    compatibility: [
      `${makeName} ${modelName} parts mostly follow generation boundaries: lights, interior trim, most electronics and body panels from one year fit other years of the same generation, across trim levels.${faceliftNote}`,
      `Before you call a yard, have your ${modelName}'s year, trim and (for body parts) colour ready. They check it against the donor and confirm fitment before you pay.`,
    ],
  };
}

const overrides: Record<string, ModelCopy> = {
  'toyota:corolla': {
    intro: [
      'We list Toyota Corolla donor cars at junkyards across Canada. Most parts swap freely within a generation, and the Corolla generations here are the E140 (2009–2013), E170 (2014–2018) and E210 (2019–2024).',
      'Body panels, interior trim and most electronics match inside each of those groups. The 1.8L 2ZR-FE engine runs through both the E140 and E170, which makes it one of the most cross-compatible engines Toyota has built.',
    ],
    compatibility: [
      'Corolla parts mostly follow generation lines. Body panels, lights, interior trim and most electronics from a 2015 Corolla (E170) fit any 2014–2018 Corolla, LE, SE and iM included. The exception is the 1.8L 2ZR-FE engine: it was used in both the E140 (2009–2013) and the E170 (2014–2018), so many engine-internal parts cross-reference.',
      'Have your year, trim and (for body parts) colour ready when you call. The yard checks that against its donor Corollas and confirms fitment before you pay.',
    ],
  },
  'toyota:camry': {
    intro: [
      'We list Toyota Camry donor cars at Canadian salvage yards, covering the XV40 (2007–2011), XV50 (2012–2017) and XV70 (2018–2024) generations.',
      'Body panels, interior trim, electronics and lighting match inside each generation. The 2.5L 2AR-FE engine bridges the XV40 and XV50; the XV70 brought the newer 2.5L A25A-FKS.',
    ],
    compatibility: [
      'Camry parts follow generation lines. Body panels and interior pieces from a 2014 Camry (XV50) fit any 2012–2017 Camry in LE, SE or XLE trim, with one catch: the SE sport bumper covers and 18" wheels do not swap with LE/XLE.',
      'Give the yard your year, trim and, for body parts, colour. A Camry Hybrid shares most non-powertrain parts with the gas car, but its high-voltage components fit hybrids only.',
    ],
  },
};

export function modelCopyFor(makeSlug: string, modelSlug: string, makeName: string, modelName: string): ModelCopy {
  const key = `${makeSlug}:${modelSlug}`;
  if (overrides[key]) return overrides[key]!;
  const gens = GENERATIONS_BY_MAKE_MODEL[key] ?? [];
  return template(makeName, modelName, gens, makeSlug, modelSlug);
}

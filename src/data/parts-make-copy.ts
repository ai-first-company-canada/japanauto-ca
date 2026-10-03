/**
 * src/data/parts-make-copy.ts — Phase 3.1 per-make body copy for /parts/[make]/* pages.
 *
 * Keyed by brand slug. Each entry provides the heading and 1–3 paragraph
 * "About <make> parts in Canada" section that supports SEO/GEO citation.
 *
 * Phase 4 SEO Guru replaces these with briefs from
 * `_archives/cloud-design/05-seo-content/parts/<slug>.md`.
 */

import { BRAND_SLUGS } from '../../lib/schema';

export interface MakeCopy {
  aboutTitle: string;
  aboutParagraphs: string[];
}

const fallback = (name: string): MakeCopy => ({
  aboutTitle: `About ${name} parts in Canada`,
  aboutParagraphs: [
    `${name} sells in real numbers in Canada, so salvage yards across the country get a steady supply of donor cars from its most popular models. Most parts also cross-reference with U.S.-market vehicles, which opens up cross-border supply.`,
    `Parts pulled from a donor ${name} are original ${name} OEM: they left the factory on that car. They typically cost 40–70% less than new dealer parts, and most Canadian junkyards give a 30-day warranty on mechanical parts.`,
  ],
});

const overrides: Partial<Record<(typeof BRAND_SLUGS)[number], MakeCopy>> = {
  toyota: {
    aboutTitle: 'About Toyota parts in Canada',
    aboutParagraphs: [
      'Toyota has assembled vehicles in Cambridge and Woodstock, Ontario since 1988 and runs one of the largest dealer networks in the country. Strong sales of the Camry, Corolla and RAV4 in particular keep Canadian junkyards stocked with late-model donor cars.',
      'Camry, Corolla and RAV4 are the Toyotas salvage yards see most, simply because so many were sold. In western Canada you also see plenty of Highlanders, 4Runners, Tacomas and Tundras; in southern Ontario, Sienna minivans turn up regularly.',
      'Most Toyota parts cross-reference between Canadian and U.S.-market vehicles, and some Canadian yards regularly buy donor cars in the northern U.S. to add supply.',
    ],
  },
  honda: {
    aboutTitle: 'About Honda parts in Canada',
    aboutParagraphs: [
      'Honda has assembled vehicles in Alliston, Ontario since 1986. The Civic and CR-V are among the highest-volume vehicles ever sold in Canada, which means donor inventory is plentiful in every major metro.',
      'Most Honda donors are Civics, Accords, CR-Vs and Pilots. Hybrids (Insight, CR-V Hybrid, Accord Hybrid) show up regularly in Toronto and Vancouver, and older Acuras on the same lot often share parts with the Hondas.',
      'Earth Dreams four-cylinders and Honda CVTs are conservative designs that yards handle all the time. Fitment data is well documented, and most yards know it by heart.',
    ],
  },
  nissan: {
    aboutTitle: 'About Nissan parts in Canada',
    aboutParagraphs: [
      'Nissan has been a top-five brand in Canada for two decades. Rogue, Sentra, Altima and Frontier are the volume models, with Pathfinder and Murano behind them. Donor supply follows sales, so Toronto and Montreal have the most Nissan stock.',
      'JATCO CVTs interchange widely within a model generation. Frontier and Titan pickup parts cross-reference closely with Infiniti QX-series equivalents, so one Nissan donor can often serve both brands.',
    ],
  },
  mazda: {
    aboutTitle: 'About Mazda parts in Canada',
    aboutParagraphs: [
      'Mazda has a long Canadian history but sells fewer cars than Toyota or Honda. Donors are easy to find for the Mazda3 and CX-5, harder for the MX-5 Miata or CX-9. JDM importers in Vancouver and Toronto sometimes have rarer Mazdas (Mazdaspeed3, RX-8) with cross-compatible parts.',
      'Skyactiv-G engines (from 2012) are built to a common design across the lineup, so at the same displacement many internal parts cross-reference between the Mazda3, CX-3, CX-30 and CX-5.',
    ],
  },
  subaru: {
    aboutTitle: 'About Subaru parts in Canada',
    aboutParagraphs: [
      'Subaru sells well in snow-belt Canada, and most donors are Outbacks, Foresters, Crosstreks and WRXs. Every Subaru sold in Canada has Symmetrical AWD as standard, so transmission and driveline parts interchange widely across models within a generation.',
      'Subaru’s boxer engines (FA20, FB25, EJ25) cross-reference across several models within their generation. Canadian junkyards know their head gaskets, timing parts and accessory drives well.',
    ],
  },
  lexus: {
    aboutTitle: 'About Lexus parts in Canada',
    aboutParagraphs: [
      'Lexus is Toyota’s luxury division, so most engines, transmissions and suspension parts cross-reference with the matching Toyota. The RX300/330/350 shares with the Highlander, the ES300/330/350 with the Camry, the GX with the 4Runner and the LX with the Land Cruiser.',
      'Lexus-only parts cost more to find: leather interiors, premium audio, adaptive lighting and the hybrid components on the RX, NX and ES Hybrid. Lexus donors usually sell at a premium because their parts hold value better than the Toyota equivalents.',
    ],
  },
  acura: {
    aboutTitle: 'About Acura parts in Canada',
    aboutParagraphs: [
      'Acura is Honda’s premium brand, and most chassis and powertrain parts are shared with a Honda: the RDX with the CR-V, the MDX with the Pilot, the TLX with the Accord. SH-AWD is Acura-only, and its parts come from Acura specialists.',
      'Integra parts (1986–2001 and 2023+) are in demand with enthusiasts, so supply is patchy and prices are high. The Honda K-series engines in Acura models cross-reference widely.',
    ],
  },
  infiniti: {
    aboutTitle: 'About Infiniti parts in Canada',
    aboutParagraphs: [
      'Infiniti is Nissan’s premium brand, and most of its donors are QX50s, QX60s, Q50s and QX80s. Engines, transmissions and suspension parts cross-reference closely with the matching Nissan (Pathfinder, Maxima, Armada).',
      'Infiniti-only interior trim and driver-assist hardware (Around View Monitor, ProPILOT) cost more. Most yards keep Infiniti and Nissan donors together, so cross-checks are quick.',
    ],
  },
  mitsubishi: {
    aboutTitle: 'About Mitsubishi parts in Canada',
    aboutParagraphs: [
      'Mitsubishi has the smallest Canadian footprint of the nine Japanese brands. The Outlander, RVR and Eclipse Cross are its volume models, and donors are few, mostly in Toronto and Vancouver. Mirage parts are especially scarce.',
      'Outlander PHEV high-voltage parts are a specialist item, so confirm warranty and provenance before you buy. Because new Mitsubishis carry a 10-year/160,000 km powertrain warranty, many donor cars under 8 years old still have transferable powertrain coverage.',
    ],
  },
};

export function makeCopyFor(slug: string, fallbackName: string): MakeCopy {
  const key = slug as (typeof BRAND_SLUGS)[number];
  return overrides[key] ?? fallback(fallbackName);
}

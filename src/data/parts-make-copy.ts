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
    `${name} has a meaningful Canadian-market presence, which keeps salvage yards across the country supplied with donor cars from the most popular models. Most parts cross-reference between Canadian and U.S.-market vehicles, so cross-border supply is also available.`,
    `Used parts from a donor ${name} are original ${name} OEM — engine, transmission, body panels, interior, electronics, and lighting all came from the factory. Costs typically run 40–70% below new dealer parts. Most Canadian junkyards offer a 30-day mechanical warranty as standard.`,
  ],
});

const overrides: Partial<Record<(typeof BRAND_SLUGS)[number], MakeCopy>> = {
  toyota: {
    aboutTitle: 'About Toyota parts in Canada',
    aboutParagraphs: [
      'Toyota has assembled vehicles in Cambridge and Woodstock, Ontario since 1988, and operates one of the largest dealer networks in the country. High Canadian-market sales — particularly Camry, Corolla, and RAV4 — keep junkyards across Canada well-stocked with late-model donor cars.',
      'Camry, Corolla, and RAV4 dominate inventory, accounting for roughly two-thirds of Toyota donor cars listed on japanauto.ca. Highlander, 4Runner, Tacoma, and Tundra are common in western Canada. Sienna minivans turn up regularly in southern Ontario.',
      'Most Toyota parts cross-reference between Canadian and U.S.-market vehicles, expanding the available supply via cross-border shipping — some Canadian yards regularly source donor cars from the northern U.S.',
    ],
  },
  honda: {
    aboutTitle: 'About Honda parts in Canada',
    aboutParagraphs: [
      'Honda has assembled vehicles in Alliston, Ontario since 1986. The Civic and CR-V are among the highest-volume vehicles ever sold in Canada, which means donor inventory is plentiful in every major metro.',
      'Civic, Accord, CR-V, and Pilot dominate Honda donor inventory. Honda hybrids (Insight, CR-V Hybrid, Accord Hybrid) appear regularly in Toronto and Vancouver. Older Acura siblings often share parts with the Honda donor cars on the same lot.',
      'Earth-Dreams 4-cylinder engines and Honda CVTs are mechanically conservative and well-supported across the salvage network — fitment data is well-documented and most yards know them by heart.',
    ],
  },
  nissan: {
    aboutTitle: 'About Nissan parts in Canada',
    aboutParagraphs: [
      'Nissan has been a top-five brand in Canada for two decades. Rogue, Sentra, Altima, and Frontier dominate volume, with Pathfinder and Murano filling out the SUV slots. Donor supply tracks sales — Toronto and Montreal carry the deepest Nissan inventory.',
      'JATCO CVT transmissions are widely interchangeable within model generations. Frontier and Titan pickup parts cross-reference closely with Infiniti QX-series equivalents, so a Nissan donor often supplies parts for both brands.',
    ],
  },
  mazda: {
    aboutTitle: 'About Mazda parts in Canada',
    aboutParagraphs: [
      'Mazda has a long Canadian history but lower volume than Toyota or Honda — donor supply is good for the Mazda3 and CX-5 but more limited for niche models like the MX-5 Miata or CX-9. JDM importers in Vancouver and Toronto sometimes carry rare Mazda donors (Mazdaspeed3, RX-8) with cross-compatible parts.',
      'Skyactiv-G engines (introduced 2012) are mechanically standardized across the lineup, so many engine-internal parts cross-reference between Mazda3, CX-3, CX-30, and CX-5 within the same engine displacement.',
    ],
  },
  subaru: {
    aboutTitle: 'About Subaru parts in Canada',
    aboutParagraphs: [
      'Subaru sells well in snow-belt Canada — Outback, Forester, Crosstrek, and WRX dominate donor inventory. Every Subaru sold in Canada has symmetrical AWD as standard, which means transmission and driveline parts are highly interchangeable across models within a generation.',
      'Boxer engines (FA20, FB25, EJ25) are unique to Subaru and cross-reference within their generation across multiple models. Head gaskets, timing components, and accessory drives are well-documented in Canadian junkyards.',
    ],
  },
  lexus: {
    aboutTitle: 'About Lexus parts in Canada',
    aboutParagraphs: [
      'Lexus is Toyota’s luxury division, which means most mechanical parts (engines, transmissions, suspension) cross-reference with the equivalent Toyota platform. RX300/330/350 share components with Highlander; ES300/330/350 share with Camry; GX shares with 4Runner; LX shares with Land Cruiser.',
      'Lexus-specific parts — leather interior, premium audio, adaptive lighting, hybrid components on the RX/NX/ES Hybrid — are higher-cost to source. Donor Lexus vehicles typically command a premium because the parts retain value better than the equivalent Toyota.',
    ],
  },
  acura: {
    aboutTitle: 'About Acura parts in Canada',
    aboutParagraphs: [
      'Acura is Honda’s premium brand. Most chassis and powertrain components share with the equivalent Honda platform — RDX shares with CR-V, MDX shares with Pilot, TLX shares with Accord. SH-AWD is Acura-specific and parts for it are sold by Acura specialists.',
      'Acura Integra parts (1986–2001 and 2023+) are popular among enthusiasts; donor supply is uneven and prices reflect demand. Honda K-series engines used in Acura models cross-reference widely.',
    ],
  },
  infiniti: {
    aboutTitle: 'About Infiniti parts in Canada',
    aboutParagraphs: [
      'Infiniti is Nissan’s premium brand. QX50, QX60, Q50, and QX80 dominate donor supply. Mechanical parts — engines, transmissions, suspension — cross-reference closely with the equivalent Nissan platform (Pathfinder, Maxima, Armada).',
      'Infiniti-specific interior trim and adaptive features (Around View Monitor, ProPILOT) are higher-cost. Most yards stock Infiniti donors alongside Nissan donors so cross-checks are quick.',
    ],
  },
  mitsubishi: {
    aboutTitle: 'About Mitsubishi parts in Canada',
    aboutParagraphs: [
      'Mitsubishi has the smallest Canadian footprint of the nine Japanese brands. Outlander, RVR, and Eclipse Cross are the volume models; donor supply is limited and concentrated in Toronto and Vancouver. Mirage parts are notably scarce.',
      'Outlander PHEV high-voltage components are specialist parts — confirm warranty and provenance before buying. Mitsubishi’s 10-year/160,000 km powertrain warranty on new vehicles means many donor cars under 8 years old still have transferable warranty on the powertrain itself.',
    ],
  },
};

export function makeCopyFor(slug: string, fallbackName: string): MakeCopy {
  const key = slug as (typeof BRAND_SLUGS)[number];
  return overrides[key] ?? fallback(fallbackName);
}

/**
 * src/data/brand-content.ts — Phase 1.2 placeholder brand copy.
 *
 * `totalCount` and `dealerCount` are baseline-Toronto; pages scale by
 * cityFactor (city.count / 1284) for per-CMA numbers.
 *
 * Phase 4 SEO Guru replaces about/faqs with real briefs from
 * 05-seo-content/brand/<slug>.md.
 */

export interface BrandContent {
  name: string;
  /** Official Canadian brand site — house-ad target in the featured slot (ADR-0013). */
  officialSite: string;
  aboutTitle: string;
  aboutParagraphs: string[];
  faqs: Array<{ q: string; a: string }>;
  totalCount: number;
  dealerCount: number;
}

export const BRAND_CONTENT: Record<string, BrandContent> = {
  toyota: {
    name: 'Toyota',
    officialSite: 'https://www.toyota.ca/',
    aboutTitle: 'About Toyota in Canada',
    aboutParagraphs: [
      'Toyota is the most-sold Japanese brand in Canada with a long reputation for reliability and resale value. Models like the Camry, Corolla, and RAV4 routinely lead their segments in Canadian sales.',
      'Hybrid options including the Prius and RAV4 Hybrid are particularly popular with Canadian buyers prioritising fuel economy in long winter commutes.',
    ],
    faqs: [
      { q: 'Is Toyota reliable in Canadian winters?', a: 'Toyota AWD vehicles like the RAV4 and Highlander are widely used across Canada year-round. The brand consistently ranks high in long-term reliability surveys.' },
      { q: 'What is the most popular used Toyota in Canada?', a: 'The Toyota Corolla and Camry are the highest-volume used Toyotas across all major Canadian cities. The RAV4 leads SUV sales.' },
      { q: 'Should I buy a hybrid Toyota?', a: 'Hybrid Toyotas like the Prius and RAV4 Hybrid offer 25-40% fuel savings on highway driving. For city-only drivers the savings may be smaller.' },
    ],
    totalCount: 78,
    dealerCount: 14,
  },
  honda: {
    name: 'Honda',
    officialSite: 'https://www.honda.ca/',
    aboutTitle: 'About Honda in Canada',
    aboutParagraphs: [
      'Honda has built a strong reputation in Canada around the Civic (most popular compact car for over a decade) and the CR-V (consistently among the top SUVs).',
      'Honda CVT transmissions and earth-dreams engines are known for longevity — many used Hondas reach 300,000 km without major repairs.',
    ],
    faqs: [
      { q: 'How does Honda compare to Toyota for reliability?', a: 'Both brands rank top-tier. Toyota slightly edges Honda for engines; Honda often wins on driving feel and interior quality.' },
      { q: 'Are Honda CVTs reliable?', a: 'Honda CVTs in 2017+ models have a solid track record. Earlier generations had software updates that addressed early concerns.' },
    ],
    totalCount: 64,
    dealerCount: 12,
  },
  nissan: {
    name: 'Nissan',
    officialSite: 'https://www.nissan.ca/',
    aboutTitle: 'About Nissan in Canada',
    aboutParagraphs: [
      'Nissan offers a wide range of models from the budget-friendly Sentra to the family-focused Pathfinder and the off-road-capable Frontier.',
      "The Rogue is the brand's best-selling crossover in Canada, competing directly with the Toyota RAV4 and Honda CR-V.",
    ],
    faqs: [
      { q: 'Is the Nissan CVT a concern?', a: 'Earlier Nissan CVT generations had reliability issues; 2018+ models showed significant improvements with extended warranty options often included.' },
    ],
    totalCount: 52,
    dealerCount: 10,
  },
  mazda: {
    name: 'Mazda',
    officialSite: 'https://www.mazda.ca/',
    aboutTitle: 'About Mazda in Canada',
    aboutParagraphs: [
      'Mazda focuses on driving engagement — the Mazda3 and CX-5 are widely praised for their handling and interior quality at their price point.',
      'Skyactiv engines are known for fuel efficiency and longevity. Most Canadian Mazdas come with i-Activ AWD as a standard option.',
    ],
    faqs: [
      { q: 'How does Mazda compare on price?', a: 'Mazdas typically retain value well — slightly above class average. Maintenance costs are reasonable.' },
    ],
    totalCount: 41,
    dealerCount: 8,
  },
  subaru: {
    name: 'Subaru',
    officialSite: 'https://www.subaru.ca/',
    aboutTitle: 'About Subaru in Canada',
    aboutParagraphs: [
      "Subaru's symmetrical AWD comes standard on every model — making them popular across snowy Canadian provinces. The Outback and Forester dominate among AWD-first buyers.",
      'Boxer engines offer a low centre of gravity and characteristic sound. Maintenance is straightforward but parts cost slightly above average.',
    ],
    faqs: [
      { q: 'Why is Subaru AWD different?', a: "Subaru's AWD is mechanical and always-on, unlike most competitors which use electronic engagement only when slip is detected." },
    ],
    totalCount: 36,
    dealerCount: 7,
  },
  lexus: {
    name: 'Lexus',
    officialSite: 'https://www.lexus.ca/',
    aboutTitle: 'About Lexus in Canada',
    aboutParagraphs: [
      "Lexus is Toyota's luxury division — combining Toyota reliability with premium materials, sound insulation, and refined ride.",
      "The RX SUV has been the brand's top seller in Canada for years. Hybrid trims (RX Hybrid, NX Hybrid) offer luxury fuel economy.",
    ],
    faqs: [
      { q: 'Is Lexus worth the premium over Toyota?', a: 'Lexus offers significantly better interiors, sound insulation, and warranty (Lexus Plus). The same chassis and powertrains underneath.' },
    ],
    totalCount: 28,
    dealerCount: 5,
  },
  acura: {
    name: 'Acura',
    officialSite: 'https://www.acura.ca/',
    aboutTitle: 'About Acura in Canada',
    aboutParagraphs: [
      "Acura is Honda's premium brand. Known for sportier characteristics than Lexus — tighter handling, more focused engines.",
      "The MDX and RDX are the brand's volume SUVs. Acura's SH-AWD system is praised for handling on dry roads.",
    ],
    faqs: [
      { q: 'Acura vs Lexus — which is more reliable?', a: 'Both rank well. Acura tends slightly more sport-focused; Lexus more comfort-focused.' },
    ],
    totalCount: 22,
    dealerCount: 5,
  },
  infiniti: {
    name: 'Infiniti',
    officialSite: 'https://www.infiniti.ca/',
    aboutTitle: 'About Infiniti in Canada',
    aboutParagraphs: [
      "Infiniti is Nissan's luxury division. Known for distinctive styling and powerful engines.",
      "The QX60 (3-row family SUV) and QX50 (mid-size crossover) are the brand's Canadian volume sellers.",
    ],
    faqs: [
      { q: 'Is Infiniti worth considering used?', a: 'Used Infinitis offer significant value vs new — depreciation is steep but reliability holds up well.' },
    ],
    totalCount: 17,
    dealerCount: 3,
  },
  mitsubishi: {
    name: 'Mitsubishi',
    officialSite: 'https://www.mitsubishi-motors.ca/',
    aboutTitle: 'About Mitsubishi in Canada',
    aboutParagraphs: [
      'Mitsubishi is the smallest of the 9 Japanese brands in the Canadian market. Known for the Outlander PHEV — one of the few mainstream three-row plug-in hybrid SUVs.',
      'Mitsubishi offers an industry-leading 10-year/160,000 km powertrain warranty on new vehicles.',
    ],
    faqs: [
      { q: 'Is the Outlander PHEV worth it used?', a: 'The Outlander PHEV offers ~40 km electric range and full SUV utility. Used examples retain value well.' },
    ],
    totalCount: 14,
    dealerCount: 3,
  },
};

export interface TierOneCity {
  slug: string;
  name: string;
  province: string;
  count: number;
}

export const TIER_1_CITIES: TierOneCity[] = [
  { slug: 'toronto',   name: 'Toronto',   province: 'ON', count: 1284 },
  { slug: 'montreal',  name: 'Montreal',  province: 'QC', count: 938 },
  { slug: 'vancouver', name: 'Vancouver', province: 'BC', count: 871 },
  { slug: 'calgary',   name: 'Calgary',   province: 'AB', count: 612 },
  { slug: 'edmonton',  name: 'Edmonton',  province: 'AB', count: 487 },
  { slug: 'ottawa',    name: 'Ottawa',    province: 'ON', count: 412 },
];

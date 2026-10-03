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
      'Toyota is the best-selling Japanese brand in Canada and has a long record for reliability and resale value. The Camry, Corolla and RAV4 regularly lead their segments in Canadian sales.',
      'Hybrids are a big share of the used supply. The Prius and RAV4 Hybrid sell well with Canadians who want lower fuel bills on long winter commutes.',
    ],
    faqs: [
      { q: 'Is Toyota reliable in Canadian winters?', a: 'Yes. AWD Toyotas such as the RAV4 and Highlander are driven year-round in every province, and the brand ranks high in long-term reliability surveys.' },
      { q: 'What is the most popular used Toyota in Canada?', a: 'By volume, the Corolla and Camry, in every major Canadian city. Among SUVs it is the RAV4.' },
      { q: 'Should I buy a hybrid Toyota?', a: 'Hybrid Toyotas such as the Prius and RAV4 Hybrid save the most in city and stop-and-go driving, where the electric motor does more of the work. On long highway runs the gap to a gas model narrows.' },
    ],
    totalCount: 78,
    dealerCount: 14,
  },
  honda: {
    name: 'Honda',
    officialSite: 'https://www.honda.ca/',
    aboutTitle: 'About Honda in Canada',
    aboutParagraphs: [
      'Honda built its Canadian reputation on two cars: the Civic, the most popular compact car here for over a decade, and the CR-V, a regular among the top-selling SUVs.',
      'Honda CVTs and Earth Dreams engines are known for lasting. Plenty of used Hondas reach 300,000 km without a major repair.',
    ],
    faqs: [
      { q: 'How does Honda compare to Toyota for reliability?', a: 'Both rank near the top. Toyota has a slight edge on engines, while Honda often wins on driving feel and interior quality.' },
      { q: 'Are Honda CVTs reliable?', a: 'Honda CVTs from the 2017 model year on have a solid record. Earlier ones received software updates that dealt with the first complaints.' },
    ],
    totalCount: 64,
    dealerCount: 12,
  },
  nissan: {
    name: 'Nissan',
    officialSite: 'https://www.nissan.ca/',
    aboutTitle: 'About Nissan in Canada',
    aboutParagraphs: [
      'Nissan sells everything from the budget Sentra to the family-sized Pathfinder and the off-road-capable Frontier.',
      "The Rogue is the brand's best-selling crossover in Canada, competing directly with the Toyota RAV4 and Honda CR-V.",
    ],
    faqs: [
      { q: 'Is the Nissan CVT a concern?', a: 'It was on older models. Nissan CVTs improved a lot from 2018, and many of those cars came with extended warranty coverage.' },
    ],
    totalCount: 52,
    dealerCount: 10,
  },
  mazda: {
    name: 'Mazda',
    officialSite: 'https://www.mazda.ca/',
    aboutTitle: 'About Mazda in Canada',
    aboutParagraphs: [
      'Mazda builds cars for people who like to drive. The Mazda3 and CX-5 get steady praise for handling and for interiors that feel above their price.',
      'Skyactiv engines have a name for good fuel economy and long life. Most Canadian Mazdas come with i-Activ AWD, either standard or as an option.',
    ],
    faqs: [
      { q: 'How does Mazda compare on price?', a: 'Used Mazdas hold their value slightly better than the class average, and maintenance costs are reasonable.' },
    ],
    totalCount: 41,
    dealerCount: 8,
  },
  subaru: {
    name: 'Subaru',
    officialSite: 'https://www.subaru.ca/',
    aboutTitle: 'About Subaru in Canada',
    aboutParagraphs: [
      "Subaru's Symmetrical AWD is standard on every model listed here, which is why the brand does well in snowy provinces. Buyers who want AWD first tend to pick the Outback or Forester.",
      'The boxer engine sits low, which lowers the centre of gravity, and it has a sound of its own. Maintenance is straightforward, though parts cost a bit more than average.',
    ],
    faqs: [
      { q: 'Why is Subaru AWD different?', a: "Subaru's AWD is mechanical and always on. Most competitors use electronic systems that engage only once they detect slip." },
    ],
    totalCount: 36,
    dealerCount: 7,
  },
  lexus: {
    name: 'Lexus',
    officialSite: 'https://www.lexus.ca/',
    aboutTitle: 'About Lexus in Canada',
    aboutParagraphs: [
      "Lexus is Toyota's luxury division. You get Toyota reliability with better materials, more sound insulation and a smoother ride.",
      "The RX has been the brand's top seller in Canada for years. The hybrid versions (RX Hybrid, NX Hybrid) pair the luxury cabin with low fuel use.",
    ],
    faqs: [
      { q: 'Is Lexus worth the premium over Toyota?', a: 'Lexus gives you much better interiors and sound insulation, plus the Lexus Plus warranty. Underneath, the chassis and powertrains are the same as Toyota.' },
    ],
    totalCount: 28,
    dealerCount: 5,
  },
  acura: {
    name: 'Acura',
    officialSite: 'https://www.acura.ca/',
    aboutTitle: 'About Acura in Canada',
    aboutParagraphs: [
      "Acura is Honda's premium brand and is sportier than Lexus, with tighter handling and more focused engines.",
      "The MDX and RDX are its volume SUVs. Acura's SH-AWD system gets good reviews for how it handles on dry roads.",
    ],
    faqs: [
      { q: 'Is Acura or Lexus more reliable?', a: 'Both rank well. The real difference is character: Acura leans sporty, Lexus leans toward comfort.' },
    ],
    totalCount: 22,
    dealerCount: 5,
  },
  infiniti: {
    name: 'Infiniti',
    officialSite: 'https://www.infiniti.ca/',
    aboutTitle: 'About Infiniti in Canada',
    aboutParagraphs: [
      "Infiniti is Nissan's luxury division, known for distinctive styling and strong engines.",
      "Most of its Canadian sales come from the QX60, a three-row family SUV, and the QX50 mid-size crossover.",
    ],
    faqs: [
      { q: 'Is Infiniti worth considering used?', a: 'Yes, mostly on price. Infinitis depreciate steeply, so a used one costs far less than new, and reliability holds up well.' },
    ],
    totalCount: 17,
    dealerCount: 3,
  },
  mitsubishi: {
    name: 'Mitsubishi',
    officialSite: 'https://www.mitsubishi-motors.ca/',
    aboutTitle: 'About Mitsubishi in Canada',
    aboutParagraphs: [
      'Mitsubishi is the smallest of the 9 Japanese brands in the Canadian market. Its best-known model here is the Outlander PHEV, one of the few mainstream three-row plug-in hybrid SUVs.',
      'New Mitsubishis carry a 10-year/160,000 km powertrain warranty, one of the longest in the industry.',
    ],
    faqs: [
      { q: 'Is the Outlander PHEV worth it used?', a: 'It gives you about 40 km of electric range and full SUV practicality, and used ones hold their value well.' },
    ],
    totalCount: 14,
    dealerCount: 3,
  },
};

/**
 * Provincial dealer regulator per province code, for page copy only. A
 * template that says "<REG>-licensed" must use this map, never a hard-coded
 * AMVIC (city pages cover ON, QC and BC too).
 */
export const DEALER_REGULATOR: Record<string, { short: string; province: string }> = {
  ON: { short: 'OMVIC', province: 'Ontario' },
  QC: { short: 'OPC', province: 'Quebec' },
  BC: { short: 'VSA', province: 'British Columbia' },
  AB: { short: 'AMVIC', province: 'Alberta' },
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

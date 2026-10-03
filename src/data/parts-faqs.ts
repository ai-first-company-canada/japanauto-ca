/**
 * src/data/parts-faqs.ts — Phase 3.1 SEO/GEO FAQ content for /parts/* pages.
 *
 * Three families of FAQ:
 *   1. PARTS_HUB_FAQS  — generic for /parts/ and /parts/[city]/.
 *   2. makeFaqs(name)  — per-make template, used on /parts/[make]/ and /parts/[make]/[city]/.
 *   3. modelFaqs(...)  — per-model template, used on /parts/[make]/[model]/ and the
 *      city-bound variant.
 *
 * Copy ported (with light editing) from `_archives/cloud-design/mockups/parts-data.jsx`.
 * Andrew can replace per-make / per-model FAQs from SEO briefs in Phase 4 without
 * touching page templates — keep the function signatures stable.
 */

export interface FaqItem {
  q: string;
  a: string;
  open?: boolean;
}

export const PARTS_HUB_FAQS: FaqItem[] = [
  {
    q: 'Why do I have to call instead of browsing parts online?',
    a: 'A used part belongs to one donor car with its own trim, factory options, engine code, model year and, for body panels, paint colour. The yard has that car on the lot, the tools to pull the part and the interchange databases that show what else it fits, so they can confirm fitment in a few minutes. Working that out yourself from a flat catalogue is slow and easy to get wrong.',
    open: true,
  },
  {
    q: 'Do junkyards offer warranty on used parts?',
    a: 'Most Canadian junkyards give 30 days on mechanical parts such as engines, transmissions, alternators and starters. Some stretch that to 60 or 90 days on expensive items. Body panels and interior trim usually sell as-is, since you can see their condition. Ask how long the warranty runs and whether it covers labour or only the part before you pay.',
    open: true,
  },
  {
    q: 'What is a “generation” for a car model?',
    a: 'It is the run of years in which a manufacturer keeps the same platform, body shell and most major mechanical parts, so parts swap freely inside it. Toyota Corolla generations include the E140 (2009–2013), E170 (2014–2018) and E210 (2019–2024). A 2015 Corolla bumper fits any 2014–2018 Corolla; a 2018 bumper will not fit a 2019.',
  },
  {
    q: 'Why does colour matter when buying body parts?',
    a: 'Doors, fenders, bumpers, hoods and trunk lids come painted in the donor car’s factory colour. If it doesn’t match your car you will need to repaint, which costs $300–$800 per panel at a body shop. Colour makes no difference for mechanical, interior or electronic parts. When you ask about a body part, give the yard your paint colour so they can check their stock.',
  },
  {
    q: 'Can I get parts shipped from another city?',
    a: 'Yes. Most yards send small parts like alternators, headlights, switches and sensors across Canada by courier (Canada Post, Purolator, FedEx Ground). Engines, transmissions and body panels usually go by LTL freight for $150–$400, depending on distance and weight. Ask about cost and timing up front: some yards build shipping into the quote, others bill it separately.',
  },
  {
    q: 'Are JDM-imported parts compatible with Canadian-market cars?',
    a: 'Often, but not always. Within a generation, JDM (Japanese Domestic Market) and Canadian cars share most mechanical parts, including engines, transmissions and suspension, and body panels generally fit. Electrical and lighting parts are where they differ: JDM headlights, taillights and gauge clusters can have other markings, beam patterns or units (km/h vs mph). Some yards specialise in JDM imports, so ask whether the donor is JDM or Canadian-market.',
  },
];

export function makeFaqs(brandName: string): FaqItem[] {
  return [
    {
      q: `Why are ${brandName} parts widely available in Canada?`,
      a: `${brandName} has sold in Canada for a long time and in high volume, so salvage yards here see a steady flow of late-model ${brandName} donor cars. Most ${brandName} parts also cross-reference with U.S.-market vehicles, and some yards buy donors across the border to add supply.`,
      open: true,
    },
    {
      q: `Are ${brandName} parts interchangeable across generations?`,
      a: `Mostly within a generation, rarely across one. Body panels, interior trim, lights and electronics usually match only inside the same generation (the years that share a platform). Some ${brandName} engine families and a few suspension parts carry over between neighbouring generations. The yard can cross-reference your year, model and trim against the donor.`,
      open: true,
    },
    {
      q: `Do ${brandName} hybrid parts cost more than gas-engine parts?`,
      a: `The high-voltage parts do: traction battery pack, inverter and hybrid transaxle all cost noticeably more than their gas-engine counterparts. A used hybrid battery from a junkyard typically runs $800–$1,800. Suspension, body panels, the 12V battery and brakes cost the same as on the gas version of the same model.`,
    },
    {
      q: `What’s the average warranty for used ${brandName} engine parts?`,
      a: `On a complete engine, 30 days is standard at Canadian salvage yards; some specialist JDM importers offer 60–90. The warranty normally covers the part only, and you pay for installation. Get in writing what voids it, for example installation by a non-licensed mechanic or no oil-change records.`,
    },
    {
      q: `Where can I find ${brandName} parts in my city?`,
      a: `Pick your city on the parts hub or go straight to the city page (e.g. /calgary/parts/${brandName.toLowerCase()}/). It lists donor cars at yards in that metro with phone numbers. Most yards ship smaller parts anywhere in Canada, so your own city isn’t the limit.`,
    },
  ];
}

export interface ModelFaqContext {
  /** e.g. "XV50 (2012–2017), XV70 (2018–2024) and XV80 (2025 on)" */
  generations?: string | null;
  /** Model years where a mid-generation facelift starts. */
  facelifts?: number[];
}

export function modelFaqs(brandName: string, modelName: string, cityName?: string, ctx: ModelFaqContext = {}): FaqItem[] {
  const cityClause = cityName ? ` in ${cityName}` : '';
  const facelifts = ctx.facelifts ?? [];
  const genSentence = ctx.generations
    ? `The ${modelName} generations are ${ctx.generations}.`
    : `Start by finding which generation your ${modelName} belongs to.`;
  const faceliftSentence = facelifts.length > 0
    ? ` Watch the facelift year${facelifts.length === 1 ? '' : 's'} (${facelifts.join(', ')}): bumpers and lights often changed then even inside one generation.`
    : '';
  return [
    {
      q: `Where can I find used ${brandName} ${modelName} parts${cityClause}?`,
      a: `Salvage yards ${cityName ? `in and around ${cityName}` : 'across Canada'} list whole donor cars on this page as they come in. Each card shows the year, trim, colour and the yard that has the car. Call with your year, trim and (for body parts) colour, and they can tell you what is on the lot in minutes. Most yards ship smaller parts across Canada.`,
      open: true,
    },
    {
      q: `Are different-year ${brandName} ${modelName} parts compatible?`,
      a: `Within one generation, most body panels, lights, interior trim, dash parts and electronics swap directly. ${genSentence}${faceliftSentence} Across generations only some engine and suspension parts cross over; the donor cars above are grouped by generation for that reason.`,
      open: true,
    },
    {
      q: `How much does a used ${brandName} ${modelName} bumper cost from a junkyard?`,
      a: `Expect $150–$350 for a used front or rear bumper at a Canadian salvage yard, depending on year, trim, colour and condition. Add $50–$120 if it still has its brackets and clips. One already painted in your factory colour works out cheaper than repainting a mismatched bumper, which costs $300–$800 at a body shop.`,
    },
    {
      q: `Can I get OEM ${brandName} ${modelName} parts from a salvage yard?`,
      a: `Yes. A donor ${modelName} left the ${brandName} factory, so its original parts are OEM. Some may have been swapped for aftermarket ones during the car’s life, and the yard will tell you if so. Junkyard OEM parts cost 40–70% less than the same parts from a dealer.`,
    },
    {
      q: `What parts are most often interchangeable across ${modelName} generations?`,
      a: `Engine internals, mostly. An engine family often runs across two neighbouring generations, so its internal parts can cross-reference, and some suspension control arms and sway-bar links carry over too. Body panels, lights, electronics and interior trim do not. Check with the yard before you buy.`,
    },
    {
      q: `Do junkyards offer warranty on used ${brandName} ${modelName} engines?`,
      a: `Thirty days is standard on a used ${brandName} engine from a Canadian salvage yard, and some yards give 60 days on engines under 200,000 km. Coverage is the block and head only; the alternator, starter and other accessories are sold separately. Most yards also require a licensed mechanic to install it for the warranty to hold.`,
    },
  ];
}

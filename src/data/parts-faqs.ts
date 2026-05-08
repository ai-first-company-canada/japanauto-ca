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
    a: 'Used parts are tied to a specific donor vehicle’s exact configuration — trim, factory options, engine code, model year, even original color for body panels. A junkyard’s staff has the donor car physically in front of them, the right tools to extract parts, and the parts databases that map cross-compatibility. They can confirm fitment in minutes. Filtering through a flat parts catalog as a non-professional buyer is slow, error-prone, and often impossible without specialist knowledge you don’t need to have.',
    open: true,
  },
  {
    q: 'Do junkyards offer warranty on used parts?',
    a: '30-day warranty is standard at most Canadian junkyards on mechanical parts (engines, transmissions, alternators, starters). Some yards extend this to 60 or 90 days for higher-priced items. Body panels and interior trim are typically sold as-is with no warranty since condition is verifiable visually. Always confirm the warranty period and what it covers (parts only, or labour-included replacement) before paying.',
    open: true,
  },
  {
    q: 'What is a “generation” for a car model?',
    a: 'A model generation is the span of years a manufacturer keeps the same platform, body shell, and most major mechanical parts. Within a generation, parts are highly interchangeable. Toyota Corolla generations include the E140 (2009–2013), E170 (2014–2018), and E210 (2019–2024). A 2015 Corolla bumper will fit any 2014–2018 Corolla; a 2018 Corolla bumper will not fit a 2019.',
  },
  {
    q: 'Why does color matter when buying body parts?',
    a: 'Body panels (doors, fenders, bumpers, hoods, trunk lids) come painted in the donor car’s factory color. If you buy a panel that doesn’t match your car, you’ll need to repaint it — which can cost $300–$800 per panel at a body shop. For mechanical, interior, or electronic parts, color is irrelevant. Always tell the junkyard your car’s color when asking about body parts; they’ll match it against their inventory.',
  },
  {
    q: 'Can I get parts shipped from another city?',
    a: 'Yes. Most junkyards will ship across Canada via courier (Canada Post, Purolator, FedEx Ground) for smaller parts — alternators, headlights, switches, sensors. Larger parts (engines, transmissions, body panels) typically ship by LTL freight at $150–$400 depending on distance and weight. Confirm shipping cost and timeline upfront; some yards include it in the quoted part price, others charge separately.',
  },
  {
    q: 'Are JDM-imported parts compatible with Canadian-market cars?',
    a: 'Sometimes — it depends on the part and model. JDM (Japanese Domestic Market) and Canadian-market cars share most mechanical parts within a generation: engines, transmissions, suspension. Body panels generally fit. Electrical and lighting systems can differ — JDM headlights, taillights, and gauge clusters often have different markings, beam patterns, or units (kph vs mph). Some yards specialize in JDM imports; ask whether the donor is JDM or Canadian-market when calling.',
  },
];

export function makeFaqs(brandName: string): FaqItem[] {
  return [
    {
      q: `Why are ${brandName} parts widely available in Canada?`,
      a: `${brandName} has a long history in the Canadian market, with high sales volumes across the most popular models. That keeps salvage yards across Canada well-stocked with late-model donor cars. Most ${brandName} parts cross-reference between Canadian-market and U.S.-market vehicles, and some yards source donor cars across the border to extend supply.`,
      open: true,
    },
    {
      q: `Are ${brandName} parts interchangeable across generations?`,
      a: `Mostly within a generation, rarely across. Body panels, interior trim, lights, and electronics typically only match within the same generation (the span of years that share a platform). Some engine families and select suspension components carry over between adjacent generations. Always verify with the junkyard — they’ll cross-reference your year, model, and trim against the donor.`,
      open: true,
    },
    {
      q: `Do ${brandName} hybrid parts cost more than gas-engine parts?`,
      a: `High-voltage components — the traction battery pack, inverter, hybrid transaxle — cost noticeably more than gas-engine equivalents. A used hybrid battery typically runs $800–$1,800 from a junkyard. Conventional parts (suspension, body panels, 12V battery, brakes) cost the same as on the gas variants of the same model.`,
    },
    {
      q: `What’s the average warranty for used ${brandName} engine parts?`,
      a: `30 days is standard at Canadian salvage yards on a complete engine assembly, with some specialist JDM importers offering 60–90 days. Warranty typically covers the part only — you pay labour to install it. Always confirm in writing what voids the warranty (e.g. installation by non-licensed mechanic, lack of oil change records).`,
    },
    {
      q: `Where can I find ${brandName} parts in my city?`,
      a: `Pick your city from the parts hub or use the city-bound page (e.g. /parts/${brandName.toLowerCase()}/calgary/). The page lists active donor cars at junkyards in that metro and the phone numbers to call. Most yards ship across Canada for smaller parts, so you’re not strictly limited to your city.`,
    },
  ];
}

export function modelFaqs(brandName: string, modelName: string, cityName?: string): FaqItem[] {
  const cityClause = cityName ? ` in ${cityName}` : '';
  const cityHint = cityName ? `${cityName} junkyards` : 'Canadian junkyards';
  return [
    {
      q: `Where can I find used ${brandName} ${modelName} parts${cityClause}?`,
      a: `Check the donor cars listed below from ${cityHint}. Each card shows the year, trim, color, and the salvage yard that holds the donor. Call the yard with your year, trim, and (for body parts) color — they’ll confirm what’s on the lot in minutes. Most yards ship across Canada for smaller parts.`,
      open: true,
    },
    {
      q: `Are different-year ${brandName} ${modelName} parts compatible?`,
      a: `Within a single generation, most body panels, lights, interior trim, dashboard components, and electronics are directly interchangeable. Across generations, only some engine and suspension parts cross-reference. The page above groups donor cars by generation so you can scan the right year range first.`,
      open: true,
    },
    {
      q: `How much does a used ${brandName} ${modelName} bumper cost from a junkyard?`,
      a: `Used front or rear bumpers typically run $150–$350 in Canadian salvage yards, depending on year, trim, color match, and condition. Add $50–$120 if the bumper still has its mounting brackets and clips. Painted bumpers in your factory color cost less overall than repainting an off-color bumper at a body shop ($300–$800 paint job).`,
    },
    {
      q: `Can I get OEM ${brandName} ${modelName} parts from a salvage yard?`,
      a: `Yes — every part on a donor ${modelName} is original ${brandName} OEM, since the donor was a factory-built ${brandName}. Some used parts may have been replaced during the car’s service life with aftermarket equivalents; the junkyard will tell you. OEM parts from a junkyard cost 40–70% less than dealer parts.`,
    },
    {
      q: `What parts are most often interchangeable across ${modelName} generations?`,
      a: `Body panels, lights, electronics, and interior trim do not interchange across generations. Some engines span two generations (a long-running engine family is often shared between adjacent platforms), so internal engine parts can cross-reference. Some suspension control arms and sway-bar links also carry over. Always confirm with the junkyard.`,
    },
    {
      q: `Do junkyards offer warranty on used ${brandName} ${modelName} engines?`,
      a: `30 days is standard on used ${brandName} engines from Canadian salvage yards. Some yards offer 60-day warranty on engines under 200,000 km. Warranty covers the engine block and head only (not accessories like alternator or starter, which are sold separately). Installation must typically be done by a licensed mechanic for the warranty to remain valid.`,
    },
  ];
}

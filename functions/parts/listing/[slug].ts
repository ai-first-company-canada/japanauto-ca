/**
 * GET /parts/listing/:slug/
 *
 * Phase 3.2 — donor-detail Pages Function. ADR-0008. Phase 2c2b proved that
 * `@astrojs/cloudflare` is incompatible with this project's Pages Functions
 * setup, so dynamic donor routes are rendered here as manual HTML strings,
 * mirroring functions/used-cars/listing/[slug].ts and functions/dealers/[slug].ts.
 *
 * Renders 17 sections per parts-pages.jsx Page D mockup:
 *   01 Navbar             10 Junkyard card
 *   02 Breadcrumb         11 Disclaimer
 *   03 Photo gallery      12 Sticky bottom bar (active only)
 *   04 Title block        13 Related — same junkyard
 *   05 Primary CTA        14 Related — same model + city
 *   06 Educational block  15 Cross-CMA city grid
 *   07 Spec grid          16 FAQ accordion
 *   08 Parts availability 17 Footer
 *   09 Compatibility
 *
 * Per-donor Schema.org @graph (renderShell wraps Organization + WebSite around
 * these): Vehicle + AutoPartsStore + FAQPage + BreadcrumbList. The Vehicle's
 * offers.availability flips to OutOfStock when condition='depleted'.
 *
 * 404 — slug not found OR status not in (active, depleted).
 */

import type { Env } from "../../../types/env";
import {
  getDonorCarBySlug, getMediaForEntity, listRelatedDonors, listDonorCountsByCity,
  recordViewThrottled, classifyViewSource, getVinDecode,
} from "../../api/_lib/db";
import { renderShell, takeCspNonce, safeUrl, renderFactoryEquipment } from "../../_lib/page-shell";
import {
  renderPartsNavBar, renderBreadcrumb, renderDepletedBand, renderPhotoGallery,
  renderTitleBlock, renderPrimaryCta, renderEducationalBlock, renderSpecGrid,
  renderPartsAvailability, renderCompatibilityCard, renderJunkyardCard,
  renderDisclaimer, renderRelatedDonors, renderCityCountGrid, renderFaqList,
  renderFooter, renderPartsStickyBar, renderStickyBarObserverScript,
  render404DonorBody, parseCompatibility, donorPhone, formatTransmission,
  parsePartsAvailable, partsAvailableSentence,
  renderDonorLead, renderPartsLongTail, renderDonorSummary,
} from "../../_lib/parts-components";
import { DONOR_PART_LABELS } from "../../../lib/schema";
import type { FaqItem } from "../../_lib/parts-components";

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ request, params, env, data, waitUntil }) => {
  const slug = params.slug as string;
  const cspNonce = takeCspNonce(data);
  const donor = await getDonorCarBySlug(env, slug);
  // frozen_at (WS-1 downgrade freeze) = public-gone, same as a missing row.
  if (!donor || donor.frozen_at != null) {
    return new Response(
      renderShell({
        title: 'Donor car not found — japanauto.ca',
        description: 'This donor car may have been removed or fully parted out.',
        canonical: `${env.PUBLIC_SITE_URL}/parts/`,
        nonce: cspNonce,
      }, render404DonorBody(slug)),
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }

  const isDepleted = donor.condition === 'depleted' || donor.status === 'depleted';
  const cfHash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? '';

  // Cabinet stats (Feature 1): count the human view off the render path —
  // depleted donors included, the yard still wants to see interest. Bots are
  // excluded via the middleware UA tag; cached hits (s-maxage=60) go
  // uncounted, so the numbers are a floor.
  if (!(data as { isBot?: boolean }).isBot) {
    waitUntil(recordViewThrottled(env, request, 'donor_car', donor.id, classifyViewSource(new URL(request.url))));
  }

  const [photos, sameYard, sameCityModel, otherCities, vinDecode] = await Promise.all([
    getMediaForEntity(env, 'donor_car', donor.id),
    listRelatedDonors(env, { excludeId: donor.id, dealerId: donor.dealer_id, modelId: donor.model_id, limit: 4 }),
    listRelatedDonors(env, { excludeId: donor.id, modelId: donor.model_id, citySlug: donor.city_slug, limit: 4 }),
    listDonorCountsByCity(env, donor.make_id, donor.model_id, donor.city_slug),
    donor.vin ? getVinDecode(env, donor.vin) : Promise.resolve(null),
  ]);

  // ==========================================================================
  // Page metadata
  // ==========================================================================
  const trim = donor.trim ?? '';
  const trimSep = trim ? ` ${trim}` : '';
  const cityShort = `${donor.city_name}, ${donor.city_province}`;
  const canonical = `${env.PUBLIC_SITE_URL}/parts/listing/${slug}/`;
  // GEO: when the yard ticked the checklist, the title/description carry the
  // actual part names — that's what long-tail queries match on.
  const partsAvail = parsePartsAvailable(donor);
  const partLabelsLc = partsAvail.map((s) => DONOR_PART_LABELS[s].toLowerCase());
  const title = partsAvail.length > 0
    ? `${donor.year} ${donor.make_name} ${donor.model_name} parts in ${donor.city_name} — ${partLabelsLc.slice(0, 3).join(', ')} — japanauto.ca`
    : `${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} donor car — ${cityShort} — japanauto.ca`;
  const description = partsAvail.length > 0
    ? (() => {
        const head = `Used parts from a ${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} donor at ${donor.dealer_name} in ${cityShort}: `;
        const list = partLabelsLc.join(', ');
        const room = 150 - head.length;
        return `${head}${list.length > room ? list.slice(0, room).replace(/,\s*[^,]*$/, '') + '…' : list}. Call to confirm fitment.`;
      })()
    : donor.available_parts_notes
      ? `${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} donor car at ${donor.dealer_name} in ${cityShort}. ${donor.available_parts_notes.slice(0, 140)}${donor.available_parts_notes.length > 140 ? '…' : ''}`
      : `${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} parts donor car at ${donor.dealer_name} in ${cityShort}. Call for parts availability.`;
  const phone = donorPhone(donor.dealer_phone);
  const primaryPhotoUrl = photos.length > 0 && cfHash
    ? `https://imagedelivery.net/${cfHash}/${photos[0]!.image_id}/public`
    : null;

  // ==========================================================================
  // Schema.org @graph (renderShell adds Organization + WebSite)
  // ==========================================================================
  const compat = parseCompatibility(donor);
  const transmissionSchema =
    donor.transmission === 'manual' ? 'https://schema.org/ManualVehicleTransmission'
    : donor.transmission === 'automatic' || donor.transmission === 'cvt' || donor.transmission === 'dct'
      ? 'https://schema.org/AutomaticVehicleTransmission'
      : undefined;

  // OpeningHoursSpecification — emit one row per day-of-week (Schema.org
  // doesn't support compound dayOfWeek arrays in all validators, so we expand).
  type HoursSpec = { '@type': 'OpeningHoursSpecification'; dayOfWeek: string; opens: string; closes: string };
  const hoursSpecs: HoursSpec[] = (donor.dealer_hours ?? []).flatMap((h) => {
    if (!h.open || !h.close) return [];
    return h.dow.map((dow) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: DOW_NAMES[dow]!,
      opens: h.open!, closes: h.close!,
    }));
  });

  // Vehicle node — primary entity. Donor extension flagged via additionalType.
  const vehicleNode: Record<string, unknown> = {
    '@type': 'Vehicle',
    '@id': canonical + '#vehicle',
    name: `${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} — donor car`,
    vehicleModelDate: String(donor.year),
    modelDate: String(donor.year),
    manufacturer: donor.make_name,
    model: donor.model_name,
    brand: { '@type': 'Brand', name: donor.make_name },
    additionalType: 'https://japanauto.ca/schema/donor-car',
    color: donor.color_exterior_full ?? donor.color_exterior,
    ...(trim ? { vehicleConfiguration: trim } : {}),
    ...(donor.vin ? { vehicleIdentificationNumber: donor.vin } : {}),
    ...(donor.engine ? { vehicleEngine: { '@type': 'EngineSpecification', name: donor.engine } } : {}),
    ...(transmissionSchema ? { vehicleTransmission: transmissionSchema } : {}),
    ...(donor.mileage !== null
      ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: donor.mileage, unitCode: 'KMT' } }
      : {}),
    ...(primaryPhotoUrl ? { image: primaryPhotoUrl } : {}),
    offers: {
      '@type': 'Offer',
      availability: isDepleted ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      priceCurrency: 'CAD',
      ...(donor.price !== null ? { price: Math.round(donor.price / 100) } : {}),
      businessFunction: 'https://schema.org/Sell',
      seller: { '@id': canonical + '#yard' },
    },
    ...(compat.models.length > 0 ? { isAccessoryOrSparePartFor: compat.models.map(m => ({ '@type': 'Vehicle', model: m })) } : {}),
  };

  const yardNode: Record<string, unknown> = {
    '@type': 'AutoPartsStore',
    '@id': canonical + '#yard',
    name: donor.dealer_name,
    url: `${env.PUBLIC_SITE_URL}/dealers/${donor.dealer_slug}/`,
    address: {
      '@type': 'PostalAddress',
      ...(donor.dealer_address_line1 ? { streetAddress: donor.dealer_address_line1 } : {}),
      addressLocality: donor.city_name,
      addressRegion: donor.dealer_province,
      ...(donor.dealer_postal_code ? { postalCode: donor.dealer_postal_code } : {}),
      addressCountry: 'CA',
    },
    ...(donor.dealer_phone ? { telephone: donor.dealer_phone } : {}),
    email: donor.dealer_email,
    ...(donor.dealer_website && safeUrl(donor.dealer_website) !== '#' ? { sameAs: safeUrl(donor.dealer_website) } : {}),
    ...(hoursSpecs.length > 0 ? { openingHoursSpecification: hoursSpecs } : {}),
    areaServed: donor.city_name,
    // GEO: the yard's own checklist as an OfferCatalog — honest entity data
    // (no prices, no fabrication; only ticked parts appear).
    ...(partsAvail.length > 0 ? {
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Used parts from this ${donor.year} ${donor.make_name} ${donor.model_name}`,
        itemListElement: partsAvail.map((s) => ({
          '@type': 'Offer',
          availability: 'https://schema.org/InStock',
          businessFunction: 'https://schema.org/Sell',
          itemOffered: {
            '@type': 'Product',
            name: `${DONOR_PART_LABELS[s]} — ${donor.year} ${donor.make_name} ${donor.model_name} (used)`,
          },
        })),
      },
    } : {}),
  };

  // FAQ — static for Phase 3.2; Phase 3.3 dashboard will let yards customize.
  // When the yard ticked the parts_available checklist (Feature 4), lead with
  // a donor-specific availability question built from it — deterministic copy,
  // and it flows into the FAQPage JSON-LD node below automatically.
  const faqs: FaqItem[] = [
    ...(partsAvail.length > 0 ? [{
      q: `Which parts are available from this ${donor.year} ${donor.make_name} ${donor.model_name}?`,
      a: `${partsAvailableSentence(donor, partsAvail)} Availability changes as parts sell — call ${donor.dealer_name} to confirm before visiting.`,
    }] : []),
    ...composeDonorFaqs(donor),
  ];
  const faqNode = {
    '@type': 'FAQPage',
    '@id': canonical + '#faq',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': canonical + '#breadcrumb',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: env.PUBLIC_SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: donor.city_name, item: `${env.PUBLIC_SITE_URL}/${donor.city_slug}/` },
      { '@type': 'ListItem', position: 3, name: 'Parts', item: `${env.PUBLIC_SITE_URL}/${donor.city_slug}/parts/` },
      { '@type': 'ListItem', position: 4, name: donor.make_name, item: `${env.PUBLIC_SITE_URL}/${donor.city_slug}/parts/${donor.make_slug}/` },
      { '@type': 'ListItem', position: 5, name: donor.model_name, item: `${env.PUBLIC_SITE_URL}/${donor.city_slug}/parts/${donor.make_slug}/${donor.model_slug}/` },
      { '@type': 'ListItem', position: 6, name: `${donor.year}${trimSep}`, item: canonical },
    ],
  };

  const schemaLD = [vehicleNode, yardNode, faqNode, breadcrumbNode];

  // ==========================================================================
  // Body composition (17 sections, mockup order)
  // ==========================================================================
  const captionLabel = `${donor.year} ${donor.make_name} ${donor.model_name}${trimSep}`;
  const educationalBlock = isDepleted
    ? renderEducationalBlock({
        heading: 'Looking for similar parts?',
        paragraphs: [
          `This ${donor.year} ${donor.model_name} has been fully parted out, but ${donor.dealer_name} regularly stocks similar ${donor.generation_range ?? donor.year} ${donor.make_name} ${donor.model_name} donors. Browse the related cars below or call to ask whether a replacement donor is on the lot.`,
        ],
      })
    : renderEducationalBlock({
        eyebrow: 'How parts work here',
        heading: 'Why call instead of browsing a parts list?',
        bullets: [
          { lead: 'Faster',                          body: "junkyard staff knows their inventory better than any catalog — they'll confirm in minutes whether the part you need is available." },
          { lead: 'More accurate',                   body: 'they have the car in front of them and the right tools to verify trim-specific options, factory equipment, and color match.' },
          { lead: 'No technical knowledge required', body: 'just tell them your year, make, model, trim, and (for body parts) color. They take it from there.' },
        ],
      });

  const body = `
${renderPartsNavBar({ cityShort })}
${isDepleted ? renderDepletedBand() : ''}
${renderBreadcrumb([
  { label: 'Home', href: '/' },
  { label: donor.city_name, href: `/${donor.city_slug}/` },
  { label: 'Parts', href: `/${donor.city_slug}/parts/` },
  { label: donor.make_name, href: `/${donor.city_slug}/parts/${donor.make_slug}/` },
  { label: donor.model_name, href: `/${donor.city_slug}/parts/${donor.make_slug}/${donor.model_slug}/` },
  { label: `${donor.year}${trimSep ? ' ' + trim : ''} ${donor.color_exterior}`.trim(), href: null },
])}

${renderPhotoGallery(photos, donor.tone, cfHash, captionLabel)}

${renderTitleBlock(donor, isDepleted)}

${renderDonorLead(donor, partsAvail)}

${renderPrimaryCta(donor, isDepleted)}

${educationalBlock}

${renderSpecGrid(donor)}

${renderFactoryEquipment(vinDecode?.equipment ?? [], vinDecode?.engine_label)}

${renderPartsAvailability(donor)}

${renderPartsLongTail(donor, partsAvail, vinDecode?.engine_label)}

${renderCompatibilityCard(donor)}

${renderJunkyardCard(donor)}

${renderDisclaimer()}

${renderRelatedDonors(sameYard, `More ${donor.make_name} ${donor.model_name} donors at this junkyard`, cfHash)}

${renderRelatedDonors(sameCityModel, `More ${donor.generation_range ? donor.generation_range + ' ' : ''}${donor.make_name} ${donor.model_name} donors in ${donor.city_name}`, cfHash)}

${renderCityCountGrid(otherCities, donor.make_slug, donor.model_slug, `${donor.make_name} ${donor.model_name} donor cars in other Canadian cities`)}

${renderFaqList('Questions about this donor car', faqs)}

${renderDonorSummary(donor, partsAvail)}

${renderFooter()}

${!isDepleted ? renderPartsStickyBar(donor, photos[0], cfHash) : ''}
${!isDepleted ? renderStickyBarObserverScript(cspNonce) : ''}
`;

  const html = renderShell({
    title, description, canonical,
    ogImage: primaryPhotoUrl,
    schemaLD,
    nonce: cspNonce,
  }, body);

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
};

/** Compose donor-specific FAQ items. Phase 3.2 ships static factory copy;
 *  Phase 3.3 dashboard will let yards override. Variables are lightly
 *  templated so the same wording works for any (make, model). */
function composeDonorFaqs(donor: { year: number; make_name: string; model_name: string; trim: string | null; dealer_name: string; generation_range: string | null }): FaqItem[] {
  const trim = donor.trim ?? '';
  const trimSep = trim ? ` ${trim}` : '';
  const gen = donor.generation_range ?? `${donor.year}`;
  return [
    {
      q: `Will parts from this ${donor.year} ${donor.make_name} ${donor.model_name}${trimSep} fit my car?`,
      a: `Most parts cross-fit between trims within the same generation (${gen}). Body panels, lights, interior trim, glass, suspension, and the engine and transmission are typically directly compatible across trims of the same generation. Trim-specific items — sport bumpers, lip spoilers, premium wheels, leather steering wheels — won't be on a base-trim donor. Call ${donor.dealer_name} with the specific part name and they'll confirm.`,
    },
    {
      q: `Does ${donor.dealer_name} offer warranty on used parts?`,
      a: 'Most salvage yards offer 30–60 days standard warranty on mechanical parts (engine, transmission, alternator, starter, A/C compressor) and sell body panels and interior trim as-is (condition is verifiable visually before purchase). Warranty covers parts only; labour for installation is at your expense. Confirm warranty terms with the yard at point of purchase and keep your receipt.',
    },
    {
      q: 'Can I see the donor car in person before buying a part?',
      a: `Yes. Most yards welcome in-person viewing during open hours. The donor car is at ${donor.dealer_name}'s yard. Call ahead so they can have it accessible — some donors are stacked or in the active dismantling area. Bring photos of the part on your own car if helpful for matching.`,
    },
    {
      q: 'How long does it take to get a quote after I call?',
      a: 'For common parts, immediately on the call — staff knows their pricing on bumpers, lights, mirrors, doors, trunk lids. For less common items (specific dashboard switches, trim pieces, hybrid components), they may need a few minutes to walk to the donor and verify availability. Email quotes typically take 1–2 business hours.',
    },
    {
      q: 'Will the junkyard ship parts to other Canadian cities?',
      a: 'Most yards ship smaller parts (alternators, starters, switches, lights) via Canada Post Expedited or Purolator. Larger items (engines, transmissions, body panels) ship LTL freight. Shipping is quoted separately from the part price; payment is typically by e-transfer or credit card before shipment. Confirm shipping options when you call.',
    },
  ];
}

void formatTransmission; // re-exported for test harness; suppress unused-import warning

/**
 * GET /used-cars/listing/:slug
 *
 * Phase 2c2b dynamic route. Fetches a listing from D1 (with photos + dealer +
 * make + model joined), then renders an HTML page that mirrors the Phase 1.4
 * SSG visual structure but with real data, real CF Images URLs for photos,
 * and full Schema.org markup. Falls back to the SVG silhouette gallery when
 * a listing has no photos uploaded yet.
 *
 * 404 — listing not found OR status != 'active' OR past its TTL (audit #8 —
 * no sweeper flips expired rows, so the read side must enforce expires_at).
 */

import type { Env } from "../../../types/env";
import { isListingExpired } from "../../../lib/schema";
import {
  getListingDetailBySlug, getMediaForEntity, recordView, getVinDecode,
} from "../../api/_lib/db";
import {
  renderShell, takeCspNonce, esc, fmt, cfImageUrl, formatPhone, relativeTime, safeUrl,
  renderFactoryEquipment,
} from "../../_lib/page-shell";

const TIER_1_CITIES: Record<string, { name: string; province: string }> = {
  toronto:   { name: 'Toronto',   province: 'ON' },
  montreal:  { name: 'Montreal',  province: 'QC' },
  vancouver: { name: 'Vancouver', province: 'BC' },
  calgary:   { name: 'Calgary',   province: 'AB' },
  edmonton:  { name: 'Edmonton',  province: 'AB' },
  ottawa:    { name: 'Ottawa',    province: 'ON' },
};

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ params, env, data, waitUntil }) => {
  const slug = params.slug as string;
  const cspNonce = takeCspNonce(data);
  // One JOIN statement (listings+dealers+makes+models, audit #25) + one media
  // query — 2 D1 round-trips. The INNER JOINs also subsume the old
  // dealer/make/model missing-row 404 guard: a dangling FK yields no row.
  const listing = await getListingDetailBySlug(env, slug);
  if (!listing || listing.status !== 'active' || isListingExpired(listing)) {
    return new Response(notFoundHtml(cspNonce), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // Cabinet stats (Feature 1): count the human view off the render path.
  // Bots are tagged by the middleware UA sniff and excluded so dealers see
  // people, not crawlers. s-maxage=60 means cached hits go uncounted — the
  // numbers are a floor, which is the honest direction to err.
  if (!(data as { isBot?: boolean }).isBot) {
    waitUntil(recordView(env, 'listing', listing.id));
  }

  const [photos, vinDecode] = await Promise.all([
    getMediaForEntity(env, 'listing', listing.id),
    listing.vin ? getVinDecode(env, listing.vin) : Promise.resolve(null),
  ]);

  const makeRow = { slug: listing.make_slug, name: listing.make_name };
  const modelRow = { slug: listing.model_slug, name: listing.model_name };
  const dealer = {
    name: listing.dealer_name,
    slug: listing.dealer_slug,
    phone: listing.dealer_phone,
    email: listing.dealer_email,
    website: listing.dealer_website,
    address_line1: listing.dealer_address_line1,
    address_line2: listing.dealer_address_line2,
    city: listing.dealer_city,
    province: listing.dealer_province,
    postal_code: listing.dealer_postal_code,
    amvic_number: listing.dealer_amvic_number,
    verified: listing.dealer_verified,
    type: listing.dealer_type,
    hours: listing.dealer_hours,
  };

  const cfHash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? '';
  const cityInfo = TIER_1_CITIES[listing.city];
  const cityName = cityInfo?.name ?? listing.city;
  const cityProvince = cityInfo?.province ?? listing.province;

  const drive = listing.drivetrain ? listing.drivetrain.toUpperCase() : 'AWD';
  const transmission = listing.transmission
    ? (listing.transmission === 'cvt' ? 'CVT' :
       listing.transmission === 'dct' ? 'DCT' :
       listing.transmission === 'manual' ? 'Manual' : 'Auto')
    : 'Auto';
  const conditionLabel =
    listing.condition === 'used_excellent' ? 'Used — Excellent' :
    listing.condition === 'used_good'      ? 'Used — Good' :
    listing.condition === 'used_fair'      ? 'Used — Fair' :
                                              'Used';
  const priceDollars = Math.round(listing.price / 100);
  const negotiable = !!listing.negotiable;
  const sold = listing.status as string === 'sold';
  const trim = listing.trim ?? '';
  const trimSep = trim ? ` ${trim}` : '';

  const phoneFmt = formatPhone(dealer.phone);
  const dealerAddress = [
    dealer.address_line1, dealer.address_line2, dealer.city, dealer.province, dealer.postal_code,
  ].filter(Boolean).join(', ') || `${dealer.city}, ${dealer.province}`;
  const dealerBadge =
    dealer.province === 'AB' && dealer.amvic_number ? 'AMVIC-licensed' :
    dealer.province === 'ON' ? 'OMVIC-registered' :
    dealer.verified ? 'Verified seller' : 'Independent dealer';
  const showAmvic = dealer.province === 'AB' && dealer.type === 'dealer' && dealer.amvic_number;

  // GEO copy descriptor — keeps the badge's casing and picks the right article.
  const dealerDescriptor =
    dealerBadge === 'AMVIC-licensed' ? 'an AMVIC-licensed dealer' :
    dealerBadge === 'OMVIC-registered' ? 'an OMVIC-registered dealer' :
    dealerBadge === 'Verified seller' ? 'a verified seller' :
    'an independent dealer';

  const realPhotoUrls = photos.map((p) => ({
    url: cfImageUrl(cfHash, p.image_id, 'public'),
    alt: p.alt_text,
  }));
  const primaryImage = realPhotoUrls[0]?.url ?? null;
  const hasPhotos = realPhotoUrls.length > 0;

  const driveConfigSchema =
    drive === 'AWD' ? 'https://schema.org/AllWheelDriveConfiguration' :
    drive === 'FWD' ? 'https://schema.org/FrontWheelDriveConfiguration' :
                      'https://schema.org/RearWheelDriveConfiguration';

  const fuelLabel = listing.fuel_type
    ? listing.fuel_type.charAt(0).toUpperCase() + listing.fuel_type.slice(1)
    : 'Gasoline';
  const bodyLabel =
    listing.body_type === 'suv' || listing.body_type === 'crossover' ? 'SUV' :
    listing.body_type === 'hatchback' ? 'Hatchback' :
    listing.body_type === 'wagon' ? 'Wagon' : 'Sedan';

  const description = listing.description ?? '';
  // Deterministic spec-sentence fallback (Feature 2): when the dealer wrote no
  // description, build honest text mass from the structured fields — every
  // value comes from the listing row, nothing generated.
  const descParas = description
    ? description.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [
        `${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} for sale by ${dealer.name} in ${cityName}, ${cityProvince}.`,
        `${fmt(listing.mileage)} km · ${transmission} · ${drive} · ${fuelLabel} · ${bodyLabel} · ${conditionLabel}.` +
          (negotiable ? ' Price is negotiable — contact the dealer directly.' : ' Contact the dealer directly to arrange a viewing.'),
      ];

  const canonical = `https://japanauto.ca/used-cars/listing/${listing.slug}/`;
  const title = `${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} — CA$${fmt(priceDollars)} — ${cityName}, ${cityProvince}`;
  const metaDescription = `${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} for sale in ${cityName}, ${cityProvince}. ${fmt(listing.mileage)} km, ${transmission}, ${drive}. CA$${fmt(priceDollars)} from ${dealer.name}.`;

  const listingFaqs = [
    {
      q: `How reliable is a ${makeRow.name} ${modelRow.name}?`,
      a: `${makeRow.name} models including the ${modelRow.name} consistently rank top-tier for long-term reliability across Canadian conditions.`,
    },
    {
      q: `What's the average mileage for a ${listing.year} ${modelRow.name}?`,
      a: `Around ${fmt(Math.round(listing.mileage / 1000) * 1000)} km is typical for ${listing.year} examples.`,
    },
    {
      q: 'Should I get a pre-purchase inspection?',
      a: `Yes, on any used vehicle priced above CA$10,000. Expect to pay CA$150–CA$250 in ${cityName} at an independent shop.`,
    },
  ];

  const schemaLD = [
    {
      '@type': 'Vehicle',
      name: `${listing.year} ${makeRow.name} ${modelRow.name}${trimSep}`,
      vehicleModelDate: String(listing.year),
      ...(listing.vin ? { vehicleIdentificationNumber: listing.vin } : {}),
      modelDate: String(listing.year),
      manufacturer: makeRow.name,
      model: modelRow.name,
      ...(trim ? { vehicleConfiguration: trim } : {}),
      mileageFromOdometer: { '@type': 'QuantitativeValue', value: listing.mileage, unitCode: 'KMT' },
      vehicleTransmission: transmission,
      driveWheelConfiguration: driveConfigSchema,
      fuelType: fuelLabel,
      bodyType: bodyLabel,
      ...(vinDecode?.engine ? {
        vehicleEngine: {
          '@type': 'EngineSpecification',
          ...(vinDecode.engine.code ? { name: vinDecode.engine.code } : {}),
          ...(vinDecode.engine.displacement_l ? {
            engineDisplacement: { '@type': 'QuantitativeValue', value: vinDecode.engine.displacement_l, unitCode: 'LTR' },
          } : {}),
        },
      } : {}),
      ...(primaryImage ? { image: primaryImage } : {}),
      offers: {
        '@type': 'Offer',
        price: priceDollars,
        priceCurrency: 'CAD',
        availability: sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        seller: {
          '@type': 'AutoDealer',
          name: dealer.name,
          ...(dealer.phone ? { telephone: dealer.phone } : {}),
          email: dealer.email,
          ...(dealer.website && safeUrl(dealer.website) !== '#' ? { url: safeUrl(dealer.website) } : {}),
          address: {
            '@type': 'PostalAddress',
            ...(dealer.address_line1 ? { streetAddress: dealer.address_line1 } : {}),
            addressLocality: dealer.city,
            addressRegion: dealer.province,
            addressCountry: 'CA',
          },
          areaServed: dealer.city,
        },
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://japanauto.ca/' },
        { '@type': 'ListItem', position: 2, name: cityName, item: `https://japanauto.ca/${listing.city}/${makeRow.slug}/${modelRow.slug}/` },
        { '@type': 'ListItem', position: 3, name: makeRow.name, item: `https://japanauto.ca/used-cars/${makeRow.slug}/` },
        { '@type': 'ListItem', position: 4, name: modelRow.name, item: `https://japanauto.ca/used-cars/${makeRow.slug}/${modelRow.slug}/` },
        { '@type': 'ListItem', position: 5, name: `${listing.year}${trimSep}`, item: canonical },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: listingFaqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  const photoGalleryHtml = hasPhotos
    ? `<section style="margin-top:16px;position:relative">
        <div role="img" aria-label="${esc(`${listing.year} ${makeRow.name} ${modelRow.name} — main photo`)}"
             style="width:100%;aspect-ratio:4 / 3;background:var(--color-bg-muted);position:relative;overflow:hidden">
          <img src="${esc(realPhotoUrls[0]!.url)}" alt="${esc(realPhotoUrls[0]!.alt)}" loading="eager"
               style="width:100%;height:100%;object-fit:cover" />
          <button type="button" class="photo-main-button" aria-label="View all photos"
                  data-open-lightbox></button>
          <div style="position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:5px;pointer-events:none">
            ${realPhotoUrls.map((_, i) => `<span style="width:6px;height:6px;border-radius:3px;background:${i === 0 ? 'var(--color-accent)' : 'rgba(140,140,140,0.6)'}"></span>`).join('')}
          </div>
          <button type="button" class="photo-counter-overlay"
                  data-open-lightbox>
            ${realPhotoUrls.length} photo${realPhotoUrls.length === 1 ? '' : 's'} · Tap to view all
          </button>
        </div>
      </section>
      <dialog id="photo-lightbox" class="photo-lightbox-dialog">
        <form method="dialog" class="photo-lightbox-header">
          <button type="button" class="icon-btn" aria-label="Share" disabled></button>
          <span class="photo-counter-text"><span data-lightbox-current>1</span> / ${realPhotoUrls.length}</span>
          <button type="submit" class="icon-btn" aria-label="Close">✕</button>
        </form>
        <div class="photo-lightbox-main">
          ${realPhotoUrls.map((_p, i) => `<input type="radio" name="lightbox-photo" id="lp-${i}" value="${i}"${i === 0 ? ' checked' : ''} class="sr-only" data-lightbox-radio />`).join('')}
          <div class="photo-lightbox-stage">
            ${realPhotoUrls.map((p, i) => `<div class="photo-lightbox-slide${i === 0 ? ' is-active' : ''}" data-slide-idx="${i}" aria-hidden="${i !== 0}"><img src="${esc(p.url)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain" /></div>`).join('')}
          </div>
        </div>
        <div class="photo-lightbox-thumbs">
          ${realPhotoUrls.map((p, i) => `<label for="lp-${i}" class="photo-thumb${i === 0 ? ' is-active' : ''}" aria-label="Photo ${i + 1}"><img src="${esc(p.url)}" alt="${esc(p.alt)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover" /></label>`).join('')}
        </div>
      </dialog>
      <script nonce="${esc(cspNonce)}">
        (function () {
          var dialog = document.getElementById('photo-lightbox');
          if (!dialog) return;
          document.querySelectorAll('[data-open-lightbox]').forEach(function (btn) {
            btn.addEventListener('click', function () { dialog.showModal(); });
          });
          var radios = dialog.querySelectorAll('[data-lightbox-radio]');
          var current = dialog.querySelector('[data-lightbox-current]');
          var slides = dialog.querySelectorAll('.photo-lightbox-slide');
          var thumbs = dialog.querySelectorAll('.photo-thumb');
          radios.forEach(function (r, idx) {
            r.addEventListener('change', function () {
              if (!r.checked) return;
              if (current) current.textContent = String(idx + 1);
              slides.forEach(function (s, i) {
                s.classList.toggle('is-active', i === idx);
                s.setAttribute('aria-hidden', String(i !== idx));
              });
              thumbs.forEach(function (t, i) {
                t.classList.toggle('is-active', i === idx);
              });
            });
          });
        })();
      </script>`
    : `<section style="margin-top:16px">
        <div role="img" aria-label="${esc(`${listing.year} ${makeRow.name} ${modelRow.name} — main photo`)}"
             style="width:100%;aspect-ratio:4 / 3;background:var(--color-bg-muted);display:flex;align-items:center;justify-content:center;color:var(--color-ink-muted);font-size:14px">
          No photos uploaded yet
        </div>
      </section>`;

  const dealerHoursRows = formatDealerHours(dealer.hours);
  const dealerHoursHtml = dealerHoursRows.map((h) =>
    `<div class="dealer-hours-row" data-dow="${esc(h.dow.join(','))}"
          style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--color-ink-default);font-weight:400">
       <span class="dealer-hours-label">${esc(h.label)}</span><span>${esc(h.hours)}</span>
     </div>`,
  ).join('');

  const body = `
<header role="banner" style="display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;border-bottom:1px solid var(--color-divider);position:sticky;top:0;background:#fff;z-index:50">
  <a href="/" aria-label="japanauto, home" style="font-weight:700;color:var(--color-ink-strong);text-decoration:none;font-size:17px;letter-spacing:-0.01em">japanauto.ca</a>
  <nav aria-label="Top" style="display:flex;align-items:center;gap:14px;font-size:13px;color:var(--color-ink-default)">
    <a href="/used-cars/" style="color:inherit;text-decoration:none">Cars</a>
    <a href="/dealers/" style="color:inherit;text-decoration:none">Dealers</a>
  </nav>
</header>

${sold ? `<div style="background:var(--color-ink-strong);color:#fff;height:48px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;letter-spacing:0.08em">SOLD</div>` : ''}

<nav aria-label="Breadcrumb" style="padding:12px 16px 0;font-size:12px;color:var(--color-ink-muted)">
  <a href="/" style="color:inherit">Home</a> · <a href="/${esc(listing.city)}/${esc(makeRow.slug)}/${esc(modelRow.slug)}/" style="color:inherit">${esc(cityName)}</a> · <a href="/used-cars/${esc(makeRow.slug)}/" style="color:inherit">${esc(makeRow.name)}</a> · <a href="/used-cars/${esc(makeRow.slug)}/${esc(modelRow.slug)}/" style="color:inherit">${esc(modelRow.name)}</a> · <span style="color:var(--color-ink-strong)">${listing.year}${trimSep ? esc(trimSep) : ''}</span>
</nav>

${photoGalleryHtml}

<section style="padding:16px 16px 0">
  ${sold ? `<span style="display:inline-block;font-size:11px;font-weight:600;color:var(--color-accent);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">Sold</span>` : ''}
  <span style="display:block;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;font-weight:500;color:var(--color-ink-muted)">
    Used · ${listing.year} · ${esc(makeRow.name)}
  </span>
  <h1 style="margin:4px 0 0;font-size:26px;line-height:32px;font-weight:600;color:var(--color-ink-strong);letter-spacing:-0.02em">
    ${listing.year} ${esc(makeRow.name)} ${esc(modelRow.name)}${esc(trimSep)}
  </h1>
  <p style="margin-top:4px;font-size:14px;line-height:20px;color:var(--color-ink-default)">
    ${fmt(listing.mileage)} km · ${esc(transmission)} · ${esc(drive)} · ${esc(cityName)}, ${esc(cityProvince)}
  </p>
</section>

<section style="padding:16px 16px 0">
  <span style="font-family:'IBM Plex Mono',monospace;font-size:36px;font-weight:600;color:var(--color-ink-strong);letter-spacing:-0.02em;line-height:40px${sold ? ';text-decoration:line-through;opacity:0.6' : ''}">
    CA$${fmt(priceDollars)}
  </span>
  ${!sold ? `<p style="margin-top:4px;font-size:13px;color:var(--color-ink-muted)">${negotiable ? 'Negotiable' : 'Firm price'}</p>` : ''}
</section>

<section style="padding:12px 16px 0">
  <p style="margin:0;font-size:15px;line-height:23px;color:var(--color-ink-default)">${esc(
    sold
      ? `This ${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} with ${fmt(listing.mileage)} km was listed in ${cityName}, ${cityProvince} by ${dealer.name} and has been sold.`
      : `This ${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} with ${fmt(listing.mileage)} km is for sale in ${cityName}, ${cityProvince} for CA$${fmt(priceDollars)} by ${dealer.name}, ${dealerDescriptor}.`,
  )}</p>
</section>

<section style="padding:24px 16px 0">
  <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 12px;color:var(--color-ink-strong)">At a glance</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <tbody>
      ${[
        ['Year', String(listing.year)],
        ['Make / model', `${makeRow.name} ${modelRow.name}${trimSep}`],
        ['Price', sold ? 'Sold' : `CA$${fmt(priceDollars)}${negotiable ? ' (negotiable)' : ''}`],
        ['Mileage', `${fmt(listing.mileage)} km`],
        ['Transmission', transmission],
        ['Drivetrain', drive],
        ['Body', bodyLabel],
        ['Fuel', fuelLabel],
        ...(vinDecode?.engine_label ? [['Engine', vinDecode.engine_label]] : []),
        ...(listing.vin ? [['VIN', listing.vin]] : []),
        ['Condition', conditionLabel],
        ['Location', `${cityName}, ${cityProvince}`],
        ['Seller', `${dealer.name} (${dealerBadge})`],
      ].map(([k, v]) => `<tr style="border-top:1px solid var(--color-divider)">
        <th scope="row" style="text-align:left;padding:7px 12px 7px 0;font-weight:500;color:var(--color-ink-muted);white-space:nowrap;width:40%">${esc(k!)}</th>
        <td style="padding:7px 0;color:var(--color-ink-strong);font-weight:500">${esc(v!)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</section>

${renderFactoryEquipment(vinDecode?.equipment ?? [])}

<section style="padding:24px 16px 0">
  <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 12px;color:var(--color-ink-strong)">About this car</h2>
  ${descParas.map((p) => `<p style="font-size:14px;line-height:21px;color:var(--color-ink-default);margin:0 0 12px">${esc(p)}</p>`).join('')}
</section>

<section style="padding:32px 16px 0">
  <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 16px;color:var(--color-ink-strong)">About this dealer</h2>
  <div style="background:var(--color-bg-subtle);border-radius:12px;padding:20px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--color-ink-strong);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;flex-shrink:0">${esc(dealer.name.charAt(0))}</div>
      <div style="min-width:0">
        <span style="font-size:17px;font-weight:600;color:var(--color-ink-strong);display:block;line-height:22px">${esc(dealer.name)}</span>
        <span style="font-size:11px;color:var(--color-ink-muted)">${esc(dealerBadge)} · ${esc(dealer.city)}, ${esc(dealer.province)}</span>
      </div>
    </div>
    <p style="margin-top:16px;font-size:14px;color:var(--color-ink-default)">${esc(dealerAddress)}</p>
    <div style="margin-top:16px">
      <h4 style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);margin:0 0 6px">Open hours</h4>
      ${dealerHoursHtml}
    </div>
    <div style="margin-top:16px;border-top:1px solid var(--color-divider);padding-top:12px">
      ${dealer.phone ? contactRow('Phone', phoneFmt.display, `tel:${esc(phoneFmt.tel)}`) : ''}
      ${contactRow('Email', dealer.email, `mailto:${esc(dealer.email)}`)}
      ${dealer.website ? contactRow('Web', dealer.website.replace(/^https?:\/\//, ''), dealer.website) : ''}
    </div>
    <div style="margin-top:16px">
      <a href="/dealers/${esc(dealer.slug)}/" style="font-size:13px;color:var(--color-ink-strong);font-weight:500">View dealer profile →</a>
    </div>
  </div>
</section>

${showAmvic ? `<section style="padding:16px;margin:16px;background:var(--color-bg-subtle);border:1px solid var(--color-divider);border-radius:12px">
  <h3 style="font-size:14px;font-weight:600;margin:0 0 8px;color:var(--color-ink-strong)">AMVIC-licensed dealer</h3>
  <p style="font-size:13px;line-height:18px;color:var(--color-ink-default);margin:0">License #${esc(dealer.amvic_number ?? '')}. Verify on the public AMVIC registry.</p>
</section>` : ''}

<section style="padding:24px 16px;color:var(--color-ink-muted);font-size:11px;line-height:16px">
  Prices and availability shown are supplied by the dealer and may change. japanauto.ca does not handle transactions; contact the dealer directly to confirm details.
</section>

<section style="padding:32px 16px">
  <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 16px;color:var(--color-ink-strong)">Common questions about ${esc(makeRow.name)} ${esc(modelRow.name)}</h2>
  ${listingFaqs.map((f) => `
    <details style="border-top:1px solid var(--color-divider);padding:12px 0">
      <summary style="cursor:pointer;font-size:14px;font-weight:500;color:var(--color-ink-strong)">${esc(f.q)}</summary>
      <p style="margin:8px 0 0;font-size:13px;line-height:19px;color:var(--color-ink-default)">${esc(f.a)}</p>
    </details>`).join('')}
</section>

<section style="padding:0 16px 24px">
  <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 8px;color:var(--color-ink-strong)">Summary</h2>
  <p style="margin:0;font-size:14px;line-height:21px;color:var(--color-ink-default)">${esc(
    sold
      ? `This ${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} (${fmt(listing.mileage)} km, ${transmission}, ${drive}) was sold by ${dealer.name} in ${cityName}, ${cityProvince}. Browse current ${makeRow.name} ${modelRow.name} listings for available alternatives.`
      : `${dealer.name}, ${dealerDescriptor} in ${cityName}, ${cityProvince}, is selling this ${listing.year} ${makeRow.name} ${modelRow.name}${trimSep} with ${fmt(listing.mileage)} km (${transmission}, ${drive}, ${fuelLabel.toLowerCase()}) for CA$${fmt(priceDollars)}${negotiable ? ', negotiable' : ''}. Contact the dealer directly by phone or email to ask questions or arrange a viewing — japanauto.ca does not handle transactions.`,
  )}</p>
</section>

${!sold && phoneFmt.tel ? `<div role="region" aria-label="Contact dealer" style="position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid var(--color-divider);padding:12px 16px;display:flex;align-items:center;gap:12px;z-index:40">
  <div style="flex:1;min-width:0">
    <p style="font-size:13px;font-weight:600;color:var(--color-ink-strong);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${listing.year} ${esc(modelRow.name)}${esc(trimSep)}</p>
    <p style="font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--color-ink-default);margin:0">CA$${fmt(priceDollars)}</p>
  </div>
  <a href="tel:${esc(phoneFmt.tel)}" style="background:var(--color-ink-strong);color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Call</a>
</div>` : ''}
`;

  const html = renderShell({
    title,
    description: metaDescription,
    canonical,
    ogImage: primaryImage,
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


function contactRow(label: string, value: string, href: string): string {
  return `<div style="display:flex;align-items:baseline;gap:12px;padding:8px 0">
    <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);width:56px;flex-shrink:0">${esc(label)}</span>
    <a href="${esc(safeUrl(href))}" style="font-size:14px;color:var(--color-ink-strong);text-decoration:none;font-weight:500">${esc(value)}</a>
  </div>`;
}

function notFoundHtml(nonce: string): string {
  return renderShell({
    title: 'Listing not found — japanauto.ca',
    description: 'This listing is no longer available.',
    canonical: 'https://japanauto.ca/used-cars/',
    nonce,
  }, `<main style="padding:48px 16px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">Listing not found</h1><p style="color:var(--color-ink-muted);font-size:14px">This listing may have sold or been removed. <a href="/used-cars/" style="color:var(--color-ink-strong)">Browse current inventory →</a></p></main>`);
}

interface DealerHoursDbEntry {
  dow: number[];
  open: string | null;
  close: string | null;
}

const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDealerHours(rows: DealerHoursDbEntry[] | null | undefined): Array<{ label: string; hours: string; dow: number[] }> {
  if (!rows || rows.length === 0) {
    return [
      { label: 'Mon–Fri',  hours: '9:00 – 18:00',  dow: [1, 2, 3, 4, 5] },
      { label: 'Saturday', hours: '10:00 – 16:00', dow: [6] },
      { label: 'Sunday',   hours: 'Closed',         dow: [0] },
    ];
  }
  return rows.map((r) => {
    const dows = [...r.dow].sort((a, b) => a - b);
    const label = dows.length === 1 ? fullDow(dows[0]!) : `${DOW_LABEL[dows[0]!]}–${DOW_LABEL[dows[dows.length - 1]!]}`;
    const hours = r.open && r.close ? `${r.open} – ${r.close}` : 'Closed';
    return { label, hours, dow: dows };
  });
}

function fullDow(n: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n] ?? '';
}

void relativeTime;

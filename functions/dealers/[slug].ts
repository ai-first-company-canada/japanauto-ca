/**
 * GET /dealers/:slug
 *
 * Phase 2c2b dynamic dealer profile route. Fetches dealer + recent listings
 * from D1 and renders an HTML page with full Schema.org AutoDealer markup.
 *
 * 404 if the dealer slug doesn't exist.
 */

import type { Env } from "../../types/env";
import { getDealerBySlug, listRecentListings } from "../api/_lib/db";
import {
  renderShell, esc, fmt, cfImageUrl, formatPhone, relativeTime,
} from "../_lib/page-shell";

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const onRequestGet: PagesFunction<Env, "slug"> = async ({ params, env }) => {
  const slug = params.slug as string;
  const dealer = await getDealerBySlug(env, slug);
  if (!dealer) {
    return new Response(notFoundHtml(), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const listings = await listRecentListings(env, { dealerId: dealer.id, limit: 24 });
  const cfHash = env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? '';

  const phoneFmt = formatPhone(dealer.phone);
  const dealerAddress = [
    dealer.address_line1, dealer.address_line2, dealer.city, dealer.province, dealer.postal_code,
  ].filter(Boolean).join(', ') || `${dealer.city}, ${dealer.province}`;
  const dealerBadge =
    dealer.province === 'AB' && dealer.amvic_number ? 'AMVIC-licensed' :
    dealer.province === 'ON' ? 'OMVIC-registered' :
    dealer.verified ? 'Verified seller' : 'Independent dealer';
  const showAmvic = dealer.province === 'AB' && dealer.type === 'dealer' && dealer.amvic_number;

  const hours = formatDealerHours(dealer.hours);

  type HoursSpec = { '@type': 'OpeningHoursSpecification'; dayOfWeek: string; opens: string; closes: string };
  const hoursSpecs: HoursSpec[] = (dealer.hours ?? []).flatMap((h) => {
    if (!h.open || !h.close) return [];
    return h.dow.map((dow) => ({
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: DOW_NAMES[dow]!,
      opens: h.open!, closes: h.close!,
    }));
  });

  const canonical = `https://japanauto.ca/dealers/${slug}/`;
  const title = `${dealer.name} — Used Japanese cars in ${dealer.city}, ${dealer.province} — japanauto.ca`;
  const description = `${dealer.name} is a ${dealerBadge.toLowerCase()} used Japanese car dealer in ${dealer.city}. ${listings.length} listings available.`;

  const schemaLD = [
    {
      '@type': 'AutoDealer',
      '@id': canonical + '#dealer',
      name: dealer.name,
      ...(dealer.phone ? { telephone: dealer.phone } : {}),
      email: dealer.email,
      ...(dealer.website ? { url: dealer.website } : {}),
      address: {
        '@type': 'PostalAddress',
        ...(dealer.address_line1 ? { streetAddress: dealer.address_line1 } : {}),
        addressLocality: dealer.city,
        addressRegion: dealer.province,
        addressCountry: 'CA',
      },
      openingHoursSpecification: hoursSpecs,
      areaServed: dealer.city,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://japanauto.ca/' },
        { '@type': 'ListItem', position: 2, name: 'Dealers', item: 'https://japanauto.ca/dealers/' },
        { '@type': 'ListItem', position: 3, name: dealer.name, item: canonical },
      ],
    },
  ];

  const cardsHtml = listings.length > 0
    ? `<section style="padding:24px 16px 32px">
        <h2 class="t-h-s" style="font-size:18px;font-weight:600;margin:0 0 12px;color:var(--color-ink-strong)">${esc(dealer.name)} — current listings</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${listings.map((l) => {
            const priceDollars = Math.round(l.price / 100);
            const trim = l.trim ? ` ${l.trim}` : '';
            const make = l.make_name ?? capitalize(l.make_slug ?? '');
            const model = l.model_name ?? prettify(l.model_slug ?? '');
            const drive = l.drivetrain ? l.drivetrain.toUpperCase() : 'AWD';
            const transmission = l.transmission
              ? (l.transmission === 'cvt' ? 'CVT' :
                 l.transmission === 'dct' ? 'DCT' :
                 l.transmission === 'manual' ? 'Manual' : 'Auto')
              : 'Auto';
            const img = l.primary_image_cf_id && cfHash
              ? `<img src="${esc(cfImageUrl(cfHash, l.primary_image_cf_id, 'public'))}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
              : '';
            return `<a href="/used-cars/listing/${esc(l.slug)}/" class="card" data-year="${l.year}" data-price="${priceDollars}" data-mileage="${l.mileage}" data-tier="${l.tier === 2 ? 'boosted' : 'organic'}" style="overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit">
              <div class="thumb" style="background:var(--color-bg-muted);aspect-ratio:4/3">${img}</div>
              <div style="padding:14px;display:flex;flex-direction:column;gap:6px">
                <h3 class="t-h-s" style="font-size:14px;line-height:20px;font-weight:600">${l.year} ${esc(make)} ${esc(model)}${esc(trim)}</h3>
                <p class="t-body-s ink-muted" style="font-size:12px;line-height:16px">${fmt(l.mileage)} km · ${esc(transmission)} · ${esc(drive)}</p>
                <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
                  <span class="num" style="font-size:18px;font-weight:600;color:#0A0A0A;letter-spacing:-0.01em">CA$${fmt(priceDollars)}</span>
                </div>
                <p class="t-body-s ink-muted" style="font-size:11px;line-height:14px;margin-top:4px;color:var(--color-ink-subtle)">${esc(relativeTime(l.created_at))} · ${esc(l.dealer_name)}</p>
              </div>
            </a>`;
          }).join('')}
        </div>
      </section>`
    : `<section style="padding:32px 16px;text-align:center;color:var(--color-ink-muted);font-size:14px">No listings available right now. Check back soon.</section>`;

  const dealerHoursHtml = hours.map((h) =>
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

<h1 class="sr-only">${esc(dealer.name)} dealer profile, ${esc(dealer.city)}, ${esc(dealer.province)}</h1>

<nav aria-label="Breadcrumb" style="padding:12px 16px 0;font-size:12px;color:var(--color-ink-muted)">
  <a href="/" style="color:inherit">Home</a> · <a href="/dealers/" style="color:inherit">Dealers</a> · <span style="color:var(--color-ink-strong)">${esc(dealer.name)}</span>
</nav>

<section style="padding:16px 16px 0">
  <h2 style="font-size:24px;line-height:30px;font-weight:600;color:var(--color-ink-strong);letter-spacing:-0.02em;margin:0">${esc(dealer.name)}</h2>
  <p style="margin:6px 0 0;font-size:14px;color:var(--color-ink-default)">${esc(dealerBadge)} · ${esc(dealer.city)}, ${esc(dealer.province)} · <span class="num">${listings.length}</span> Japanese car${listings.length === 1 ? '' : 's'} available</p>
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
      ${dealer.phone ? contactRow('Phone', phoneFmt.display, `tel:${phoneFmt.tel}`) : ''}
      ${contactRow('Email', dealer.email, `mailto:${dealer.email}`)}
      ${dealer.website ? contactRow('Web', dealer.website.replace(/^https?:\/\//, ''), dealer.website) : ''}
    </div>
  </div>
</section>

${showAmvic ? `<section style="padding:16px;margin:16px;background:var(--color-bg-subtle);border:1px solid var(--color-divider);border-radius:12px">
  <h3 style="font-size:14px;font-weight:600;margin:0 0 8px;color:var(--color-ink-strong)">AMVIC-licensed dealer</h3>
  <p style="font-size:13px;line-height:18px;color:var(--color-ink-default);margin:0">License #${esc(dealer.amvic_number ?? '')}. Verify on the public AMVIC registry.</p>
</section>` : ''}

${cardsHtml}
`;

  const html = renderShell({
    title, description, canonical, schemaLD,
  }, body);

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  });
};

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettify(s: string): string {
  if (!s) return '';
  return s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function contactRow(label: string, value: string, href: string): string {
  return `<div style="display:flex;align-items:baseline;gap:12px;padding:8px 0">
    <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);width:56px;flex-shrink:0">${esc(label)}</span>
    <a href="${esc(href)}" style="font-size:14px;color:var(--color-ink-strong);text-decoration:none;font-weight:500">${esc(value)}</a>
  </div>`;
}

function notFoundHtml(): string {
  return renderShell({
    title: 'Dealer not found — japanauto.ca',
    description: 'This dealer profile could not be found.',
    canonical: 'https://japanauto.ca/dealers/',
  }, `<main style="padding:48px 16px;text-align:center"><h1 style="font-size:24px;margin:0 0 12px">Dealer not found</h1><p style="color:var(--color-ink-muted);font-size:14px"><a href="/dealers/" style="color:var(--color-ink-strong)">Browse all dealers →</a></p></main>`);
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
    const hoursStr = r.open && r.close ? `${r.open} – ${r.close}` : 'Closed';
    return { label, hours: hoursStr, dow: dows };
  });
}

function fullDow(n: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n] ?? '';
}

/**
 * functions/_lib/parts-components.ts
 *
 * HTML rendering helpers for the donor-detail Pages Function
 * (functions/parts/listing/[slug].ts). Each helper returns a `string` of
 * HTML — no template engines, no JSX. Tailwind utility classes are not used
 * here; we stick with the inline-style + CSS-variable convention shared by
 * `functions/_lib/page-shell.ts` so the look matches the SSG side
 * (dist/styles/global.css defines the --color-* variables).
 *
 * All user-controlled strings flow through `esc()`. `fmt()` formats integers.
 * `cfImageUrl()` builds Cloudflare Images delivery URLs.
 */

import { esc, fmt, cfImageUrl, formatPhone, safeUrl } from "./page-shell";
import type { DonorCarDetailRow, DonorCardRow, DonorCityCountRow } from "../api/_lib/db";
import type { MediaPublic, DonorPartSlug } from "../../lib/schema";
import { DONOR_PART_GROUPS, DONOR_PART_LABELS } from "../../lib/schema";

// ============================================================================
// Constants
// ============================================================================

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TonePalette {
  top: string; bot: string; glass: string; wheel: string; stroke: string;
}

const TONE_PALETTES: Record<string, TonePalette> = {
  silver:   { top: '#E0E0E2', bot: '#9A9A9C', glass: '#2A2A2D', wheel: '#0A0A0A', stroke: '#7A7A7C' },
  midnight: { top: '#3A4250', bot: '#1A1F2A', glass: '#0A0A0A', wheel: '#0A0A0A', stroke: '#0A0A0A' },
  white:    { top: '#FAFAF9', bot: '#D8D6CF', glass: '#1F1F22', wheel: '#0A0A0A', stroke: '#9A9890' },
  pearl:    { top: '#F4F1EA', bot: '#C9C2B0', glass: '#1F1F22', wheel: '#0A0A0A', stroke: '#9A9486' },
  black:    { top: '#3A3A3D', bot: '#0E0E10', glass: '#000000', wheel: '#0A0A0A', stroke: '#000000' },
  red:      { top: '#9E1F2E', bot: '#5E0E1A', glass: '#1A0A0E', wheel: '#0A0A0A', stroke: '#3E0610' },
  crimson:  { top: '#9E1F2E', bot: '#5E0E1A', glass: '#1A0A0E', wheel: '#0A0A0A', stroke: '#3E0610' },
  blue:     { top: '#3D5878', bot: '#1B2C44', glass: '#0A0F1A', wheel: '#0A0A0A', stroke: '#0F1830' },
  grey:     { top: '#9C9A95', bot: '#5C5A55', glass: '#1F1F22', wheel: '#0A0A0A', stroke: '#3F3D38' },
  graphite: { top: '#5A5A5E', bot: '#1F1F22', glass: '#0A0A0A', wheel: '#0A0A0A', stroke: '#1A1A1C' },
  sand:     { top: '#E0D8C5', bot: '#A8997B', glass: '#3A3528', wheel: '#0A0A0A', stroke: '#7A6F58' },
  forest:   { top: '#4A5A4A', bot: '#1F2A1F', glass: '#0A150A', wheel: '#0A0A0A', stroke: '#0F1A0F' },
  bronze:   { top: '#9A8A75', bot: '#5C4A35', glass: '#2A2520', wheel: '#0A0A0A', stroke: '#3A2E1F' },
};

// ============================================================================
// Small utilities
// ============================================================================

/** Format kilometers like 280000 → "280,000 km". null → "—". */
export function formatKm(n: number | null): string {
  return n === null ? '—' : `${fmt(n)} km`;
}

/** Convert donor_cars.transmission to a display label. */
export function formatTransmission(t: string | null): string {
  if (!t) return '—';
  return t === 'cvt' ? 'CVT'
       : t === 'dct' ? 'DCT'
       : t === 'manual' ? 'Manual'
       : t === 'automatic' ? 'Auto'
       : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Compose `(403) 555-1234` for display, `+14035551234` for tel: */
export function donorPhone(e164: string | null): { display: string; tel: string } {
  return formatPhone(e164);
}

/** Today's day-of-week (0=Sun..6=Sat) in America/Edmonton — most yards we list are AB. */
export function computeTodayDow(): number {
  // Worker UTC → AB is UTC-7 (MST/MDT). Use Intl to be DST-safe.
  const fmtr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' });
  const wd = fmtr.format(new Date());
  const idx = DOW_SHORT.indexOf(wd);
  return idx >= 0 ? idx : new Date().getUTCDay();
}

// ============================================================================
// Tone-based SVG placeholder (3/4 view) — used when no media rows exist
// ============================================================================

const PLACEHOLDER_FRAMINGS = ['three-quarter', 'side', 'rear-three-quarter', 'engine-bay', 'interior', 'wheel-detail'] as const;
type PlaceholderFraming = (typeof PLACEHOLDER_FRAMINGS)[number];

/**
 * Inline SVG silhouette for a donor car, picked by tone + framing. Mirrors
 * src/components/atoms/ListingPhoto.astro so the Pages Function output looks
 * like the SSG side. Returns a self-contained `<svg>` string sized to fill its
 * container (width:100%; height:100%).
 */
export function renderTonePlaceholder(
  tone: string | null,
  framing: PlaceholderFraming = 'three-quarter',
): string {
  const c = TONE_PALETTES[tone ?? 'silver'] ?? TONE_PALETTES.silver!;
  const gid = `lp-${framing}-${tone ?? 'silver'}`;
  const usesBackdrop = framing !== 'interior' && framing !== 'engine-bay';
  const defs = `<defs>
    <linearGradient id="bg-${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F2F2F2"/>
      <stop offset="55%" stop-color="#E8E6DF"/>
      <stop offset="100%" stop-color="#C9C5BA"/>
    </linearGradient>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.top}"/>
      <stop offset="100%" stop-color="${c.bot}"/>
    </linearGradient>
    <radialGradient id="floor-${gid}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="rgba(0,0,0,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>`;
  const backdrop = usesBackdrop
    ? `<rect width="400" height="300" fill="url(#bg-${gid})"/><ellipse cx="200" cy="245" rx="160" ry="14" fill="url(#floor-${gid})"/>`
    : '';
  const body = pickFramingPath(framing, c, gid);
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block" aria-hidden="true">${defs}${backdrop}${body}</svg>`;
}

function pickFramingPath(framing: PlaceholderFraming, c: TonePalette, gid: string): string {
  switch (framing) {
    case 'side':
      return `<g transform="translate(40 140)">
        <path d="M0 70 Q4 48 26 44 L60 36 Q72 18 110 14 L210 14 Q252 18 268 38 L308 46 Q320 52 318 70 L318 96 L0 96 Z" fill="url(#${gid})" stroke="${c.stroke}" stroke-width="1.2"/>
        <path d="M68 38 Q80 20 110 18 L210 18 Q244 22 264 40 L264 50 L72 50 Z" fill="${c.glass}"/>
        <circle cx="62" cy="96" r="22" fill="${c.wheel}"/><circle cx="62" cy="96" r="10" fill="#3A3A3D"/>
        <circle cx="262" cy="96" r="22" fill="${c.wheel}"/><circle cx="262" cy="96" r="10" fill="#3A3A3D"/>
      </g>`;
    case 'rear-three-quarter':
      return `<g transform="translate(60 130)">
        <path d="M10 70 Q14 52 32 46 L60 38 Q72 18 116 14 L184 14 Q220 18 240 38 L274 46 Q288 50 286 72 L286 96 L10 96 Z" fill="url(#${gid})" stroke="${c.stroke}" stroke-width="1.2"/>
        <path d="M64 38 Q72 22 110 18 L186 18 Q210 20 232 38 L232 50 L70 50 Z" fill="${c.glass}"/>
        <rect x="240" y="60" width="46" height="12" rx="2" fill="#A03020"/>
        <circle cx="64" cy="96" r="20" fill="${c.wheel}"/><circle cx="64" cy="96" r="9" fill="#3A3A3D"/>
        <circle cx="232" cy="96" r="20" fill="${c.wheel}"/><circle cx="232" cy="96" r="9" fill="#3A3A3D"/>
      </g>`;
    case 'engine-bay':
      return `<rect width="400" height="300" fill="#262626"/>
        <rect x="80" y="100" width="240" height="120" rx="4" fill="#3A3A3D" stroke="#5A5A5E" stroke-width="1.5"/>
        <rect x="130" y="130" width="140" height="60" rx="3" fill="#5A5A5E"/>
        <text x="200" y="166" font-family="sans-serif" font-size="14" fill="#E0E0E2" text-anchor="middle" font-weight="600">DONOR CAR</text>`;
    case 'interior':
      return `<rect width="400" height="300" fill="#1A1A1C"/>
        <path d="M0 200 Q200 130 400 200 L400 300 L0 300 Z" fill="#0A0A0A"/>
        <circle cx="120" cy="195" r="42" fill="none" stroke="#5A5A5E" stroke-width="3"/>
        <circle cx="120" cy="195" r="14" fill="#3A3A3D"/>
        <rect x="200" y="170" width="120" height="70" rx="6" fill="#262626" stroke="#3A3A3D" stroke-width="1"/>`;
    case 'wheel-detail':
      return `<circle cx="200" cy="160" r="110" fill="#1A1A1C"/>
        <circle cx="200" cy="160" r="100" fill="#0A0A0A" stroke="#3A3A3D" stroke-width="2"/>
        <path d="M200 160 L292 160" stroke="#9A9A9C" stroke-width="9" stroke-linecap="round"/>
        <path d="M200 160 L228.4 247.5" stroke="#9A9A9C" stroke-width="9" stroke-linecap="round"/>
        <path d="M200 160 L125.4 213.7" stroke="#9A9A9C" stroke-width="9" stroke-linecap="round"/>
        <path d="M200 160 L125.4 106.3" stroke="#9A9A9C" stroke-width="9" stroke-linecap="round"/>
        <path d="M200 160 L228.4 72.5" stroke="#9A9A9C" stroke-width="9" stroke-linecap="round"/>
        <circle cx="200" cy="160" r="22" fill="#3A3A3D"/><circle cx="200" cy="160" r="6" fill="#0A0A0A"/>`;
    case 'three-quarter':
    default:
      return `<g transform="translate(60 130)">
        <path d="M10 70 Q14 50 32 46 L70 38 Q82 18 116 14 L184 14 Q224 18 244 38 L274 46 Q288 52 286 72 L286 96 L10 96 Z" fill="url(#${gid})" stroke="${c.stroke}" stroke-width="1.2"/>
        <path d="M76 36 Q86 22 116 18 L184 18 Q214 20 240 38 L240 50 L80 50 Z" fill="${c.glass}"/>
        <circle cx="64" cy="96" r="20" fill="${c.wheel}"/><circle cx="64" cy="96" r="9" fill="#3A3A3D"/>
        <circle cx="232" cy="96" r="20" fill="${c.wheel}"/><circle cx="232" cy="96" r="9" fill="#3A3A3D"/>
      </g>`;
  }
}

// ============================================================================
// Section helpers
// ============================================================================

/** Sticky top navigation bar — same shape as the dealer/listing pages. */
export function renderPartsNavBar(opts: { cityShort: string }): string {
  return `<header role="banner" style="display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;border-bottom:1px solid var(--color-divider);position:sticky;top:0;background:#fff;z-index:50">
  <a href="/" aria-label="japanauto, home" style="font-weight:700;color:var(--color-ink-strong);text-decoration:none;font-size:17px;letter-spacing:-0.01em">japanauto.ca</a>
  <nav aria-label="Top" style="display:flex;align-items:center;gap:14px;font-size:13px;color:var(--color-ink-default)">
    <a href="/used-cars/" style="color:inherit;text-decoration:none">Cars</a>
    <a href="/parts/" style="color:inherit;text-decoration:none">Parts</a>
    <span aria-label="Current city" style="font-size:11px;color:var(--color-ink-muted);letter-spacing:0.04em;text-transform:uppercase">${esc(opts.cityShort)}</span>
  </nav>
</header>`;
}

/** Generic breadcrumb. Last entry has href === null (rendered as text). */
export function renderBreadcrumb(crumbs: Array<{ label: string; href: string | null }>): string {
  const parts: string[] = [];
  crumbs.forEach((c, i) => {
    const last = i === crumbs.length - 1;
    if (c.href && !last) {
      parts.push(`<a href="${esc(c.href)}" style="color:inherit;text-decoration:none">${esc(c.label)}</a>`);
    } else {
      parts.push(`<span style="color:var(--color-ink-strong)">${esc(c.label)}</span>`);
    }
    if (!last) parts.push('<span aria-hidden style="margin:0 6px">·</span>');
  });
  return `<nav aria-label="Breadcrumb" style="padding:12px 16px 0;font-size:12px;color:var(--color-ink-muted);overflow-x:auto;white-space:nowrap">${parts.join('')}</nav>`;
}

/** Black "FULLY PARTED OUT" band — shown only on depleted donors. */
export function renderDepletedBand(): string {
  return `<div role="alert" style="background:var(--color-ink-strong);color:#fff;height:48px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;letter-spacing:0.06em">FULLY PARTED OUT</div>`;
}

/**
 * Photo gallery. When `photos` has entries we render a 4:3 hero with photo
 * counter + dot indicator (no JS — every dot is a label backed by a hidden
 * radio so the user can click between slides). When `photos` is empty we
 * render a single tone-based silhouette so the page still looks finished
 * before junkyard photos exist.
 */
export function renderPhotoGallery(
  photos: MediaPublic[], tone: string | null, cfHash: string, captionLabel: string,
): string {
  if (photos.length === 0) {
    return `<section style="margin-top:0">
      <div role="img" aria-label="${esc(`${captionLabel} — placeholder illustration`)}" style="width:100%;aspect-ratio:4 / 3;background:var(--color-bg-muted);position:relative;overflow:hidden">
        ${renderTonePlaceholder(tone, 'three-quarter')}
        <div style="position:absolute;inset:auto 0 12px 0;text-align:center;color:#fff;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,0.4)">
          Photos coming soon
        </div>
      </div>
    </section>`;
  }
  const limited = photos.slice(0, 6);
  const count = limited.length;
  return `<section style="margin-top:0;position:relative">
    <div style="width:100%;aspect-ratio:4 / 3;background:var(--color-bg-muted);position:relative;overflow:hidden">
      <img src="${esc(cfImageUrl(cfHash, limited[0]!.image_id, 'public'))}" alt="${esc(limited[0]!.alt_text)}" loading="eager" style="width:100%;height:100%;object-fit:cover" />
      <span style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.65);color:#fff;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:500;letter-spacing:0.04em;backdrop-filter:blur(4px)">
        <span class="num">1</span> / <span class="num">${count}</span>
      </span>
      <div style="position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:4px;pointer-events:none">
        ${limited.map((_, i) => `<span style="width:${i === 0 ? 16 : 4}px;height:4px;border-radius:2px;background:${i === 0 ? '#fff' : 'rgba(255,255,255,0.5)'}"></span>`).join('')}
      </div>
    </div>
  </section>`;
}

/** Hero title block — eyebrow + H1 + meta line. Adds "Depleted" pill when applicable. */
export function renderTitleBlock(donor: DonorCarDetailRow, depleted: boolean): string {
  const trim = donor.trim ?? '';
  const meta: string[] = [];
  meta.push(esc(donor.color_exterior_full ?? donor.color_exterior));
  if (donor.mileage !== null) meta.push(`<span class="num">${fmt(donor.mileage)}</span> km`);
  if (donor.transmission) meta.push(esc(formatTransmission(donor.transmission)));
  if (trim) meta.push(`${esc(trim)} trim`);
  if (donor.generation_range) meta.push(`<span class="num">${esc(donor.generation_range)}</span> generation`);

  return `<section style="padding:20px 16px 0">
    ${depleted ? `<span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px">Depleted</span>` : ''}
    <span style="display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted)">Parts donor car · ${esc(donor.make_name)}</span>
    <h1 style="margin:4px 0 0;font-size:26px;line-height:32px;font-weight:600;letter-spacing:-0.015em;color:var(--color-ink-strong)">
      <span class="num">${donor.year}</span> ${esc(donor.make_name)} ${esc(donor.model_name)}${trim ? ' ' + esc(trim) : ''} — donor car
    </h1>
    <p style="margin:4px 0 0;font-size:15px;line-height:22px;color:var(--color-ink-default)">${meta.join(' · ')}</p>
  </section>`;
}

/** Phone CTA + secondary email link. Disabled state for depleted donors. */
export function renderPrimaryCta(donor: DonorCarDetailRow, depleted: boolean): string {
  if (depleted) {
    return `<section style="padding:20px 16px 0">
      <button disabled aria-disabled="true" style="display:block;width:100%;height:64px;padding:0;border:0;border-radius:8px;background:var(--color-bg-muted);color:var(--color-ink-muted);font-family:'IBM Plex Sans',sans-serif;font-size:17px;font-weight:600;cursor:not-allowed">
        This donor car has been fully parted out
      </button>
    </section>`;
  }
  const phone = donorPhone(donor.dealer_phone);
  if (!phone.tel) {
    return `<section style="padding:20px 16px 0">
      <a href="mailto:${esc(donor.dealer_email)}" data-event="donor-call" style="display:flex;width:100%;height:64px;align-items:center;justify-content:center;gap:12px;border-radius:8px;background:var(--color-accent);color:#fff;text-decoration:none;font-family:'IBM Plex Sans',sans-serif;font-size:17px;font-weight:600;letter-spacing:-0.005em">
        Email ${esc(donor.dealer_name)} about this donor →
      </a>
    </section>`;
  }
  return `<section style="padding:20px 16px 0">
    <a href="tel:${esc(phone.tel)}" data-event="donor-call" data-donor-id="${esc(donor.id)}" style="display:flex;width:100%;height:64px;align-items:center;justify-content:center;gap:12px;border-radius:8px;background:var(--color-accent);color:#fff;text-decoration:none;font-family:'IBM Plex Sans',sans-serif;font-size:17px;font-weight:600;letter-spacing:-0.005em">
      <span aria-hidden style="font-size:20px">☎</span>
      <span>Call <span class="num">${esc(phone.display)}</span> to find your part</span>
    </a>
    <p style="margin:10px 0 0;text-align:center;font-size:13px;color:var(--color-ink-muted)">
      Or <a href="mailto:${esc(donor.dealer_email)}" style="color:var(--color-ink-default);font-weight:500;text-decoration:underline;text-underline-offset:2px">email ${esc(donor.dealer_name)} →</a>
    </p>
  </section>`;
}

export interface EducationalBlockOpts {
  eyebrow?: string;
  heading: string;
  paragraphs?: string[];
  bullets?: Array<{ lead: string; body: string }>;
}

/** "Why call instead of browsing a parts list?" — paragraph or bullet variant. */
export function renderEducationalBlock(opts: EducationalBlockOpts): string {
  const eyebrow = opts.eyebrow
    ? `<span style="display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);margin-bottom:4px">${esc(opts.eyebrow)}</span>`
    : '';
  const body = opts.bullets
    ? `<ul style="margin:0;padding:0;list-style:none">${opts.bullets.map((b, i) => `
        <li style="display:grid;grid-template-columns:14px 1fr;column-gap:8px;margin-top:${i === 0 ? 0 : 12}px;font-size:15px;line-height:23px;color:var(--color-ink-default)">
          <span aria-hidden style="color:var(--color-ink-strong);font-weight:700;line-height:23px">•</span>
          <span><strong style="font-weight:600;color:var(--color-ink-strong)">${esc(b.lead)}:</strong> ${esc(b.body)}</span>
        </li>`).join('')}</ul>`
    : (opts.paragraphs ?? []).map((p, i) =>
        `<p style="margin:${i === 0 ? 0 : '12px 0 0'};font-size:15px;line-height:23px;color:var(--color-ink-default)">${esc(p)}</p>`,
      ).join('');

  return `<section style="padding:24px 16px 0">
    <div style="background:var(--color-bg-subtle);border-radius:12px;padding:20px">
      ${eyebrow}
      <h2 style="font-size:17px;font-weight:600;margin:0 0 12px;color:var(--color-ink-strong);letter-spacing:-0.005em;line-height:24px">${esc(opts.heading)}</h2>
      ${body}
    </div>
  </section>`;
}

/** "About this donor car" — 2-col spec grid. */
export function renderSpecGrid(donor: DonorCarDetailRow): string {
  const cells: Array<[string, string, boolean]> = [
    ['Year', String(donor.year), true],
    ['Make', donor.make_name, false],
    ['Model', donor.model_name, false],
    ['Trim', donor.trim ?? '—', false],
    ['Generation', donor.generation_range ? `${donor.generation_range}${donor.generation_code ? ' (' + donor.generation_code + ')' : ''}` : (donor.generation_code ?? '—'), false],
    ['Engine', donor.engine ?? '—', false],
    ['Mileage', donor.mileage !== null ? formatKm(donor.mileage) : '—', true],
    ['Color (exterior)', donor.color_exterior_full ?? donor.color_exterior, false],
  ];
  const cellHtml = cells.map(([label, value, mono]) => `
    <div style="display:flex;flex-direction:column;gap:2px;padding:12px 0;border-bottom:1px solid var(--color-divider)">
      <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted)">${esc(label)}</span>
      <span style="font-size:15px;font-weight:500;color:var(--color-ink-strong);${mono ? "font-family:'IBM Plex Mono',monospace;" : ''}line-height:20px">${esc(value)}</span>
    </div>`).join('');
  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">About this donor car</h2>
    <div id="key-specs" style="display:grid;grid-template-columns:repeat(2,1fr);column-gap:16px">${cellHtml}</div>
  </section>`;
}

/**
 * Parse the parts_available JSON column into validated slugs. Unknown slugs
 * (taxonomy drift between old rows and current deploy) are dropped silently.
 */
export function parsePartsAvailable(donor: DonorCarDetailRow): DonorPartSlug[] {
  if (!donor.parts_available) return [];
  try {
    const v = JSON.parse(donor.parts_available);
    if (!Array.isArray(v)) return [];
    return v.filter((s): s is DonorPartSlug => typeof s === 'string' && s in DONOR_PART_LABELS);
  } catch { return []; }
}

/**
 * Deterministic availability sentence (Feature 4) — SEO body copy + FAQ
 * answer, built from the yard's own checklist. No generation, no fabrication.
 */
export function partsAvailableSentence(donor: DonorCarDetailRow, parts: DonorPartSlug[]): string {
  const labels = parts.map((s) => DONOR_PART_LABELS[s].toLowerCase());
  return `Available from this ${donor.year} ${donor.make_name} ${donor.model_name} donor in ${donor.city_name}: ${labels.join(', ')}.`;
}

/**
 * "Parts availability" — overview sentence from the checklist + free-form
 * notes. The per-part detail lives in renderPartsLongTail (H2/H3 sections)
 * right below this card, so no chips grid here. Rows without a checklist fall
 * back to notes-only, exactly the pre-0011 rendering.
 */
export function renderPartsAvailability(donor: DonorCarDetailRow): string {
  const parts = parsePartsAvailable(donor);
  const updated = relativeTimeFromUnix(donor.updated_at);

  const overview = parts.length > 0
    ? `<p style="margin:0;font-size:15px;line-height:23px;color:var(--color-ink-default)">${esc(partsAvailableSentence(donor, parts))}</p>`
    : '';

  const notes = donor.available_parts_notes
    ?? (parts.length > 0 ? null : 'No detailed availability notes — call the junkyard for specifics.');

  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">Parts availability</h2>
    <div style="background:var(--color-bg-subtle);border-radius:12px;padding:16px">
      ${overview}
      ${notes ? `<p style="margin:${parts.length > 0 ? '12px 0 0' : '0'};font-size:15px;line-height:23px;color:var(--color-ink-default);white-space:pre-wrap">${esc(notes)}</p>` : ''}
      <p style="margin:10px 0 0;font-size:12px;font-style:italic;color:var(--color-ink-muted)">Last updated ${esc(updated)} by ${esc(donor.dealer_name)}.</p>
    </div>
  </section>`;
}

/**
 * Year-fit label used across the GEO copy: compatible-years range when the
 * yard provided one, else generation_range, else the donor's own year.
 */
export function donorFitLabel(donor: DonorCarDetailRow): string {
  const compat = parseCompatibility(donor);
  if (compat.years.length > 0) return formatYearRange(compat.years);
  return donor.generation_range ?? String(donor.year);
}

/**
 * Lead answer paragraph (GEO): one extractable sentence right under the title
 * that answers "are there parts from a {year} {model} in {city}" outright.
 * Deterministic — built from row data only.
 */
export function renderDonorLead(donor: DonorCarDetailRow, parts: DonorPartSlug[]): string {
  const base = `${donor.year} ${donor.make_name} ${donor.model_name} donor car at ${donor.dealer_name} in ${donor.city_name}`;
  const text = parts.length > 0
    ? `${parts.length} used part${parts.length === 1 ? ' is' : 's are'} available from this ${base}, including ${parts.slice(0, 3).map((s) => DONOR_PART_LABELS[s].toLowerCase()).join(', ')}. Parts typically fit ${donorFitLabel(donor)} ${donor.model_name} models of the same generation.`
    : `This ${base} is being parted out — call the yard to confirm which parts are currently in stock.`;
  return `<section style="padding:12px 16px 0">
    <p style="margin:0;font-size:15px;line-height:23px;color:var(--color-ink-default)">${esc(text)}</p>
  </section>`;
}

/**
 * Long-tail part sections (GEO): one H2 per taxonomy group ("Body parts for
 * 2018 Toyota Corolla"), one H3 per available part ("Doors for 2018 Toyota
 * Corolla") with a keyword-complete catalog sentence. One donor page ranks
 * for dozens of "{part} {model} {year} {city}" queries without per-part
 * pages. Sections exist ONLY for ticked parts — nothing fabricated.
 */
export function renderPartsLongTail(donor: DonorCarDetailRow, parts: DonorPartSlug[]): string {
  if (parts.length === 0) return '';
  const fit = donorFitLabel(donor);
  const car = `${donor.year} ${donor.make_name} ${donor.model_name}`;
  return DONOR_PART_GROUPS.map((g) => {
    const inGroup = g.parts.filter((p) => parts.includes(p.slug));
    if (inGroup.length === 0) return '';
    return `<section style="padding:24px 16px 0">
    <h2 style="font-size:16px;font-weight:600;color:var(--color-ink-strong);margin:0 0 4px">${esc(`${g.label} for ${car}`)}</h2>
    <p style="margin:0 0 6px;font-size:13px;line-height:19px;color:var(--color-ink-muted)">Pulled from this donor at ${esc(donor.dealer_name)} — typically fits ${esc(fit)} ${esc(donor.model_name)} models. Confirm trim-specific fitment before purchase.</p>
    ${inGroup.map((p) => `<h3 style="font-size:14px;font-weight:600;color:var(--color-ink-strong);margin:10px 0 2px">${esc(`${p.label} for ${car}`)}</h3>
    <p style="margin:0;font-size:13px;line-height:19px;color:var(--color-ink-default)">Used ${esc(p.label.toLowerCase())} for the ${esc(car)} — available at ${esc(donor.dealer_name)} in ${esc(donor.city_name)}. Ask for condition photos and pricing when you call.</p>`).join('')}
  </section>`;
  }).join('');
}

/**
 * Closing summary (GEO "conclusions"): restates the key facts at the end of
 * the page — answer engines frequently extract the closing recap.
 */
export function renderDonorSummary(donor: DonorCarDetailRow, parts: DonorPartSlug[]): string {
  const car = `${donor.year} ${donor.make_name} ${donor.model_name}`;
  const partsText = parts.length > 0
    ? `Available parts include ${parts.map((s) => DONOR_PART_LABELS[s].toLowerCase()).join(', ')}. `
    : '';
  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 8px">Summary</h2>
    <p style="margin:0;font-size:14px;line-height:21px;color:var(--color-ink-default)">${esc(
      `This ${car} donor car is at ${donor.dealer_name}, a salvage yard in ${donor.city_name}, ${donor.dealer_province}. ` +
      partsText +
      `Most parts fit ${donorFitLabel(donor)} ${donor.model_name} models of the same generation. Availability changes as parts sell — call the yard to confirm stock and arrange pickup or shipping.`,
    )}</p>
  </section>`;
}

export interface CompatibilityParsed {
  models: string[];
  years: number[];
  trims: string[];
}

/** Parse the JSON-encoded compatibility columns into native arrays. */
export function parseCompatibility(donor: DonorCarDetailRow): CompatibilityParsed {
  const safe = <T>(s: string | null, fallback: T[]): T[] => {
    if (!s) return fallback;
    try { const v = JSON.parse(s); return Array.isArray(v) ? v as T[] : fallback; }
    catch { return fallback; }
  };
  return {
    models: safe<string>(donor.compatible_models, []),
    years: safe<number>(donor.compatible_years, []),
    trims: safe<string>(donor.compatible_trims, []),
  };
}

/** "Parts compatibility" — three rows: models / years / trims. */
export function renderCompatibilityCard(donor: DonorCarDetailRow): string {
  const compat = parseCompatibility(donor);
  const modelsLabel = compat.models.length > 0
    ? compat.models.map(m => prettify(m)).join(', ') + (donor.generation_code ? ` (${donor.generation_code} generation)` : '')
    : (donor.model_name + (donor.generation_code ? ` (${donor.generation_code})` : ''));
  const yearsLabel = compat.years.length > 0
    ? formatYearRange(compat.years)
    : (donor.generation_range ?? String(donor.year));
  const trimsLabel = compat.trims.length > 0 ? compat.trims.join(', ') : '—';

  const rows: Array<[string, string]> = [
    ['Models', modelsLabel],
    ['Years', yearsLabel],
    ['Trims', trimsLabel],
  ];
  const rowsHtml = rows.map(([label, value], i, arr) => `
    <div style="display:grid;grid-template-columns:70px 1fr;gap:12px;padding:10px 0;${i === arr.length - 1 ? '' : 'border-bottom:1px solid var(--color-divider)'}">
      <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted)">${esc(label)}</span>
      <span class="num" style="font-size:14px;font-weight:500;color:var(--color-ink-strong);line-height:20px">${esc(value)}</span>
    </div>`).join('');

  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">Parts compatibility</h2>
    <div style="background:var(--color-bg-subtle);border-radius:12px;padding:20px">
      <span style="display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);margin-bottom:12px">Parts from this donor fit</span>
      ${rowsHtml}
    </div>
    <p style="margin:12px 0 0;font-size:12px;line-height:18px;font-style:italic;color:var(--color-ink-muted)">Verify part-specific compatibility with the junkyard before purchase. Trim, transmission, and equipment options can affect fitment.</p>
  </section>`;
}

/** "About this junkyard" card — mirrors mockup section 10. */
export function renderJunkyardCard(donor: DonorCarDetailRow): string {
  const phone = donorPhone(donor.dealer_phone);
  const fullAddress = [
    donor.dealer_address_line1, donor.dealer_address_line2,
    donor.city_name, donor.dealer_province, donor.dealer_postal_code,
  ].filter(Boolean).join(', ') || `${donor.city_name}, ${donor.dealer_province}`;

  const specializesIn = formatSpecializesIn(donor);
  const today = computeTodayDow();
  const hoursRows = formatHoursForDisplay(donor.dealer_hours);
  const hoursHtml = hoursRows.map(h => {
    const isToday = h.dow.includes(today);
    return `<div style="display:flex;justify-content:space-between;font-size:13px;line-height:20px;color:${isToday ? 'var(--color-ink-strong)' : 'var(--color-ink-default)'};font-weight:${isToday ? 600 : 400}">
      <span>${esc(h.label)}</span><span class="num">${esc(h.hours)}</span>
    </div>`;
  }).join('');

  const contactRows: Array<[string, string, string]> = [];
  if (phone.tel) contactRows.push(['Phone', phone.display, `tel:${phone.tel}`]);
  contactRows.push(['Email', donor.dealer_email, `mailto:${donor.dealer_email}`]);
  if (donor.dealer_website) contactRows.push(['Web', donor.dealer_website.replace(/^https?:\/\//, ''), donor.dealer_website]);

  const contactHtml = contactRows.map(([label, value, href]) => `
    <div style="display:flex;align-items:baseline;gap:12px;padding:8px 0">
      <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);width:56px;flex-shrink:0">${esc(label)}</span>
      <a href="${esc(safeUrl(href))}" style="font-size:14px;color:var(--color-ink-strong);text-decoration:none;font-weight:500">${esc(value)}</a>
    </div>`).join('');

  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">About this junkyard</h2>
    <div style="background:var(--color-bg-subtle);border-radius:12px;padding:20px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--color-ink-strong);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;flex-shrink:0">${esc(donor.dealer_name.charAt(0).toUpperCase())}</div>
        <div style="min-width:0">
          <a href="/dealers/${esc(donor.dealer_slug)}/" style="font-size:17px;font-weight:600;color:var(--color-ink-strong);display:block;line-height:22px;text-decoration:none">${esc(donor.dealer_name)}</a>
          <span style="font-size:11px;color:var(--color-ink-muted)">Salvage yard · ${esc(donor.city_name)}, ${esc(donor.dealer_province)}${specializesIn ? ' · Specializes in ' + esc(specializesIn) : ''}</span>
        </div>
      </div>
      <p style="margin:16px 0 0;font-size:14px;color:var(--color-ink-default);line-height:20px">${esc(fullAddress)}</p>
      <div style="margin-top:16px">
        <span style="display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted);margin-bottom:6px">Open hours</span>
        ${hoursHtml}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--color-divider);padding-top:12px">
        ${contactHtml}
      </div>
      <a href="/dealers/${esc(donor.dealer_slug)}/" style="display:inline-block;margin-top:16px;font-size:13px;font-weight:500;color:var(--color-accent);text-decoration:none">View junkyard profile →</a>
    </div>
  </section>`;
}

/** Small italic disclaimer block. */
export function renderDisclaimer(): string {
  return `<section style="padding:32px 32px 0">
    <p style="margin:0;font-size:11px;line-height:17px;font-style:italic;text-align:center;color:var(--color-ink-subtle)">
      Information provided by junkyard. Verify part fitment, condition, and compatibility before purchase. japanauto.ca is a marketplace and is not a party to the transaction.
    </p>
  </section>`;
}

/** "More <model> donors at this junkyard" or "in <city>" section. */
export function renderRelatedDonors(donors: DonorCardRow[], heading: string, cfHash: string): string {
  if (donors.length === 0) {
    return `<section style="padding:32px 16px 0">
      <h2 style="font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:var(--color-ink-strong);margin:0 0 8px">${esc(heading)}</h2>
      <p style="margin:0;font-size:13px;color:var(--color-ink-muted)">No other matching donor cars listed yet. Check back soon.</p>
    </section>`;
  }
  const cards = donors.map(d => donorCardHtml(d, cfHash)).join('');
  return `<section style="padding:32px 0 0">
    <h2 style="padding:0 16px;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:var(--color-ink-strong);margin:0 0 12px">${esc(heading)}</h2>
    <div style="padding:0 16px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cards}</div>
  </section>`;
}

function donorCardHtml(d: DonorCardRow, cfHash: string): string {
  const trim = d.trim ?? '';
  const newToday = (Math.floor(Date.now() / 1000) - d.created_at) < 86400;
  const km = d.mileage !== null ? `<span class="num">${fmt(d.mileage)}</span> km` : '—';
  const trans = formatTransmission(d.transmission);
  const photo = d.primary_image_cf_id && cfHash
    ? `<img src="${esc(cfImageUrl(cfHash, d.primary_image_cf_id, 'public'))}" alt="${esc(d.primary_image_alt ?? '')}" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
    : renderTonePlaceholder(d.tone, 'three-quarter');
  return `<a href="/parts/listing/${esc(d.slug)}/" class="card" style="display:flex;flex-direction:column;overflow:hidden;text-decoration:none;color:inherit;position:relative;border:1px solid var(--color-divider);border-radius:12px;background:#fff">
    <div style="aspect-ratio:4 / 3;width:100%;position:relative;overflow:hidden;background:var(--color-bg-muted)">
      ${photo}
      ${newToday ? `<span style="position:absolute;top:8px;left:8px;background:var(--color-accent);color:#fff;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:4px">New today</span>` : ''}
    </div>
    <div style="padding:12px 12px 14px;display:flex;flex-direction:column;gap:4px">
      <span style="font-size:10px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted)">Donor car${d.generation_range ? ' · ' + esc(d.generation_range) + ' generation' : ''}</span>
      <span style="font-size:15px;font-weight:600;color:var(--color-ink-strong);letter-spacing:-0.005em;line-height:20px"><span class="num">${d.year}</span>${trim ? ' ' + esc(trim) : ''}</span>
      <span style="font-size:13px;color:var(--color-ink-default);line-height:18px">${esc(d.color_exterior)} · ${km} · ${esc(trans)}</span>
      <span style="margin-top:4px;font-size:10px;font-weight:500;letter-spacing:0.04em;color:var(--color-ink-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.dealer_name)} · ${esc(d.city_name)}</span>
    </div>
  </a>`;
}

/** Cross-CMA city grid — "donors in other Canadian cities". */
export function renderCityCountGrid(
  rows: DonorCityCountRow[], makeSlug: string, modelSlug: string, headingText: string,
): string {
  if (rows.length === 0) {
    return `<section style="padding:32px 16px 0">
      <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">${esc(headingText)}</h2>
      <p style="margin:0;font-size:13px;color:var(--color-ink-muted)">No other cities listing this donor model yet.</p>
    </section>`;
  }
  const cards = rows.map(r => `
    <a href="/${esc(r.city_slug)}/parts/${esc(makeSlug)}/${esc(modelSlug)}/" class="card" style="padding:12px 14px;text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:2px;border:1px solid var(--color-divider);border-radius:12px;background:#fff">
      <span style="font-size:14px;font-weight:600;color:var(--color-ink-strong)">${esc(r.city_name)}</span>
      <span style="font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-ink-muted)"><span class="num">${r.count}</span> donor${r.count === 1 ? '' : 's'}</span>
    </a>`).join('');
  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:17px;font-weight:600;color:var(--color-ink-strong);margin:0 0 12px">${esc(headingText)}</h2>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${cards}</div>
  </section>`;
}

export interface FaqItem { q: string; a: string }

/** FAQ accordion (uses native `<details>` so no JS needed). */
export function renderFaqList(heading: string, faqs: FaqItem[]): string {
  return `<section style="padding:32px 16px 0">
    <h2 style="font-size:20px;line-height:28px;font-weight:600;letter-spacing:-0.005em;color:var(--color-ink-strong);margin:0 0 12px">${esc(heading)}</h2>
    <div>
      ${faqs.map((f, i) => `
        <details${i === 0 ? ' open' : ''} style="border-top:${i === 0 ? '1px solid var(--color-divider)' : 'none'};border-bottom:1px solid var(--color-divider);padding:14px 0">
          <summary style="cursor:pointer;font-size:15px;font-weight:600;color:var(--color-ink-strong);line-height:22px;list-style:none">${esc(f.q)}</summary>
          <p style="margin:8px 0 0;font-size:14px;line-height:21px;color:var(--color-ink-default)">${esc(f.a)}</p>
        </details>`).join('')}
    </div>
  </section>`;
}

/** Site footer. */
export function renderFooter(): string {
  return `<footer role="contentinfo" style="margin-top:32px;padding:24px 16px 32px;border-top:1px solid var(--color-divider);color:var(--color-ink-muted);font-size:12px">
    <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center">
      <span style="font-weight:600;color:var(--color-ink-strong);font-size:14px">japanauto.ca</span>
      <nav aria-label="Footer" style="display:flex;gap:14px">
        <a href="/" style="color:inherit;text-decoration:none">Home</a>
        <a href="/used-cars/" style="color:inherit;text-decoration:none">Cars</a>
        <a href="/parts/" style="color:inherit;text-decoration:none">Parts</a>
        <a href="/dealers/" style="color:inherit;text-decoration:none">Dealers</a>
      </nav>
    </div>
    <p style="margin:12px 0 0">Canadian marketplace for used Japanese cars and parts donor cars.</p>
  </footer>`;
}

/** Sticky bottom contact bar. Hidden on depleted donors. Toggled visible by IntersectionObserver. */
export function renderPartsStickyBar(donor: DonorCarDetailRow, primaryPhoto: MediaPublic | undefined, cfHash: string): string {
  const phone = donorPhone(donor.dealer_phone);
  if (!phone.tel) return '';
  const trim = donor.trim ?? '';
  const thumb = primaryPhoto && cfHash
    ? `<img src="${esc(cfImageUrl(cfHash, primaryPhoto.image_id, 'public'))}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" />`
    : renderTonePlaceholder(donor.tone, 'three-quarter');
  return `<div id="parts-sticky-bar" role="region" aria-label="Contact junkyard" style="position:fixed;left:0;right:0;bottom:0;height:64px;padding:0 16px;padding-bottom:env(safe-area-inset-bottom);background:#fff;border-top:1px solid var(--color-divider);box-shadow:0 -4px 16px rgba(0,0,0,0.04);display:flex;align-items:center;gap:10px;z-index:40;transform:translateY(100%);transition:transform 200ms ease-out;will-change:transform">
    <div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:var(--color-bg-muted);flex-shrink:0">${thumb}</div>
    <div style="flex:1;min-width:0">
      <p style="margin:0;font-size:13px;font-weight:600;color:var(--color-ink-strong);line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span class="num">${donor.year}</span> ${esc(donor.model_name)}${trim ? ' ' + esc(trim) : ''} <span style="color:var(--color-ink-muted);font-weight:500">· Donor</span></p>
      <p style="margin:0;font-size:12px;font-weight:500;color:var(--color-ink-muted);line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(donor.dealer_name)} · ${esc(donor.city_name)}</p>
    </div>
    <a href="tel:${esc(phone.tel)}" data-event="donor-call-sticky" data-donor-id="${esc(donor.id)}" aria-label="Call ${esc(donor.dealer_name)}" style="width:44px;height:44px;border-radius:8px;background:var(--color-accent);color:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none;flex-shrink:0;font-size:18px">☎</a>
    <a href="mailto:${esc(donor.dealer_email)}" aria-label="Email ${esc(donor.dealer_name)}" style="width:44px;height:44px;border-radius:8px;background:#fff;color:var(--color-ink-strong);border:1px solid var(--color-ink-strong);display:flex;align-items:center;justify-content:center;text-decoration:none;flex-shrink:0;font-size:16px">✉</a>
  </div>`;
}

/** Inline IntersectionObserver script — toggles `.visible` on the sticky bar
 *  once the user scrolls past the spec grid. Pure JS, no library. Takes the
 *  per-request CSP nonce — script-src has no 'unsafe-inline' (audit #18). */
export function renderStickyBarObserverScript(nonce: string): string {
  return `<script nonce="${esc(nonce)}">(function(){
  var bar = document.getElementById('parts-sticky-bar');
  var trigger = document.getElementById('key-specs');
  if (!bar || !trigger || !('IntersectionObserver' in window)) {
    if (bar) bar.style.transform = 'translateY(0)';
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      bar.style.transform = e.isIntersecting && e.boundingClientRect.top >= 0
        ? 'translateY(100%)'
        : 'translateY(0)';
    });
  }, { rootMargin: '-50px 0px 0px 0px' });
  io.observe(trigger);
})();</script>`;
}

/** "Donor not found" 404 body. */
export function render404DonorBody(slug: string): string {
  return `<main style="padding:48px 16px;text-align:center">
    <h1 style="font-size:24px;margin:0 0 12px;color:var(--color-ink-strong)">Donor car not found</h1>
    <p style="color:var(--color-ink-muted);font-size:14px;margin:0 0 16px">The donor car at slug <code style="font-family:'IBM Plex Mono',monospace;font-size:13px;background:var(--color-bg-subtle);padding:2px 6px;border-radius:4px">${esc(slug)}</code> may have been removed or fully parted out.</p>
    <p style="margin:0"><a href="/parts/" style="color:var(--color-ink-strong);font-weight:500">Browse all donor cars →</a></p>
  </main>`;
}

// ============================================================================
// Internals
// ============================================================================

function prettify(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function relativeTimeFromUnix(ts: number): string {
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (ageSec < 86_400) return 'today';
  const days = Math.floor(ageSec / 86_400);
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** Format a Year array into a compact range string ("2014–2018" or "2014, 2016, 2018"). */
function formatYearRange(years: number[]): string {
  if (years.length === 0) return '—';
  const sorted = [...years].sort((a, b) => a - b);
  let contiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]! - sorted[i - 1]! !== 1) { contiguous = false; break; }
  }
  if (contiguous && sorted.length > 1) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  return sorted.join(', ');
}

/** Derive "Specializes in: Toyota, Honda" line from compatible_makes JSON. */
function formatSpecializesIn(donor: DonorCarDetailRow): string {
  if (!donor.compatible_makes) return '';
  try {
    const arr = JSON.parse(donor.compatible_makes);
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.slice(0, 3).map((s) => prettify(String(s))).join(', ');
  } catch { return ''; }
}

interface FormattedHoursRow { label: string; hours: string; dow: number[] }

/**
 * Format dealer hours for display. Falls back to a sensible default Mon–Fri /
 * Saturday / Sunday pattern when the dealer has no hours set, so the section
 * never looks empty.
 */
function formatHoursForDisplay(
  rows: Array<{ dow: number[]; open: string | null; close: string | null }> | null,
): FormattedHoursRow[] {
  if (!rows || rows.length === 0) {
    return [
      { label: 'Mon–Fri',  hours: '8:00 – 17:00', dow: [1, 2, 3, 4, 5] },
      { label: 'Saturday', hours: '9:00 – 14:00', dow: [6] },
      { label: 'Sunday',   hours: 'Closed',       dow: [0] },
    ];
  }
  return rows.map(r => {
    const dows = [...r.dow].sort((a, b) => a - b);
    const label = dows.length === 1
      ? DOW_FULL[dows[0]!]!
      : `${DOW_SHORT[dows[0]!]!}–${DOW_SHORT[dows[dows.length - 1]!]!}`;
    const hoursStr = r.open && r.close ? `${r.open} – ${r.close}` : 'Closed';
    return { label, hours: hoursStr, dow: dows };
  });
}

/**
 * src/lib/schema-graph.ts — Schema.org @graph helpers for SSG content pages.
 *
 * Phase 4.1 templates pass the result of one of these helpers into the
 * BaseLayout `schemaLD` prop, which slots it under the existing
 * Organization + WebSite root graph (see src/layouts/BaseLayout.astro).
 *
 * Keep helpers narrow — each template composes its own @graph by combining
 * the breadcrumb, FAQ, and entity-specific node.
 */

const SITE = 'https://japanauto.ca';

export interface CrumbInput {
  label: string;
  href?: string; // omit for the leaf node
}

export function breadcrumbList(items: CrumbInput[], pageUrl: string): object {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: absUrl(c.href, pageUrl) } : {}),
    })),
  };
}

export function faqPage(
  questions: string[],
  answers: Array<string | null> = [],
): object | null {
  if (!questions.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: questions.map((q, i) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answers[i] ?? 'Coming soon — see related guides.',
      },
    })),
  };
}

export interface ItemListItem {
  name: string;
  url: string;
}

export function itemList(items: ItemListItem[], name?: string): object | null {
  if (!items.length) return null;
  return {
    '@type': 'ItemList',
    ...(name ? { name } : {}),
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

/**
 * Resolve a relative href against the absolute page URL. Falls back to the
 * site root when no href is supplied (used for breadcrumb leaves).
 */
function absUrl(href: string, pageUrl: string): string {
  if (/^https?:\/\//.test(href)) return href;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return `${SITE}${href}`;
  }
}

export const AUTHOR_BIOS: Record<
  string,
  { name: string; url: string; role: string }
> = {
  'marc-tremblay': {
    name: 'Marc Tremblay',
    url: `${SITE}/editorial-team/#marc-tremblay`,
    role: 'Senior Editor — Eastern Canada',
  },
  'sarah-chen': {
    name: 'Sarah Chen',
    url: `${SITE}/editorial-team/#sarah-chen`,
    role: 'Senior Editor — Western Canada',
  },
  'japanauto-editorial': {
    name: 'japanauto.ca Editorial',
    url: `${SITE}/editorial-team/`,
    role: 'Editorial Team',
  },
};

export const CATEGORY_LABELS: Record<string, string> = {
  'buying-guides': 'Buying guides',
  'model-deep-dives': 'Model deep-dives',
  'canada-regulations': 'Canadian regulations',
  'parts-101': 'Parts 101',
  news: 'News & market trends',
};

export const CATEGORY_ORDER: string[] = [
  'buying-guides',
  'model-deep-dives',
  'canada-regulations',
  'parts-101',
  'news',
];

export const GROUP_LABELS: Record<string, string> = {
  'vehicle-tech': 'Vehicle technology',
  'brand-specific-tech': 'Brand-specific technology',
  marketplace: 'Marketplace',
  'canadian-regulations': 'Canadian regulations',
  parts: 'Parts',
};

export function readingTime(estWordCount?: string): number {
  if (!estWordCount) return 6;
  // Briefs use ranges like "1800-2200" — average them, divide by 250 wpm.
  const m = String(estWordCount).match(/(\d+)\s*[-–]?\s*(\d+)?/);
  if (!m) return 6;
  const lo = parseInt(m[1] ?? '0', 10);
  const hi = m[2] ? parseInt(m[2], 10) : lo;
  const avg = (lo + hi) / 2 || lo;
  return Math.max(3, Math.round(avg / 250));
}

export function stripUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''));
  } catch {
    return url;
  }
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatIsoDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

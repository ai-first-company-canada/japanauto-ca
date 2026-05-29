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
  // Only emit Q&A pairs that have a REAL answer. Google's FAQPage policy forbids
  // placeholder/invisible answers and requires the markup to match visible
  // content — emitting "Coming soon" for unanswered questions risks a
  // structured-data manual action. If nothing has a real answer, omit the node.
  const pairs = questions
    .map((q, i) => ({ q, a: answers[i] }))
    .filter((p): p is { q: string; a: string } =>
      typeof p.a === 'string' && p.a.trim().length > 0);
  if (!pairs.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: pairs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
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

export interface AuthorBio {
  name: string;
  url: string;
  role: string;
}

// Author lookup accepts BOTH the Phase 4.1 skeleton slug form
// (`marc-tremblay`) and the Phase 4.2 content-factory display-name form
// (`Marc Tremblay`). Falls back to the editorial collective when no key
// matches so a missing/typo author never breaks rendering.
const AUTHOR_BIOS_BY_KEY: Record<string, AuthorBio> = {
  'marc-tremblay': {
    name: 'Marc Tremblay',
    url: `${SITE}/editorial-team/#marc-tremblay`,
    role: 'Senior Editor — Eastern Canada',
  },
  'marc tremblay': {
    name: 'Marc Tremblay',
    url: `${SITE}/editorial-team/#marc-tremblay`,
    role: 'Senior Editor — Eastern Canada',
  },
  'sarah-chen': {
    name: 'Sarah Chen',
    url: `${SITE}/editorial-team/#sarah-chen`,
    role: 'Senior Editor — Western Canada',
  },
  'sarah chen': {
    name: 'Sarah Chen',
    url: `${SITE}/editorial-team/#sarah-chen`,
    role: 'Senior Editor — Western Canada',
  },
  'japanauto-editorial': {
    name: 'japanauto.ca Editorial',
    url: `${SITE}/editorial-team/`,
    role: 'Editorial Team',
  },
  'japanauto.ca editorial team': {
    name: 'japanauto.ca Editorial',
    url: `${SITE}/editorial-team/`,
    role: 'Editorial Team',
  },
};

const EDITORIAL_FALLBACK: AuthorBio = AUTHOR_BIOS_BY_KEY['japanauto-editorial']!;

export function authorBio(raw: string | undefined): AuthorBio {
  if (!raw) return EDITORIAL_FALLBACK;
  return AUTHOR_BIOS_BY_KEY[raw.toLowerCase().trim()] ?? EDITORIAL_FALLBACK;
}

/** @deprecated retained for back-compat — call `authorBio()` instead. */
export const AUTHOR_BIOS = AUTHOR_BIOS_BY_KEY;

/**
 * Phase 4.2 dropped `category` from blog frontmatter. When missing, infer
 * one from slug heuristics. Mirrors the 5 categories of the Phase 4.1 hub.
 */
export function deriveBlogCategory(slug: string, fallback: string | undefined): string {
  if (fallback) return fallback;
  const s = slug.toLowerCase();
  if (/(amvic|omvic|uvip|riv|gst|hst|pst|tax|regulation|safety-inspection|salvage)/.test(s)) {
    return 'canada-regulations';
  }
  if (/(market|quarterly|recall|trends|adoption)/.test(s)) {
    return 'news';
  }
  if (/(buying|how-to-buy|pre-purchase|inspection|guide)/.test(s)) {
    return 'buying-guides';
  }
  if (/(parts|oem|aftermarket|filter|brake|battery|fluid)/.test(s)) {
    return 'parts-101';
  }
  // Model deep-dives — anything with a brand+model combo
  return 'model-deep-dives';
}

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

export interface BlogCategory {
  slug: string;
  label: string;
  description: string;
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: 'buying-guides',
    label: 'Buying guides',
    description: 'How to evaluate, inspect, and price used Japanese cars in Canada — pre-purchase inspections, dealer verification, taxes and fees.',
  },
  {
    slug: 'model-deep-dives',
    label: 'Model deep-dives',
    description: 'Used Japanese vehicle reviews focused on Canadian winter performance, reliability data, and known generation issues.',
  },
  {
    slug: 'canada-regulations',
    label: 'Canadian regulations',
    description: 'Provincial dealer licensing (AMVIC, OMVIC, VSA), import processes (RIV), safety inspections, and consumer protection.',
  },
  {
    slug: 'parts-101',
    label: 'Parts 101',
    description: 'Used Japanese parts buying — junkyard donor cars, OEM vs aftermarket, compatibility across generations.',
  },
  {
    slug: 'news',
    label: 'News & market trends',
    description: 'Quarterly market updates — EV adoption, JDM imports, used-car pricing trends across Toronto, Calgary, Vancouver.',
  },
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

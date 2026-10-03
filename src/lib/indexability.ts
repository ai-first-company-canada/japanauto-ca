/**
 * src/lib/indexability.ts — one rule for "may this URL be indexed?".
 *
 * Inventory templates (city × make × model, parts directories) are indexable
 * only once they show real inventory. With an empty catalog they render an
 * "onboarding" empty state that is ~90% identical across cities — a soft-404 /
 * doorway pattern that would set a poor quality baseline on a new domain
 * (tech-SEO audit 2026-10-03, B1). They stay crawlable (`noindex, follow`) so
 * link equity still flows, and flip to indexable on the first build after
 * inventory lands — no template change needed.
 *
 * Exception (2026-10-03): a city × model page with a public price table
 * (Calgary pilot, src/lib/market.ts) answers the query on its own, so it is
 * indexable without listings; so is its city × make hub when any model has one.
 *
 * BaseLayout derives the robots meta from the pathname, and the static
 * sitemap filters through the same function, so the two can never disagree.
 */
import { getCollection } from 'astro:content';
import { liveCounts } from '../data/live-counts';
import { TIER_1_CITIES } from '../data/brand-content';
import { MODELS_BY_BRAND } from '../data/models-stubs';
import { BLOG_CATEGORIES, deriveBlogCategory } from './schema-graph';
import { hasMarketTable } from './market';

/** Minimum live listings before an inventory page is worth indexing. */
export const MIN_INDEXABLE_LISTINGS = 1;

const CITY_SLUGS = new Set(TIER_1_CITIES.map((c) => c.slug));
const MAKE_SLUGS = new Set(Object.keys(MODELS_BY_BRAND));
const ok = (n: number) => n >= MIN_INDEXABLE_LISTINGS;

let blogCounts: Map<string, number> | undefined;
async function blogCategoryCount(slug: string): Promise<number> {
  if (!blogCounts) {
    blogCounts = new Map();
    for (const p of await getCollection('blog')) {
      const c = deriveBlogCategory(p.data.slug, p.data.category);
      blogCounts.set(c, (blogCounts.get(c) ?? 0) + 1);
    }
  }
  return blogCounts.get(slug) ?? 0;
}

/**
 * True when the page at `pathname` should be indexed. Unknown paths default
 * to indexable — only inventory templates are gated here.
 */
export async function isIndexable(pathname: string): Promise<boolean> {
  const s = pathname.split('/').filter(Boolean);

  // Parts directories: donor cars are not exported to SSG yet, so every
  // parts page below the /parts/ hub is an empty directory.
  if (s[0] === 'parts' && s.length >= 2 && s[1] !== 'listing') return false;
  if (CITY_SLUGS.has(s[0]!) && s[1] === 'parts') return false;

  if (s[0] === 'used-cars' && MAKE_SLUGS.has(s[1]!)) {
    if (s.length === 2) return ok(liveCounts.brand(s[1]!));
    if (s.length === 3) return ok(liveCounts.brandModel(s[1]!, s[2]!));
  }

  if (CITY_SLUGS.has(s[0]!) && MAKE_SLUGS.has(s[1]!)) {
    if (s.length === 2) {
      return ok(liveCounts.cityBrand(s[0]!, s[1]!))
        || (MODELS_BY_BRAND[s[1]!] ?? []).some((m) => hasMarketTable(s[0]!, s[1]!, m.slug));
    }
    if (s.length === 3) {
      return ok(liveCounts.cityModel(s[0]!, s[1]!, s[2]!)) || hasMarketTable(s[0]!, s[1]!, s[2]!);
    }
  }

  if (s[0] === 'blog' && s.length === 2) {
    // Posts and category hubs share this depth; gate only empty categories.
    if (BLOG_CATEGORIES.some((c) => c.slug === s[1])) {
      return (await blogCategoryCount(s[1]!)) > 0;
    }
  }

  return true;
}

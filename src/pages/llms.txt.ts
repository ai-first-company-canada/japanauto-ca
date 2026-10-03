/**
 * /llms.txt — generated from the content collections on every build, so it
 * can't link to posts that were never published (the hand-written copy in
 * public/ had 7 dead blog links by 2026-10). Inventory URLs are listed only
 * when indexable (src/lib/indexability.ts).
 */
import { getCollection } from 'astro:content';
import { TIER_1_CITIES } from '../data/brand-content';
import { MODELS_BY_BRAND } from '../data/models-stubs';
import { isIndexable } from '../lib/indexability';
import { SITE } from '../lib/markdown-alternates';

export const prerender = true;

const oneLine = (s: string, max = 220) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, t.lastIndexOf(' ', max))}…` : t;
};

export async function GET() {
  const [blog, glossary, brands] = await Promise.all([
    getCollection('blog'), getCollection('glossary'), getCollection('brand'),
  ]);
  const posts = blog
    .filter((p) => p.data.body_status === 'published')
    .sort((a, b) => (b.data.last_reviewed ?? b.data.pub_date ?? '').localeCompare(a.data.last_reviewed ?? a.data.pub_date ?? ''));
  const terms = glossary.slice().sort((a, b) => a.data.term.localeCompare(b.data.term));

  const inventory: string[] = [];
  for (const make of Object.keys(MODELS_BY_BRAND)) {
    for (const city of TIER_1_CITIES) {
      const path = `/${city.slug}/${make}/`;
      if (await isIndexable(path)) inventory.push(`- [Used ${make} in ${city.name}](${SITE}${path})`);
    }
  }

  const lines = [
    '# japanauto.ca',
    '',
    '> Independent Canadian marketplace for used Japanese cars (Toyota, Honda, Nissan, Mazda, Subaru, Lexus, Acura, Infiniti, Mitsubishi) and salvage-yard donor cars in Toronto, Montreal, Vancouver, Calgary, Edmonton and Ottawa. Buyers contact dealers directly; no buyer account is needed.',
    '',
    'Editorial pages (brand guides, buying guides, glossary) cite their primary sources at the end of each page and show a last-reviewed date. Every editorial page has a Markdown twin: replace the trailing slash with `.md` (e.g. /glossary/abs/ → /glossary/abs.md).',
    '',
    '## Marketplace',
    `- [Used Japanese cars in Canada](${SITE}/used-cars/): catalog across 9 brands and 6 cities.`,
    `- [Donor-car parts directory](${SITE}/parts/): salvage-yard donor cars by make, model and city.`,
    `- [Dealers](${SITE}/dealers/): provincially licensed dealers and salvage yards listed on the site.`,
    ...TIER_1_CITIES.map((c) => `- [${c.name}, ${c.province}](${SITE}/${c.slug}/): used Japanese cars in ${c.name}.`),
    ...inventory,
    '',
    '## Brand guides',
    ...brands.map((b) => `- [${b.data.h1 ?? b.data.suggested_h1}](${SITE}/brands/${b.data.make}/): ${oneLine(b.data.meta_description)}`),
    '',
    '## Buying guides and articles',
    ...posts.map((p) => `- [${p.data.title}](${SITE}/blog/${p.data.slug}/): ${oneLine(p.data.tldr_draft)}`),
    '',
    '## Glossary',
    ...terms.map((t) => `- [${t.data.term}](${SITE}/glossary/${t.data.slug}/): ${oneLine(t.data.canonical_definition, 160)}`),
    '',
    '## About',
    `- [About japanauto.ca](${SITE}/about/)`,
    `- [Editorial policy](${SITE}/editorial-policy/)`,
    `- [Editorial team](${SITE}/editorial-team/)`,
    `- [Contact](${SITE}/contact/)`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

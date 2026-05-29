import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { MODELS_BY_BRAND } from '../data/models-stubs';
import { TIER_1_CITIES } from '../data/brand-content';
import { BLOG_CATEGORIES } from '../lib/schema-graph';

export const prerender = true;

const SITE = 'https://japanauto.ca';

const MAKES = Object.keys(MODELS_BY_BRAND);

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority: number;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlBlock(u: UrlEntry): string {
  const parts = [`    <loc>${xmlEscape(u.loc)}</loc>`];
  if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
  if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
  parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

export async function GET({ site }: APIContext) {
  const base = (site?.toString() ?? SITE).replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);

  const urls: UrlEntry[] = [];

  // ---- Top hubs ------------------------------------------------------------
  urls.push({ loc: `${base}/`, lastmod: today, changefreq: 'daily', priority: 1.0 });
  urls.push({ loc: `${base}/used-cars/`, changefreq: 'hourly', priority: 0.8 });
  urls.push({ loc: `${base}/parts/`, changefreq: 'hourly', priority: 0.8 });
  urls.push({ loc: `${base}/brands/`, changefreq: 'monthly', priority: 0.6 });
  urls.push({ loc: `${base}/blog/`, changefreq: 'weekly', priority: 0.6 });
  urls.push({ loc: `${base}/glossary/`, changefreq: 'monthly', priority: 0.6 });
  urls.push({ loc: `${base}/dealers/`, changefreq: 'daily', priority: 0.6 });
  urls.push({ loc: `${base}/editorial-team/`, changefreq: 'monthly', priority: 0.4 });
  urls.push({ loc: `${base}/editorial-policy/`, changefreq: 'monthly', priority: 0.4 });

  // ---- /[city]/ city hubs
  for (const city of TIER_1_CITIES) {
    urls.push({ loc: `${base}/${city.slug}/`, changefreq: 'daily', priority: 0.8 });
  }

  // ---- /used-cars/[make]/ (national brand), /used-cars/[make]/[model]/ (national model),
  //      /[city]/[make]/ (brand+city), /[city]/[make]/[model]/ (model+city)
  for (const make of MAKES) {
    urls.push({ loc: `${base}/used-cars/${make}/`, changefreq: 'daily', priority: 0.6 });
    for (const city of TIER_1_CITIES) {
      urls.push({
        loc: `${base}/${city.slug}/${make}/`,
        changefreq: 'daily', priority: 0.7,
      });
    }
    const models = MODELS_BY_BRAND[make] ?? [];
    for (const model of models) {
      urls.push({
        loc: `${base}/used-cars/${make}/${model.slug}/`,
        changefreq: 'weekly', priority: 0.5,
      });
      for (const city of TIER_1_CITIES) {
        urls.push({
          loc: `${base}/${city.slug}/${make}/${model.slug}/`,
          changefreq: 'daily', priority: 0.7,
        });
      }
    }
  }

  // ---- /[city]/parts/ (city parts hub), /parts/[make]/ (national brand parts),
  //      /[city]/parts/[make]/ (brand+city), /parts/[make]/[model]/ (national model),
  //      /[city]/parts/[make]/[model]/ (model+city)
  for (const city of TIER_1_CITIES) {
    urls.push({ loc: `${base}/${city.slug}/parts/`, changefreq: 'daily', priority: 0.6 });
  }
  for (const make of MAKES) {
    urls.push({ loc: `${base}/parts/${make}/`, changefreq: 'daily', priority: 0.6 });
    for (const city of TIER_1_CITIES) {
      urls.push({
        loc: `${base}/${city.slug}/parts/${make}/`,
        changefreq: 'daily', priority: 0.7,
      });
    }
    const models = MODELS_BY_BRAND[make] ?? [];
    for (const model of models) {
      urls.push({
        loc: `${base}/parts/${make}/${model.slug}/`,
        changefreq: 'weekly', priority: 0.5,
      });
      for (const city of TIER_1_CITIES) {
        urls.push({
          loc: `${base}/${city.slug}/parts/${make}/${model.slug}/`,
          changefreq: 'daily', priority: 0.7,
        });
      }
    }
  }

  // ---- /brands/[make]/
  const brandColl = await getCollection('brand');
  for (const b of brandColl) {
    urls.push({
      loc: `${base}/brands/${b.data.make}/`,
      lastmod: b.data.last_reviewed ?? undefined,
      changefreq: 'monthly',
      priority: 0.7,
    });
  }

  // ---- /blog/[slug]/ + /blog/[category]/
  const blog = await getCollection('blog');
  for (const p of blog) {
    urls.push({
      loc: `${base}/blog/${p.data.slug}/`,
      lastmod: p.data.last_reviewed ?? p.data.pub_date ?? undefined,
      changefreq: 'monthly',
      priority: 0.6,
    });
  }
  for (const c of BLOG_CATEGORIES) {
    urls.push({
      loc: `${base}/blog/${c.slug}/`,
      changefreq: 'weekly',
      priority: 0.5,
    });
  }

  // ---- /glossary/[term]/
  const glossary = await getCollection('glossary');
  for (const t of glossary) {
    urls.push({
      loc: `${base}/glossary/${t.data.slug}/`,
      lastmod: t.data.last_reviewed ?? undefined,
      changefreq: 'monthly',
      priority: t.data.priority === 1 ? 0.7 : 0.6,
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(urlBlock).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

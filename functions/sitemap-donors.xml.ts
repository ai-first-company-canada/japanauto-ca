import type { Env } from '../types/env';

const SITE_FALLBACK = 'https://japanauto.ca';

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const base = (env.PUBLIC_SITE_URL || SITE_FALLBACK).replace(/\/$/, '');

  // Depleted donors stay indexed — they render a "fully parted out" Schema.org
  // SoldOut variant that's still citable. Drafts and expired rows are excluded.
  const result = await env.DB.prepare(
    `SELECT slug, updated_at
       FROM donor_cars
      WHERE status IN ('active', 'depleted')
        AND frozen_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 50000`,
  ).all<{ slug: string; updated_at: number }>();

  const rows = result.results ?? [];

  const urls = rows.map((r) => {
    const lastmod = new Date(r.updated_at * 1000).toISOString().slice(0, 10);
    return `  <url><loc>${xmlEscape(`${base}/parts/listing/${r.slug}/`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};

import type { APIContext } from 'astro';

export const prerender = true;

const SITE = 'https://japanauto.ca';

export async function GET({ site }: APIContext) {
  const base = (site?.toString() ?? SITE).replace(/\/$/, '');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-listings.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-donors.xml</loc></sitemap>
</sitemapindex>
`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

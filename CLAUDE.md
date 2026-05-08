## 2026-05-04 — Phase 0 + Phase 1 complete

Stack pins: TS 5.6.3, Tailwind 4.1.18 via @tailwindcss/vite, Astro 6.2.2.
Wrangler.toml Pages mode: no account_id, no [env.dev], no [images] block.
esbuild Astro frontmatter: TS unions on single line (multi-line leading-pipe breaks).
Edge geo: HTMLRewriter patches data-geo='...' (text) + data-geo-href='...' (href template).
StickyBar pattern: data-sticky-trigger + IntersectionObserver inline script.
setCityCookie helper in BaseLayout writes jc_city + jc_province + reload.

Phase 2 deferred: filter Apply wire-up to /api/listings, dealer profile pages
/dealers/[slug]/, photo lightbox, hours today highlighting (client JS), real
dealer/listing data from D1 instead of stubs.

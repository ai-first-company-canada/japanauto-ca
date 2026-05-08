// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Cloudflare Images delivery hash — inlined at build time. Set in Cloudflare
// Pages → Build & Deploy → Environment Variables (production scope).
const CF_ACCOUNT_HASH = process.env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? '';

// Pure-static build. Phase 2c2b dynamic routes (listing detail, dealer
// profile) live in Pages Functions (functions/used-cars/listing/[slug].ts and
// functions/dealers/[slug].ts) — they fetch D1 and return rendered HTML, so
// the Astro page templates for those slugs emit empty getStaticPaths and the
// Pages Function intercepts the request.
export default defineConfig({
  site: 'https://japanauto.ca',
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: 'lightningcss',
    },
    define: {
      'import.meta.env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH': JSON.stringify(CF_ACCOUNT_HASH),
    },
  },
});

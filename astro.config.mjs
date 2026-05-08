// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Cloudflare Images delivery hash. Pulled from `process.env` at build time so
// Cloudflare Pages → Build & Deploy → Environment Variables (production scope)
// can set it once and have every static page render the correct meta tag.
// Falls back to empty string for local builds without the var set.
const CF_ACCOUNT_HASH = process.env.PUBLIC_CLOUDFLARE_ACCOUNT_HASH ?? '';

// https://astro.build/config
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

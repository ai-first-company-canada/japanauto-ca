/**
 * Postbuild step: extract the compiled Tailwind/global CSS that Astro inlines
 * into every SSG page (because of `inlineStylesheets: 'always'`) and write it
 * to dist/styles/global.css. The Phase 2c2b dynamic Pages Functions
 * (functions/used-cars/listing/[slug].ts, functions/dealers/[slug].ts) link
 * this file so dynamic pages share the same look as static ones.
 *
 * We pull the CSS from dist/index.html — every SSG page contains the same
 * inlined block, but the homepage is the smallest reliable anchor.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = 'dist/index.html';
const OUT = 'dist/styles/global.css';

const html = readFileSync(SRC, 'utf8');
// Concatenate every <style>…</style> block — Astro can emit multiple.
const blocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (blocks.length === 0) {
  console.error('extract-css: no <style> blocks found in', SRC);
  process.exit(1);
}
const css = blocks.join('\n\n');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, css);
console.log(`extract-css: wrote ${css.length} bytes from ${blocks.length} block(s) → ${OUT}`);

/**
 * Generates public/og-default.png — the default Open Graph / Twitter card image.
 *
 * Pure Node (zlib only), no native deps. Produces a 1200×630 PNG: brand-ink
 * background with a Japanese-red accent stripe. This is a PLACEHOLDER raster so
 * social shares stop 404-ing; replace with a designed branded card (same dims)
 * when available. Re-run with: `node scripts/gen-og-assets.mjs`.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** bands: [{untilY, rgb:[r,g,b]}], last entry covers the remainder. */
function bandedPng(width, height, bands) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = truecolor RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0; // filter: none
    let rgb = bands[bands.length - 1].rgb;
    for (const b of bands) { if (y < b.untilY) { rgb = b.rgb; break; } }
    for (let x = 0; x < width; x++) {
      raw[off++] = rgb[0]; raw[off++] = rgb[1]; raw[off++] = rgb[2];
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = bandedPng(1200, 630, [
  { untilY: 600, rgb: [10, 10, 10] },    // --color-ink-strong
  { untilY: 630, rgb: [188, 0, 45] },    // --color-accent (Japanese red)
]);
const out = new URL('../public/og-default.png', import.meta.url);
writeFileSync(out, png);
console.log(`wrote ${out.pathname} (${png.length} bytes)`);

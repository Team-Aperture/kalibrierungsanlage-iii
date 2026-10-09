// Exports the logo system as PNGs into docs/brand/ and writes the static favicon
// (an SVG of the 15×15 badge) into index.html. The generators are plain TypeScript
// without imports, so Node can load them directly.
// usage: node --experimental-strip-types scripts/brand-export.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const { emblemPixels } = await load('src/art/brand/emblem.ts');
const { bannerPixels } = await load('src/art/brand/banner.ts');

const paletteSrc = readFileSync(path.join(root, 'src/art/palette.ts'), 'utf8');
const HEX = [...paletteSrc.matchAll(/'(#[0-9a-f]{6})'/g)].map((m) => m[1]).slice(0, 28);
if (HEX.length !== 28) throw new Error('palette not found');
const RGB = HEX.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGBA PNG of indexed pixels at an integer scale (255 = transparent, or `bg`). */
function png(px, scale, pad = 0, bg = null) {
  const W = (px.w + pad * 2) * scale;
  const H = (px.h + pad * 2) * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / scale) - pad;
      const sy = Math.floor(y / scale) - pad;
      const inside = sx >= 0 && sy >= 0 && sx < px.w && sy < px.h;
      const c = inside ? px.data[sy * px.w + sx] : 255;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      const rgb = c === 255 ? bg : RGB[c];
      if (rgb) {
        raw[o] = rgb[0];
        raw[o + 1] = rgb[1];
        raw[o + 2] = rgb[2];
        raw[o + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = path.join(root, 'docs/brand');
mkdirSync(out, { recursive: true });
const VOID = RGB[0];
const files = [
  ['emblem-full.png', emblemPixels('full'), 4],
  ['emblem-simple.png', emblemPixels('simple'), 6],
  ['emblem-screen.png', emblemPixels('screen'), 8],
  ['emblem-badge.png', emblemPixels('badge'), 16],
  ['emblem-full-peak.png', emblemPixels('full', { red: 1, green: 1, spark: 1 }), 4],
  ['banner.png', bannerPixels(), 3],
];
for (const [name, px, scale] of files) {
  writeFileSync(path.join(out, name), png(px, scale, 4, VOID));
  console.log('docs/brand/' + name, `${px.w}x${px.h} @${scale}x`);
}

// Static favicon: the badge as an SVG of 1×1 rects (one path per colour).
const badge = emblemPixels('badge');
const byColor = new Map();
for (let y = 0; y < badge.h; y++) {
  for (let x = 0; x < badge.w; x++) {
    const c = badge.data[y * badge.w + x];
    if (c === 255) continue;
    byColor.set(c, (byColor.get(c) ?? '') + `M${x} ${y}h1v1h-1z`);
  }
}
let svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-0.5 -0.5 16 16' shape-rendering='crispEdges'>`;
for (const [c, d] of byColor) svg += `<path fill='${HEX[c]}' d='${d}'/>`;
svg += '</svg>';
const uri = 'data:image/svg+xml,' + svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
const indexPath = path.join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const next = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${uri}" />`);
if (next !== html) {
  writeFileSync(indexPath, next);
  console.log('index.html favicon updated');
}

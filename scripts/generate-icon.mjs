// Generates build/icon.icns (and build/icon.png) from Machole's logo — the
// conic gradient ring with a black "hole" in the middle. Zero dependencies:
// renders the artwork pixel-by-pixel, encodes PNGs by hand, and assembles the
// .icns with macOS `iconutil`. Re-run with `npm run icon` after design tweaks.

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- minimal PNG encoder ----------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- artwork ----------------------------------------------------------------

const THEME = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b'];
const STOPS = THEME.map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);
const BG = [28, 28, 32];
const HOLE = [6, 6, 8];

function gradientColor(t) {
  const seg = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(seg), STOPS.length - 2);
  const f = seg - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// Signed distance to a rounded rectangle (<= 0 means inside).
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - hw + r;
  const dy = Math.abs(py - cy) - hh + r;
  return (
    Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r
  );
}

function render(size) {
  const SS = 4; // supersampling factor for anti-aliasing
  const rgba = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const pad = size * 0.085;
  const hw = size / 2 - pad;
  const corner = hw * 2 * 0.225;
  const outerR = hw * 0.8; // gradient ring outer radius
  const holeR = outerR * 0.6; // black centre radius

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (roundedRectSDF(px, py, c, c, hw, hw, corner) <= 0) {
            a = 255;
            const d = Math.hypot(px - c, py - c);
            if (d <= holeR) {
              [r, g, b] = HOLE;
            } else if (d <= outerR) {
              let ang = Math.atan2(py - c, px - c) + Math.PI / 2;
              ang /= 2 * Math.PI;
              ang -= Math.floor(ang);
              [r, g, b] = gradientColor(ang);
            } else {
              [r, g, b] = BG;
            }
          }
          pr += r * a;
          pg += g * a;
          pb += b * a;
          pa += a;
        }
      }
      const idx = (y * size + x) * 4;
      const outA = pa / (SS * SS);
      if (pa > 0) {
        rgba[idx] = Math.round(pr / pa);
        rgba[idx + 1] = Math.round(pg / pa);
        rgba[idx + 2] = Math.round(pb / pa);
        rgba[idx + 3] = Math.round(outA);
      }
    }
  }
  return rgba;
}

// --- assemble ---------------------------------------------------------------

const SIZES = [16, 32, 64, 128, 256, 512, 1024];
const pngs = new Map(SIZES.map((s) => [s, encodePNG(s, render(s))]));

const buildDir = path.join(root, 'build');
const iconset = path.join(buildDir, 'icon.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });

const ICONSET = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];
for (const [size, name] of ICONSET) {
  fs.writeFileSync(path.join(iconset, name), pngs.get(size));
}

fs.writeFileSync(path.join(buildDir, 'icon.png'), pngs.get(1024));
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
fs.rmSync(iconset, { recursive: true, force: true });

console.log('Wrote build/icon.icns and build/icon.png');

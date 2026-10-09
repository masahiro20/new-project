// App icons for the PWA build, drawn in code and encoded with a tiny PNG writer
// (node:zlib only, no image dependencies). Output is deterministic, so rebuilding
// does not change the committed PNGs or the service-worker cache hash.
//
// The motif is a pitch line with a drop (下がり目): low → high → high → low, white on
// the page's accent blue. "any" icons have rounded corners; "maskable" icons are
// full-bleed with all content inside the 80 % safe zone.
import { deflateSync } from 'node:zlib';

const BG = [0x1c, 0x5a, 0x86]; // --accent (light)
const FG = [0xff, 0xff, 0xff];

// Unit-square geometry (0..1). Max distance from centre incl. stroke ≈ 0.36 < 0.40 safe radius.
const PTS = [[0.25, 0.63], [0.42, 0.37], [0.58, 0.37], [0.75, 0.63]];
const STROKE = 0.065;
const DOT = 0.06;

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inRoundRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}
function sample(x, y, maskable) {
  if (!maskable && !inRoundRect(x, y, 0.22)) return null;
  for (let i = 0; i < PTS.length; i++) if (Math.hypot(x - PTS[i][0], y - PTS[i][1]) <= DOT) return FG;
  for (let i = 0; i + 1 < PTS.length; i++) if (segDist(x, y, PTS[i], PTS[i + 1]) <= STROKE / 2) return FG;
  return BG;
}

/** RGBA pixels, 4×4 supersampled. */
function render(size, maskable) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, maskable);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const o = (y * size + x) * 4;
      if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Encode RGBA (or RGB when opaque) pixels as PNG. */
export function encodePng(size, rgba) {
  const opaque = rgba.every((v, i) => i % 4 !== 3 || v === 255);
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc(size * (size * ch + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * ch + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < ch; c++) raw[y * (size * ch + 1) + 1 + x * ch + c] = rgba[(y * size + x) * 4 + c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6; // bit depth, colour type RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderIcon(size, { maskable = false } = {}) {
  return encodePng(size, render(size, maskable));
}

/** [file name, size, maskable] for every icon the PWA ships. */
export const ICONS = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], // iOS applies its own mask; must be opaque
];

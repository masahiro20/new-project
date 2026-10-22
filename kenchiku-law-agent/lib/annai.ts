// 案内図: stitches 国土地理院 tiles around a point into one PNG with a pin.
// Text inside the image is ASCII only (server fonts may lack Japanese glyphs);
// the Japanese caption and the 出典 are shown next to the image in the page / PDF.

import sharp from "sharp";

export const ANNAI_STYLES = {
  std: { label: "標準地図", url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", maxZoom: 18 },
  pale: { label: "淡色地図", url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", maxZoom: 18 },
  photo: { label: "航空写真", url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", maxZoom: 18 },
} as const;
export type AnnaiStyle = keyof typeof ANNAI_STYLES;
export const GSI_TILE_SOURCE = { label: "国土地理院 地理院タイル", url: "https://maps.gsi.go.jp/development/ichiran.html" };

const TILE = 256;

/** Web Mercator pixel position of a point at zoom z. */
export function pixelOf(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z * TILE;
  const x = ((lon + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Metres per pixel at this latitude and zoom. */
export const metresPerPixel = (lat: number, z: number) => (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (2 ** z * TILE);

async function tile(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "kenchiku-law-agent (in-house)" } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function overlaySvg(w: number, h: number, lat: number, z: number, style: AnnaiStyle): string {
  const cx = w / 2;
  const cy = h / 2;
  // Scale bar: the round length that fits in ~1/5 of the width.
  const mpp = metresPerPixel(lat, z);
  const target = (w / 5) * mpp;
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].reduce((best, v) => (v <= target ? v : best), 5);
  const barPx = nice / mpp;
  const label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
  const ink = style === "photo" ? "#ffffff" : "#111827";
  const halo = style === "photo" ? "#111827" : "#ffffff";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <g fill="none" stroke="#ff3b30" stroke-width="3">
    <circle cx="${cx}" cy="${cy}" r="26" stroke-opacity="0.9"/>
    <circle cx="${cx}" cy="${cy}" r="44" stroke-opacity="0.45" stroke-dasharray="6 6"/>
  </g>
  <g transform="translate(${cx},${cy})">
    <path d="M0 0 C -14 -18 -16 -26 -16 -32 A16 16 0 1 1 16 -32 C 16 -26 14 -18 0 0 Z" fill="#ff3b30" stroke="#ffffff" stroke-width="3"/>
    <circle cx="0" cy="-32" r="6" fill="#ffffff"/>
  </g>
  <g transform="translate(${w - 46},46)">
    <circle r="24" fill="${halo}" fill-opacity="0.85"/>
    <path d="M0 -17 L8 6 L0 1 L-8 6 Z" fill="${ink}"/>
    <text y="17" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="${ink}">N</text>
  </g>
  <g transform="translate(20,${h - 26})" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700">
    <rect x="-8" y="-24" width="${barPx + 70}" height="36" rx="6" fill="${halo}" fill-opacity="0.85"/>
    <path d="M0 0 H${barPx}" stroke="${ink}" stroke-width="4"/>
    <path d="M0 -6 V6 M${barPx} -6 V6" stroke="${ink}" stroke-width="2"/>
    <text x="${barPx + 8}" y="5" fill="${ink}">${label}</text>
  </g>
  <text x="${w - 10}" y="${h - 10}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="${ink}" stroke="${halo}" stroke-width="3" paint-order="stroke">Source: GSI Japan (Chiriin tiles)</text>
</svg>`;
}

export async function renderAnnai(opts: { lat: number; lon: number; z: number; style: AnnaiStyle; width: number; height: number; bare?: boolean; format?: "png" | "jpg" }): Promise<Buffer> {
  const { lat, lon, style, width, height } = opts;
  const z = Math.max(5, Math.min(ANNAI_STYLES[style].maxZoom, Math.round(opts.z)));
  const center = pixelOf(lat, lon, z);
  const left = center.x - width / 2;
  const top = center.y - height / 2;
  const tx0 = Math.floor(left / TILE);
  const ty0 = Math.floor(top / TILE);
  const tx1 = Math.floor((left + width - 1) / TILE);
  const ty1 = Math.floor((top + height - 1) / TILE);
  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  const jobs: Promise<{ input: Buffer; left: number; top: number } | null>[] = [];
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      const url = ANNAI_STYLES[style].url.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty));
      jobs.push(tile(url).then((b) => (b ? { input: b, left: (tx - tx0) * TILE, top: (ty - ty0) * TILE } : null)));
    }
  const tiles = (await Promise.all(jobs)).filter((t): t is { input: Buffer; left: number; top: number } => t !== null);
  if (tiles.length === 0) throw new Error("地図タイルを取得できませんでした");
  const mosaic = await sharp({ create: { width: cols * TILE, height: rows * TILE, channels: 3, background: "#e5e7eb" } })
    .composite(tiles)
    .png()
    .toBuffer();
  const cropped = await sharp(mosaic)
    .extract({ left: Math.round(left - tx0 * TILE), top: Math.round(top - ty0 * TILE), width, height })
    .toBuffer();
  const out = opts.bare ? sharp(cropped) : sharp(cropped).composite([{ input: Buffer.from(overlaySvg(width, height, lat, z, style)), left: 0, top: 0 }]);
  return opts.format === "jpg" ? out.jpeg({ quality: 72, mozjpeg: true }).toBuffer() : out.png({ compressionLevel: 8 }).toBuffer();
}

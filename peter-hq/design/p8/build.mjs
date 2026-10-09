#!/usr/bin/env node
// Builds the GRANDSTRIDE promo set as SVG, and as PNG with --png (needs playwright).
//   node build.mjs            -> itch-banner-960x300.svg, x-header-1500x500.svg, short-titlecard-1080x1920.svg
//   node build.mjs --png      -> also writes the matching .png files
// Look follows mech-game/store (cover, screenshots) and docs/game-design.md:
// night over the drowned SHORE CITY 2091, HEKATON TYPE-04 (28 m, four legs), cyan HUD lines, amber lamps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const C = { bg: "#0a0e13", bg2: "#111a26", cyan: "#5ff2e8", amber: "#ffb547", ink: "#e9f4f6", muted: "#7f93a3", hull: "#1b2431", hull2: "#252f3f", edge: "#3a4a60" };
const FONT_EN = "'Chakra Petch','Share Tech Mono',sans-serif";
const FONT_JP = "'Zen Kaku Gothic New','Noto Sans JP','Hiragino Sans',sans-serif";
const FONT_MONO = "'Share Tech Mono',ui-monospace,monospace";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Skyline band with lit windows. Returns SVG markup.
function city(w, h, base, seed, opts = {}) {
  const r = rng(seed), out = [];
  const far = opts.far ?? 0.55;
  for (const layer of [{ k: far, col: "#0e1622", lit: 0.18 }, { k: 1, col: "#0b121c", lit: 0.32 }]) {
    let x = -10;
    while (x < w + 10) {
      const bw = (24 + r() * 70) * (opts.scale ?? 1), bh = (h * (0.25 + r() * 0.75)) * layer.k;
      out.push(`<rect x="${x.toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${layer.col}"/>`);
      const step = 7 * (opts.scale ?? 1);
      for (let yy = base - bh + 8; yy < base - 6; yy += step) for (let xx = x + 5; xx < x + bw - 5; xx += step)
        if (r() < layer.lit) out.push(`<rect x="${xx.toFixed(1)}" y="${yy.toFixed(1)}" width="${(2.6 * (opts.scale ?? 1)).toFixed(1)}" height="${(3.4 * (opts.scale ?? 1)).toFixed(1)}" fill="${r() < 0.3 ? "#ffd98a" : "#7fb6ff"}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`);
      x += bw + 3;
    }
  }
  return out.join("");
}
function embers(w, h, n, seed) { const r = rng(seed); let s = ""; for (let i = 0; i < n; i++) s += `<rect x="${(r() * w).toFixed(0)}" y="${(r() * h).toFixed(0)}" width="${(2 + r() * 4).toFixed(1)}" height="${(2 + r() * 4).toFixed(1)}" fill="#ff8a4a" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`; return s; }

// HEKATON TYPE-04, front three-quarter view. Drawn in a 400x300 box, feet on y=280.
const MECH = `
<g id="hekaton">
  <ellipse cx="200" cy="284" rx="190" ry="14" fill="#000" opacity=".45"/>
  <!-- rear legs -->
  <g fill="#141b26" stroke="${C.edge}" stroke-width="1.5" stroke-linejoin="round">
    <path d="M170 132 L128 70 L116 76 L150 140 Z"/><path d="M128 70 L104 262 L122 262 L134 78 Z"/><path d="M96 258 h36 v12 h-36 z"/>
    <path d="M230 132 L272 70 L284 76 L250 140 Z"/><path d="M272 70 L296 262 L278 262 L266 78 Z"/><path d="M268 258 h36 v12 h-36 z"/>
  </g>
  <!-- hull -->
  <path d="M136 112 L170 92 L230 92 L264 112 L256 150 L144 150 Z" fill="${C.hull2}" stroke="${C.edge}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M150 150 L250 150 L238 168 L162 168 Z" fill="${C.hull}" stroke="${C.edge}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M176 92 L188 66 L212 66 L224 92 Z" fill="${C.hull}" stroke="${C.edge}" stroke-width="2"/>
  <!-- cockpit head -->
  <circle cx="200" cy="118" r="26" fill="#10161f" stroke="${C.edge}" stroke-width="2"/>
  <rect x="184" y="113" width="32" height="7" rx="1.5" fill="${C.amber}" filter="url(#glowA)"/>
  <!-- front legs -->
  <g fill="${C.hull2}" stroke="${C.edge}" stroke-width="2" stroke-linejoin="round">
    <path d="M150 120 L84 40 L66 50 L132 136 Z"/><path d="M84 40 L50 270 L76 270 L92 52 Z"/><path d="M36 262 h52 v18 h-52 z"/>
    <path d="M250 120 L316 40 L334 50 L268 136 Z"/><path d="M316 40 L350 270 L324 270 L308 52 Z"/><path d="M312 262 h52 v18 h-52 z"/>
  </g>
  <!-- rim light and joints -->
  <g stroke="${C.cyan}" stroke-width="1.6" fill="none" opacity=".75"><path d="M66 50 L132 136"/><path d="M334 50 L268 136"/><path d="M136 112 L170 92 L230 92 L264 112"/></g>
  <circle cx="84" cy="44" r="7" fill="#0e141c" stroke="${C.cyan}" stroke-width="1.5"/><circle cx="316" cy="44" r="7" fill="#0e141c" stroke="${C.cyan}" stroke-width="1.5"/>
  <g fill="${C.amber}" filter="url(#glowA)"><rect x="40" y="266" width="44" height="3"/><rect x="316" y="266" width="44" height="3"/></g>
</g>`;

function defs(extra = "") {
  return `<defs>
  <filter id="glowC" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feFlood flood-color="${C.cyan}" flood-opacity=".55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowA" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <radialGradient id="lamp"><stop offset="0" stop-color="${C.amber}" stop-opacity=".55"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080d"/><stop offset=".65" stop-color="#121a2a"/><stop offset="1" stop-color="#2a1a22"/></linearGradient>
  <linearGradient id="scrimL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#05080d" stop-opacity=".9"/><stop offset=".55" stop-color="#05080d" stop-opacity=".6"/><stop offset="1" stop-color="#05080d" stop-opacity="0"/></linearGradient>
  <linearGradient id="scrimR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#05080d" stop-opacity=".9"/><stop offset=".55" stop-color="#05080d" stop-opacity=".6"/><stop offset="1" stop-color="#05080d" stop-opacity="0"/></linearGradient>
  <linearGradient id="scrimT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05080d" stop-opacity="0"/><stop offset=".25" stop-color="#05080d" stop-opacity=".75"/><stop offset=".8" stop-color="#05080d" stop-opacity=".75"/><stop offset="1" stop-color="#05080d" stop-opacity="0"/></linearGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1520"/><stop offset="1" stop-color="#05080d"/></linearGradient>
  ${extra}</defs>`;
}
const svgOpen = (w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">`;
const lamps = (pts) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#lamp)"/>`).join("");
const scan = (w, h) => `<rect width="${w}" height="${h}" fill="url(#scan)" opacity=".5"/>`;
const scanDef = `<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity=".03"/></pattern>`;

function titleBlock(x, y, size, anchor = "start") {
  const sub = size * 0.36;
  const lineW = size * 6.2;
  const lx = anchor === "middle" ? x - lineW / 2 : anchor === "end" ? x - lineW : x;
  return `
  <text x="${x}" y="${y - size * 0.95}" text-anchor="${anchor}" font-family="${FONT_JP}" font-weight="700" font-size="${sub}" letter-spacing="${sub * 0.45}" fill="${C.amber}">鋼脚戦機</text>
  <text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT_EN}" font-weight="700" font-size="${size}" letter-spacing="${size * 0.04}" fill="${C.ink}" filter="url(#glowC)">GRANDSTRIDE</text>
  <rect x="${lx}" y="${y + size * 0.22}" width="${lineW}" height="${Math.max(2, size * 0.035)}" fill="${C.cyan}" opacity=".8"/>`;
}

const files = {};

// 1) itch.io banner 960x300
{
  const W = 960, H = 300;
  files["itch-banner-960x300.svg"] = `${svgOpen(W, H, "GRANDSTRIDE 鋼脚戦機")}
${defs(scanDef)}
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${city(W, 220, 236, 7)}
<rect y="236" width="${W}" height="64" fill="url(#water)"/>
${lamps([[600, 250, 60], [880, 256, 50], [430, 262, 40]])}
${embers(W, H, 26, 3)}
<rect width="640" height="${H}" fill="url(#scrimL)"/>
<g transform="translate(560 18) scale(0.92)">${MECH}</g>
${titleBlock(40, 168, 76)}
<text x="40" y="236" font-family="${FONT_MONO}" font-size="15" letter-spacing="1.5" fill="${C.muted}">HEKATON TYPE-04 ／ SHORE CITY 2091</text>
<text x="40" y="262" font-family="${FONT_EN}" font-weight="600" font-size="17" fill="${C.ink}">Ride a 28m quadruped war machine. Feel every step.</text>
${scan(W, H)}
</svg>`;
}

// 2) X header 1500x500 (bottom-left is covered by the profile photo, so keep it empty)
{
  const W = 1500, H = 500;
  files["x-header-1500x500.svg"] = `${svgOpen(W, H, "GRANDSTRIDE 鋼脚戦機")}
${defs(scanDef)}
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${city(W, 360, 400, 11, { scale: 1.3 })}
<rect y="400" width="${W}" height="100" fill="url(#water)"/>
${lamps([[300, 420, 90], [700, 430, 70], [1380, 430, 80]])}
${embers(W, H, 40, 5)}
<rect x="640" width="860" height="${H}" fill="url(#scrimR)"/>
<g transform="translate(150 40) scale(1.25)">${MECH}</g>
${titleBlock(1440, 250, 104, "end")}
<text x="1440" y="318" text-anchor="end" font-family="${FONT_JP}" font-weight="700" font-size="28" fill="${C.ink}">全高28mの四脚戦機に乗り込め。</text>
<text x="1440" y="356" text-anchor="end" font-family="${FONT_MONO}" font-size="20" letter-spacing="2" fill="${C.muted}">HEKATON TYPE-04 ／ SHORE CITY 2091</text>
<g font-family="${FONT_MONO}" font-size="16" fill="${C.cyan}" opacity=".8"><text x="1440" y="40" text-anchor="end">RESONANCE 100% ▸ OVERBEAT</text></g>
${scan(W, H)}
</svg>`;
}

// 3) vertical short title card 1080x1920 (bottom ~320px left calm for the app's own captions and buttons)
{
  const W = 1080, H = 1920;
  files["short-titlecard-1080x1920.svg"] = `${svgOpen(W, H, "GRANDSTRIDE 鋼脚戦機 タイトルカード")}
${defs(scanDef)}
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${city(W, 700, 1420, 21, { scale: 1.6, far: 0.7 })}
<rect y="1420" width="${W}" height="500" fill="url(#water)"/>
${lamps([[180, 1440, 160], [900, 1450, 140], [540, 1470, 120]])}
${embers(W, H, 70, 9)}
<!-- HUD frame -->
<g fill="none" stroke="${C.cyan}" stroke-width="4" opacity=".75">
  <path d="M60 140 V60 H140"/><path d="M1020 140 V60 H940"/><path d="M60 1500 V1580 H140"/><path d="M1020 1500 V1580 H940"/>
</g>
<g font-family="${FONT_MONO}" font-size="26" letter-spacing="3" fill="${C.cyan}" opacity=".85">
  <text x="90" y="118">MISSION 01</text><text x="990" y="118" text-anchor="end">汀都 第七区画</text>
</g>
<rect y="200" width="${W}" height="580" fill="url(#scrimT)"/>
${titleBlock(540, 470, 128, "middle")}
<text x="540" y="620" text-anchor="middle" font-family="${FONT_JP}" font-weight="700" font-size="50" fill="${C.ink}">全高28mの四脚戦機に乗り込め。</text>
<text x="540" y="690" text-anchor="middle" font-family="${FONT_JP}" font-weight="500" font-size="36" fill="${C.muted}">4本の脚で踏みしめ、鼓動を重ねて灰殻を討つ。</text>
<g transform="translate(40 820) scale(2.5)">${MECH}</g>
<text x="540" y="1640" text-anchor="middle" font-family="${FONT_MONO}" font-size="30" letter-spacing="4" fill="${C.amber}">共鳴率 RESONANCE ▸ OVERBEAT</text>
${scan(W, H)}
</svg>`;
}

for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(here, name), svg);
console.log("wrote", Object.keys(files).join(", "));

if (process.argv.includes("--png")) {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { console.error("--png needs playwright"); process.exit(1); }
  const launch = {};
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY };
  const browser = await chromium.launch(launch);
  const fonts = "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Share+Tech+Mono&family=Zen+Kaku+Gothic+New:wght@500;700&display=block";
  for (const [name, svg] of Object.entries(files)) {
    const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${fonts}"><style>html,body{margin:0;background:#000}svg{display:block}</style></head><body>${svg}</body></html>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(here, name.replace(/\.svg$/, ".png")) });
    await page.close();
  }
  await browser.close();
  console.log("wrote PNG files");
}

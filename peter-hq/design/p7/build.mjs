#!/usr/bin/env node
// LEDGERBREAKER 帳簿破り — promo set built from P7's own art (anime/book/art on peter/p7-anime).
//   node build.mjs --art <path to anime/book/art> [--png]
// Writes logo-ja / logo-en (transparent), key visuals 1920x1080 and 1080x1920, BOOTH thumbnail 1200x1200,
// Ko-fi banner 1500x500. Character and cover art are inlined as <symbol>s, so each SVG stands alone.
// Palette and type follow anime/launch (ink #0E0B10, red #E5172F, paper #F5EEDD, gold #C9A24A;
// Dela Gothic One, Zen Kaku Gothic New, IBM Plex Mono).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ART = opt("--art", path.join(here, "../../../anime/book/art"));
const C = { ink: "#0E0B10", ink2: "#181B25", red: "#E5172F", deep: "#7A0614", paper: "#F5EEDD", gold: "#C9A24A", muted: "#9A958C" };
const DISPLAY = "'Dela Gothic One','Zen Kaku Gothic New',sans-serif";
const SANS = "'Zen Kaku Gothic New','Noto Sans JP',sans-serif";
const MONO = "'IBM Plex Mono',ui-monospace,monospace";

// Turn one of P7's SVG files into a <symbol>, prefixing ids so several can live in one file.
function symbol(file, id, { stripBackdrop = false } = {}) {
  let src = fs.readFileSync(path.join(ART, file), "utf8");
  const vb = src.match(/viewBox="([^"]+)"/)[1];
  let inner = src.slice(src.indexOf(">", src.indexOf("<svg")) + 1, src.lastIndexOf("</svg>"));
  inner = inner.replace(/<title[\s\S]*?<\/title>/g, "").replace(/<desc[\s\S]*?<\/desc>/g, "");
  if (stripBackdrop) inner = inner
    .replace(/<rect width="600" height="1300" fill="url\(#(bg|rule|aura)\)"\/>/g, "")
    .replace(/<line x1="(64|70)" y1="0"[^>]*\/>/g, "");
  inner = inner.replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`).replace(/href="#([^"]+)"/g, `href="#${id}-$1"`);
  return `<symbol id="${id}" viewBox="${vb}" overflow="visible">${inner}</symbol>`;
}

const ruled = (w, h, op = 0.5) => `<pattern id="ruled" width="${w}" height="34" patternUnits="userSpaceOnUse"><line x1="0" y1="33.5" x2="${w}" y2="33.5" stroke="#232838" stroke-width="1"/></pattern>`;
const commonDefs = (w) => `
  ${ruled(w)}
  <filter id="glowR" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="10" result="b"/><feFlood flood-color="${C.red}" flood-opacity=".55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .06 0"/></filter>
  <linearGradient id="fadeL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></linearGradient>
  <linearGradient id="fadeT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></linearGradient>
  <linearGradient id="fadeB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.ink}"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></linearGradient>
  <radialGradient id="redglow"><stop offset="0" stop-color="${C.red}" stop-opacity=".45"/><stop offset="1" stop-color="${C.red}" stop-opacity="0"/></radialGradient>`;

// ---- logos (drawn in a local box, placed with transform) ----
// EN: two tiers, LEDGER / BREAKER, a red tear running through LEDGER like a torn ledger line. Box 1200x520.
function logoEN() {
  return `<g>
    <g opacity=".55">${[60, 94, 128, 162, 196].map((y) => `<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="${C.muted}" stroke-width="1.5" opacity=".35"/>`).join("")}</g>
    <line x1="34" y1="0" x2="34" y2="470" stroke="${C.red}" stroke-width="3" opacity=".7"/><line x1="44" y1="0" x2="44" y2="470" stroke="${C.red}" stroke-width="3" opacity=".7"/>
    <text x="80" y="220" font-family="${DISPLAY}" font-size="230" fill="${C.paper}" textLength="1100" lengthAdjust="spacingAndGlyphs">LEDGER</text>
    <text x="80" y="460" font-family="${DISPLAY}" font-size="230" fill="${C.red}" textLength="1100" lengthAdjust="spacingAndGlyphs" filter="url(#glowR)">BREAKER</text>
    <path d="M60 150 L300 128 L340 160 L560 112 L600 148 L860 104 L900 140 L1200 96" fill="none" stroke="${C.ink}" stroke-width="16" stroke-linejoin="bevel"/>
    <path d="M60 150 L300 128 L340 160 L560 112 L600 148 L860 104 L900 140 L1200 96" fill="none" stroke="${C.red}" stroke-width="5" stroke-linejoin="bevel"/>
    <text x="1180" y="510" text-anchor="end" font-family="${SANS}" font-weight="700" font-size="40" letter-spacing="18" fill="${C.paper}">帳簿破り</text>
    <text x="80" y="510" font-family="${MONO}" font-size="28" letter-spacing="6" fill="${C.muted}">−∞ / I'M NOT PAYING.</text>
  </g>`;
}
// JA: 帳簿破り with ruby, 破 in red cut by a tear. Box 1100x520.
function logoJA() {
  return `<g>
    <text x="550" y="70" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="44" letter-spacing="22" fill="${C.muted}">レジャーブレイカー</text>
    <text x="40" y="350" font-family="${DISPLAY}" font-size="250" fill="${C.paper}" textLength="1020" lengthAdjust="spacingAndGlyphs">帳簿<tspan fill="${C.red}" filter="url(#glowR)">破</tspan>り</text>
    <path d="M560 150 L640 230 L600 250 L700 360" fill="none" stroke="${C.ink}" stroke-width="16"/>
    <path d="M560 150 L640 230 L600 250 L700 360" fill="none" stroke="${C.paper}" stroke-width="4"/>
    <line x1="40" y1="410" x2="1060" y2="410" stroke="${C.red}" stroke-width="4"/>
    <text x="550" y="478" text-anchor="middle" font-family="${MONO}" font-size="40" letter-spacing="14" fill="${C.paper}">LEDGERBREAKER</text>
  </g>`;
}

const open = (w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">`;
const base = (w, h) => `<rect width="${w}" height="${h}" fill="${C.ink}"/><rect width="${w}" height="${h}" fill="url(#ruled)"/>`;
const grain = (w, h) => `<rect width="${w}" height="${h}" filter="url(#grain)" opacity=".7"/>`;
const use = (id, x, y, w, h, extra = "") => `<use href="#${id}" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}/>`;

const SYM = {
  cover: () => symbol("cover.svg", "cover"),
  jin: () => symbol("char-jin.svg", "jin", { stripBackdrop: true }),
  hazama: () => symbol("char-hazama.svg", "hazama", { stripBackdrop: true }),
  kujo: () => symbol("char-kujo.svg", "kujo", { stripBackdrop: true }),
  tsubame: () => symbol("char-tsubame.svg", "tsubame", { stripBackdrop: true }),
};
const defs = (w, ...ids) => `<defs>${commonDefs(w)}${ids.map((i) => SYM[i]()).join("")}</defs>`;

const out = {};
out["logo-en.svg"] = `${open(1200, 520, "LEDGERBREAKER")}<defs>${commonDefs(1200)}</defs>${logoEN()}</svg>`;
out["logo-ja.svg"] = `${open(1100, 500, "帳簿破り")}<defs>${commonDefs(1100)}</defs>${logoJA()}</svg>`;

// Key visual, landscape: the cover art on the right, logo and line on the left, Hazama faint behind.
out["keyvisual-1920x1080.svg"] = `${open(1920, 1080, "LEDGERBREAKER 帳簿破り キービジュアル")}${defs(1920, "cover", "hazama")}
${base(1920, 1080)}
${use("cover", 940, -230, 1100, 1561)}
<rect x="940" width="460" height="1080" fill="url(#fadeL)"/>
<rect x="1700" width="220" height="1080" fill="${C.ink}" opacity=".0"/>
<circle cx="760" cy="520" r="420" fill="url(#redglow)"/>
${use("hazama", 600, 120, 420, 910, 'opacity=".45"')}
<g transform="translate(110 250) scale(.78)">${logoEN()}</g>
<text x="120" y="770" font-family="${SANS}" font-weight="700" font-size="76" fill="${C.red}">払わねえよ。</text>
<text x="124" y="830" font-family="${MONO}" font-size="34" letter-spacing="4" fill="${C.paper}">I'm not paying.</text>
<text x="124" y="980" font-family="${MONO}" font-size="22" letter-spacing="6" fill="${C.muted}">ORIGINAL ANIME PROJECT ／ 都市カネグラ</text>
${grain(1920, 1080)}
</svg>`;

// Key visual, portrait: the cover art fills the frame; logo on top, line at the bottom.
out["keyvisual-1080x1920.svg"] = `${open(1080, 1920, "LEDGERBREAKER 帳簿破り キービジュアル 縦")}${defs(1080, "cover", "hazama")}
${base(1080, 1920)}
${use("cover", -40, 120, 1160, 1646)}
<rect width="1080" height="640" fill="url(#fadeT)"/>
<rect y="1420" width="1080" height="500" fill="url(#fadeB)"/>
${use("hazama", 760, 330, 300, 650, 'opacity=".35"')}
<g transform="translate(70 120) scale(.78)">${logoEN()}</g>
<text x="540" y="1790" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="96" fill="${C.red}">払わねえよ。</text>
<text x="540" y="1860" text-anchor="middle" font-family="${MONO}" font-size="40" letter-spacing="6" fill="${C.paper}">I'm not paying.</text>
${grain(1080, 1920)}
</svg>`;

// BOOTH thumbnail 1:1: Jin with the red mark, Japanese logo, product label, AI disclosure as on the current thumbnail.
out["booth-thumb-1200x1200.svg"] = `${open(1200, 1200, "帳簿破り BOOTH サムネイル")}${defs(1200, "jin", "hazama")}
${base(1200, 1200)}
<line x1="64" y1="0" x2="64" y2="1200" stroke="${C.red}" stroke-opacity=".25" stroke-width="2"/><line x1="72" y1="0" x2="72" y2="1200" stroke="${C.red}" stroke-opacity=".25" stroke-width="2"/>
<circle cx="860" cy="560" r="460" fill="url(#redglow)"/>
${use("hazama", 760, 40, 420, 910, 'opacity=".4"')}
${use("jin", 590, 80, 520, 1127)}
<rect x="0" y="0" width="640" height="1200" fill="url(#fadeL)" opacity=".75"/>
<g transform="translate(70 160) scale(.54)">${logoJA()}</g>
<rect x="110" y="520" width="300" height="64" fill="${C.red}"/>
<text x="130" y="564" font-family="${SANS}" font-weight="700" font-size="34" fill="${C.paper}">設定資料集 PDF</text>
<text x="110" y="660" font-family="${SANS}" font-weight="700" font-size="52" fill="${C.paper}">払わねえよ。</text>
<text x="112" y="712" font-family="${MONO}" font-size="26" letter-spacing="3" fill="${C.muted}">I'm not paying.</text>
<text x="110" y="1140" font-family="${SANS}" font-size="22" fill="${C.muted}">AI使用・作者監修 / Made with AI assistance</text>
${grain(1200, 1200)}
</svg>`;

// Ko-fi banner 1500x500: logo on the left, four of the cast on the right.
out["kofi-banner-1500x500.svg"] = `${open(1500, 500, "LEDGERBREAKER Ko-fi バナー")}${defs(1500, "jin", "tsubame", "kujo", "hazama")}
${base(1500, 500)}
<ellipse cx="1080" cy="500" rx="520" ry="120" fill="url(#redglow)"/>
${use("hazama", 1260, 40, 210, 455, 'opacity=".9"')}
${use("kujo", 1060, 20, 222, 481)}
${use("tsubame", 840, 70, 200, 433)}
${use("jin", 640, 6, 228, 494)}
<g transform="translate(40 60) scale(.5)">${logoEN()}</g>
<text x="60" y="400" font-family="${SANS}" font-weight="700" font-size="40" fill="${C.red}">払わねえよ。 <tspan font-family="${MONO}" font-size="24" fill="${C.paper}" font-weight="400">I'm not paying.</tspan></text>
<text x="60" y="460" font-family="${SANS}" font-size="18" fill="${C.muted}">AI使用・作者監修 / Made with AI assistance</text>
${grain(1500, 500)}
</svg>`;

for (const [n, s] of Object.entries(out)) fs.writeFileSync(path.join(here, n), s);
console.log("wrote", Object.keys(out).join(", "));

if (args.includes("--png")) {
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { console.error("--png needs playwright"); process.exit(1); }
  const launch = {};
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY };
  const browser = await chromium.launch(launch);
  const fonts = "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;700&display=block";
  for (const [n, s] of Object.entries(out)) {
    const [, w, h] = s.match(/width="(\d+)" height="(\d+)"/);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${fonts}"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${s}</body></html>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(here, n.replace(/\.svg$/, ".png")), omitBackground: n.startsWith("logo") });
    await page.close();
  }
  await browser.close();
  console.log("wrote PNG files");
}

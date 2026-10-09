#!/usr/bin/env node
// Builds one 1200x630 OGP image per guide page from og-template.svg.
// Usage:
//   node generate-og.mjs --in guides.json --out public/og          # writes <slug>.svg
//   node generate-og.mjs --in guides.json --out public/og --png    # also writes <slug>.png (needs playwright)
// guides.json: [{ "slug": "...", "title": "...", "serviceType": "..." }]  (see extract-guides.mjs)
// Social sites do not accept SVG for og:image, so ship the PNGs. Runs at build time only; works with static export.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const inFile = opt("--in", path.join(here, "guides.json"));
const outDir = opt("--out", path.join(here, "out"));
const wantPng = args.includes("--png");

const template = fs.readFileSync(path.join(here, "og-template.svg"), "utf8");
const guides = JSON.parse(fs.readFileSync(inFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Width in em: full-width characters count 1, ASCII about 0.55.
const ems = (s) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);

function wrap(text, maxEm, maxLines) {
  // balance lines so the last one is not a stray word
  const need = Math.min(maxLines, Math.ceil(ems(text) / maxEm));
  if (need > 1) maxEm = Math.min(maxEm, Math.ceil(ems(text) / need) + 1);
  const lines = [];
  let cur = "";
  for (const ch of text) {
    if (ems(cur + ch) > maxEm) {
      // keep closing punctuation on the line it belongs to
      if ("、。」）)・".includes(ch)) { cur += ch; continue; }
      lines.push(cur); cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ems(last + "…") > maxEm) last = last.slice(0, -1);
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

// "主題｜補足" or "主題？補足" → main title + subtitle
function split(title) {
  const br = title.match(/【([^】]+)】/);
  if (br) { const [m, s] = split(title.replace(br[0], "")); return [m, [br[1], s].filter(Boolean).join("・")]; }
  const m = title.match(/^(.+?[？?])(.+)$/) || title.match(/^(.+?)[｜|](.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [title, ""];
}

const TEXT_W = 820; // px available beside the illustration
function render(g) {
  const [main, sub] = split(g.title);
  let size = 64, lines = wrap(main, TEXT_W / size, 2);
  if (lines.length > 1 && ems(main) > (TEXT_W / 64) * 2) { size = 54; lines = wrap(main, TEXT_W / size, 3); }
  const lh = Math.round(size * 1.3);
  const titleY = 268;
  const subY = titleY + lh * (lines.length - 1) + 64;
  const subLines = sub ? wrap(sub, TEXT_W / 30, 2) : [];
  const tspans = (ls, l) => ls.map((t, i) => `<tspan x="74" dy="${i ? l : 0}">${esc(t)}</tspan>`).join("");
  return template
    .replace("{{EYEBROW}}", esc(g.serviceType ? g.serviceType + "の解説" : "減算と運営指導の解説"))
    .replace("{{TITLE_Y}}", String(titleY))
    .replace("{{TITLE_SIZE}}", String(size))
    .replace("{{TITLE_TSPANS}}", tspans(lines, lh))
    .replace("{{SUB_Y}}", String(subY))
    .replace("{{SUB_TSPANS}}", tspans(subLines, 40));
}

const written = [];
for (const g of guides) {
  const file = path.join(outDir, g.slug + ".svg");
  fs.writeFileSync(file, render(g));
  written.push(file);
}
console.log(`wrote ${written.length} SVG files to ${outDir}`);

if (wantPng) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { console.error("--png needs playwright (npm i -D playwright). SVGs were written."); process.exit(1); }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const font = "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=block";
  for (const f of written) {
    const svg = fs.readFileSync(f, "utf8");
    await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="${font}"><style>html,body{margin:0}</style></head><body>${svg}</body></html>`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: f.replace(/\.svg$/, ".png"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  }
  await browser.close();
  console.log(`wrote ${written.length} PNG files`);
}

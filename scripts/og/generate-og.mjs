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

// Japanese has no spaces, so break between phrases rather than at any character:
// a new chunk starts where hiragana or punctuation is followed by kanji/katakana/latin
// ("障害福祉の|運営指導で|指摘されやすい|書類チェックリスト"). Opening brackets stay with
// what follows them; closing punctuation stays with what precedes it.
const NO_LINE_START = "、。」）)・ー？?！!";
const NO_LINE_END = "（「(【";
const isContent = (ch) => /[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9０-９]/u.test(ch);
const isSoft = (ch) => /[\p{Script=Hiragana}、。・）」)？?！!]/u.test(ch);

function chunks(text) {
  const out = [];
  let cur = "";
  for (const ch of text) {
    const prev = cur.slice(-1);
    if (cur && isContent(ch) && isSoft(prev) && !NO_LINE_END.includes(prev)) {
      out.push(cur);
      cur = "";
    }
    if (cur && NO_LINE_END.includes(ch) && isSoft(prev)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function greedy(parts, maxEm) {
  const lines = [];
  lines.split = false;
  let cur = "";
  for (const part of parts) {
    if (cur && ems(cur + part) > maxEm) {
      lines.push(cur);
      cur = "";
    }
    if (ems(part) > maxEm) {
      // a phrase wider than the line: first try breaking between its kanji and its
      // hiragana tail ("…未実施減算|とは？"), then fall back to characters
      const tail = part.match(/^(.*[^\p{Script=Hiragana}？?！!])(\p{Script=Hiragana}+[？?！!]?)$/u);
      if (tail && ems(tail[1]) <= maxEm) {
        if (cur) lines.push(cur);
        lines.push(tail[1]);
        cur = tail[2];
        continue;
      }
      lines.split = true;
      for (const ch of part) {
        if (cur && ems(cur + ch) > maxEm && !NO_LINE_START.includes(ch)) { lines.push(cur); cur = ""; }
        cur += ch;
      }
    } else cur += part;
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrap(text, maxEm, maxLines) {
  const parts = chunks(text);
  // balance lines so the last one is not a stray word, but only while it still fits in maxLines
  const need = Math.min(maxLines, Math.ceil(ems(text) / maxEm));
  let lines = greedy(parts, maxEm);
  if (need > 1) {
    for (let w = Math.ceil(ems(text) / need); w < maxEm; w++) {
      const tryLines = greedy(parts, w);
      if (!tryLines.split && tryLines.length <= Math.max(need, lines.length)) { lines = tryLines; break; }
    }
  }
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
  // "主題【補足】続き" → main "主題", sub "補足・続き"
  const br = title.match(/^(.*?)【([^】]+)】(.*)$/);
  if (br && br[1]) return [br[1].trim(), [br[2], br[3].trim()].filter(Boolean).join("・")];
  const m = title.match(/^(.+?[？?])(.+)$/) || title.match(/^(.+?)[｜|](.+)$/);
  return m ? [m[1].trim(), m[2].trim()] : [title, ""];
}

const TEXT_W = 820; // px available beside the illustration
function render(g) {
  const [main, sub] = split(g.title);
  // largest size at which the title fits without "…"
  let size = 64, lines = wrap(main, TEXT_W / size, 2);
  for (const [sz, max] of [[54, 3], [46, 3]]) {
    if (!lines.some((l) => l.endsWith("…"))) break;
    size = sz;
    lines = wrap(main, TEXT_W / size, max);
  }
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

// Render book HTML files to A5 PDF with headless Chromium.
// Usage: node build.mjs vol0-ja.html vol0-en.html
// SVGs referenced as <img src="art/*.svg"> are inlined at build time so their
// text uses the book's web fonts (an <img> SVG cannot load web fonts).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

let seq = 0;
function inlineSvg(dir, src, attrs) {
  const file = path.join(dir, src);
  if (!fs.existsSync(file)) return null;
  const p = `s${++seq}-`;
  let svg = fs.readFileSync(file, 'utf8').replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/i, '');
  // Prefix ids and their references so several inlined SVGs never collide.
  svg = svg.replace(/\bid="([^"]+)"/g, (_, id) => `id="${p}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${p}${id})`)
    .replace(/(xlink:href|href)="#([^"]+)"/g, (_, a, id) => `${a}="#${p}${id}"`)
    .replace(/aria-labelledby="([^"]+)"/g, (_, ids) => `aria-labelledby="${ids.split(/\s+/).map(i => p + i).join(' ')}"`);
  // Size by the container: drop fixed width/height on the root element.
  svg = svg.replace(/<svg\b([^>]*)>/, (m, a) => {
    a = a.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${a} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
  const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
  const alt = (attrs.match(/alt="([^"]*)"/) || [])[1] || '';
  const style = (attrs.match(/style="([^"]*)"/) || [])[1] || '';
  return `<span class="svg-inline ${cls}" role="img" aria-label="${alt}" style="display:block;${style}">${svg}</span>`;
}

const files = process.argv.slice(2);
const browser = await chromium.launch();
for (const f of files) {
  const abs = path.resolve(f);
  const dir = path.dirname(abs);
  const missing = [];
  const html = fs.readFileSync(abs, 'utf8').replace(/<img\b([^>]*?)src="([^"]+\.svg)"([^>]*)>/g, (m, a1, src, a2) => {
    const out = inlineSvg(dir, src, a1 + a2);
    if (!out) { missing.push(src); return m; }
    return out;
  });
  const tmp = path.join(dir, `.build-${path.basename(f)}`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')]
    .map((el, i) => (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) ? i + 1 : 0).filter(Boolean));
  const out = abs.replace(/\.html$/, '.pdf');
  await page.pdf({ path: out, width: '148mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
  const n = await page.locator('.page').count();
  console.log(path.basename(out), n, 'pages', overflow.length ? `OVERFLOW on pages ${overflow.join(',')}` : 'no overflow',
    missing.length ? `MISSING art: ${missing.join(', ')}` : '');
  await page.close();
  fs.unlinkSync(tmp);
}
await browser.close();

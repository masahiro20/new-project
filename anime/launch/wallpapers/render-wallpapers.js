// Renders every *.svg in this folder to a 1179x2556 PNG with the Google Fonts loaded.
// Usage: node render-wallpapers.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path'); const os = require('os');
const dir = __dirname;
(async () => {
  const browser = await chromium.launch();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8');
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=block">
<style>html,body{margin:0;background:#0E0B10}svg{display:block}</style></head><body>${svg}</body></html>`;
    const tmp = path.join(os.tmpdir(), f + '.html'); fs.writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family));
    const out = path.join(dir, f.replace(/\.svg$/, '.png'));
    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
    console.log(path.basename(out), w + 'x' + h, fs.statSync(out).size, 'bytes', [...new Set(fonts)].join(','));
    await page.close();
  }
  await browser.close();
})();

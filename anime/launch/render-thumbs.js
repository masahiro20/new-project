const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const dir = '/home/user/new-project/anime/launch';
const names = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  for (const n of names) {
    const svg = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    const html = `<!doctype html><html><head><meta charset="utf-8"><base href="file://${dir}/">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=block">
<style>html,body{margin:0;background:#0E0B10}svg{display:block}</style></head><body>${svg}</body></html>`;
    const tmp = path.join(require('os').tmpdir(), n + '.html'); fs.writeFileSync(tmp, html);
    const page = await browser.newPage({ viewport: { width: +w, height: +h } });
    await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
    await page.screenshot({ path: path.join(dir, n + '.png'), clip: { x: 0, y: 0, width: +w, height: +h } });
    console.log(n, w + 'x' + h, [...new Set(fonts)].join(','));
    await page.close();
  }
  await browser.close();
})();

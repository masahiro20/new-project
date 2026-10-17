// CrazyGames 版の読み込み時間と容量を測る（SDK は本物。ローカル環境として動く）。GAME_DIR=dist/crazygames node release/crazygames/measure.js
const L = require('../../tests/lib');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = path.resolve(process.env.GAME_DIR || 'dist/crazygames');
  let total = 0, n = 0; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : (total += fs.statSync(p).size, n++); } })(dir);
  console.log(`files: ${n}, total ${(total / 1024).toFixed(0)} KB (limit 250 MB / 1500 files; initial download limit 50 MB)`);
  const errors = []; const b = await L.launch();
  for (const [name, o] of [['PC 1280x720', { viewport: { width: 1280, height: 720 } }], ['phone 844x390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }], ['phone 667x375', { viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true }]]) {
    const t0 = Date.now();
    const pg = await L.open(b, name, Object.assign({ locale: 'en-US' }, o), errors);
    const tTitle = Date.now() - t0;
    const bad = await pg.evaluate(() => { const out = []; document.querySelectorAll('#title *').forEach(e => { if (e.closest('.hidden')) return; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (!r.width || cs.visibility === 'hidden' || cs.display === 'none') return; if (r.right > innerWidth + 2 || r.left < -2) out.push((e.id || e.className) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); }); return { out: out.slice(0, 6), hscroll: document.documentElement.scrollWidth > innerWidth }; });
    const t1 = Date.now();
    await pg.evaluate(() => { window.__t = performance.now(); });
    await pg.click('#btnLaunch'); await L.waitState(pg, 'launch', 3000); await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
    console.log(`${name}: title ready ${tTitle} ms (headless software GL, CDN SDK); title overflow: ${JSON.stringify(bad)}; launch->play ${Date.now() - t1} ms`);
    await pg.__close();
  }
  console.log('errors:', errors.filter(e => !/HTML5 SDK/.test(e))); await b.close();
})();

const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'skip', { viewport: { width: 1280, height: 720 } }, errors);
  await pg.evaluate(() => { window.__kl = []; window.addEventListener('keydown', e => __kl.push([e.code, __GAME.state, Math.round(performance.now())]), true); });
  const t0 = Date.now(); await pg.click('#btnLaunch'); const tc = await pg.evaluate(() => Math.round(performance.now()));
  for (const w of [300, 700, 1500, 2500]) { await pg.waitForTimeout(w - (Date.now() - t0) > 0 ? w - (Date.now() - t0) : 0); await pg.keyboard.press('KeyK'); await pg.waitForTimeout(50); console.log(w, await pg.evaluate(() => __GAME.state)); }
  console.log(tc, JSON.stringify(await pg.evaluate(() => __kl)));
  // tap on launch screen
  await pg.__close(); await b.close();
})();

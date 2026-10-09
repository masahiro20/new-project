// Mobile layout screenshots: title (mission select, daily), hangar, reset confirm, result. Plus overflow checks.
const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  for (const [name, vp] of [['land', { width: 844, height: 390 }], ['port', { width: 390, height: 844 }]]) {
    const pg = await L.open(b, name, { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }, errors);
    await pg.waitForTimeout(800);
    await L.shot(pg, `ui_${name}_title_locked`);
    await pg.evaluate(() => { localStorage.setItem('grandstride_save', JSON.stringify({ v: 1, parts: 900, up: { legs: 2, core: 1, armor: 0 }, cleared: { 1: true }, launched: true })); });
    await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
    await pg.tap('.mcard[data-m="2"]'); await pg.waitForTimeout(1500);
    const ov = await pg.evaluate(() => { const r = []; document.querySelectorAll('#title *').forEach(el => { if (!el.offsetParent && el.id !== 'title') return; const b = el.getBoundingClientRect(); if (b.width && (b.right > innerWidth + 1 || b.bottom > innerHeight + 1 || b.left < -1 || b.top < -1)) r.push(el.id || el.className || el.tagName); }); return { sel: __GAME.selectedMission, over: r.slice(0, 8), sh: document.getElementById('title').scrollHeight, ch: document.getElementById('title').clientHeight }; });
    console.log(name, 'title', JSON.stringify(ov));
    await L.shot(pg, `ui_${name}_title_m2`);
    await pg.tap('#btnHangar'); await pg.waitForTimeout(400);
    const hv = await pg.evaluate(() => { const h = document.getElementById('hangar'), c = h.querySelector('.card').getBoundingClientRect(); return { open: __GAME.hangarOpen, card: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)], scroll: h.scrollHeight > h.clientHeight + 1 }; });
    console.log(name, 'hangar', JSON.stringify(hv));
    await L.shot(pg, `ui_${name}_hangar`);
    await pg.tap('.hbuy[data-k="armor"]'); await pg.waitForTimeout(300);
    console.log(name, 'after buy', JSON.stringify(await pg.evaluate(() => ({ up: __GAME.upgrades, parts: __GAME.parts, msg: document.getElementById('hMsg').textContent }))));
    await pg.tap('#hReset'); await pg.waitForTimeout(200);
    await L.shot(pg, `ui_${name}_hangar_confirm`);
    await pg.tap('#hNo'); await pg.tap('#hClose'); await pg.waitForTimeout(200);
    await pg.evaluate(() => __GAME.startMission(1)); await pg.waitForTimeout(1500);
    console.log(name, 'play armorMax', JSON.stringify(await pg.evaluate(() => __GAME.player.armorMax)));
    await pg.evaluate(() => __GAME.debugKillAll());
    await L.waitState(pg, 'result', 20000); await pg.waitForTimeout(400);
    await L.shot(pg, `ui_${name}_result`);
    const rv = await pg.evaluate(() => { const c = document.querySelector('#result .card').getBoundingClientRect(); return [Math.round(c.top), Math.round(c.bottom), innerHeight]; });
    console.log(name, 'result card', JSON.stringify(rv));
    await pg.__close();
  }
  console.log(errors.join('\n') || 'no errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });

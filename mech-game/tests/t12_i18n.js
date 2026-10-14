// 12. Language: English UI has no Japanese left on any screen; JA mode still works; the switch button persists the choice.
//     GAME_DIR=dist/crazygames (or dist/itch). Screenshots go to tests/shots/i18n-*.png
const L = require('./lib');
const JP = /[぀-ヿ一-鿿＀-￯]/;
const WIDTHS = [[800, 450], [1280, 720]];
async function texts(pg) { return pg.evaluate(() => { const o = []; document.querySelectorAll('#app *').forEach(e => { if (e.id === 'btnLang') return; if (e.children.length === 0 && e.textContent.trim()) o.push(e.textContent.trim()); const a = e.getAttribute('aria-label'); if (a) o.push(a); const t = e.getAttribute('title'); if (t) o.push(t); }); return o; }); }
async function overflow(pg) { return pg.evaluate(() => { const bad = []; document.querySelectorAll('#app *').forEach(e => { if (e.closest('.hidden') || e.closest('#touch') || e.closest('#compass') || e.id === 'lockTxt') return; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.offsetParent && cs.position !== 'fixed') return; if (parseFloat(cs.opacity) === 0) return; const r = e.getBoundingClientRect(); if (r.width === 0) return; if (r.right > innerWidth + 2 || r.left < -2) bad.push((e.id || e.className || e.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); }); return bad.slice(0, 8); }); }
(async () => {
  const errors = []; const b = await L.launch();
  for (const [w, h] of WIDTHS) {
    const pg = await L.open(b, 'en' + w, { viewport: { width: w, height: h }, locale: 'en-US' }, errors);
    await pg.evaluate(() => __GAME.debugSkipTutorial && __GAME.debugSkipTutorial());
    L.check(`${w}: <html lang> is en`, await pg.evaluate(() => document.documentElement.lang === 'en'));
    let t = (await texts(pg)).filter(x => JP.test(x));
    L.check(`${w}: title screen has no Japanese`, t.length === 0, t.slice(0, 6));
    L.check(`${w}: title screen fits`, (await overflow(pg)).length === 0, await overflow(pg));
    await L.shot(pg, `i18n-title-${w}`);
    await pg.evaluate(() => { __GAME.debugAddParts(900); __GAME.openHangar(); });
    await pg.waitForTimeout(300);
    t = (await texts(pg)).filter(x => JP.test(x)); L.check(`${w}: hangar has no Japanese`, t.length === 0, t.slice(0, 6));
    L.check(`${w}: hangar fits`, (await overflow(pg)).length === 0, await overflow(pg));
    await L.shot(pg, `i18n-hangar-${w}`);
    await pg.evaluate(() => __GAME.closeHangar());
    await L.launchToPlay(pg);
    await pg.waitForFunction(() => __GAME.enemies.length > 0, null, { timeout: 60000 });
    await L.waitGame(pg, 3);
    t = (await texts(pg)).filter(x => JP.test(x)); L.check(`${w}: HUD has no Japanese`, t.length === 0, t.slice(0, 6));
    L.check(`${w}: HUD fits`, (await overflow(pg)).length === 0, await overflow(pg));
    await L.shot(pg, `i18n-hud-${w}`);
    const radio = await pg.evaluate(() => document.getElementById('radioText').textContent);
    L.check(`${w}: radio line is English`, radio && !JP.test(radio), radio);
    await pg.evaluate(() => __GAME.pause()); await pg.waitForTimeout(200);
    t = (await texts(pg)).filter(x => JP.test(x)); L.check(`${w}: pause has no Japanese`, t.length === 0, t.slice(0, 6));
    await L.shot(pg, `i18n-pause-${w}`);
    await pg.evaluate(() => __GAME.resume());
    await pg.evaluate(() => __GAME.debugKillAll()); await L.waitState(pg, 'result', 20000); await pg.waitForTimeout(500);
    t = (await texts(pg)).filter(x => JP.test(x)); L.check(`${w}: result has no Japanese`, t.length === 0, t.slice(0, 6));
    L.check(`${w}: result fits`, (await overflow(pg)).length === 0, await overflow(pg));
    await L.shot(pg, `i18n-result-${w}`);
    if (w === 800) {
      await pg.evaluate(() => __GAME.openHangar()); await pg.waitForTimeout(200); await pg.evaluate(() => __GAME.closeHangar());
      await pg.evaluate(() => document.getElementById('btnToTitle').click()); await L.waitState(pg, 'title', 5000);
      // switch to Japanese and back
      await pg.click('#btnLang'); await pg.waitForFunction(() => document.documentElement.lang === 'ja', null, { timeout: 5000 }).catch(() => {});
      await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title', null, { timeout: 20000 });
      L.check('switch button -> Japanese after reload', await pg.evaluate(() => document.documentElement.lang === 'ja' && /出撃/.test(document.getElementById('btnLaunch').textContent)));
      await L.shot(pg, 'i18n-title-ja');
      await pg.click('#btnLang'); await pg.waitForTimeout(1500);
      await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title', null, { timeout: 20000 });
      L.check('switch button -> English again', await pg.evaluate(() => document.documentElement.lang === 'en'));
    }
    await pg.__close();
  }
  const pgj = await L.open(b, 'ja', { viewport: { width: 800, height: 450 }, locale: 'ja-JP' }, errors);
  // (the CrazyGames build takes the locale from the SDK, whose local demo mode reports English, so this check is for the itch build)
  if (!process.env.GAME_DIR || !/crazygames/.test(process.env.GAME_DIR)) L.check('ja browser locale -> Japanese by default', await pgj.evaluate(() => document.documentElement.lang === 'ja'));
  await pgj.__close(); await b.close();
  process.exit(L.summary(errors.filter(e => !/HTML5 SDK/.test(e))) ? 1 : 0);
})();

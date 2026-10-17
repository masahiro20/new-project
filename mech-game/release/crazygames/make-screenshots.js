// 英語 UI のスクリーンショット（1280x720）を作る。CrazyGames と itch.io の両方で使う。
// 使い方: cd mech-game && bash build.sh && GAME_DIR=dist/itch node release/crazygames/make-screenshots.js
const L = require('../../tests/lib');
const path = require('path');
const OUT = path.join(__dirname, 'screenshots');
const SAVE = { v: 2, parts: 640, up: { legs: 2, core: 1, armor: 1 }, cleared: { 1: true, 2: true, 3: false }, launched: true, tutorial: true, streak: { last: '', n: 2 },
  medals: { 1: [true, true, false], 2: [true, false, false], 3: [false, false, false] }, hardClear: {}, hard: false, assist: false, loses: {}, run: null };
(async () => {
  const errors = []; const b = await L.launch();
  const init = `try{ localStorage.setItem('grandstride_save', ${JSON.stringify(JSON.stringify(SAVE))}); localStorage.setItem('grandstride_lang','en'); localStorage.setItem('grandstride_quality','high'); localStorage.setItem('grandstride_hiscore','21500'); localStorage.setItem('grandstride_hirank','S'); }catch(e){}`;
  const pg = await L.open(b, 'shots', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US' }, errors, init);
  const shot = async (n) => { await pg.screenshot({ path: path.join(OUT, n + '.png') }); console.log('wrote', n); };
  const wait = (ms) => pg.waitForTimeout(ms);
  await wait(1200); await shot('01-title');
  await pg.evaluate(() => __GAME.openHangar()); await wait(400); await shot('02-hangar'); await pg.evaluate(() => __GAME.closeHangar());
  for (const [id, base, boss] of [[1, '03-combat', false], [1, '04-shell-lord', true], [2, '05-harbor', false], [2, '06-twinshell', true], [3, '07-storm', false], [3, '08-maelshell', true]]) {
    await pg.evaluate(([id, boss]) => { __GAME.startMission(id); if (boss) __GAME.debugSpawnBoss(); }, [id, boss]);
    await wait(boss ? 4000 : 7000);
    // ラジオの文字送りが途中で撮れないように、文末まで出るのを待つ（ソフトウェア描画では遅いため）
    await pg.waitForFunction(() => /[.!?…]$/.test(document.getElementById('radioText').textContent.trim()), null, { timeout: 70000 }).catch(() => {});
    await wait(300); await shot(base);
    await pg.evaluate(() => __GAME.goTitle && __GAME.goTitle());
    await pg.evaluate(() => { try { if (__GAME.state !== 'title') document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); } catch (e) {} });
    await wait(300);
    await pg.evaluate(() => { const t = document.getElementById('btnPauseTitle'); if (t && t.offsetParent) t.click(); });
    await wait(500);
  }
  await pg.evaluate(() => { __GAME.startMission(1); }); await wait(3000);
  await pg.evaluate(() => __GAME.debugKillAll()); await L.waitState(pg, 'result', 30000); await wait(1500); await shot('09-result');
  console.log('errors:', errors); await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });

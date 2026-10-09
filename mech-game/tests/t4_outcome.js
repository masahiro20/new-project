// 4. Win / lose (armor 0 by real enemy fire, time-out) / retry resets / back-to-title relaunch / debug runs never save a high score.
const L = require('./lib');
const HS = pg => pg.evaluate(() => ({ hs: localStorage.getItem('grandstride_hiscore'), rank: localStorage.getItem('grandstride_hirank') }));
async function checkReset(pg, tag) {
  const g = await pg.evaluate(() => ({ s: __GAME.state, p: __GAME.player, m: __GAME.mission, cracks: document.getElementById('cracks').childElementCount }));
  const ok = g.s === 'play' && g.p.kills === 0 && g.p.armor === 100 && g.p.shots === 0 && g.p.hits === 0 && g.p.heat === 0 && g.m.timeLeft > 178 &&
    g.m.enemiesAlive === 0 && !g.m.lordSpawned && !g.m.lordDead && !g.m.ending && g.p.grip.every(v => v === 100) && g.cracks === 0;
  L.check(`${tag}: state fully reset`, ok, { kills: g.p.kills, armor: g.p.armor, timeLeft: +g.m.timeLeft.toFixed(1), enemies: g.m.enemiesAlive, shots: g.p.shots, heat: g.p.heat, lord: g.m.lordSpawned, grip: g.p.grip, cracks: g.cracks });
}
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'outcome', { viewport: { width: 800, height: 450 } }, errors);
  await pg.evaluate(() => localStorage.clear());
  // first-run tutorial (MISSION 01) holds the mission clock; this test is about other things
  await pg.evaluate(() => __GAME.debugSkipTutorial && __GAME.debugSkipTutorial());
  await L.launchToPlay(pg);
  await checkReset(pg, 'first launch');
  // armor is not writable through the test API
  const w = await pg.evaluate(() => { const p = __GAME.player; p.armor = 0; return __GAME.player.armor; });
  L.check('__GAME.player is a read-only snapshot (armor cannot be set from tests)', w === 100, w);
  // ---- win via debugKillAll
  await L.waitGame(pg, 3);
  await pg.evaluate(() => __GAME.debugKillAll());
  await L.waitState(pg, 'result', 15000);
  await pg.waitForTimeout(400);
  let r = await pg.evaluate(() => ({ r: __GAME.result, title: document.getElementById('resTitle').textContent, newHi: document.getElementById('newHi').textContent }));
  await L.shot(pg, 't4_win');
  L.check('debugKillAll -> MISSION COMPLETE result', r.r && r.r.win && r.title === 'MISSION COMPLETE' && r.r.kills === 13, { title: r.title, kills: r.r && r.r.kills, score: r.r && r.r.score, rank: r.r && r.r.rank });
  let hs = await HS(pg);
  L.check('debugKillAll run does NOT save high score', hs.hs === null && r.r.debug === true && r.newHi === '', { stored: hs, debug: r.r.debug, newHi: r.newHi });
  // ---- retry resets
  await pg.click('#btnRetry');
  await L.waitState(pg, 'launch', 5000);
  await pg.waitForTimeout(600); await pg.keyboard.press('KeyK');
  await L.waitState(pg, 'play', 20000);
  await checkReset(pg, 'retry after win');
  // ---- lose by armor 0 (real enemy fire). Score some kills first so the legit result can set a high score.
  const t0 = Date.now();
  await pg.mouse.move(400, 225);
  for (let i = 0; i < 200; i++) {
    const g = await L.G(pg);
    if (g.s !== 'play' || g.m.ending) break;
    if (g.p.kills < 2 && g.m.enemiesAlive) { await pg.evaluate(() => __GAME.debugFaceNearest()); await pg.mouse.down(); await L.waitGame(pg, 0.8); await pg.mouse.up(); }
    else await L.waitGame(pg, 2);
  }
  await L.waitState(pg, 'result', 240000);
  await pg.waitForTimeout(400);
  r = await pg.evaluate(() => ({ r: __GAME.result, p: __GAME.player, title: document.getElementById('resTitle').textContent, newHi: document.getElementById('newHi').textContent }));
  await L.shot(pg, 't4_lose_armor');
  L.check('armor 0 from enemy fire -> MISSION FAILED', !r.r.win && r.p.armor <= 0 && r.title === 'MISSION FAILED', { armor: r.p.armor, kills: r.r.kills, gameTime: Math.round(r.r.time), score: r.r.score, realSec: Math.round((Date.now() - t0) / 1000) });
  hs = await HS(pg);
  L.check('legit run saves high score (score > 0)', r.r.score > 0 ? (+hs.hs === r.r.score && /NEW RECORD/.test(r.newHi)) : hs.hs === null, { score: r.r.score, stored: hs });
  const legit = hs;
  // ---- back to title, high score shown, relaunch, time-out
  await pg.click('#btnToTitle'); await L.waitState(pg, 'title');
  const hiVal = await pg.evaluate(() => document.getElementById('hiVal').textContent);
  L.check('title shows saved high score', +hiVal === (+legit.hs || 0), hiVal);
  await L.launchToPlay(pg);
  await checkReset(pg, 'relaunch from title');
  await L.waitGame(pg, 1);
  await pg.evaluate(() => __GAME.debugSetTimeLeft(1.5));
  await L.waitState(pg, 'result', 30000);
  await pg.waitForTimeout(400);
  r = await pg.evaluate(() => ({ r: __GAME.result, m: __GAME.mission, p: __GAME.player, title: document.getElementById('resTitle').textContent }));
  await L.shot(pg, 't4_lose_time');
  L.check('time-out -> MISSION FAILED with armor left', !r.r.win && r.p.armor > 0 && r.m.timeLeft === 0 && r.title === 'MISSION FAILED', { armor: Math.round(r.p.armor), timeLeft: r.m.timeLeft, time: Math.round(r.r.time) });
  hs = await HS(pg);
  L.check('debugSetTimeLeft run does not touch high score', hs.hs === legit.hs, { stored: hs });
  // ---- pause -> title -> relaunch
  await pg.click('#btnRetry'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  await checkReset(pg, 'retry after time-out');
  await L.waitGame(pg, 4);
  await pg.mouse.down(); await L.waitGame(pg, 1); await pg.mouse.up();
  await pg.keyboard.press('Escape'); await L.waitState(pg, 'paused');
  await pg.click('#btnPauseTitle'); await L.waitState(pg, 'title');
  const ti = await pg.evaluate(() => ({ hud: document.getElementById('hud').classList.contains('hidden'), touch: document.getElementById('touch').classList.contains('hidden') }));
  L.check('pause -> title hides HUD', ti.hud && ti.touch, ti);
  await L.launchToPlay(pg);
  await checkReset(pg, 'relaunch after pause->title');
  await L.shot(pg, 't4_relaunch');
  const fail = L.summary(errors);
  await pg.__close(); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

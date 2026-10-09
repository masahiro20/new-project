// New features, one check each: tutorial, autosave, interrupted run, legit clear -> medals / NEXT MISSION / tomorrow,
// HARD, ASSIST offer after 2 defeats, stopLaunch on skip, jump height, all-clear title, save migration v1 -> v2.
const L = require('../qa/lib');
const st = pg => pg.evaluate(() => __GAME.state);
async function until(pg, fn, arg, ms = 120000) { return pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); }
async function botClear(pg, maxReal = 1500000) {
  // aims with debugFaceNearest (not a debug hook: it only turns the mech) and holds fire; jumps now and then
  const t0 = Date.now(); await pg.mouse.move(400, 225);
  while (Date.now() - t0 < maxReal) {
    const s = await st(pg); if (s !== 'play') break;
    await pg.evaluate(() => __GAME.debugFaceNearest());
    await pg.mouse.down(); await pg.waitForTimeout(700); await pg.mouse.up();
  }
  await until(pg, () => __GAME.state === 'result', null, 60000);
}
(async () => {
  const errors = []; const b = await L.launch();
  // ---- v1 save migration
  const v1 = JSON.stringify({ v: 1, parts: 300, up: { legs: 1, core: 0, armor: 0 }, cleared: { 1: true }, launched: true, daily: null, streak: { last: '', n: 0 } });
  let pg = await L.open(b, 'mig', { viewport: { width: 800, height: 450 } }, errors, `try{ if(!sessionStorage.getItem('m')){ sessionStorage.setItem('m','1'); localStorage.setItem('grandstride_save', ${JSON.stringify(v1)}); localStorage.setItem('grandstride_hirank','A'); } }catch(e){}`);
  let r = await pg.evaluate(() => ({ s: JSON.parse(localStorage.getItem('grandstride_save')), m: __GAME.medals, td: __GAME.tutorialDone, parts: __GAME.parts }));
  L.check('save v1 -> v2 migration (parts/upgrades kept, CLEAR + RANK A medals from records, tutorial seen)', r.s.v === 2 && r.parts >= 300 && r.m[1].medals[0] && r.m[1].medals[1] && !r.m[1].medals[2] && r.td, { v: r.s.v, parts: r.parts, m1: r.m[1], td: r.td });
  await pg.__close();

  // ---- fresh player: tutorial on first real M01 launch
  pg = await L.open(b, 'fresh', { viewport: { width: 800, height: 450 } }, errors);
  await pg.click('#btnLaunch'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(700);
  await pg.evaluate(() => { const MA = window.MechAudio, f = MA.stopLaunch; window.__stopN = 0; MA.stopLaunch = function () { window.__stopN++; return f.apply(this, arguments); }; });
  await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  await pg.waitForTimeout(1500);
  const sn = await pg.evaluate(() => window.__stopN);
  L.check('skip launch calls MechAudio.stopLaunch()', sn === 1, sn);
  r = await pg.evaluate(() => ({ tut: __GAME.tutorial, sp: __GAME.mission.spawned, tl: __GAME.mission.timeLeft, hint: document.getElementById('tutHint').offsetParent !== null, radio: document.getElementById('radioText').textContent }));
  L.check('tutorial starts at "move", clock held, no ASHSHELL yet, hint shown', r.tut === 'move' && r.sp === 0 && r.tl === 180 && r.hint, r);
  await L.shot(pg, '../qa2/f_tut_move');
  await pg.keyboard.down('KeyW'); await until(pg, () => __GAME.tutorial !== 'move', null, 120000); await pg.keyboard.up('KeyW');
  await pg.keyboard.down('KeyD'); await until(pg, () => __GAME.tutorial !== 'turn', null, 120000); await pg.keyboard.up('KeyD');
  r = await pg.evaluate(() => ({ tut: __GAME.tutorial, sp: __GAME.mission.spawned, tl: __GAME.mission.timeLeft }));
  L.check('move -> turn -> fire (still no spawn, clock held)', r.tut === 'fire' && r.sp === 0 && r.tl === 180, r);
  await pg.mouse.move(400, 225); await pg.mouse.down(); await until(pg, () => __GAME.tutorial !== 'fire', null, 120000); await pg.mouse.up();
  await pg.keyboard.down('KeyW'); await pg.keyboard.down('ShiftLeft');
  await until(pg, () => __GAME.tutorial !== 'dash', null, 120000);
  await pg.keyboard.up('ShiftLeft'); await pg.keyboard.up('KeyW');
  await until(pg, () => __GAME.mission.spawned > 0, null, 120000);
  r = await pg.evaluate(() => ({ tut: __GAME.tutorial, sp: __GAME.mission.spawned, tl: __GAME.mission.timeLeft }));
  L.check('dash step done -> first ASHSHELL arrives in the second half, clock running', r.tut === 'boost' && r.sp >= 1 && r.tl < 180, r);
  await pg.keyboard.press('Space');
  await until(pg, () => __GAME.tutorial === null, null, 60000);
  let maxY = 0; for (let i = 0; i < 30; i++) { const y = await pg.evaluate(() => __GAME.player.y); maxY = Math.max(maxY, y); if (i > 3 && y === 0) break; await pg.waitForTimeout(80); }
  r = await pg.evaluate(() => ({ done: __GAME.tutorialDone }));
  L.check('boost ends the tutorial, saved as seen', r.done, r);
  // ---- interrupted run: reload mid-mission
  const p0 = await pg.evaluate(() => __GAME.parts);
  await pg.reload(); await until(pg, () => window.__GAME && __GAME.state === 'title', null, 20000);
  r = await pg.evaluate(() => ({ note: document.getElementById('titleNote').textContent, parts: __GAME.parts, run: JSON.parse(localStorage.getItem('grandstride_save')).run }));
  L.check('closed mid-mission -> "前回の作戦は中断されました" + defeat minimum PARTS', /前回の作戦は中断されました/.test(r.note) && r.parts === p0 + 15 && r.run === null, { note: r.note, before: p0, after: r.parts });
  await L.shot(pg, '../qa2/f_interrupted');
  // second launch: no tutorial
  await pg.click('#btnLaunch'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(500); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  r = await pg.evaluate(() => __GAME.tutorial);
  L.check('second M01 launch: no tutorial', r === null, r);
  // jump height
  await pg.keyboard.press('Space'); maxY = 0;
  for (let i = 0; i < 60; i++) { const y = await pg.evaluate(() => __GAME.player.y); maxY = Math.max(maxY, y); if (i > 3 && y === 0) break; await pg.waitForTimeout(40); }
  L.check('BOOST jump peak clears the body-slam heights (beetle 5m / SHELL LORD 6m)', maxY > 6, { peak: +maxY.toFixed(2) });
  // ---- legit clear of M01 by the bot
  const tReal = Date.now();
  await botClear(pg);
  await pg.waitForTimeout(1500);
  r = await pg.evaluate(() => ({ r: __GAME.result, next: !document.getElementById('btnNext').classList.contains('hidden'), nextPrimary: document.getElementById('btnNext').classList.contains('primary'), retryPrimary: document.getElementById('btnRetry').classList.contains('primary'),
    medalsHtml: document.getElementById('rMedals').innerHTML, rew: document.getElementById('rewards').textContent, m: __GAME.medals }));
  console.log('  bot run:', JSON.stringify({ win: r.r.win, rank: r.r.rank, dmg: Math.round(r.r.damageTaken), time: Math.round(r.r.time), real: Math.round((Date.now() - tReal) / 1000), parts: r.r.partsDetail }));
  await L.shot(pg, '../qa2/f_result_win');
  if (r.r.win) {
    L.check('legit clear: medal CLEAR earned (+bonus), new-medal pop, saved', r.r.newMedals.includes(0) && r.m[1].medals[0] && /class="md on new"/.test(r.medalsHtml) && r.r.partsDetail.medal > 0, { newMedals: r.r.newMedals, medals: r.m[1], bonus: r.r.partsDetail.medal });
    L.check('win: NEXT MISSION is the primary button, RELAUNCH is not', r.next && r.nextPrimary && !r.retryPrimary, r);
    L.check('result shows tomorrow reward line', /明日の報酬/.test(r.rew), r.rew.slice(-60));
    await pg.click('#btnNext'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(500); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
    r = await pg.evaluate(() => __GAME.missionId);
    L.check('NEXT MISSION launches MISSION 02', r === 2, r);
    await pg.keyboard.press('Escape'); await L.waitState(pg, 'paused'); await pg.click('#btnPauseTitle'); await L.waitState(pg, 'title');
  } else L.check('bot cleared MISSION 01 legit (needed for the medal checks)', false, r.r);
  // ---- HARD on M01 (cleared)
  await pg.evaluate(() => __GAME.selectMission(1));
  const la0 = await pg.evaluate(() => __GAME.lastAutosave.count);
  await pg.click('#tglHard');
  r = await pg.evaluate(() => ({ hard: __GAME.hard, la: __GAME.lastAutosave, ind: document.getElementById('autoSave').classList.contains('on'), saved: JSON.parse(localStorage.getItem('grandstride_save')).hard }));
  L.check('HARD toggle on a cleared mission: setting saved at once, AUTO SAVE indicator shown', r.hard && r.saved && r.la.count > la0 && r.ind, r);
  await L.shot(pg, '../qa2/f_title_hard');
  await pg.evaluate(() => __GAME.startMission(1)); await pg.waitForTimeout(500);
  await until(pg, () => __GAME.enemies.length > 0, null, 120000);
  r = await pg.evaluate(() => __GAME.enemies[0]);
  L.check('HARD: enemy HP x1.5 (beetle 6, floater 7.5)', (r.type === 'beetle' && r.hp === 6) || (r.type === 'floater' && r.hp === 7.5), r);
  await pg.evaluate(() => __GAME.debugKillAll()); await L.waitState(pg, 'result', 30000);
  r = await pg.evaluate(() => __GAME.result);
  L.check('HARD result flagged, PARTS x1.5 part shown', r.hard && r.partsDetail.hard > 0, { hard: r.hard, detail: r.partsDetail });
  await pg.click('#btnToTitle'); await L.waitState(pg, 'title');
  await pg.evaluate(() => __GAME.setHard(false));
  // ---- two legit defeats -> ASSIST offered
  for (let k = 0; k < 2; k++) {
    await pg.evaluate(() => __GAME.startMission(1));
    await until(pg, () => __GAME.state === 'result', null, 1500000);
  }
  r = await pg.evaluate(() => ({ r: __GAME.result, btn: !document.getElementById('btnAssist').classList.contains('hidden'), retryPrimary: document.getElementById('btnRetry').classList.contains('primary'), loses: __GAME.medals[1].loses }));
  L.check('2 defeats in a row -> ASSIST button on the result, RELAUNCH primary', !r.r.win && r.btn && r.retryPrimary && r.loses >= 2, { loses: r.loses, btn: r.btn });
  await L.shot(pg, '../qa2/f_result_assist');
  await pg.click('#btnAssist'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(500); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  r = await pg.evaluate(() => ({ as: __GAME.assist, tag: document.getElementById('mnMode').textContent }));
  L.check('ASSIST relaunch: assist on, HUD shows ASSIST', r.as && r.tag === 'ASSIST', r);
  await pg.evaluate(() => __GAME.debugKillAll()); await L.waitState(pg, 'result', 30000);
  r = await pg.evaluate(() => ({ r: __GAME.result, html: document.getElementById('rMedals').textContent }));
  L.check('ASSIST: RANK A+ medal disabled on the result', r.r.assist && r.r.medals[1] === false && /ASSIST中は無効/.test(r.html), r.html);
  await pg.click('#btnToTitle'); await L.waitState(pg, 'title'); await pg.evaluate(() => __GAME.setAssist(false));
  // ---- debugSimulateInterrupted
  await pg.evaluate(() => __GAME.debugSimulateInterrupted(2));
  await pg.reload(); await until(pg, () => window.__GAME && __GAME.state === 'title', null, 20000);
  r = await pg.evaluate(() => document.getElementById('titleNote').textContent);
  L.check('debugSimulateInterrupted -> notice on next load', /中断.*MISSION 02/.test(r), r);
  await pg.__close();
  // ---- all clear title
  const all = JSON.stringify({ v: 2, parts: 0, up: { legs: 0, core: 0, armor: 0 }, cleared: { 1: true, 2: true, 3: true }, launched: true, tutorial: true, streak: { last: '', n: 0 }, medals: { 1: [true, true, true], 2: [true, false, false], 3: [true, false, false] }, hardClear: { 1: true } });
  pg = await L.open(b, 'all', { viewport: { width: 1280, height: 720 } }, errors, `try{ if(!sessionStorage.getItem('a')){ sessionStorage.setItem('a','1'); localStorage.setItem('grandstride_save', ${JSON.stringify(all)}); } }catch(e){}`);
  r = await pg.evaluate(() => ({ t: document.getElementById('allClear').textContent, vis: !document.getElementById('allClear').classList.contains('hidden'), stars: document.getElementById('mStars1').textContent }));
  L.check('all 3 cleared: title shows 全作戦完了 + next goals (HARD 1/3, medals 5/9)', r.vis && /全作戦完了/.test(r.t) && /1\/3/.test(r.t) && /5\/9/.test(r.t) && r.stars.startsWith('★★★'), r);
  await L.shot(pg, '../qa2/f_title_allclear');
  await pg.__close();
  const fail = L.summary(errors); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

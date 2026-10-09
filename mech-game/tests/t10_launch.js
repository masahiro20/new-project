// 10. Launch sequence timing: first launch full (~5.5 s), later launches short (~1 s), persisted. Time-to-control for a first-time user.
// run: GAME_DIR=../frozen-m02 node t10_launch.js
const L = require('./lib');
async function timeToPlay(pg, t0) { await pg.waitForFunction(() => __GAME.state === 'play', null, { timeout: 30000, polling: 20 }); return Date.now() - t0; }
async function toTitle(pg) { await pg.evaluate(() => __GAME.pause()); await pg.click('#btnPauseTitle'); await L.waitState(pg, 'title'); }
(async () => {
  const errors = []; const b = await L.launch();
  const runs = [];
  for (let k = 0; k < 2; k++) {
    // fresh profile; measure page load -> title ready (navigation timing), then click -> play
    const pg = await L.open(b, 'first' + k, { viewport: { width: 1280, height: 720 } }, errors);
    const load = await pg.evaluate(() => ({ titleAt: Math.round(performance.now()), dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd), fps: __GAME.fps, short: __GAME.launchShort }));
    await pg.waitForTimeout(1500); // a player looks at the title for a moment
    const t0 = Date.now(); await pg.click('#btnLaunch');
    const full = await timeToPlay(pg, t0);
    const after = await pg.evaluate(() => ({ short: __GAME.launchShort, fps: __GAME.fps, save: JSON.parse(localStorage.getItem('grandstride_save')).launched }));
    await toTitle(pg);
    let t1 = Date.now(); await pg.click('#btnLaunch'); const short1 = await timeToPlay(pg, t1);
    await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
    const shortFlag = await pg.evaluate(() => __GAME.launchShort);
    t1 = Date.now(); await pg.click('#btnLaunch'); const short2 = await timeToPlay(pg, t1);
    runs.push({ load, full, after, short1, shortFlag, short2 });
    await pg.__close();
  }
  console.log('  runs', JSON.stringify(runs));
  const r = runs[0];
  L.check('fresh profile: launchShort false', !r.load.short && !runs[1].load.short);
  L.check('first launch is the full sequence (5.5 s .. 7.5 s wall)', runs.every(x => x.full >= 5400 && x.full < 7500), runs.map(x => x.full));
  L.check('after first launch: launchShort true and saved', runs.every(x => x.after.short && x.after.save));
  L.check('second launch short (<= 2.5 s wall: 1.0 s design + frame latency at 5-8 fps)', runs.every(x => x.short1 <= 2500), runs.map(x => x.short1));
  L.check('after reload still short', runs.every(x => x.shortFlag && x.short2 <= 2500), runs.map(x => x.short2));
  // skip on the full sequence (key / tap on launch screen, accepted after 0.4 s)
  const pg = await L.open(b, 'skip', { viewport: { width: 1280, height: 720 } }, errors);
  const hint = await pg.evaluate(() => document.getElementById('skipHint').textContent);
  let t0 = Date.now(); await pg.click('#btnLaunch'); await pg.keyboard.press('KeyK'); // too early: ignored
  const early = await pg.evaluate(() => __GAME.state);
  await pg.waitForTimeout(1200); await pg.keyboard.press('KeyK'); // skip uses launchSeq.t from the last frame; at 5-8 fps the first frames after the click are slow, so 0.5-0.7 s can still read < 0.4
  const skip = await timeToPlay(pg, t0);
  const fl = await pg.evaluate(() => __GAME.launchShort);
  L.check('full launch: immediate key ignored, key after ~1.2 s skips (hint shown)', early === 'launch' && skip < 2600 && /スキップ/.test(hint), { skipMs: skip, hint });
  L.check('skipping the first launch also counts as seen (next is short)', fl);
  // startMission() shortcut must not mark the sequence as seen
  const pg2 = await L.open(b, 'sm', { viewport: { width: 1280, height: 720 } }, errors);
  await pg2.evaluate(() => __GAME.startMission(1)); await L.waitGame(pg2, 0.3);
  L.check('startMission() does not mark launch as seen', !(await pg2.evaluate(() => __GAME.launchShort)));
  await pg.__close(); await pg2.__close();
  const avgLoad = Math.round((runs[0].load.titleAt + runs[1].load.titleAt) / 2), avgFull = Math.round((runs[0].full + runs[1].full) / 2);
  console.log(`  TIME-TO-CONTROL (first-time user): page load->title ${avgLoad} ms (DCL ${r.load.dcl} ms), click->play ${avgFull} ms; total ≈ ${avgLoad + avgFull} ms + time the player spends before clicking 出撃. With skip: ≈ ${avgLoad + skip} ms. fps ${r.load.fps}/${r.after.fps}`);
  const fail = L.summary(errors);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

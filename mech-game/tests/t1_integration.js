// 1. Integration: real MechAudio initialises, AudioContext running, no node leak from per-frame engine/servo, 60s soak with input.
const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'desktop', { viewport: { width: 800, height: 450 } }, errors);
  // first-run tutorial (MISSION 01) holds the mission clock; this test is about other things
  await pg.evaluate(() => __GAME.debugSkipTutorial && __GAME.debugSkipTutorial());
  const real = await pg.evaluate(() => ({ keys: Object.keys(window.MechAudio || {}), ctxs: __AUD.ctxs.length }));
  L.check('MechAudio is the real module (not the fallback proxy)', real.keys.includes('engine') && real.keys.includes('init'), real.keys.length + ' API fns');
  L.check('no AudioContext before user gesture', real.ctxs === 0, real.ctxs);
  await L.shot(pg, 't1_title');
  await pg.click('#btnLaunch');
  await pg.waitForFunction(() => __AUD.ctxs.length > 0 && __AUD.ctxs[0].state === 'running', null, { timeout: 5000 }).catch(() => {});
  const ac = await pg.evaluate(() => ({ n: __AUD.ctxs.length, st: __AUD.ctxs[0] && __AUD.ctxs[0].state, created: __AUD.total }));
  L.check('launch click creates exactly one AudioContext and it is running', ac.n === 1 && ac.st === 'running', ac);
  await pg.waitForTimeout(2500); await L.shot(pg, 't1_launch');
  // let the launch sequence play out naturally (no skip)
  await L.waitState(pg, 'play', 20000);
  L.check('launch sequence reaches play on its own', true);
  // idle node growth: engine()/servo() are called every frame
  await L.waitGame(pg, 1);
  const n0 = await pg.evaluate(() => ({ t: __AUD.total, tl: __GAME.mission.timeLeft, fps: __GAME.fps, live: __AUD.live.size }));
  await L.waitGame(pg, 3);
  const n1 = await pg.evaluate(() => ({ t: __AUD.total, tl: __GAME.mission.timeLeft, c: __AUD.created }));
  L.check('idle in play: no audio nodes created per frame (engine/servo reuse persistent nodes)', n1.t - n0.t <= 10, { createdIn3GameSec: n1.t - n0.t, liveConnected: n0.live, gameSec: +(n0.tl - n1.tl).toFixed(1), fps: n0.fps });
  // turning only (servo) for 3s
  const s0 = await pg.evaluate(() => __AUD.total);
  await pg.keyboard.down('KeyD'); await L.waitGame(pg, 2); await pg.keyboard.up('KeyD');
  const s1 = await pg.evaluate(() => __AUD.total);
  L.check('turning in place: node creation bounded (servo is persistent)', s1 - s0 < 200, { created3s: s1 - s0 });

  // 60s+ game-time soak with walking, shooting, dashing, jumping, turning. The mech usually dies in ~30s of
  // standing combat, so the soak spans several missions (retry on result) and sums game time.
  const live0 = await pg.evaluate(() => __AUD.live.size);
  const tStart = Date.now(); let gameSec = 0, missions = 1, shots = 0, i = 0, fpsSum = 0, fpsN = 0;
  let last = await pg.evaluate(() => __GAME.mission.timeLeft);
  await pg.mouse.move(400, 225);
  while (gameSec < 62) {
    const st = await pg.evaluate(() => ({ s: __GAME.state, tl: __GAME.mission.timeLeft, fps: __GAME.fps, shots: __GAME.player.shots, ac: __AUD.ctxs[0].state }));
    if (st.s === 'play') { gameSec += Math.max(0, last - st.tl); last = st.tl; fpsSum += st.fps; fpsN++; }
    if (st.s === 'result' || (st.s === 'play' && st.tl < 1)) {
      shots += st.shots;
      if (st.s !== 'result') await L.waitState(pg, 'result', 30000);
      await pg.click('#btnRetry'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
      last = await pg.evaluate(() => __GAME.mission.timeLeft); missions++; continue;
    }
    if (st.s !== 'play') { await pg.waitForTimeout(200); continue; }
    const ph = i++ % 6;
    await pg.keyboard.down('KeyW');
    if (ph === 1) await pg.keyboard.down('ShiftLeft');
    if (ph === 2) await pg.keyboard.press('Space');
    if (ph === 3) await pg.keyboard.down('KeyA');
    if (ph === 5) await pg.evaluate(() => __GAME.debugFaceNearest());
    await pg.mouse.down();
    await pg.mouse.move(400 + (ph - 3) * 30, 225, { steps: 3 });
    await L.waitGame(pg, 0.9);
    await pg.mouse.up();
    await pg.keyboard.up('ShiftLeft'); await pg.keyboard.up('KeyA');
    if (ph === 4) await pg.keyboard.up('KeyW');
    await L.waitGame(pg, 0.2);
    if (i === 8) await L.shot(pg, 't1_soak');
  }
  await pg.keyboard.up('KeyW');
  const t1 = await pg.evaluate(() => ({ s: __GAME.state, p: __GAME.player, ac: __AUD.ctxs[0].state, created: __AUD.created, total: __AUD.total }));
  shots += t1.p.shots;
  L.check('soak: >=60s game time with continuous input', gameSec >= 60, { gameSec: Math.round(gameSec), realSec: Math.round((Date.now() - tStart) / 1000), missions, avgFps: Math.round(fpsSum / Math.max(1, fpsN)) });
  L.check('soak: player actually shot/moved', shots > 30, { shots });
  L.check('soak: AudioContext still running', t1.ac === 'running', t1.ac);
  console.log('  nodes created so far:', t1.total, JSON.stringify(t1.created));
  // let every one-shot tail finish, then the set of still-connected nodes must be back near the baseline
  if (t1.s === 'play') { await pg.evaluate(() => __GAME.pause()); }
  await pg.waitForTimeout(4000);
  const live1 = await pg.evaluate(() => __AUD.live.size);
  L.check('no leaked audio nodes: connected-node count returns to baseline after one-shots end', live1 <= live0 + 15, { baseline: live0, afterSoak: live1 });
  if (t1.s === 'play') await pg.evaluate(() => __GAME.resume());
  const died = (await pg.evaluate(() => __GAME.state)) !== 'play';
  // through pause/result/title phases
  if (!died) { await pg.keyboard.press('Escape'); await L.waitState(pg, 'paused'); await pg.click('#btnResume'); await L.waitState(pg, 'play'); }
  await pg.evaluate(() => __GAME.debugKillAll());
  await L.waitState(pg, 'result', 8000);
  await pg.click('#btnToTitle'); await L.waitState(pg, 'title');
  await pg.waitForTimeout(1000);
  await pg.click('#btnLaunch'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(800); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play');
  const ac2 = await pg.evaluate(() => ({ n: __AUD.ctxs.length, st: __AUD.ctxs[0].state }));
  L.check('second launch reuses the same AudioContext', ac2.n === 1 && ac2.st === 'running', ac2);
  const fail = L.summary(errors);
  await pg.__close(); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

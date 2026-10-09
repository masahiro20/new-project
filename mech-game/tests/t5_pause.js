// 5. Pause freezes the mission clock; hidden tab auto-pauses (and suspends audio); window blur auto-pauses.
const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'pause', { viewport: { width: 800, height: 450 } }, errors);
  await L.launchToPlay(pg);
  await pg.waitForFunction(() => __GAME.enemies.length > 0, null, { timeout: 60000 });
  // API pause
  await pg.evaluate(() => __GAME.pause());
  let a = await L.G(pg); const e0 = JSON.stringify(await pg.evaluate(() => __GAME.enemies)); await pg.waitForTimeout(2500); let c = await L.G(pg); const e1 = JSON.stringify(await pg.evaluate(() => __GAME.enemies));
  const vis = await pg.evaluate(() => !document.getElementById('pause').classList.contains('hidden'));
  L.check('pause(): state paused, pause menu visible', a.s === 'paused' && vis);
  L.check('paused: mission clock frozen for 2.5s real time', c.m.timeLeft === a.m.timeLeft, { before: a.m.timeLeft, after: c.m.timeLeft });
  L.check('paused: enemies / player frozen', c.p.x === a.p.x && c.p.z === a.p.z && e0 === e1, { enemies: JSON.parse(e0).length });
  await L.shot(pg, 't5_pause');
  // input while paused is ignored
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(800); await pg.keyboard.up('KeyW');
  c = await L.G(pg);
  L.check('paused: W key does not move the mech', c.p.x === a.p.x && c.p.z === a.p.z);
  await pg.evaluate(() => __GAME.resume());
  a = await L.G(pg); await L.waitGame(pg, 1); c = await L.G(pg);
  L.check('resume(): clock runs again', c.s === 'play' && c.m.timeLeft < a.m.timeLeft, { dt: +(a.m.timeLeft - c.m.timeLeft).toFixed(2) });
  // hidden tab: open another page in the same context and bring it to front
  const other = await pg.context().newPage();
  await other.goto('about:blank'); await other.bringToFront();
  await pg.waitForTimeout(500);
  let hidden = await pg.evaluate(() => document.visibilityState);
  let how = 'real tab switch';
  if (hidden !== 'hidden') {
    // headless shell keeps every page "visible"; emulate the browser hiding the tab
    how = 'emulated visibilitychange';
    await pg.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await pg.waitForTimeout(500);
  }
  const h = await pg.evaluate(() => ({ s: __GAME.state, tl: __GAME.mission.timeLeft, ac: __AUD.ctxs[0].state }));
  await pg.waitForTimeout(2000);
  const h2 = await pg.evaluate(() => ({ s: __GAME.state, tl: __GAME.mission.timeLeft }));
  L.check(`tab hidden (${how}) -> auto pause, clock frozen`, h.s === 'paused' && h2.tl === h.tl, { state: h.s, frozen: h2.tl === h.tl });
  L.check('tab hidden -> AudioContext suspended', h.ac === 'suspended', h.ac);
  // visible again: stays paused until the player resumes; audio resumes
  await pg.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pg.bringToFront(); await other.close();
  await pg.waitForTimeout(600);
  const v = await pg.evaluate(() => ({ s: __GAME.state, ac: __AUD.ctxs[0].state }));
  L.check('tab visible again -> still paused (waits for player), audio running', v.s === 'paused' && v.ac === 'running', v);
  await pg.click('#btnResume');
  L.check('resume button returns to play', (await pg.evaluate(() => __GAME.state)) === 'play');
  // window blur
  await pg.evaluate(() => window.dispatchEvent(new Event('blur')));
  L.check('window blur -> auto pause', (await pg.evaluate(() => __GAME.state)) === 'paused');
  await pg.keyboard.press('Escape');
  L.check('Esc from pause resumes', (await pg.evaluate(() => __GAME.state)) === 'play');
  // engine/servo sound silenced while paused (gain targets 0)
  const fail = L.summary(errors);
  await pg.__close(); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

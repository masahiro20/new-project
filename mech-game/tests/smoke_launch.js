const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'launch', { viewport: { width: 960, height: 540 } }, errors);
  let t = Date.now(); await pg.click('#btnLaunch'); await L.waitState(pg, 'play', 20000);
  console.log('full launch ms', Date.now() - t, 'short flag', await pg.evaluate(() => __GAME.launchShort));
  await pg.keyboard.press('Escape'); await L.waitState(pg, 'paused'); await pg.click('#btnPauseTitle'); await L.waitState(pg, 'title');
  t = Date.now(); await pg.click('#btnLaunch'); await pg.waitForTimeout(500); await L.shot(pg, 'launch_short_mid'); await L.waitState(pg, 'play', 20000);
  console.log('short launch ms', Date.now() - t);
  await pg.evaluate(() => { const s = JSON.parse(localStorage.getItem('grandstride_save')); s.cleared = {1: true}; localStorage.setItem('grandstride_save', JSON.stringify(s)); });
  await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
  await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(1500);
  console.log('sel', await pg.evaluate(() => __GAME.selectedMission));
  await L.shot(pg, 'port_title');
  await pg.keyboard.press('Enter'); await L.waitState(pg, 'play', 20000);
  console.log('mission', await pg.evaluate(() => __GAME.missionId));
  await pg.keyboard.down('KeyW'); await L.waitGame(pg, 8); await pg.keyboard.up('KeyW');
  await pg.mouse.move(480, 270); await L.shot(pg, 'port_play');
  // daily date hook
  console.log(JSON.stringify(await pg.evaluate(() => { const a = __GAME.debugSetDate('2026-10-10'); return {a, d: __GAME.daily}; })));
  console.log(JSON.stringify(await pg.evaluate(() => { __GAME.debugSetDate('2026-10-12'); return __GAME.daily.streak; })));
  console.log(errors.join('\n') || 'no errors');
  await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });

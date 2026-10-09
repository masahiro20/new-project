const L = require('./lib'); const HOOK = require('./scenehook');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'twin', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  await pg.evaluate(() => { __GAME.debugSetUpgrades({ armor: 5, core: 5 }); __GAME.startMission(2); });
  await L.waitGame(pg, 1);
  await pg.evaluate(() => __GAME.debugBossPhase2()); await L.waitGame(pg, 4.5);
  await pg.keyboard.down('KeyJ');
  for (let i = 0; i < 40; i++) {
    const st = await pg.evaluate(() => { const f = __GAME.debugFaceNearest(); const p = __GAME.player; return { f, b: __GAME.boss, armor: Math.round(p.armor), heat: Math.round(p.heat), oh: p.overheated, shots: p.shots, hits: p.hits, lock: document.getElementById('lockBox').classList.contains('on') }; });
    console.log(JSON.stringify(st));
    if (!st.b) break;
    await L.waitGame(pg, 1);
  }
  await L.shot(pg, 'dbg_twin');
  console.log(errors);
  await pg.__close(); await b.close();
})();

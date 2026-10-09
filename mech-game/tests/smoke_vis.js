const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'vis', { viewport: { width: 960, height: 540 } }, errors);
  await pg.evaluate(() => __GAME.startMission(2)); await L.waitState(pg, 'play');
  await pg.keyboard.down('KeyW'); await L.waitGame(pg, 5); await pg.keyboard.up('KeyW');
  console.log(JSON.stringify(await pg.evaluate(() => __GAME.player)));
  let got = false;
  for (let i = 0; i < 150 && !got; i++) {
    const r = await pg.evaluate(() => { const e = __GAME.enemies.find(x => x.type === 'rammer' && (x.state === 'windup' || x.state === 'stunned')); if (!e) return null; return e.state; });
    if (r) { await pg.evaluate(() => __GAME.debugFaceNearest()); await pg.waitForTimeout(50); await L.shot(pg, 'vis_rammer_' + r); if (r === 'windup') got = true; }
    else { await pg.evaluate(() => __GAME.debugFaceNearest()); await pg.mouse.down(); await L.waitGame(pg, 0.4); await pg.mouse.up(); }
    if (await pg.evaluate(() => __GAME.state) !== 'play') break;
  }
  console.log('rammer seen', got, JSON.stringify(await pg.evaluate(() => ({ p: __GAME.player, m: __GAME.mission }))));
  if (await pg.evaluate(() => __GAME.state) === 'play') {
    await pg.evaluate(() => __GAME.debugSpawnBoss()); await L.waitGame(pg, 1.5);
    await pg.evaluate(() => __GAME.debugFaceNearest()); await L.shot(pg, 'vis_boss1');
    await pg.evaluate(() => __GAME.debugBossPhase2()); await L.waitGame(pg, 1.9); await pg.evaluate(() => __GAME.debugFaceNearest()); await L.shot(pg, 'vis_boss_tf');
    await L.waitGame(pg, 3); await pg.evaluate(() => __GAME.debugFaceNearest()); await L.shot(pg, 'vis_boss2');
  }
  console.log(errors.join('\n') || 'no errors');
  await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });

const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'm2', { viewport: { width: 960, height: 540 } }, errors);
  await L.shot(pg, 'm2_title');
  const t0 = await pg.evaluate(() => ({daily: __GAME.daily, parts: __GAME.parts, up: __GAME.upgrades, m2: __GAME.m2Unlocked}));
  console.log(JSON.stringify(t0));
  await pg.evaluate(() => __GAME.startMission(2));
  await L.waitState(pg, 'play');
  await pg.waitForTimeout(3000);
  console.log(JSON.stringify(await pg.evaluate(() => ({m: __GAME.mission, ri: __GAME.renderInfo, e: __GAME.enemies}))));
  await L.shot(pg, 'm2_play');
  // wait for rammer
  for (let i = 0; i < 60; i++) {
    const e = await pg.evaluate(() => __GAME.enemies);
    if (e.some(x => x.type === 'rammer')) break;
    await pg.evaluate(() => { for (const x of __GAME.enemies) {} });
    await pg.evaluate(() => __GAME.debugFaceNearest()); await pg.mouse.down(); await L.waitGame(pg, 1); await pg.mouse.up();
  }
  console.log('enemies', JSON.stringify(await pg.evaluate(() => __GAME.enemies)));
  const seen = new Set();
  for (let i = 0; i < 40; i++) { const e = await pg.evaluate(() => __GAME.enemies.filter(x => x.type === 'rammer').map(x => x.state)); e.forEach(s => seen.add(s)); if (e.includes('windup')) await L.shot(pg, 'm2_windup'); await L.waitGame(pg, 0.3); }
  console.log('rammer states', [...seen], JSON.stringify(await pg.evaluate(() => __GAME.player)));
  await pg.evaluate(() => __GAME.debugSpawnBoss());
  await L.waitGame(pg, 2); await pg.evaluate(() => __GAME.debugFaceNearest());
  await L.shot(pg, 'm2_boss');
  console.log('boss', JSON.stringify(await pg.evaluate(() => __GAME.boss)));
  await pg.evaluate(() => __GAME.debugBossPhase2());
  await L.waitGame(pg, 1.5); await L.shot(pg, 'm2_transform');
  await L.waitGame(pg, 4);
  console.log('boss2', JSON.stringify(await pg.evaluate(() => __GAME.boss)));
  const st = new Set();
  for (let i = 0; i < 30; i++) { const bo = await pg.evaluate(() => __GAME.boss); if (!bo) break; st.add(bo.state); if (bo.state === 'slam') await L.shot(pg, 'm2_slam'); await L.waitGame(pg, 0.4); }
  console.log('boss states', [...st], JSON.stringify(await pg.evaluate(() => ({p: __GAME.player, s: __GAME.state}))));
  await L.shot(pg, 'm2_p2');
  if (await pg.evaluate(() => __GAME.state) === 'play') { await pg.evaluate(() => __GAME.debugKillAll()); }
  await L.waitState(pg, 'result', 20000); await pg.waitForTimeout(500);
  console.log('result', JSON.stringify(await pg.evaluate(() => __GAME.result)));
  await L.shot(pg, 'm2_result');
  console.log(errors.join('\n') || 'no errors');
  await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });

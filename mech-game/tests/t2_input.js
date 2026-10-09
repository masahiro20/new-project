// 2. Real keyboard / mouse input.
const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'desktop', { viewport: { width: 800, height: 450 } }, errors);
  await L.launchToPlay(pg);
  await L.waitGame(pg, 0.5);
  let a = await L.G(pg);
  await pg.keyboard.down('KeyW'); await L.waitGame(pg, 2.5);
  let c = await L.G(pg);
  const walkV = c.p.speed;
  L.check('W walks: position changes', Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z) > 5, { moved: +Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z).toFixed(1), speed: +walkV.toFixed(1) });
  // Shift dash
  const h0 = c.p.heat;
  await pg.keyboard.down('ShiftLeft'); await L.waitGame(pg, 2.5);
  let d = await L.G(pg);
  L.check('Shift dash: speed up', d.p.speed > walkV + 3, { walk: +walkV.toFixed(1), dash: +d.p.speed.toFixed(1) });
  L.check('Shift dash: core temp up', d.p.heat > h0 + 2, { before: +h0.toFixed(1), after: +d.p.heat.toFixed(1) });
  await pg.keyboard.up('ShiftLeft'); await pg.keyboard.up('KeyW');
  // turning
  a = await L.G(pg);
  await pg.keyboard.down('KeyA'); await L.waitGame(pg, 1.5); await pg.keyboard.up('KeyA');
  c = await L.G(pg);
  L.check('A turns: heading increases', c.p.heading - a.p.heading > 0.2, { dHeading: +(c.p.heading - a.p.heading).toFixed(2) });
  a = c;
  await pg.keyboard.down('KeyD'); await L.waitGame(pg, 1.5); await pg.keyboard.up('KeyD');
  c = await L.G(pg);
  L.check('D turns: heading decreases', c.p.heading - a.p.heading < -0.1, { dHeading: +(c.p.heading - a.p.heading).toFixed(2) });
  // mouse look
  await L.waitGame(pg, 0.8);
  a = await L.G(pg);
  await pg.mouse.move(250, 225); await pg.mouse.move(550, 225, { steps: 10 }); await L.waitGame(pg, 0.6);
  c = await L.G(pg);
  L.check('mouse move right turns heading', c.p.heading - a.p.heading < -0.1, { dHeading: +(c.p.heading - a.p.heading).toFixed(2) });
  // jump
  await L.waitGame(pg, 1.5);
  a = await L.G(pg);
  await pg.keyboard.press('Space');
  const seq = []; let maxHeat = 0;
  for (let i = 0; i < 40; i++) { const g = await pg.evaluate(() => [__GAME.player.grounded, __GAME.player.heat]); seq.push(g[0]); maxHeat = Math.max(maxHeat, g[1]); if (i > 2 && g[0]) break; await L.waitGame(pg, 0.08); }
  const air = seq.indexOf(false), land = seq.lastIndexOf(true);
  L.check('Space jump: grounded true -> false -> true', a.p.grounded && air >= 0 && land > air, seq.map(x => x ? 'G' : 'a').join(''));
  L.check('jump raises core temp', maxHeat > a.p.heat + 5, { before: +a.p.heat.toFixed(1), peak: +maxHeat.toFixed(1) });
  console.log('  state after jump', JSON.stringify(await L.G(pg)));
  // firing (fresh mission: an idle mech loses ~3 armor/s once 4 enemies are up, and the steps above take ~20 game-seconds)
  await pg.evaluate(() => __GAME.start()); await L.waitGame(pg, 0.5);
  await L.waitGame(pg, 2.0);
  a = await L.G(pg); console.log('  state before fire', JSON.stringify(a), JSON.stringify(await pg.evaluate(() => __GAME.result)));
  await pg.mouse.move(400, 225); await pg.mouse.down(); await L.waitGame(pg, 1.5); await pg.mouse.up();
  c = await L.G(pg);
  L.check('mouse fire: shots increase', c.p.shots > a.p.shots + 3, { shots: c.p.shots - a.p.shots });
  L.check('mouse fire: core temp up', c.p.heat > a.p.heat, { before: +a.p.heat.toFixed(1), after: +c.p.heat.toFixed(1) });
  a = c;
  await pg.keyboard.down('KeyJ'); await L.waitGame(pg, 0.8); await pg.keyboard.up('KeyJ');
  c = await L.G(pg);
  L.check('J key fire: shots increase', c.p.shots > a.p.shots, { shots: c.p.shots - a.p.shots });
  // Esc / P pause keys
  await pg.keyboard.press('Escape'); await L.waitGame(pg, 0.2);
  const ps = await pg.evaluate(() => __GAME.state);
  await pg.keyboard.press('KeyP'); await L.waitGame(pg, 0.2);
  const ps2 = await pg.evaluate(() => __GAME.state);
  L.check('Esc pauses, P resumes', ps === 'paused' && ps2 === 'play', [ps, ps2]);
  // aim at enemies and shoot until hits increase
  // fresh mission with full armor (walking into the spawn area above costs a lot of armor)
  await pg.evaluate(() => __GAME.start());
  await pg.waitForFunction(() => __GAME.enemies.length > 0, null, { timeout: 20000 });
  a = await L.G(pg);
  let hits = 0, tries = 0;
  for (; tries < 25; tries++) {
    await pg.evaluate(() => __GAME.debugFaceNearest());
    await pg.mouse.down(); await L.waitGame(pg, 0.6); await pg.mouse.up(); await L.waitGame(pg, 0.3);
    c = await L.G(pg); hits = c.p.hits - a.p.hits;
    if (hits >= 3) break;
    if (c.s !== 'play') { await pg.evaluate(() => __GAME.start()); a = await L.G(pg); await pg.waitForFunction(() => __GAME.enemies.length > 0, null, { timeout: 60000 }); }
    if (tries % 4 === 3) { await pg.keyboard.down('KeyW'); await L.waitGame(pg, 0.8); await pg.keyboard.up('KeyW'); }
  }
  await L.shot(pg, 't2_hits');
  L.check('firing at enemy: hits increase', hits >= 1, { state: c.s, armor: Math.round(c.p.armor), result: c.s === 'result' ? 'ended' : '-', hits, shots: c.p.shots - a.p.shots, tries, kills: c.p.kills });
  const fail = L.summary(errors);
  await pg.__close(); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

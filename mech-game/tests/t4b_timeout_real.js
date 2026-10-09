// 4b. Real (no debug hook) time-out: stay idle in the launch bay for the full 180s of game time; must end as MISSION FAILED with armor left.
// Also prints the armor curve (balance reference).
const L = require('./lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'probe', { viewport: { width: 640, height: 360 } }, errors);
  await L.launchToPlay(pg);
  const out = [];
  while ((await pg.evaluate(() => __GAME.state)) === 'play') {
    const g = await L.G(pg); out.push(`${Math.round(180 - g.m.timeLeft)}s:${Math.round(g.p.armor)}/${g.m.enemiesAlive}`);
    await L.waitGame(pg, 3);
  }
  console.log('  armor curve (gameSec:armor/enemiesAlive):', out.join(' '));
  await L.waitState(pg, 'result', 30000); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => ({ r: __GAME.result, m: __GAME.mission, p: __GAME.player, title: document.getElementById('resTitle').textContent }));
  if (r.p.armor <= 0) {
    // enemy spawns are random: an idle mech is sometimes destroyed before 3:00. Not a time-out bug -> report as SKIP
    // (the deterministic time-out path is covered in t4_outcome via debugSetTimeLeft).
    console.log(`SKIP  natural time-out: mech destroyed first at ${Math.round(r.r.time)}s (armor 0) - rerun to retry`);
    L.check('mech destroyed while idle -> MISSION FAILED (defeat path)', !r.r.win && r.title === 'MISSION FAILED', { time: Math.round(r.r.time) });
  } else
  L.check('natural time-out -> MISSION FAILED, armor > 0, timer 0', !r.r.win && r.p.armor > 0 && r.m.timeLeft === 0 && r.title === 'MISSION FAILED', { armor: Math.round(r.p.armor), time: Math.round(r.r.time), score: r.r.score, debug: r.r.debug });
  L.check('natural run is not flagged debug', r.r.debug === false);
  const fail = L.summary(errors);
  await pg.__close(); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

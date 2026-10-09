const L = require('../qa/lib');
(async () => {
  const errors = []; const b = await L.launch();
  const pg = await L.open(b, 'smoke', { viewport: { width: 800, height: 450 } }, errors);
  console.log(await pg.evaluate(() => ({ t: document.title, med: __GAME.medals, hard: __GAME.hard, as: __GAME.assist, tut: __GAME.tutorial, la: __GAME.lastAutosave })));
  await pg.screenshot({ path: 'smoke_title.png' });
  await pg.click('#btnLaunch'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(700); await pg.keyboard.press('KeyK');
  await L.waitState(pg, 'play', 20000);
  for (let i = 0; i < 4; i++) { await pg.waitForTimeout(3000); console.log(await pg.evaluate(() => ({ tut: __GAME.tutorial, tl: __GAME.mission.timeLeft.toFixed(1), sp: __GAME.mission.spawned }))); }
  await pg.keyboard.down('KeyW'); await pg.waitForTimeout(8000); await pg.keyboard.up('KeyW');
  console.log(await pg.evaluate(() => ({ tut: __GAME.tutorial })));
  await pg.screenshot({ path: 'smoke_tut.png' });
  console.log(errors);
  await pg.__close(); await b.close();
})().catch(e => { console.error(e); process.exit(2); });

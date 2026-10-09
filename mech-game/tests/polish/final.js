const L = require('../qa/lib');
(async () => {
  const errors = []; const b = await L.launch();
  const all = JSON.stringify({ v: 2, parts: 100, up: { legs: 0, core: 0, armor: 0 }, cleared: { 1: true, 2: true, 3: true }, launched: true, tutorial: true, streak: { last: '', n: 0 }, medals: { 1: [true, true, true], 2: [true, false, false], 3: [true, false, false] }, hardClear: { 1: true } });
  const pg = await L.open(b, 'all', { viewport: { width: 1280, height: 720 } }, errors, `try{ if(!sessionStorage.getItem('a')){ sessionStorage.setItem('a','1'); localStorage.setItem('grandstride_save', ${JSON.stringify(all)}); } }catch(e){}`);
  let r = await pg.evaluate(() => ({ t: document.getElementById('allClear').textContent, vis: !document.getElementById('allClear').classList.contains('hidden'), stars: document.getElementById('mStars1').textContent, credit: document.getElementById('credit').textContent, title: document.title }));
  L.check('all 3 cleared: title shows 全作戦完了 + next goals (HARD 1/3, medals 5/9)', r.vis && /全作戦完了/.test(r.t) && /1\/3/.test(r.t) && /5\/9/.test(r.t) && r.stars.startsWith('★★★'), r);
  await pg.screenshot({ path: 'f_title_allclear.png' });
  // a plain read of __GAME.daily does not write
  const before = await pg.evaluate(() => localStorage.getItem('grandstride_save'));
  await pg.evaluate(() => __GAME.daily);
  r = await pg.evaluate(() => localStorage.getItem('grandstride_save'));
  L.check('reading __GAME.daily does not write the save', r === before);
  await pg.evaluate(() => __GAME.debugSetDate('2030-01-01'));
  r = await pg.evaluate(() => JSON.parse(localStorage.getItem('grandstride_save')));
  L.check('debugSetDate: fake date not written to the save', !r.daily || r.daily.date !== '2030-01-01', r.daily && r.daily.date);
  await pg.evaluate(() => __GAME.debugSetDate(null));
  await pg.evaluate(() => { __GAME.debugAddParts(5000); __GAME.debugSetUpgrades({ armor: 5 }); });
  await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
  r = await pg.evaluate(() => ({ parts: __GAME.parts, up: __GAME.upgrades }));
  L.check('debugAddParts / debugSetUpgrades are not in the save after a reload', r.parts < 5000 && r.up.armor === 0, r);
  await pg.__close();
  const fail = L.summary(errors); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

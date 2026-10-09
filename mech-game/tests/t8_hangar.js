// 8. Hangar (整備) + PARTS rewards + daily completion on a real (non-debug) run + debug runs never save.
// run: GAME_DIR=../frozen-m02 node t8_hangar.js
const L = require('./lib');
const KEY = 'grandstride_save';
const save = pg => pg.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const reload = async pg => { await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title'); };

(async () => {
  const errors = []; const b = await L.launch();
  // ---------- A. buying ----------
  let pg = await L.open(b, 'hangar', { viewport: { width: 1280, height: 720 } }, errors);
  let t = await pg.evaluate(() => ({ open: __GAME.openHangar(), ho: __GAME.hangarOpen, parts: __GAME.parts, buy: __GAME.buyUpgrade('legs'), msg: document.getElementById('hMsg').textContent, up: __GAME.upgrades, vis: !document.getElementById('hangar').classList.contains('hidden') }));
  L.check('hangar opens from title (API), visible', t.open && t.ho && t.vis, t);
  L.check('not enough PARTS: buyUpgrade false, message, upgrades unchanged', t.buy === false && /足りません/.test(t.msg) && t.up.legs === 0, { parts: t.parts, msg: t.msg });
  await L.shot(pg, 't8_hangar_empty');
  await pg.evaluate(() => __GAME.closeHangar());
  // give PARTS by writing the save (not a debug hook, so this page session stays non-debug)
  await pg.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.parts = 2000; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await reload(pg);
  const p0 = await pg.evaluate(() => __GAME.parts);
  await pg.click('#btnHangar');
  await pg.click('.hbuy[data-k="armor"]');
  t = await pg.evaluate(() => ({ parts: __GAME.parts, up: __GAME.upgrades, msg: document.getElementById('hMsg').textContent, shown: document.getElementById('hPartsN').textContent }));
  let s = await save(pg);
  L.check('click 強化 (armor): PARTS -120, armor Lv1, saved, UI updated', t.parts === p0 - 120 && t.up.armor === 1 && s.parts === p0 - 120 && s.up.armor === 1 && t.shown === String(p0 - 120), { p0, ...t });
  await pg.keyboard.press('Digit1');
  t = await pg.evaluate(() => ({ parts: __GAME.parts, up: __GAME.upgrades }));
  L.check('hangar key 1 buys LEGS', t.up.legs === 1 && t.parts === p0 - 240, t);
  const costs = [];
  for (let i = 0; i < 5; i++) { const before = await pg.evaluate(() => __GAME.parts); const ok = await pg.evaluate(() => __GAME.buyUpgrade('legs')); costs.push(ok ? before - await pg.evaluate(() => __GAME.parts) : 'x'); }
  t = await pg.evaluate(() => ({ up: __GAME.upgrades, btn: document.querySelector('.hbuy[data-k="legs"]').disabled, txt: document.querySelector('.hbuy[data-k="legs"]').textContent }));
  L.check('LEGS costs 200/320/480/700 then MAX (button disabled)', JSON.stringify(costs) === JSON.stringify([200, 320, 480, 700, 'x']) && t.up.legs === 5 && t.btn && /MAX/.test(t.txt), { costs, ...t });
  await L.shot(pg, 't8_hangar_bought');
  await pg.keyboard.press('Escape');
  t = await pg.evaluate(() => ({ ho: __GAME.hangarOpen, st: __GAME.state, tp: document.getElementById('tParts').textContent, parts: __GAME.parts }));
  L.check('Esc closes hangar back to title, title PARTS badge updated', !t.ho && t.st === 'title' && t.tp === '◆' + t.parts, t);
  // next sortie uses the upgrades
  await pg.click('#btnLaunch'); await L.waitState(pg, 'launch'); await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); await L.waitState(pg, 'play', 20000);
  t = await pg.evaluate(() => ({ p: __GAME.player, fx: __GAME.upgradeEffects }));
  L.check('next sortie: armorMax 112, gripMax 140 (armor Lv1, legs Lv5)', t.p.armorMax === 112 && t.p.armor === 112 && t.p.gripMax === 140 && Math.max(...t.p.grip) === 140, { armorMax: t.p.armorMax, gripMax: t.p.gripMax, fx: t.fx });
  await reload(pg);
  t = await pg.evaluate(() => ({ up: __GAME.upgrades, parts: __GAME.parts }));
  L.check('upgrades + PARTS persist after reload', t.up.legs === 5 && t.up.armor === 1 && t.parts === p0 - 120 - 120 - 1700, t);
  // reset UI
  await pg.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.cleared = { 1: true }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await reload(pg);
  const before = await save(pg);
  await pg.click('#btnHangar'); await pg.click('#hReset');
  const conf = await pg.evaluate(() => !document.getElementById('hConfirm').classList.contains('hidden'));
  await pg.click('#hYes');
  t = await pg.evaluate(() => ({ up: __GAME.upgrades, parts: __GAME.parts, un: __GAME.m2Unlocked, msg: document.getElementById('hMsg').textContent }));
  s = await save(pg);
  L.check('reset: confirm step, then upgrades/PARTS/cleared wiped (M02 relocked), daily+streak+launched kept', conf && t.up.legs === 0 && t.up.armor === 0 && t.parts === 0 && !t.un && JSON.stringify(s.streak) === JSON.stringify(before.streak) && s.daily.date === before.daily.date && s.launched === before.launched, { ...t, saved: { up: s.up, parts: s.parts, cleared: s.cleared } });
  await reload(pg);
  t = await pg.evaluate(() => ({ up: __GAME.upgrades, parts: __GAME.parts, un: __GAME.m2Unlocked }));
  L.check('reset survives reload', t.up.legs === 0 && t.parts === 0 && !t.un, t);
  await pg.__close();

  // ---------- B. real (non-debug) run: reward + daily goal completion ----------
  pg = await L.open(b, 'reward', { viewport: { width: 960, height: 540 } }, errors);
  await pg.evaluate(k => {
    const d = new Date(), ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem(k, JSON.stringify({ v: 1, parts: 0, up: { legs: 0, core: 0, armor: 0 }, cleared: {}, launched: true, streak: { last: ds, n: 3 },
      daily: { date: ds, allDone: false, goals: [
        { id: 'kills', n: 20, target: 20, prog: 19, reward: 80, m2: false, done: false },
        { id: 'boss', n: 1, target: 1, prog: 1, reward: 100, m2: false, done: true },
        { id: 'wins', n: 2, target: 2, prog: 2, reward: 100, m2: false, done: true }] } }));
  }, KEY);
  await reload(pg);
  t = await pg.evaluate(() => ({ d: __GAME.daily, parts: __GAME.parts, html: document.getElementById('daily').textContent }));
  L.check('title shows today\'s goals with progress (19/20) and STREAK 3', /19\/20/.test(t.html) && /STREAK 3/.test(t.html) && t.parts === 0, t.html);
  await pg.evaluate(() => __GAME.startMission(1));
  await pg.waitForFunction(() => __GAME.enemies.length > 0, null, { timeout: 60000 });
  for (let i = 0; i < 80; i++) {
    const k = await pg.evaluate(() => { __GAME.debugFaceNearest(); return __GAME.mission.kills; });
    if (k >= 1) break;
    await pg.mouse.down(); await L.waitGame(pg, 0.5); await pg.mouse.up(); await L.waitGame(pg, 0.2);
  }
  const kills = await pg.evaluate(() => __GAME.mission.kills);
  L.check('real run: killed an enemy', kills >= 1, { kills });
  // then stand still until destroyed (non-debug end of mission)
  await pg.keyboard.down('KeyW'); await L.waitGame(pg, 3); await pg.keyboard.up('KeyW');
  await pg.waitForFunction(() => __GAME.state === 'result', null, { timeout: 900000, polling: 500 });
  await pg.waitForTimeout(300);
  t = await pg.evaluate(() => ({ r: __GAME.result, parts: __GAME.parts, rew: document.getElementById('rewards').textContent }));
  s = await save(pg);
  console.log('  result', JSON.stringify(t.r), t.rew);
  const expect = t.r.parts + (t.r.daily || []).reduce((a, d) => a + d.reward, 0);
  L.check('non-debug defeat: PARTS reward >= 15 saved', !t.r.debug && t.r.parts >= 15 && s.parts === expect && t.parts === expect, { reward: t.r.parts, saved: s.parts, expect });
  L.check('daily goal completed on the run (+80) and all-done bonus (+100)', (t.r.daily || []).some(d => d.reward === 80) && (t.r.daily || []).some(d => d.reward === 100) && s.daily.allDone, t.r.daily);
  L.check('result card shows 次の強化まで / 次のランク', /次の強化まで あと資材 \d+|強化できます/.test(t.rew) && /次のランク|成功でランク/.test(t.rew), t.rew);
  await L.shot(pg, 't8_result');
  // hangar from the result screen
  const partsNow = t.parts;
  await pg.click('#btnResHangar');
  const okBuy = await pg.evaluate(() => __GAME.buyUpgrade('core'));
  await pg.click('#hClose');
  t = await pg.evaluate(() => ({ st: __GAME.state, resVis: !document.getElementById('result').classList.contains('hidden'), nxt: document.querySelector('#rewards .nxt').textContent, parts: __GAME.parts }));
  L.check('hangar from result -> back to result, next-upgrade hint refreshed', t.st === 'result' && t.resVis && (okBuy ? t.parts === partsNow - 120 : true) && /次の強化まで|強化できます/.test(t.nxt), { okBuy, ...t });
  await reload(pg);
  t = await pg.evaluate(() => ({ parts: __GAME.parts, d: __GAME.daily }));
  L.check('reward + daily state persist after reload', t.parts === (okBuy ? partsNow - 120 : partsNow) && t.d.allDone, { parts: t.parts, allDone: t.d.allDone });

  // ---------- C. debug hooks: runs never save ----------
  const s0 = await save(pg);
  const hi0 = await pg.evaluate(() => localStorage.getItem('grandstride_hiscore'));
  await pg.evaluate(() => __GAME.debugAddParts(500));
  await pg.evaluate(() => __GAME.startMission(1)); await L.waitGame(pg, 1);
  await pg.evaluate(() => __GAME.debugKillAll());
  await L.waitState(pg, 'result', 30000);
  t = await pg.evaluate(() => ({ r: __GAME.result, parts: __GAME.parts, rew: document.getElementById('rewards').textContent }));
  s = await save(pg);
  L.check('after debugAddParts: winning run is DEBUG, no reward/clear/daily/hiscore saved', t.r.win && t.r.debug && s.parts === s0.parts + 500 && !s.cleared[1] && JSON.stringify(s.daily) === JSON.stringify(s0.daily) && (await pg.evaluate(() => localStorage.getItem('grandstride_hiscore'))) === hi0 && /DEBUG/.test(t.rew),
    { savedParts: s.parts, before: s0.parts, cleared: s.cleared });
  await reload(pg);
  t = await pg.evaluate(() => ({ parts: __GAME.parts, un: __GAME.m2Unlocked }));
  console.log('  NOTE after reload: debug-added PARTS still in save:', t.parts, '(was', s0.parts, ')');
  L.check('[observation] debugAddParts PARTS do NOT persist across reload', t.parts === s0.parts, { parts: t.parts, before: s0.parts });
  await pg.__close();

  const fail = L.summary(errors);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

// 9. Daily goals: deterministic per date, 3 goals (<=1 needing M02), STREAK increments / resets / 7-day bonus cap.
// run: GAME_DIR=../frozen-m02 node t9_daily.js
const L = require('./lib');
const KEY = 'grandstride_save';
(async () => {
  const errors = []; const b = await L.launch();
  const dates = []; for (let i = 0; i < 40; i++) { const d = new Date(2026, 9, 1 + i * 3); dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); }
  const collect = pg => pg.evaluate(ds => ds.map(d => { __GAME.debugSetDate(d); const x = __GAME.daily; return { date: x.date, g: x.goals.map(g => g.id + ':' + g.target + ':' + g.reward + (g.m2 ? ':m2' : '')) }; }), dates);
  const p1 = await L.open(b, 'daily1', { viewport: { width: 960, height: 540 } }, errors);
  const A = await collect(p1);
  const p2 = await L.open(b, 'daily2', { viewport: { width: 960, height: 540 } }, errors);
  const B = await collect(p2);
  console.log('  sample', JSON.stringify(A.slice(0, 4)));
  L.check('same date -> same 3 goals in two independent profiles (40 dates)', JSON.stringify(A) === JSON.stringify(B));
  const distinct = new Set(A.map(x => x.g.join('|'))).size;
  L.check('goals vary between dates', distinct > 20, { distinctSets: distinct, of: A.length });
  L.check('always 3 distinct goals, at most one needs MISSION 02', A.every(x => x.g.length === 3 && new Set(x.g.map(s => s.split(':')[0])).size === 3 && x.g.filter(s => s.endsWith(':m2')).length <= 1));
  const r1 = await p1.evaluate(() => { __GAME.debugSetDate('2026-10-10'); const a = JSON.stringify(__GAME.daily.goals); __GAME.debugSetDate('2026-10-11'); __GAME.debugSetDate('2026-10-10'); return [a, JSON.stringify(__GAME.daily.goals)]; });
  L.check('switching away and back to a date regenerates identical goals', r1[0] === r1[1]);
  await p1.__close(); await p2.__close();

  // streak
  const pg = await L.open(b, 'streak', { viewport: { width: 960, height: 540 } }, errors);
  const seq = [];
  for (const d of ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10', '2027-01-11', '2027-01-12', '2027-01-13']) {
    const r = await pg.evaluate(d => { const p0 = __GAME.parts; __GAME.debugSetDate(d); return { d, n: __GAME.daily.streak, bonus: __GAME.parts - p0, note: document.getElementById('titleNote').textContent, head: document.querySelector('#daily .dh').textContent }; }, d);
    seq.push(r);
  }
  console.log('  streak', JSON.stringify(seq.map(x => [x.d.slice(5), x.n, x.bonus])));
  L.check('STREAK: consecutive days 1,2,3; gap resets to 1', seq[0].n === 1 && seq[1].n === 2 && seq[2].n === 3 && seq[3].n === 1, seq.slice(0, 4).map(x => x.n));
  L.check('STREAK bonus 10*n PARTS, capped at 70 from day 7', seq[0].bonus === 10 && seq[1].bonus === 20 && seq[2].bonus === 30 && seq[3].bonus === 10 && seq[9].n === 7 && seq[9].bonus === 70 && seq[11].n === 9 && seq[11].bonus === 70, seq.map(x => x.bonus));
  L.check('title shows STREAK note + header', /STREAK 1日目 ボーナス 資材 \+10/.test(seq[3].note) && /STREAK 1日/.test(seq[3].head), { note: seq[3].note, head: seq[3].head });
  const same = await pg.evaluate(() => { const p0 = __GAME.parts; __GAME.debugSetDate('2027-01-13'); return { n: __GAME.daily.streak, bonus: __GAME.parts - p0 }; });
  L.check('same day again: no extra streak / bonus', same.n === 9 && same.bonus === 0, same);
  // debug date hook writes the real save?
  const sv = await pg.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  console.log('  save after debugSetDate:', JSON.stringify({ parts: sv.parts, streak: sv.streak, daily: sv.daily.date }));
  L.check('[observation] debugSetDate does not write streak/PARTS into the save', sv.streak.last !== '2027-01-13', { parts: sv.parts, streak: sv.streak });
  await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
  const after = await pg.evaluate(() => ({ d: __GAME.daily, parts: __GAME.parts }));
  console.log('  after reload (real date):', JSON.stringify({ date: after.d.date, streak: after.d.streak, parts: after.parts }));
  await L.shot(pg, 't9_title_daily');
  await pg.__close();
  const fail = L.summary(errors);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

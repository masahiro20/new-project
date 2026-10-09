// 7. MISSION 02: lock/unlock, stage switch city<->port (no leak), RAMSHELL states, TWINSHELL phases, boss kill -> win, side-step.
// run: GAME_DIR=../frozen-m02 node t7_m02.js
const L = require('./lib');
const HOOK = require('./scenehook');
const SAVE_KEY = 'grandstride_save';
const CITY_BG = '060a14', PORT_BG = '050a0e';

(async () => {
  const errors = []; const b = await L.launch();
  // ---------- A. lock / unlock ----------
  let pg = await L.open(b, 'lock', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  let t = await pg.evaluate(() => ({ un: __GAME.m2Unlocked, locked: document.querySelector('.mcard[data-m="2"]').classList.contains('locked'), save: localStorage.getItem('grandstride_save') }));
  L.check('fresh profile: MISSION 02 locked (API + card .locked)', !t.un && t.locked, t);
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Digit2');
  await pg.click('.mcard[data-m="2"]');
  t = await pg.evaluate(() => ({ sel: __GAME.selectedMission, api: __GAME.selectMission(2), note: document.getElementById('titleNote').textContent, bg: __sceneStats().bg }));
  L.check('locked: ←/2/click/selectMission(2) keep MISSION 01 selected + note shown', t.sel === 1 && t.api === false && /解放/.test(t.note) && t.bg === CITY_BG, t);
  // unlock by writing the save format read by loadSave(): {v:1, parts, up, cleared:{1:true}, launched, daily, streak}
  await pg.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, parts: 0, up: { legs: 0, core: 0, armor: 0 }, cleared: { 1: true }, launched: false, daily: null, streak: { last: '', n: 0 } })), SAVE_KEY);
  await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
  t = await pg.evaluate(() => ({ un: __GAME.m2Unlocked, locked: document.querySelector('.mcard[data-m="2"]').classList.contains('locked') }));
  L.check('save cleared[1]=true -> MISSION 02 unlocked after reload', t.un && !t.locked, t);
  await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(200);
  t = await pg.evaluate(() => ({ sel: __GAME.selectedMission, bg: __sceneStats().bg, brief: document.getElementById('briefText').textContent, card: document.querySelector('.mcard[data-m="2"]').classList.contains('sel') }));
  L.check('→ selects MISSION 02, title backdrop switches to the harbor, brief updates', t.sel === 2 && t.bg === PORT_BG && /突進型/.test(t.brief) && t.card, t);
  await pg.keyboard.press('Digit1'); await pg.waitForTimeout(100);
  const s1 = await pg.evaluate(() => ({ sel: __GAME.selectedMission, bg: __sceneStats().bg }));
  await pg.keyboard.press('Digit2'); await pg.waitForTimeout(100);
  const s2 = await pg.evaluate(() => ({ sel: __GAME.selectedMission, bg: __sceneStats().bg }));
  L.check('1 / 2 keys switch the selection (and backdrop)', s1.sel === 1 && s1.bg === CITY_BG && s2.sel === 2 && s2.bg === PORT_BG, [s1, s2]);
  await pg.reload(); await pg.waitForFunction(() => window.__GAME && __GAME.state === 'title');
  t = await pg.evaluate(() => ({ sel: __GAME.selectedMission, bg: __sceneStats().bg }));
  L.check('selected mission remembered across reload', t.sel === 2 && t.bg === PORT_BG, t);
  // H opens hangar, Esc closes
  await pg.keyboard.press('KeyH'); const h1 = await pg.evaluate(() => __GAME.hangarOpen);
  await pg.keyboard.press('Escape'); const h2 = await pg.evaluate(() => __GAME.hangarOpen);
  await pg.waitForTimeout(600); // let Chrome drop focus from the now-hidden hangar button (Enter on a focused BUTTON is ignored by the title key handler)
  L.check('title: H opens hangar, Esc closes it', h1 && !h2, [h1, h2]);
  // Enter launches the selected mission
  await pg.keyboard.press('Enter'); await L.waitState(pg, 'launch', 3000); await pg.waitForTimeout(600); await pg.keyboard.press('KeyK');
  await L.waitState(pg, 'play', 20000);
  t = await pg.evaluate(() => ({ id: __GAME.missionId, total: __GAME.mission.total, time: __GAME.mission.timeLeft, bg: __sceneStats().bg, name: document.getElementById('mnName').textContent }));
  L.check('Enter on title launches MISSION 02 (16 enemies, 4:00, harbor)', t.id === 2 && t.total === 16 && t.time > 230 && t.bg === PORT_BG && /港湾/.test(t.name), t);
  await pg.__close();

  // ---------- B. stage switch + leak ----------
  pg = await L.open(b, 'stage', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  const snaps = [];
  for (let cyc = 0; cyc < 4; cyc++) {
    for (const id of [2, 1]) {
      await pg.evaluate(id => __GAME.startMission(id), id);
      await L.waitGame(pg, 2.5);
      if (id === 2 && cyc === 1) { // exercise the boss + transformation debris too
        await pg.evaluate(() => __GAME.debugBossPhase2()); await L.waitGame(pg, 4.5);
      }
      const s = await pg.evaluate(() => Object.assign(__sceneStats(), { ri: __GAME.renderInfo, mid: __GAME.missionId }));
      snaps.push({ cyc, id, children: s.children, objs: s.objs, geo: s.ri.geometries, prog: s.ri.programs, bg: s.bg });
      await pg.evaluate(() => { __GAME.pause(); }); await pg.click('#btnPauseTitle'); await L.waitState(pg, 'title');
    }
  }
  const tit = await pg.evaluate(() => Object.assign(__sceneStats(), { ri: __GAME.renderInfo }));
  console.log('  stage snaps', JSON.stringify(snaps), 'title', JSON.stringify({ children: tit.children, objs: tit.objs, geo: tit.ri.geometries }));
  const m2s = snaps.filter(s => s.id === 2), m1s = snaps.filter(s => s.id === 1);
  L.check('startMission(2) -> harbor, startMission(1) -> city', m2s.every(s => s.bg === PORT_BG) && m1s.every(s => s.bg === CITY_BG));
  const last = a => a[a.length - 1];
  L.check('no leak: scene children / objects / geometries stable over 4 city<->harbor cycles (cycle 2 vs 4)',
    m1s[1].children === last(m1s).children && m1s[1].objs === last(m1s).objs && last(m1s).geo <= m1s[1].geo + 2 && m2s[2].children === last(m2s).children,
    { m1: m1s.map(s => [s.children, s.objs, s.geo]), m2: m2s.map(s => [s.children, s.objs, s.geo]) });
  await pg.__close();

  // ---------- C. RAMSHELL ----------
  pg = await L.open(b, 'rammer', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  await pg.evaluate(() => { __GAME.debugSetUpgrades({ armor: 5 }); __GAME.startMission(2); });
  // in-page per-frame recorder for the first rammer + its warning line + glow
  await pg.evaluate(() => {
    window.__ram = { seq: [], windupWarn: 0, windupFrames: 0, chargeWarn: 0 };
    const tick = () => {
      requestAnimationFrame(tick);
      if (__GAME.state !== 'play') return;
      const r = __GAME.enemies.find(e => e.type === 'rammer'); if (!r) return;
      const R = __ram; if (R.seq[R.seq.length - 1] !== r.state) R.seq.push(r.state);
      const fx = __fx();
      if (r.state === 'windup') { R.windupFrames++; if (fx.warn) R.windupWarn++; }
      if (r.state === 'charge' && fx.warn) R.chargeWarn++;
    };
    requestAnimationFrame(tick);
  });
  await pg.waitForFunction(() => __GAME.enemies.some(e => e.type === 'rammer'), null, { timeout: 120000 });
  // kill the other enemies' influence: keep facing away is not needed; just wait while the rammer runs its cycle
  await pg.waitForFunction(() => { const s = __ram.seq; return s.includes('stunned') || s.includes('recoil') ? s.lastIndexOf('approach') > Math.max(s.indexOf('stunned'), s.indexOf('recoil')) : false; }, null, { timeout: 240000, polling: 200 }).catch(() => {});
  const ram = await pg.evaluate(() => __ram);
  console.log('  rammer', JSON.stringify(ram));
  const i0 = ram.seq.indexOf('windup');
  L.check('rammer: approach -> windup -> charge -> (stunned|recoil) -> approach', ram.seq[0] === 'approach' && i0 > 0 && ram.seq[i0 + 1] === 'charge' && ['stunned', 'recoil'].includes(ram.seq[i0 + 2]), ram.seq.join('>'));
  L.check('rammer windup shows the red ground warning line', ram.windupFrames > 0 && ram.windupWarn >= ram.windupFrames * 0.8, { windupFrames: ram.windupFrames, withLine: ram.windupWarn });
  // dodge the next charge with a side-step (in-page, timed in game time) -> rammer overshoots / crashes -> stunned
  await pg.evaluate(() => {
    __ram.seq = []; __ram.dodges = 0;
    let wT = null;
    const tick = () => {
      requestAnimationFrame(tick); if (__GAME.state !== 'play') return;
      const r = __GAME.enemies.find(e => e.type === 'rammer'); if (!r) return;
      const tl = __GAME.mission.timeLeft;
      if (r.state === 'windup' && wT === null) wT = tl;
      if (r.state !== 'windup' && r.state !== 'charge') wT = null;
      if (wT !== null && wT - tl > 0.7 && __GAME.player.grounded) {
        wT = -1e9; __ram.dodges++;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', key: 'd' }));
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
        setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', key: 'd' })); }, 400);
      }
    };
    requestAnimationFrame(tick);
  });
  await pg.waitForFunction(() => __ram.seq.includes('stunned') && __ram.seq[__ram.seq.length - 1] !== 'stunned', null, { timeout: 300000, polling: 200 }).catch(() => {});
  const ram2 = await pg.evaluate(() => ({ seq: __ram.seq, dodges: __ram.dodges, armor: __GAME.player.armor }));
  console.log('  rammer (with side-step dodge)', JSON.stringify(ram2));
  const j = ram2.seq.indexOf('stunned');
  L.check('rammer: side-stepped charge ends in stunned, then back to approach', j > 0 && ram2.seq[j - 1] === 'charge' && ram2.seq[j + 1] === 'approach', ram2.seq.join('>'));
  await pg.__close();

  // ---------- D. side-step ----------
  pg = await L.open(b, 'side', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  await pg.evaluate(() => __GAME.startMission(1)); await L.waitGame(pg, 1);
  let a = await L.G(pg);
  await pg.keyboard.down('KeyD'); await pg.keyboard.press('Space');
  let air = false, peakY = 0;
  for (let i = 0; i < 30; i++) { const p = await pg.evaluate(() => __GAME.player); if (!p.grounded) air = true; peakY = Math.max(peakY, p.y); if (air && p.grounded) break; await L.waitGame(pg, 0.05); }
  await pg.keyboard.up('KeyD');
  let c = await L.G(pg);
  // lateral displacement along the mech's right axis at the start heading (right = (cos h, -sin h))
  const lat = (c.p.x - a.p.x) * Math.cos(a.p.heading) - (c.p.z - a.p.z) * Math.sin(a.p.heading);
  L.check('side-step: D + Space hops right (lateral move, low arc, heat up)', air && lat > 4 && peakY < 3 && c.p.heat > a.p.heat, { lateral: +lat.toFixed(1), peakY: +peakY.toFixed(2), heat: +c.p.heat.toFixed(1) });
  await L.waitGame(pg, 1.5); a = await L.G(pg);
  await pg.keyboard.down('KeyA'); await pg.keyboard.press('Space');
  air = false; peakY = 0;
  for (let i = 0; i < 30; i++) { const p = await pg.evaluate(() => __GAME.player); if (!p.grounded) air = true; peakY = Math.max(peakY, p.y); if (air && p.grounded) break; await L.waitGame(pg, 0.05); }
  await pg.keyboard.up('KeyA'); c = await L.G(pg);
  const lat2 = (c.p.x - a.p.x) * Math.cos(a.p.heading) - (c.p.z - a.p.z) * Math.sin(a.p.heading);
  L.check('side-step: A + Space hops left', air && lat2 < -4 && peakY < 3, { lateral: +lat2.toFixed(1), peakY: +peakY.toFixed(2) });
  await L.waitGame(pg, 1.5); a = await L.G(pg);
  await pg.keyboard.press('Space'); peakY = 0;
  for (let i = 0; i < 40; i++) { const p = await pg.evaluate(() => __GAME.player); peakY = Math.max(peakY, p.y); if (i > 3 && p.grounded) break; await L.waitGame(pg, 0.05); }
  L.check('plain Space (no A/D) is still the high jump', peakY > 4, { peakY: +peakY.toFixed(2) });
  await pg.__close();

  // ---------- E. TWINSHELL ----------
  pg = await L.open(b, 'twin', { viewport: { width: 960, height: 540 } }, errors, HOOK);
  const twinParts0 = await pg.evaluate(() => __GAME.parts);
  await pg.evaluate(() => { __GAME.debugSetUpgrades({ armor: 5, core: 5 }); __GAME.startMission(2); });
  await L.waitGame(pg, 1);
  await pg.evaluate(() => __GAME.debugSpawnBoss());
  await L.waitGame(pg, 0.3);
  t = await pg.evaluate(() => ({ boss: __GAME.boss, bar: document.getElementById('hud').classList.contains('boss'), name: document.getElementById('bossName').textContent, ph: document.getElementById('bossPhase').textContent }));
  L.check('debugSpawnBoss in M02: TWINSHELL hp 170 phase 1, boss bar shown', t.boss && t.boss.type === 'twin' && t.boss.maxHp === 170 && t.boss.phase === 1 && t.bar && /TWINSHELL/.test(t.name) && t.ph === 'PHASE 1', t);
  // phase 1 armour: body hits do almost nothing while closed
  await pg.evaluate(() => {
    window.__tw = { states: [], popups: [], dodges: 0, hits: 0 };
    new MutationObserver(() => __tw.popups.push(document.getElementById('popup').textContent)).observe(document.getElementById('popup'), { childList: true, characterData: true, subtree: true });
    const tick = () => { requestAnimationFrame(tick); const bo = __GAME.boss; if (!bo) return; const s = __tw.states; const k = bo.phase + ':' + bo.state; if (s[s.length - 1] !== k) s.push(k); };
    requestAnimationFrame(tick);
  });
  await pg.evaluate(() => __GAME.debugBossPhase2());
  await L.waitGame(pg, 0.3);
  t = await pg.evaluate(() => ({ boss: __GAME.boss, ph: document.getElementById('bossPhase').textContent }));
  L.check('debugBossPhase2: hp -> 85, state transform, bar says TRANSFORM', t.boss.hp === 85 && t.boss.state === 'transform' && t.ph === 'TRANSFORM', t);
  await L.waitGame(pg, 4.2);
  t = await pg.evaluate(() => ({ boss: __GAME.boss, ph: document.getElementById('bossPhase').textContent, p2: document.getElementById('bossBar').classList.contains('p2') }));
  L.check('after ~4s: phase 2, bar PHASE 2 (.p2)', t.boss.phase === 2 && t.ph === 'PHASE 2' && t.p2, t);
  // shockwave: auto-jump when a ring is about to reach us (in-page, so latency does not matter)
  await pg.evaluate(() => {
    window.__jumper = true;
    const tick = () => {
      requestAnimationFrame(tick); if (!__jumper || __GAME.state !== 'play') return;
      const p = __GAME.player; if (!p.grounded) return;
      for (const w of __fx().waves) { const gap = Math.hypot(p.x - w.x, p.z - w.z) - w.r; if (gap > 0 && gap < 26) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); break; } }
    };
    requestAnimationFrame(tick);
  });
  await pg.waitForFunction(() => __tw.popups.some(x => /衝撃波 回避/.test(x)) || __tw.states.filter(s => s === '2:slam').length >= 3, null, { timeout: 240000, polling: 250 }).catch(() => {});
  t = await pg.evaluate(() => ({ states: __tw.states, dodge: __tw.popups.filter(x => /衝撃波/.test(x)).length }));
  L.check('phase 2 uses slam (shockwave) + homing attacks', t.states.includes('2:slam') && t.states.includes('2:homing'), t.states.join('>'));
  L.check('jumping over the shockwave counts as a dodge (popup 衝撃波 回避)', t.dodge > 0, { dodgePopups: t.dodge });
  // kill it by shooting (aim helper each 0.3 s game time); keep auto-jumping shockwaves
  const hp0 = (await pg.evaluate(() => __GAME.boss)).hp;
  await pg.evaluate(() => { window.__jumper = true; });
  await pg.keyboard.down('KeyJ');
  for (let i = 0; i < 400; i++) {
    const st = await pg.evaluate(() => { __GAME.debugFaceNearest(); return { s: __GAME.state, b: __GAME.boss, heat: __GAME.player.heat, oh: __GAME.player.overheated, end: __GAME.mission.ending }; });
    if (!st.b || st.end || st.s !== 'play') break;
    await L.waitGame(pg, 0.3);
  }
  await pg.keyboard.up('KeyJ');
  t = await pg.evaluate(() => ({ m: __GAME.mission, boss: __GAME.boss, p: __GAME.player }));
  const gunKill = t.m.lordDead && t.m.win && !t.boss;
  L.check('TWINSHELL destroyed by gunfire (phase 2, armor Lv5) -> win', gunKill, { hpStart: hp0, hpLeft: t.boss && t.boss.hp, armor: Math.round(t.p.armor), state: await pg.evaluate(() => __GAME.state) });
  if (!gunKill) {
    // fall back: restart, spawn boss, and kill it through killEnemy (same path as a lethal hit) to test the win flow
    if (await pg.evaluate(() => __GAME.mission.ending)) await L.waitState(pg, 'result', 30000);
    if ((await pg.evaluate(() => __GAME.state)) !== 'play') { await pg.evaluate(() => __GAME.startMission(2)); await L.waitGame(pg, 0.5); }
    await pg.evaluate(() => { __GAME.debugSpawnBoss(); }); await L.waitGame(pg, 0.5);
    await pg.evaluate(() => __GAME.debugKillAll());
    t = await pg.evaluate(() => ({ m: __GAME.mission, boss: __GAME.boss }));
    L.check('boss kill (debugKillAll -> killEnemy) -> lordDead, win', t.m.lordDead && t.m.win && !t.boss, t.m);
  }
  await L.waitState(pg, 'result', 30000);
  t = await pg.evaluate(() => ({ r: __GAME.result, title: document.getElementById('resTitle').textContent, rew: document.getElementById('rewards').textContent, save: JSON.parse(localStorage.getItem('grandstride_save')), hi: localStorage.getItem('grandstride_m2_hiscore') }));
  L.check('result: MISSION COMPLETE for M02', t.r.win && t.r.mission === 2 && t.title === 'MISSION COMPLETE', { r: { win: t.r.win, mission: t.r.mission, score: t.r.score, rank: t.r.rank, debug: t.r.debug } });
  L.check('debug run: result marked DEBUG, nothing saved (cleared/hiscore/parts)', t.r.debug && /DEBUG/.test(t.rew) && !(t.save && t.save.cleared && t.save.cleared[2]) && !t.hi && t.save.parts === twinParts0, { saveParts: t.save && t.save.parts, cleared: t.save && t.save.cleared, hi: t.hi });
  await L.shot(pg, 't7_m02_result');
  await pg.__close();

  const fail = L.summary(errors);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

// 3. Touch: virtual stick drag moves, fire button shoots, multi-touch (stick + fire at once). Landscape 844x390 and portrait 390x844.
const L = require('./lib');
async function rect(pg, sel) { return pg.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, vis: getComputedStyle(document.querySelector(s)).display !== 'none' && r.width > 0 }; }, sel); }
async function run(b, name, vp, errors) {
  const pg = await L.open(b, name, { viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, errors);
  const cdp = await pg.context().newCDPSession(pg);
  await pg.evaluate(() => { window.__PID = {}; window.addEventListener('pointerdown', e => { for (let t = e.target; t && t.id !== undefined; t = t.parentElement) if (t.id) __PID[t.id] = e.pointerId; }, true); });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
  await pg.tap('#btnLaunch');
  await L.waitState(pg, 'launch', 5000);
  const ac = await pg.evaluate(() => __AUD.ctxs[0] && __AUD.ctxs[0].state);
  L.check(`${name}: tap on 出撃 starts audio`, ac === 'running', ac);
  await pg.waitForTimeout(800);
  await pg.tap('#launch');
  await L.waitState(pg, 'play', 20000);
  await L.waitGame(pg, 0.5);
  const st = await rect(pg, '#stickBase'), fire = await rect(pg, '#tFire'), zone = await rect(pg, '#stickZone');
  L.check(`${name}: touch controls visible and on screen`, st.vis && fire.vis && fire.x + fire.w / 2 <= vp.width && st.x - st.w / 2 >= 0 && fire.y + fire.h / 2 <= vp.height, { stick: [Math.round(st.x), Math.round(st.y)], fire: [Math.round(fire.x), Math.round(fire.y)] });
  // stick drag: forward
  let a = await L.G(pg);
  const s0 = { x: st.x, y: st.y, id: 1 };
  await touch('touchStart', [s0]);
  for (let k = 1; k <= 6; k++) await touch('touchMove', [{ ...s0, y: s0.y - k * 12 }]);
  await L.waitGame(pg, 2.5);
  let c = await L.G(pg);
  L.check(`${name}: stick up drag walks forward`, Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z) > 5 && c.p.speed > 3, { moved: +Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z).toFixed(1), speed: +c.p.speed.toFixed(1) });
  // stick right: turn
  a = c;
  await touch('touchMove', [{ ...s0, x: s0.x + 60, y: s0.y }]);
  await L.waitGame(pg, 1.5);
  c = await L.G(pg);
  L.check(`${name}: stick right drag turns`, c.p.heading - a.p.heading < -0.15, { dHeading: +(c.p.heading - a.p.heading).toFixed(2) });
  // multitouch: keep stick forward and press fire with a second finger
  await touch('touchMove', [{ ...s0, y: s0.y - 60 }]);
  await L.waitGame(pg, 0.5);
  a = await L.G(pg);
  const f = { x: fire.x, y: fire.y, id: 2 };
  await touch('touchStart', [{ ...s0, y: s0.y - 60 }, f]);
  await L.waitGame(pg, 1.5);
  c = await L.G(pg);
  await L.shot(pg, `t3_${name}_multitouch`);
  const fireOn = await pg.evaluate(() => document.getElementById('tFire').classList.contains('on'));
  L.check(`${name}: multi-touch stick+fire: shots increase while moving`, c.p.shots > a.p.shots + 2 && Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z) > 3, { shots: c.p.shots - a.p.shots, moved: +Math.hypot(c.p.x - a.p.x, c.p.z - a.p.z).toFixed(1), fireBtnOn: fireOn });
  // lift the stick finger only: fire keeps going, movement stops
  // CDP cannot lift one finger of a multi-touch (touchEnd releases all, touchMove ignores missing points),
  // so lift the stick finger with a pointerup for the real pointerId Chromium assigned to it.
  await pg.evaluate(() => { const z = document.getElementById('stickZone'); z.dispatchEvent(new PointerEvent('pointerup', { pointerId: window.__PID.stickZone, pointerType: 'touch', isPrimary: true, bubbles: true })); });
  const stickAfter = await pg.evaluate(() => document.getElementById('stickKnob').style.transform);
  await L.waitGame(pg, 2.5);
  a = await L.G(pg);
  await L.waitGame(pg, 1);
  c = await L.G(pg);
  console.log('  knob transform after lift:', JSON.stringify(stickAfter), 'pid', await pg.evaluate(() => JSON.stringify(__PID)));
  L.check(`${name}: release stick, fire still held -> stops walking, keeps firing`, Math.abs(c.p.speed) < 1.5 && c.p.shots > a.p.shots, { speed: +c.p.speed.toFixed(2), shots: c.p.shots - a.p.shots });
  await touch('touchEnd', []);
  await L.waitGame(pg, 0.5);
  a = await L.G(pg); await L.waitGame(pg, 1); c = await L.G(pg);
  L.check(`${name}: release all -> firing stops`, c.p.shots === a.p.shots, { shots: c.p.shots - a.p.shots });
  // single fire tap
  a = c;
  await pg.tap('#tFire');
  await L.waitGame(pg, 0.3);
  c = await L.G(pg);
  L.check(`${name}: tap fire button -> shots +1`, c.p.shots > a.p.shots, { shots: c.p.shots - a.p.shots });
  // boost button
  await L.waitGame(pg, 0.5);
  await pg.tap('#tBoost');
  let air = false; for (let k = 0; k < 10; k++) { if (!(await pg.evaluate(() => __GAME.player.grounded))) { air = true; break; } await L.waitGame(pg, 0.05); }
  L.check(`${name}: boost button jumps`, air);
  // pause button
  await L.waitGame(pg, 1.5);
  await pg.tap('#tPause');
  L.check(`${name}: pause button pauses`, (await pg.evaluate(() => __GAME.state)) === 'paused');
  await L.shot(pg, `t3_${name}_pause`);
  await pg.tap('#btnResume');
  L.check(`${name}: resume via tap`, (await pg.evaluate(() => __GAME.state)) === 'play');
  await pg.__close();
}
(async () => {
  const errors = []; const b = await L.launch();
  await run(b, 'landscape', { width: 844, height: 390 }, errors);
  await run(b, 'portrait', { width: 390, height: 844 }, errors);
  const fail = L.summary(errors);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

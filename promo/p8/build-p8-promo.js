#!/usr/bin/env node
// GRANDSTRIDE 鋼脚戦機 (P8) promo videos — capture, text cards, edit, encode.
//
//   node promo/p8/build-p8-promo.js capture L   # record 1920x1080 gameplay frames (virtual time, 30fps)
//   node promo/p8/build-p8-promo.js capture P   # record 1080x1920 gameplay frames
//   node promo/p8/build-p8-promo.js cards       # render the text overlays (PNG with alpha)
//   node promo/p8/build-p8-promo.js edit        # cut + overlay + encode the three MP4s
//   node promo/p8/build-p8-promo.js all         # all of the above
//   node promo/p8/build-p8-promo.js stills      # extract check stills from the MP4s
//
// Env:
//   P8_SRC    the GRANDSTRIDE checkout (mech-game/). Its dist/grandstride-itch.zip is served locally.
//   P8_WORK   scratch folder for frames and cards (never inside the repo).
//   ITCH_URL  optional. When set, the end cards show it under the CTA. Unset = no URL on screen.
//
// Needs: Node 18+, Playwright (global install is fine), ffmpeg/ffprobe, python3 (static server), unzip,
// and network access to fonts.googleapis.com for Zen Kaku Gothic New (Chakra Petch / Share Tech Mono
// are loaded from the game's vendor/fonts).
// Nothing in P8_SRC is modified. No audio is added: every output is encoded with -an.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const OUT = process.env.P8_OUT || __dirname;
const SRC = process.env.P8_SRC || '/tmp/claude-0/-home-user-new-project/619c54eb-da82-5799-8bb7-0ffabf842705/scratchpad/p8-src/mech-game';
const WORK = process.env.P8_WORK || '/tmp/claude-0/-home-user-new-project/619c54eb-da82-5799-8bb7-0ffabf842705/scratchpad/p8promo';
const ITCH_URL = process.env.ITCH_URL || '';
const FPS = 30;
const PORT = 8787;

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  return require('/opt/node22/lib/node_modules/playwright');
}

// ---------------------------------------------------------------- brand (Otto's README)
const C = { cyan: '#5ff2e8', amber: '#ffb547', ink: '#e9f4f6', muted: '#9fb2c0', bg: '#05080d' };
const FONT_EN = "'Chakra Petch','Share Tech Mono',sans-serif";
const FONT_JP = "'Zen Kaku Gothic New','Noto Sans JP','IPAGothic',sans-serif";
const FONT_MONO = "'Share Tech Mono',ui-monospace,monospace";

// ---------------------------------------------------------------- official copy (store/store-page.md)
const COPY = {
  title: 'GRANDSTRIDE',
  titleJa: '鋼脚戦機',
  taglineEn: 'Pilot a 28m four-legged war machine. Two missions, upgrades, daily goals. Free.',
  taglineJa: '全高28mの四脚戦機で灰殻を討て。2つの作戦、機体の強化、毎日の作戦目標。ブラウザで今すぐ出撃。',
  cta: 'FREE', ctaJa: 'ブラウザで今すぐ',
  // AI disclosure, shortened from §3 / §5 of the store page. The last sentence is about this video.
  aiEn: 'Made with extensive use of generative AI (Claude). No AI image-generation models or AI-generated audio. Footage: real gameplay capture.',
  aiJa: '生成 AI（Claude）を全面的に使って制作。画像生成 AI・AI 音声は不使用。映像は実際のプレイ画面。',
};

// ================================================================= 1. capture
// Virtual time: performance.now / rAF / timers only move when __step() is called, so a slow software
// renderer still yields smooth 30fps footage. Math.random is seeded so a re-run gives the same fight.
const VTIME = `(() => {
  let vnow = 0, tid = 1, timers = [];
  const rafQ = [];
  performance.now = () => vnow;
  const D0 = Date.now(); Date.now = () => D0 + vnow;
  window.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (fn, ms, ...a) => { const id = tid++; timers.push({ id, t: vnow + (+ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { const id = tid++; timers.push({ id, t: vnow + (+ms || 0), fn, a, every: Math.max(1, +ms || 0) }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers = timers.filter(t => t.id !== id); };
  let s = 0x9e3779b9 ^ 2091;
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__step = (n = 1, dt = 1000 / ${FPS}) => {
    for (let i = 0; i < n; i++) {
      vnow += dt;
      for (const t of timers.slice().sort((a, b) => a.t - b.t)) {
        if (t.t > vnow) continue;
        if (t.every) t.t += t.every; else timers = timers.filter(x => x !== t);
        try { if (typeof t.fn === 'function') t.fn(...t.a); } catch (e) {}
      }
      const q = rafQ.splice(0);
      for (const cb of q) { try { cb(vnow); } catch (e) { console.error(e); } }
    }
    return vnow;
  };
})();`;

function serveGame() {
  const dir = path.join(WORK, 'itch');
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-oq', path.join(SRC, 'dist/grandstride-itch.zip'), '-d', dir]);
  }
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: dir, stdio: 'ignore' });
  return srv;
}

async function waitHttp(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('static server did not start: ' + url);
}

async function capture(orient) {
  const [W, H] = orient === 'P' ? [1080, 1920] : [1920, 1080];
  const dir = path.join(WORK, 'frames', orient);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let srv = null;
  try { await waitHttp(`http://127.0.0.1:${PORT}/`); } catch (e) { srv = serveGame(); await waitHttp(`http://127.0.0.1:${PORT}/`); }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.addInitScript(VTIME);
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__GAME && document.fonts.status === 'loaded');
  await page.evaluate(() => { __GAME.setQuality('high'); __GAME.setShowFps(false); });

  const log = [];
  let f = 0;
  const shot = async (tag) => {
    await page.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    const s = await page.evaluate(() => { const p = __GAME.player, m = __GAME.state === 'play' ? __GAME.mission : null;
      return { x: Math.round(p.x), z: Math.round(p.z), h: +p.heading.toFixed(2), st: __GAME.state, res: +p.resonance.toFixed(1), ob: p.overbeat, heat: Math.round(p.heat), v: Math.round(p.speed), kills: p.kills, hits: p.hits, armor: Math.round(p.armor), alive: m ? m.enemiesAlive : 0 }; });
    log.push(Object.assign({ f, tag }, s));
    f++;
  };
  const step = async (n = 1) => { await page.evaluate(k => window.__step(k), n); };

  // --- title screen 2s, then the full first-time launch sequence (fresh storage => long version)
  await step(10);
  for (let i = 0; i < 60; i++) { await step(); await shot('title'); }
  await page.keyboard.press('Enter');
  while ((await page.evaluate(() => __GAME.state)) !== 'play' && f < 600) { await step(); await shot('launch'); }

  // --- play: scripted pilot. Hold W, steer toward the nearest Ashshell, fire when lined up,
  // a dash, a boost jump, and side-steps at fixed times.
  const held = new Set();
  const key = async (code, on) => {
    if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
    if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
  };
  const PLAY_SECS = +(process.env.P8_PLAY_SECS || 75);
  let northbound = true;
  const side = [[9.0, 'KeyA'], [16.5, 'KeyD'], [27.0, 'KeyA'], [38.0, 'KeyD'], [50.0, 'KeyA'], [60.0, 'KeyD']];
  for (let i = 0; i < PLAY_SECS * FPS; i++) {
    const t = i / FPS;
    // Steering: patrol up and down the avenue (x = 0, between z = 122 and z = -5), the one long sightline
    // through the city; elsewhere the cockpit windows fill with a building wall. Turn toward an Ashshell only
    // when it is already within ~55 degrees of the nose.
    const info = await page.evaluate((wp) => {
      const p = __GAME.player;
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      const goal = wp ? [0, -5] : [0, 122];
      const reached = Math.abs(p.z - goal[1]) < 12;
      let want = Math.atan2(-(goal[0] - p.x), -(goal[1] - p.z));
      let best = null, bd = 1e9, aimDiff = null, nd = 1e9;
      for (const e of __GAME.enemies) {
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        nd = Math.min(nd, d);
        const a = wrap(Math.atan2(-(e.x - p.x), -(e.z - p.z)) - p.heading);
        if (d < 240 && Math.abs(a) < 1.0 && d < bd) { bd = d; best = e; aimDiff = a; }
      }
      if (best && Math.abs(wrap(want - p.heading)) < 0.8) want = p.heading + aimDiff;
      return { p, d: best ? bd : null, diff: wrap(want - p.heading), aimDiff, reached, nearest: best && bd <= nd };
    }, northbound);
    if (info.reached) northbound = !northbound;
    if (info.p.armor <= 0 || (await page.evaluate(() => __GAME.state)) !== 'play') break;
    let tag = 'walk';
    await key('KeyW', true);
    const sideNow = side.find(([s]) => t >= s && t < s + 0.6);
    const dash = t >= 2.0 && t < 4.5;
    await key('ShiftLeft', dash && !sideNow);
    if (dash) tag = 'dash';
    let turn = 0;
    if (sideNow) { tag = 'side'; turn = sideNow[1] === 'KeyA' ? 1 : -1; }
    else if (Math.abs(info.diff) > 0.06) turn = info.diff > 0 ? 1 : -1;
    await key('KeyA', turn > 0);
    await key('KeyD', turn < 0);
    if (sideNow && t - sideNow[0] < 1 / FPS) await page.keyboard.press('Space');
    if (!sideNow && Math.abs(t - 6.0) < 0.5 / FPS) { await page.keyboard.press('Space'); tag = 'jump'; }
    let fire = false;
    if (info.d != null && info.d < 230 && Math.abs(info.aimDiff) < 0.16 && !info.p.overheated && info.p.heat < 72) {
      // QA hook from the game: fine aim (incl. pitch) at the nearest Ashshell, only when that is the one ahead
      if (info.nearest) await page.evaluate(() => __GAME.debugFaceNearest());
      fire = true;
    }
    await key('KeyJ', fire);
    if (fire && tag === 'walk') tag = 'fire';
    await step();
    await shot(tag);
    if (i % 150 === 0) console.log(orient, 't=' + t.toFixed(1), JSON.stringify(log[log.length - 1]));
  }
  for (const k of [...held]) await key(k, false);
  fs.writeFileSync(path.join(WORK, `log-${orient}.json`), JSON.stringify(log));
  await browser.close();
  if (srv) srv.kill();
  console.log(`captured ${f} frames -> ${dir}`);
}

// ================================================================= 2. edit decision lists
// Source frames are found from the capture log (log-L.json / log-P.json), so a re-capture still lines up.
function marks(orient) {
  const log = JSON.parse(fs.readFileSync(path.join(WORK, `log-${orient}.json`), 'utf8'));
  const first = (fn, from = 0) => { const e = log.find(x => x.f >= from && fn(x)); return e ? e.f : null; };
  const kills = []; for (let i = 1; i < log.length; i++) if (log[i].kills > log[i - 1].kills) kills.push(log[i].f);
  const sides = []; for (let i = 1; i < log.length; i++) if (log[i].tag === 'side' && log[i - 1].tag !== 'side') sides.push(log[i].f);
  const obs = []; for (let i = 1; i < log.length; i++) if (log[i].ob && !log[i - 1].ob) obs.push(log[i].f);
  const m = {
    n: log.length,
    launch: first(x => x.tag === 'launch'),
    play: first(x => x.st === 'play'),
    jump: first(x => x.tag === 'jump'),
    kills, sides, obs,
  };
  for (const k of ['launch', 'play', 'jump']) if (m[k] == null) throw new Error(`capture ${orient}: no ${k} in log`);
  if (!obs.length) throw new Error(`capture ${orient}: OVERBEAT was never reached; capture longer (P8_PLAY_SECS)`);
  if (!sides.length || kills.length < 2) throw new Error(`capture ${orient}: not enough side-steps / kills`);
  return m;
}

// A cut: {src, from (frame), dur (s), flash?: 'white'|'black' fade-in}
// A text: {at, dur, card (name), cut?: true = appear without fade}
function plans() {
  const L = marks('L'), P = marks('P');
  const sec = s => Math.round(s * FPS);
  // kill right before / during the first OVERBEAT, for the montage beat
  const obKillL = L.kills.find(k => k > L.obs[0]) || L.kills[L.kills.length - 1];
  const trailer = {
    name: 'grandstride-trailer-30s', W: 1920, H: 1080, src: 'L', dur: 30,
    cuts: [
      { from: L.launch + 6, dur: 5.0 },                       // boot log, red bay, bay opens
      { from: L.play + sec(1.8), dur: 4.5 },                  // dash, boost jump, landing shake
      { from: L.kills[1] - sec(3.4), dur: 4.5 },              // firing, a kill
      { from: L.sides[0] - sec(0.6), dur: 3.0 },              // side-step
      { from: L.obs[0] - sec(3.0), dur: 3.0 },                // resonance climbing to 100
      { from: L.obs[0], dur: 4.0, flash: 'white' },           // OVERBEAT
      { from: obKillL - sec(0.8), dur: 1.5 },                 // kill in the montage
      { end: 'end-L', dur: 4.5 },
    ],
    texts: [
      { at: 0.3, dur: 2.6, card: 'L-sea' },
      { at: 3.0, dur: 2.0, card: 'L-saddle' },
      { at: 5.3, dur: 4.0, card: 'L-step' },
      { at: 9.7, dur: 4.1, card: 'L-shot' },
      { at: 14.1, dur: 2.8, card: 'L-side' },
      { at: 17.1, dur: 2.8, card: 'L-res' },
      { at: 20.05, dur: 3.8, card: 'L-ob', cut: true },
      { at: 24.05, dur: 1.4, card: 'L-hold' },
    ],
  };
  const shortA = {
    name: 'grandstride-short-a-15s', W: 1080, H: 1920, src: 'P', dur: 15,
    cuts: [
      { from: P.play + sec(1.8), dur: 3.0 },                  // dash: speed + shake
      { from: P.jump - sec(0.3), dur: 2.5 },                  // boost jump, landing shake
      { from: P.kills[1] - sec(2.2), dur: 3.0 },              // firing, a kill
      { from: P.sides[0] - sec(0.4), dur: 2.0 },              // side-step
      { from: P.obs[0], dur: 2.0, flash: 'white' },           // OVERBEAT
      { end: 'end-P', dur: 2.5 },
    ],
    texts: [
      { at: 0, dur: 2.95, card: 'P-hookA', cut: true },
      { at: 3.0, dur: 2.45, card: 'P-step' },
      { at: 5.5, dur: 2.95, card: 'P-shot' },
      { at: 8.5, dur: 1.95, card: 'P-side' },
      { at: 10.5, dur: 1.95, card: 'P-ob', cut: true },
    ],
  };
  // hook: the second OVERBEAT if there was one, else the back half of the first (8s long), so no shot repeats
  const ob2 = P.obs[1] != null ? P.obs[1] : P.obs[0] + sec(3.7);
  const shortB = {
    name: 'grandstride-short-b-15s', W: 1080, H: 1920, src: 'P', dur: 15,
    cuts: [
      { from: ob2 + sec(0.3), dur: 2.5, flash: 'white' },     // cold open in OVERBEAT
      { from: P.play + sec(4.5), dur: 3.0 },                  // steady walk, resonance rising
      { from: P.kills[0] - sec(2.0), dur: 3.0 },              // landing shots
      { from: P.obs[0] - sec(1.5), dur: 4.0 },                // meter hits 100 -> OVERBEAT
      { end: 'end-P', dur: 2.5 },
    ],
    texts: [
      { at: 0, dur: 2.45, card: 'P-hookB', cut: true },
      { at: 2.5, dur: 2.95, card: 'P-rhythm' },
      { at: 5.5, dur: 2.95, card: 'P-landing' },
      { at: 9.6, dur: 2.85, card: 'P-enter', cut: true },
    ],
  };
  return [trailer, shortA, shortB];
}

// ================================================================= 3. text cards
// Every caption = optional mono kicker + English line + smaller Japanese line (store-page.md wording).
const CAPS = {
  'sea':    { k: 'SHORE CITY', en: 'The sea has swallowed the lower city.', ja: '海に沈みかけた都市、汀都。' },
  'saddle': { k: 'HEKATON TYPE-04', en: 'You are strapped into the saddle of HEKATON TYPE-04,<br>a 28-meter, four-legged war machine.', ja: 'あなたは全高28mの四脚機「ヘカトン TYPE-04」の鞍座に座る鞍士だ。' },
  'step':   { en: 'Every step shakes the cockpit.', ja: '一歩ごとに鞍座が揺れ、' },
  'shot':   { en: 'Every shot heats the core.', ja: '撃つたびに炉が熱を持つ。' },
  'side':   { k: 'SPACE + A / D', en: 'Sidestep.', ja: '横跳び SIDESTEP' },
  'res':    { k: 'RESONANCE', en: 'Push resonance to 100% and the machine’s<br>heartbeat becomes yours.', ja: '共鳴率100%、機体の鼓動があなたの鼓動になる。' },
  'hold':   { en: 'Keep four legs planted, and hold the line.', ja: '4本の脚で踏みとどまって都市を守ってください。' },
  'hookA':  { k: 'HEKATON TYPE-04', en: 'A 28-meter, four-legged war machine.', ja: '全高28mの四脚機「ヘカトン TYPE-04」', big: true },
  'rhythm': { k: 'RESONANCE', en: 'Walk with a steady rhythm', ja: '一定のリズムで歩き、' },
  'landing':{ k: 'RESONANCE', en: 'and keep landing shots to raise it.', ja: '撃ち当て続けると上がる。' },
  'enter':  { k: 'RESONANCE 100%', en: 'Hit 100% and enter OVERBEAT.', ja: '100%で鼓動モード OVERBEAT に突入。' },
};

// Chakra Petch / Share Tech Mono: the game's own vendor/fonts. Zen Kaku Gothic New (Otto's JP face):
// downloaded once from Google Fonts (full TTF) into P8_WORK/fonts, then loaded from file://.
function zenKaku() {
  const dir = path.join(WORK, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const w of [500, 700]) {
    const f = path.join(dir, `ZenKakuGothicNew-${w}.ttf`);
    if (!fs.existsSync(f)) {
      try {
        const css = execFileSync('curl', ['-sS', `https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@${w}`]).toString();
        const url = (css.match(/url\((https:[^)]+\.ttf)\)/) || [])[1];
        if (url) execFileSync('curl', ['-sS', '-o', f, url]);
      } catch (e) { console.warn('could not download Zen Kaku Gothic New', w, e.message); }
    }
    if (fs.existsSync(f)) out[w] = f;
  }
  return out;
}
function fontCss() {
  const v = path.join(SRC, 'vendor/fonts');
  const face = (fam, w, file, fmt = 'woff2') => `@font-face{font-family:'${fam}';font-weight:${w};src:url(file://${file}) format('${fmt}')}`;
  const zk = zenKaku();
  return [face('Chakra Petch', 400, `${v}/ChakraPetch-400.woff2`), face('Chakra Petch', 600, `${v}/ChakraPetch-600.woff2`),
    face('Chakra Petch', 700, `${v}/ChakraPetch-700.woff2`), face('Share Tech Mono', 400, `${v}/ShareTechMono-400.woff2`),
    ...Object.entries(zk).map(([w, f]) => face('Zen Kaku Gothic New', w, f, 'truetype'))].join('\n');
}

function captionHtml(c, W, H) {
  const P = H > W;
  // safe area for vertical: top 12%, bottom 20%, right 8% are kept clear
  const box = P ? `left:64px; top:${Math.round(H * 0.12) + 70}px; width:${Math.round(W * 0.92) - 64 - 24}px;`
                : `left:110px; bottom:205px; width:fit-content; max-width:1640px;`;
  const enSize = P ? (c.big ? 78 : 64) : 60;
  const jaSize = P ? (c.big ? 40 : 36) : 32;
  return `<div class="cap" style="${box}">
    ${c.k ? `<div class="k" style="font-size:${P ? 28 : 24}px">${c.k}</div>` : ''}
    <div class="en" style="font-size:${enSize}px">${c.en}</div>
    <div class="ja" style="font-size:${jaSize}px">${c.ja}</div></div>`;
}

function obHtml(W, H, jaText) {
  const P = H > W;
  const top = P ? Math.round(H * 0.12) + 90 : 300;
  const width = P ? Math.round(W * 0.92) : W;
  return `<div style="position:absolute;left:0;top:${top}px;width:${width}px;text-align:center">
    <div class="k" style="font-size:${P ? 30 : 28}px;letter-spacing:.3em;color:${C.amber};text-shadow:0 0 12px rgba(0,0,0,.9)">RESONANCE 100%</div>
    <div class="ob" style="font-size:${P ? 150 : 190}px">OVERBEAT</div>
    <div class="ja" style="font-size:${P ? 50 : 48}px;font-weight:700;color:${C.amber};letter-spacing:.4em;margin:6px -.4em 0 0;text-shadow:0 0 10px #000,0 0 22px rgba(0,0,0,.9)">${jaText}</div></div>`;
}

function endHtml(W, H, bgFile) {
  const P = H > W;
  const url = ITCH_URL ? `<div class="url">${ITCH_URL}</div>` : '';
  // vertical: everything between y=12% and y=80%, right edge at 92%
  const area = P ? `left:0;top:${Math.round(H * 0.12)}px;width:${Math.round(W * 0.92)}px;height:${Math.round(H * 0.68)}px;`
                 : `left:0;top:0;width:${W}px;height:${H}px;`;
  return `<div style="position:absolute;inset:0;background:${C.bg} url(file://${bgFile}) center/cover"></div>
  <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(5,8,13,.55), rgba(5,8,13,.92) 70%)"></div>
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 4px)"></div>
  <div class="end" style="position:absolute;${area}display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div class="ja" style="font-weight:700;font-size:${P ? 52 : 48}px;letter-spacing:.45em;margin-right:-.45em;color:${C.amber}">${COPY.titleJa}</div>
    <div class="logo" style="font-size:${P ? 122 : 150}px">${COPY.title}</div>
    <div class="rule" style="width:${P ? 640 : 760}px"></div>
    <div class="tag" style="font-size:${P ? 34 : 34}px;max-width:${P ? 860 : 1300}px">${COPY.taglineEn}</div>
    <div class="ja" style="font-size:${P ? 28 : 28}px;max-width:${P ? 860 : 1300}px;color:${C.muted};margin-top:10px">${COPY.taglineJa}</div>
    <div class="cta" style="font-size:${P ? 46 : 44}px;margin-top:${P ? 56 : 44}px"><b>${COPY.cta}</b><span class="sl">／</span><span class="ja">${COPY.ctaJa}</span></div>
    ${url}
    <div class="ai" style="font-size:${P ? 22 : 21}px;max-width:${P ? 860 : 1500}px;margin-top:${P ? 70 : 54}px">${COPY.aiEn}<br><span class="ja">${COPY.aiJa}</span></div>
  </div>`;
}

const BASE_CSS = `
html,body{margin:0;background:transparent}
.ja{font-family:${FONT_JP};font-weight:500}
.k{font-family:${FONT_MONO};color:${C.cyan};letter-spacing:.18em;text-transform:uppercase;margin-bottom:10px}
.cap{position:absolute;padding:26px 34px 28px 34px;border-left:5px solid ${C.cyan};
  background:linear-gradient(90deg, rgba(5,8,13,.86), rgba(5,8,13,.70) 70%, rgba(5,8,13,.0));}
.cap .en{font-family:${FONT_EN};font-weight:700;color:${C.ink};line-height:1.12;text-shadow:0 0 18px rgba(95,242,232,.35)}
.cap .ja{color:${C.ink};opacity:.88;margin-top:14px;line-height:1.4}
.ob{font-family:${FONT_EN};font-weight:700;color:#fff3dc;letter-spacing:.06em;line-height:1;
  text-shadow:0 0 24px ${C.amber},0 0 60px rgba(255,181,71,.8),0 4px 0 rgba(0,0,0,.6)}
.logo{font-family:${FONT_EN};font-weight:700;color:${C.ink};letter-spacing:.04em;line-height:1.05;
  text-shadow:0 0 22px rgba(95,242,232,.55)}
.rule{height:2px;margin:18px 0 26px;background:linear-gradient(90deg,transparent,${C.cyan},transparent)}
.tag{font-family:${FONT_EN};font-weight:600;color:${C.ink};line-height:1.3}
.cta{font-family:${FONT_EN};color:${C.ink};padding:14px 40px;border:2px solid ${C.amber};background:rgba(255,181,71,.10)}
.cta b{color:${C.amber};letter-spacing:.12em}
.cta .sl{color:${C.muted};margin:0 .4em}
.cta .ja{font-weight:700}
.url{font-family:${FONT_MONO};color:${C.cyan};font-size:30px;margin-top:18px;letter-spacing:.06em}
.ai{font-family:${FONT_EN};color:${C.muted};line-height:1.5}
.ai .ja{font-size:.95em}
`;

async function cards() {
  const dir = path.join(WORK, 'cards');
  fs.mkdirSync(dir, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const css = fontCss();
  const render = async (name, W, H, body, opaque) => {
    await page.setViewportSize({ width: W, height: H });
    // written to a file and opened from file:// so the local @font-face URLs are allowed
    const html = path.join(dir, name + '.html');
    fs.writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8">
      <style>${css}${BASE_CSS}</style></head><body style="width:${W}px;height:${H}px;position:relative;overflow:hidden">${body}</body></html>`);
    await page.goto('file://' + html, { waitUntil: 'load' });
    await page.evaluate(async () => { await Promise.all([...document.fonts].map(f => f.load().catch(() => {}))); await document.fonts.ready; });
    const jpOk = await page.evaluate(() => document.fonts.check("700 40px 'Zen Kaku Gothic New'", '鋼脚'));
    if (!jpOk) console.warn('warning: Zen Kaku Gothic New not loaded, Japanese falls back to a system font');
    await page.screenshot({ path: path.join(dir, name + '.png'), omitBackground: !opaque });
  };
  for (const [o, W, H] of [['L', 1920, 1080], ['P', 1080, 1920]]) {
    if (!fs.existsSync(path.join(WORK, `log-${o}.json`))) { console.warn(`skip ${o}: no capture yet`); continue; }
    for (const [id, c] of Object.entries(CAPS)) await render(`${o}-${id}`, W, H, captionHtml(c, W, H));
    await render(`${o}-ob`, W, H, obHtml(W, H, '鼓動モード'));
    await render(`${o}-hookB`, W, H, obHtml(W, H, '鼓動モード'));
    // end card background: a still from the capture (OVERBEAT moment), blurred under a dark scrim
    const m = marks(o);
    const still = path.join(dir, `${o}-endbg.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(WORK, 'frames', o, String(m.obs[0] + 40).padStart(5, '0') + '.jpg'),
      '-vf', 'gblur=sigma=14,eq=brightness=-0.05:saturation=0.8', still]);
    await render(`end-${o}`, W, H, endHtml(W, H, still), true);
  }
  await browser.close();
  console.log('cards ->', dir);
}

// ================================================================= 4. edit + encode
function ffmpeg(args) { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); }

function buildVideo(v) {
  const fdir = path.join(WORK, 'frames', v.src);
  const cdir = path.join(WORK, 'cards');
  const inputs = [], chains = [], segs = [];
  let t = 0;
  v.cuts.forEach((c, i) => {
    const n = Math.round(c.dur * FPS);
    if (c.end) {
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(c.dur), '-i', path.join(cdir, c.end + '.png'));
      // slow push-in on the end card, faded up from black
      chains.push(`[${i}:v]scale=${v.W * 2}:${v.H * 2},zoompan=z='1+0.03*on/${n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${v.W}x${v.H}:fps=${FPS},trim=end_frame=${n},setpts=PTS-STARTPTS,fade=in:st=0:d=0.35,format=yuv420p,setsar=1[s${i}]`);
    } else {
      inputs.push('-framerate', String(FPS), '-start_number', String(c.from), '-i', path.join(fdir, '%05d.jpg'));
      const fx = c.flash ? `,fade=in:st=0:d=0.25:color=${c.flash}` : '';
      chains.push(`[${i}:v]trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${v.W}:${v.H}${fx},format=yuv420p,setsar=1[s${i}]`);
    }
    segs.push(`[s${i}]`);
    t += c.dur;
  });
  if (Math.abs(t - v.dur) > 1e-6) throw new Error(`${v.name}: cuts add up to ${t}s, not ${v.dur}s`);
  chains.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[base]`);
  let last = 'base';
  const base = v.cuts.length;
  v.texts.forEach((x, j) => {
    const k = base + j;
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(x.dur), '-i', path.join(cdir, x.card + '.png'));
    const fin = x.cut ? '' : `fade=in:st=0:d=0.22:alpha=1,`;
    chains.push(`[${k}:v]format=rgba,${fin}fade=out:st=${(x.dur - 0.2).toFixed(2)}:d=0.2:alpha=1,setpts=PTS-STARTPTS+${x.at}/TB[t${j}]`);
    chains.push(`[${last}][t${j}]overlay=0:0:eof_action=pass:format=auto[o${j}]`);
    last = `o${j}`;
  });
  chains.push(`[${last}]format=yuv420p[out]`);
  const out = path.join(OUT, v.name + '.mp4');
  ffmpeg([...inputs, '-filter_complex', chains.join(';'), '-map', '[out]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', v.H > v.W ? '20' : '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-t', String(v.dur), '-movflags', '+faststart', out]);
  const mb = fs.statSync(out).size / 1e6;
  console.log(`${path.basename(out)}  ${mb.toFixed(1)} MB`);
  if (mb >= 30) throw new Error(`${out} is ${mb.toFixed(1)} MB (limit 30 MB)`);
}

function stills() {
  const dir = path.join(WORK, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const v of plans()) {
    const out = path.join(OUT, v.name + '.mp4');
    const ts = v.dur === 30 ? [1.5, 7.5, 12, 15.5, 18.5, 21.5, 24.8, 28.5] : [1.0, 4.2, 7.0, 9.5, 11.4, 14.2];
    for (const s of ts) ffmpeg(['-ss', String(s), '-i', out, '-frames:v', '1', '-q:v', '3', path.join(dir, `${v.name}-${String(s).replace('.', '_')}.jpg`)]);
  }
  console.log('stills ->', dir);
}

module.exports = { COPY, C, plans, buildVideo, marks };

if (require.main === module) {
  const [cmd, arg] = process.argv.slice(2);
  (async () => {
    if (cmd === 'capture') await capture(arg === 'P' ? 'P' : 'L');
    else if (cmd === 'cards') await cards();
    else if (cmd === 'edit') { for (const v of plans()) if (!arg || v.name.includes(arg)) buildVideo(v); }
    else if (cmd === 'stills') stills();
    else if (cmd === 'all') { await capture('L'); await capture('P'); await cards(); for (const v of plans()) buildVideo(v); stills(); }
    else console.log('usage: node build-p8-promo.js capture L|P | cards | edit [name] | stills | all');
  })().catch(e => { console.error(e); process.exit(1); });
}

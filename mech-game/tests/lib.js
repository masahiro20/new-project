// Shared harness for P8 Mech Game QA (integrated build: mech-game/index.html with real audio.js)
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
// GAME_DIR=<dir> tests a static build directory (e.g. the frozen itch copy) instead of mech-game/index.html
const GAME_DIR = process.env.GAME_DIR ? path.resolve(process.env.GAME_DIR) : null;
const INDEX = GAME_DIR ? path.join(GAME_DIR, 'index.html') : '/home/user/new-project/mech-game/index.html';
const SHOTS = path.join(__dirname, 'shots');

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      if (q.url === '/' || q.url.startsWith('/index.html')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(INDEX)); }
      else if (GAME_DIR) {
        // static files next to index.html (itch build: three.r128.min.js, fonts/)
        const f = path.join(GAME_DIR, decodeURIComponent(q.url.split('?')[0]));
        if (!f.startsWith(GAME_DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
        const ext = path.extname(f), ct = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.css': 'text/css', '.png': 'image/png', '.txt': 'text/plain' }[ext] || 'application/octet-stream';
        r.writeHead(200, { 'content-type': ct }); r.end(fs.readFileSync(f));
      }
      else { r.writeHead(404); r.end(); }
    }).listen(0, () => res(srv));
  });
}

// Counts every Web Audio node creation and keeps a handle on each AudioContext.
const INIT = () => {
  window.MECH_AUDIO_DEBUG = true; // make MechAudio log swallowed internal errors
  window.__AUD = { ctxs: [], created: {}, total: 0 };
  const Orig = window.AudioContext;
  if (Orig) {
    window.AudioContext = class extends Orig { constructor(...a) { super(...a); window.__AUD.ctxs.push(this); } };
    window.webkitAudioContext = window.AudioContext;
    const proto = BaseAudioContext.prototype;
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^create/.test(k) || k === 'createBuffer' || k === 'createPeriodicWave') continue;
      const f = proto[k]; if (typeof f !== 'function') continue;
      proto[k] = function (...a) { const A = window.__AUD; A.created[k] = (A.created[k] || 0) + 1; A.total++; return f.apply(this, a); };
    }
    // track nodes that still have outgoing connections (a leak shows up as an ever-growing set)
    const live = window.__AUD.live = new Set();
    const c0 = AudioNode.prototype.connect, d0 = AudioNode.prototype.disconnect;
    AudioNode.prototype.connect = function (...a) { live.add(this); return c0.apply(this, a); };
    AudioNode.prototype.disconnect = function (...a) { if (a.length === 0) live.delete(this); return d0.apply(this, a); };
  }
};

async function launch() {
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

async function open(browser, name, ctxOpts, errors, extraInit) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(INIT);
  if (extraInit) await ctx.addInitScript(extraInit);
  const pg = await ctx.newPage();
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${name} console.${m.type()}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${name} PAGEERROR: ${e.message}`));
  const srv = await serve();
  await pg.goto(`http://localhost:${srv.address().port}/`);
  await pg.waitForFunction(() => window.__GAME && window.__GAME.state === 'title', null, { timeout: 20000 });
  pg.__url = `http://localhost:${srv.address().port}/`;
  pg.__close = async () => { await ctx.close(); srv.close(); };
  return pg;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}
function summary(errors) {
  check('no console errors / page exceptions', errors.length === 0, errors.slice(0, 10).join(' | ') || 'none');
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n=== ${results.length - fail}/${results.length} passed ===`);
  return fail;
}
const G = pg => pg.evaluate(() => ({ s: __GAME.state, p: __GAME.player, m: __GAME.mission }));
const shot = (pg, n) => pg.screenshot({ path: path.join(SHOTS, n + '.png') });
async function waitState(pg, st, timeout = 15000) { await pg.waitForFunction(s => __GAME.state === s, st, { timeout }); }
// Fire the real launch button and wait for gameplay.
async function launchToPlay(pg, skip = true) {
  await pg.click('#btnLaunch');
  await waitState(pg, 'launch', 3000);
  if (skip) { await pg.waitForTimeout(600); await pg.keyboard.press('KeyK'); }
  await waitState(pg, 'play', 20000);
}
module.exports = { launch, open, check, summary, G, shot, waitState, launchToPlay, SHOTS, results };
// Wait for N seconds of *game* time in play state (the sim clamps dt to 50ms, so on slow SwiftShader frames game time < real time).
async function waitGame(pg, sec, timeout = 120000) {
  const t0 = await pg.evaluate(() => __GAME.mission.timeLeft);
  await pg.waitForFunction(([t0, sec]) => __GAME.state !== 'play' || t0 - __GAME.mission.timeLeft >= sec, [t0, sec], { timeout, polling: 50 });
}
module.exports.waitGame = waitGame;

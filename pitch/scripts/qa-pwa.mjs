// End-to-end QA for the PWA build (site/app/) with Playwright/Chromium.
//
// Usage: node scripts/qa-pwa.mjs [--fixtures <dir with manifest.json>] [--out <dir>] [--port 5199] [--prefix /new-project/pitch]
// --prefix serves site/ under that sub-path (as on GitHub Pages) and also checks the LP's links.
// Run `npm run build:pwa` first. Fixtures come from scripts/qa-make-fixtures.mjs (only the
// .wav files are used). Serves site/ with scripts/serve.mjs and opens http://localhost:PORT/app/.
//
// Checks: manifest parsed and installable (CDP), icons load at their declared sizes, SW
// registered and controlling after reload, precache complete; then offline: reload,
// navigations fall back to the cached page, auto/synthetic samples and .wav uploads still
// judge correctly; install hint (Chromium prompt, iOS instructions, hidden when
// standalone); 390 px without horizontal scroll; zero console errors.
import { mkdirSync, readFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const root = new URL('..', import.meta.url).pathname;
const fixDir = arg('--fixtures', null) && resolve(arg('--fixtures'));
const outDir = resolve(arg('--out', join(root, '.qa-out/pwa')));
const port = Number(arg('--port', 5199));
const prefix = (arg('--prefix', '') || '').replace(/\/+$/, '');
mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return createRequire(join(g, 'noop.js'))('playwright');
}
const { chromium, devices } = loadPlaywright();

const results = [];
const record = (id, check, ok, detail = '') => { results.push({ id, check, ok }); console.error(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}${detail ? ' — ' + detail : ''}`); };

// ---------------------------------------------------------------- server
// Started and stopped around the offline phase: Chromium's context.setOffline() does not
// cover requests a service worker makes, so "offline" here also means "server gone".
let server;
// With --prefix, stage a root where site/ appears at <prefix>/ (symlink, nothing copied).
let serveRoot = 'site';
if (prefix) {
  const { mkdirSync, rmSync, symlinkSync } = await import('node:fs');
  const stage = join(root, '.qa-out/pages');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, dirname(prefix)), { recursive: true });
  symlinkSync(join(root, 'site'), join(stage, prefix));
  serveRoot = '.qa-out/pages';
}
async function startServer() {
  server = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), String(port), '--root', serveRoot], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, ko) => { server.stdout.once('data', ok); server.once('exit', ko); });
}
async function stopServer() {
  const done = new Promise((ok) => server.once('exit', ok));
  server.kill();
  await done;
}
await startServer();
const base = `http://localhost:${port}${prefix}/app/`;

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

function track(context, page) {
  const log = { errors: [], warnings: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); if (m.type() === 'warning') log.warnings.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  context.on('request', (r) => log.requests.push(r.url()));
  return log;
}
async function waitSettled(page, timeout = 60000) {
  await page.waitForFunction(() => window.__pitchLast && ['done', 'error'].includes(document.querySelector('#result')?.dataset.state), null, { timeout });
  return page.evaluate(() => ({
    state: document.querySelector('#result').dataset.state,
    dataPass: document.querySelector('#verdict').dataset.pass,
    pass: window.__pitchLast?.result?.pass,
    detectedK: window.__pitchLast?.result?.detectedK,
    reason: document.querySelector('#reason')?.textContent.trim(),
  }));
}
async function analyse(page, action) {
  await page.evaluate(() => { window.__pitchLast = null; });
  await action();
  return waitSettled(page, 30000);
}
const fmt = (r) => `state=${r.state} pass=${r.pass} data-pass=${r.dataPass} k=${r.detectedK}`;

async function judgeChecks(page, label) {
  const auto = await waitSettled(page);
  record(`${label}-auto`, `${label}: auto sample on load → pass`, auto.state === 'done' && auto.pass === true, fmt(auto));
  for (const [id, kind, want] of [['w0001', 'correct', true], ['w0001', 'wrong', false], ['w0026', 'correct', true], ['w0026', 'wrong', false]]) {
    await page.selectOption('#word-select', id);
    const r = await analyse(page, () => page.click(`button[data-sample="${kind}"]`));
    record(`${label}-sample`, `${label}: ${id} ${kind} sample → pass=${want}`, r.state === 'done' && r.pass === want && r.dataPass === String(want), fmt(r));
  }
  if (!fixDir) return;
  const manifest = JSON.parse(readFileSync(join(fixDir, 'manifest.json'), 'utf8'));
  for (const f of manifest.filter((x) => x.format === 'wav' && x.variant === 'memo')) {
    await page.selectOption('#word-select', f.wordId);
    const r = await analyse(page, () => page.setInputFiles('#file', join(fixDir, f.file)));
    record(`${label}-wav`, `${label}: upload ${f.file} → pass=${f.expectedPass}`, r.state === 'done' && r.pass === f.expectedPass, fmt(r));
  }
}

// ---------------------------------------------------------------- online: install criteria + SW
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const log = track(context, page);
const cdp = await context.newCDPSession(page);
await page.goto(base);

const mf = await cdp.send('Page.getAppManifest');
let parsed = null;
try { parsed = JSON.parse(mf.data); } catch {}
record('manifest', 'manifest fetched and parsed without errors', !!parsed && mf.errors.length === 0 && /manifest\.webmanifest$/.test(mf.url),
  `url=${mf.url} errors=${JSON.stringify(mf.errors)}`);
if (parsed) {
  const need = { name: 'Pitch — Japanese pitch accent', short_name: 'Pitch', start_url: './', scope: './', display: 'standalone', lang: 'ja' };
  const bad = Object.entries(need).filter(([k, v]) => parsed[k] !== v).map(([k]) => k);
  const sizes = parsed.icons.map((i) => `${i.sizes}/${i.purpose}`);
  record('manifest-fields', 'manifest fields + 192/512 any + maskable icons', bad.length === 0
    && ['192x192/any', '512x512/any', '192x192/maskable', '512x512/maskable'].every((s) => sizes.includes(s)), `bad=${bad} icons=${sizes}`);
  const dims = await page.evaluate(async (icons) => Promise.all(icons.map((i) => new Promise((ok) => {
    const img = new Image(); img.onload = () => ok(`${img.naturalWidth}x${img.naturalHeight}` === i.sizes); img.onerror = () => ok(false); img.src = i.src;
  }))), parsed.icons);
  record('icons', 'every manifest icon loads at its declared size', dims.every(Boolean), JSON.stringify(dims));
}
const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active?.scriptURL));
record('sw-registered', 'service worker registered and active', /\/app\/sw\.js$/.test(swReady ?? ''), swReady);
await waitSettled(page).catch(() => {});
await page.reload();
const controller = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
record('sw-controlling', 'page controlled by the SW after reload', !!controller, controller);
const inst = await cdp.send('Page.getInstallabilityErrors');
record('installable', 'Chromium reports no installability errors', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const out = {};
  for (const k of keys) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
  return out;
});
const cacheNames = Object.keys(cached);
record('precache', 'one versioned cache with index, manifest and 5 icons', cacheNames.length === 1
  && ['/app/index.html', '/app/manifest.webmanifest', '/app/icons/icon-512.png', '/app/icons/apple-touch-icon.png'].every((p) => cached[cacheNames[0]].includes(prefix + p))
  && cached[cacheNames[0]].length === 7, JSON.stringify(cached));
// Chromium headless may or may not fire beforeinstallprompt; when it does, the button must show.
const hint = await page.evaluate(() => ({ hint: !document.getElementById('install-hint').hidden, btn: !document.getElementById('install-btn').hidden, ios: !document.getElementById('install-ios').hidden }));
record('hint-chromium', 'install hint: never shows iOS text on Chromium; button only with hint', !hint.ios && hint.btn === hint.hint, JSON.stringify(hint));
// Headless Chromium does not fire beforeinstallprompt; simulate one to check the button path.
const bip = await page.evaluate(async () => {
  let prompted = false;
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { prompted = true; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(e);
  const shown = !document.getElementById('install-hint').hidden && !document.getElementById('install-btn').hidden;
  document.getElementById('install-btn').click();
  return { prevented: e.defaultPrevented, shown, prompted, hiddenAfter: document.getElementById('install-hint').hidden };
});
record('hint-bip', 'beforeinstallprompt → button shown; click → prompt(), hint hidden', bip.prevented && bip.shown && bip.prompted && bip.hiddenAfter, JSON.stringify(bip));
await waitSettled(page);

// ---------------------------------------------------------------- offline
await stopServer();
await context.setOffline(true);
const resp = await page.reload();
record('offline-reload', 'offline reload served by the SW', resp?.ok() && resp.fromServiceWorker(), `status=${resp?.status()} fromSW=${resp?.fromServiceWorker()}`);
await judgeChecks(page, 'offline');
for (const path of ['index.html', '?word=w0002', 'not-a-page.html']) {
  const p2 = await context.newPage();
  const l2 = track(context, p2);
  const r2 = await p2.goto(base + path);
  const ok = r2?.ok() && (await p2.title()).includes('Pitch');
  record('offline-nav', `offline navigation to ./${path} → cached app`, ok && l2.errors.length === 0, `status=${r2?.status()} fromSW=${r2?.fromServiceWorker()} errors=${l2.errors.join(' | ')}`);
  await p2.close();
}
await page.screenshot({ path: join(outDir, 'offline-desktop.png'), fullPage: true });
const foreign = log.requests.filter((u) => !u.startsWith(`http://localhost:${port}/`) && !/^(data|blob):/.test(u));
record('no-foreign', 'no cross-origin requests', foreign.length === 0, foreign.slice(0, 5).join(', '));
record('console', 'zero console errors (online + offline session)', log.errors.length === 0, log.errors.slice(0, 5).join(' || '));
if (log.warnings.length) console.error(`  (console warnings: ${log.warnings.slice(0, 3).join(' || ')})`);
await context.close();
await startServer();

// ---------------------------------------------------------------- iOS hint, standalone, 390 px
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  const p = await ctx.newPage();
  const l = track(ctx, p);
  await p.goto(base);
  await waitSettled(p).catch(() => {});
  const h = await p.evaluate(() => ({ hint: !document.getElementById('install-hint').hidden, ios: !document.getElementById('install-ios').hidden, btn: !document.getElementById('install-btn').hidden, text: document.getElementById('install-ios').textContent.trim() }));
  record('hint-ios', 'iOS UA: hint shows 共有 → ホーム画面に追加, no button', h.hint && h.ios && !h.btn && /共有/.test(h.text) && /ホーム画面に追加/.test(h.text), JSON.stringify(h));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  record('390', `iPhone 13 (${devices['iPhone 13'].viewport.width}px): no horizontal scroll`, sw <= devices['iPhone 13'].viewport.width, `scrollWidth=${sw}`);
  await p.screenshot({ path: join(outDir, 'iphone-dark.png') });
  await p.click('#install-close');
  await p.reload();
  const again = await p.evaluate(() => !document.getElementById('install-hint').hidden);
  record('hint-dismiss', 'dismissed hint stays hidden after reload', !again);
  record('console-ios', 'zero console errors (iOS context)', l.errors.length === 0, l.errors.slice(0, 3).join(' || '));
  await ctx.close();
}
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  const p = await ctx.newPage();
  await p.goto(base);
  const shown = await p.evaluate(() => !document.getElementById('install-hint').hidden);
  record('hint-standalone', 'standalone (navigator.standalone): hint hidden', !shown);
  // File picking in standalone mode is the same <input type=file>.
  const r = fixDir ? await (async () => {
    const f = JSON.parse(readFileSync(join(fixDir, 'manifest.json'), 'utf8')).find((x) => x.format === 'wav' && x.variant === 'memo' && x.expectedPass);
    await waitSettled(p).catch(() => {});
    await p.selectOption('#word-select', f.wordId);
    return analyse(p, () => p.setInputFiles('#file', join(fixDir, f.file)));
  })() : null;
  if (r) record('standalone-upload', 'standalone: wav upload via input[type=file] → pass', r.pass === true, fmt(r));
  await ctx.close();
}

// The landing page (site/index.html) under the same server: every same-origin
// resource it references, and the CTA into ./app/, must resolve under the prefix.
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  const lp = `http://localhost:${port}${prefix}/`;
  await p.goto(lp);
  const links = await p.evaluate(() => [...document.querySelectorAll('a[href], link[href], img[src], script[src]')]
    .map((e) => e.href || e.src).filter((u) => u.startsWith(location.origin)));
  for (const u of new Set(links.map((u) => u.split('#')[0]))) {
    const r = await ctx.request.get(u);
    if (r.status() >= 400) bad.push(`${r.status()} ${u}`);
  }
  const cta = await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => /free beta/i.test(a.textContent))?.href);
  record('lp-links', `LP at ${lp}: all same-origin links/resources resolve`, bad.length === 0, bad.join('; ') || `${links.length} checked`);
  record('lp-cta', 'LP CTA points at the app under the prefix', cta === base, String(cta));
  await ctx.close();
}

await browser.close();
await stopServer();
const failed = results.filter((r) => !r.ok);
console.log(`qa-pwa: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.id).join(', ')}` : ''} (screenshots in ${outDir})`);
process.exit(failed.length ? 1 : 0);

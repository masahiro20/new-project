// 公開版（GitHub Pages など）の Pitch を Playwright/Chromium で確認する。
// 使い方: node scripts/qa-live.mjs [--url https://masahiro20.github.io/new-project/pitch/] [--fixtures <dir>]
// 確認: LP のリンク、manifest、Service Worker の登録と制御、オフラインでの再読み込みと判定、iPhone 想定の表示。
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// playwright はローカルになければグローバルから読む（qa-pwa.mjs と同じ）
function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  return createRequire(join(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright');
}
const { chromium, devices } = loadPlaywright();

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const site = arg('--url', 'https://masahiro20.github.io/new-project/pitch/').replace(/\/?$/, '/');
const app = site + 'app/';
const fixDir = arg('--fixtures', null) && resolve(arg('--fixtures'));
const results = [];
const record = (id, ok, detail = '') => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`); };

let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

async function settled(page, timeout = 60000) {
  await page.waitForFunction(() => window.__pitchLast && ['done', 'error'].includes(document.querySelector('#result')?.dataset.state), null, { timeout });
  return page.evaluate(() => ({ state: document.querySelector('#result').dataset.state, pass: window.__pitchLast?.result?.pass, k: window.__pitchLast?.result?.detectedK }));
}
async function run(page, action) {
  await page.evaluate(() => { window.__pitchLast = null; });
  await action();
  return settled(page, 30000);
}
const fmt = (r) => `state=${r.state} pass=${r.pass} k=${r.k}`;

// 1) LP: 同一オリジンのリンクと読み込みがすべて 200 台、ボタンがアプリへ向いている
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(site);
  const links = await p.evaluate(() => [...document.querySelectorAll('a[href], link[href], img[src], script[src]')]
    .map((e) => (e.href || e.src).split('#')[0]).filter((u) => u.startsWith(location.origin)));
  const bad = [];
  for (const u of new Set(links)) { const r = await ctx.request.get(u); if (r.status() >= 400) bad.push(`${r.status()} ${u}`); }
  record('lp-links', bad.length === 0, bad.join('; ') || `${new Set(links).size} 件`);
  const cta = await p.evaluate(() => [...document.querySelectorAll('a')].find((a) => /free beta/i.test(a.textContent))?.href);
  record('lp-cta', cta === app, String(cta));
  record('lp-console', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 2) アプリ: manifest、SW、オンライン判定 → オフラインで再読み込みして判定
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(app);
  const auto = await settled(p);
  record('online-auto-sample', auto.state === 'done' && auto.pass === true, fmt(auto));
  const cdp = await ctx.newCDPSession(p);
  const man = await cdp.send('Page.getAppManifest');
  record('manifest', !!man.data && man.errors.length === 0, `${man.url} errors=${JSON.stringify(man.errors)}`);
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(() => ({ installabilityErrors: [] }));
  record('installable', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, script: r.active?.scriptURL }; });
  record('sw-scope', sw.scope === app, JSON.stringify(sw));
  await p.reload();
  const controlled = await p.evaluate(() => !!navigator.serviceWorker.controller);
  record('sw-controlling', controlled);
  await settled(p);

  await ctx.setOffline(true);
  const resp = await p.reload();
  record('offline-reload-from-sw', !!resp && resp.status() === 200 && resp.fromServiceWorker(), `status=${resp?.status()} fromSW=${resp?.fromServiceWorker()}`);
  const off = await settled(p);
  record('offline-auto-sample', off.state === 'done' && off.pass === true, fmt(off));
  for (const [id, kind, want] of [['w0001', 'correct', true], ['w0002', 'wrong', false]]) {
    await p.selectOption('#word-select', id);
    const r = await run(p, () => p.click(`button[data-sample="${kind}"]`));
    record(`offline-sample-${id}-${kind}`, r.state === 'done' && r.pass === want, fmt(r));
  }
  if (fixDir) {
    const list = JSON.parse(readFileSync(join(fixDir, 'manifest.json'), 'utf8')).filter((f) => f.variant === 'memo' && ['wav', 'm4a'].includes(f.format)).slice(0, 8);
    for (const f of list) {
      await p.selectOption('#word-select', f.wordId);
      const r = await run(p, () => p.setInputFiles('#file', join(fixDir, f.file)));
      record(`offline-file-${f.file}`, r.state === 'done' && r.pass === f.expectedPass, fmt(r));
    }
  }
  record('app-console', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 3) iPhone（Safari 相当の UA と画面）: 横スクロールなし、ホーム画面追加の案内が出る
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.goto(app);
  await settled(p);
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, hint: !document.getElementById('install-hint')?.hidden }));
  record('iphone-no-hscroll', m.sw <= m.cw, `scrollWidth=${m.sw} clientWidth=${m.cw}`);
  record('iphone-install-hint', m.hint);
  await p.goto(site);
  const lp = await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  record('iphone-lp-no-hscroll', lp);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`qa-live: ${results.length - failed.length}/${results.length} 合格${failed.length ? ` — 不合格: ${failed.map((f) => f.id).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);

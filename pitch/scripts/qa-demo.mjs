// End-to-end QA for the single-file demo (dist/pitch-demo.html) with Playwright/Chromium.
//
// Usage: node scripts/qa-demo.mjs --fixtures <dir with manifest.json> --out <dir> [--html dist/pitch-demo.html]
// Fixtures come from scripts/qa-make-fixtures.mjs. Playwright is resolved from the local
// node_modules or the global npm root; Chromium falls back to /opt/pw-browsers/chromium.
//
// Checks: (a) no console errors on load from file://, (b) no http(s) requests at all,
// (c) auto sample reaches data-state=done, (d) samples pass/fail per word, (e) fixture
// uploads per format, (f) 390 px viewport without horizontal scroll + dark screenshots,
// (g) lexicon size.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const root = new URL('..', import.meta.url).pathname;
const htmlPath = resolve(arg('--html', join(root, 'dist/pitch-demo.html')));
const fixDir = arg('--fixtures', null) && resolve(arg('--fixtures'));
const outDir = resolve(arg('--out', join(root, '.qa-out')));
const EXPECTED_WORDS = Number(arg('--words', 266));
const SAMPLE_WORDS = ['w0001', 'w0002', 'w0003', 'w0026', 'w0020'];
mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return createRequire(join(g, 'noop.js'))('playwright');
}
const { chromium } = loadPlaywright();

// The artifact host wraps the page content; do the same for local testing.
const body = readFileSync(htmlPath, 'utf8');
const wrapped = /<!doctype/i.test(body.slice(0, 200))
  ? body
  : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
const pagePath = join(outDir, 'pitch-demo.wrapped.html');
writeFileSync(pagePath, wrapped);
const pageUrl = pathToFileURL(pagePath).href;

const results = []; // { id, check, ok, detail }
const record = (id, check, ok, detail = '') => { results.push({ id, check, ok, detail }); console.error(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}${detail ? ' — ' + detail : ''}`); };
const notes = [];

let browser;
try { browser = await chromium.launch(); } catch (e) {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}

async function openPage(opts = {}) {
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  context.on('request', (r) => log.requests.push(r.url()));
  // Block anything remote so a leak cannot actually send data, but still record it.
  await context.route(/^https?:/, (route) => route.abort());
  await page.goto(pageUrl);
  return { context, page, log };
}

const STATE = '#result';
async function waitSettled(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const s = document.querySelector('#result')?.dataset.state;
    return window.__pitchLast && (s === 'done' || s === 'error');
  }, null, { timeout });
  return page.evaluate(() => {
    const L = window.__pitchLast;
    const r = L?.result ?? {};
    return {
      state: document.querySelector('#result')?.dataset.state,
      dataPass: document.querySelector('#verdict')?.dataset.pass ?? null,
      reason: document.querySelector('#reason')?.textContent.trim() ?? null,
      resultText: document.querySelector('#result')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 200),
      word: L?.word?.id ?? L?.word ?? null,
      source: L?.source ?? null,
      pass: r.pass, detectedK: r.detectedK, error: r.error ?? null, verdict: r.verdict ?? null,
      segments: Array.isArray(r.segments) ? r.segments.length : null,
    };
  });
}
// Run an action and wait for a *fresh* analysis.
async function analyse(page, action, timeout) {
  await page.evaluate(() => { window.__pitchLast = null; });
  await action();
  return waitSettled(page, timeout);
}
async function selectWord(page, id) {
  const tag = await page.$eval('#word-select', (el) => el.tagName);
  if (tag === 'SELECT') await page.selectOption('#word-select', id);
  else await page.click(`#word-select [data-id="${id}"], #word-select [value="${id}"]`);
}
const hasJa = (s) => /[぀-ヿ一-鿿]/.test(s ?? '');
const wordIdOf = (r) => (typeof r.word === 'string' ? r.word : null);

// ---------------------------------------------------------------- main page
const { context, page, log } = await openPage({ viewport: { width: 1280, height: 900 } });

// (c) auto sample
let auto;
try {
  await page.waitForFunction(() => window.__pitchLast && ['done', 'error'].includes(document.querySelector('#result')?.dataset.state), null, { timeout: 60000 });
  auto = await waitSettled(page);
  record('c', 'auto sample on load → data-state=done', auto.state === 'done' && auto.source != null,
    `state=${auto.state} source=${JSON.stringify(auto.source)} word=${auto.word} pass=${auto.pass} detectedK=${auto.detectedK}`);
  record('c2', 'auto sample is the correct sample → pass=true, #verdict[data-pass=true]', auto.pass === true && auto.dataPass === 'true',
    `pass=${auto.pass} data-pass=${auto.dataPass} reason="${auto.reason}"`);
} catch (e) {
  record('c', 'auto sample on load → data-state=done', false, `timeout: ${e.message.split('\n')[0]}; #result state=${await page.$eval(STATE, (el) => el.dataset.state).catch(() => 'missing')}`);
}

// DOM contract presence
for (const sel of ['#file', '#word-search', '#word-select', 'button[data-sample="correct"]', 'button[data-sample="wrong"]', '#result', '#verdict', '#reason', 'svg#plot']) {
  const n = await page.locator(sel).count();
  if (n !== 1) record('dom', `selector ${sel} exists once`, false, `count=${n}`);
}
const fileType = await page.$eval('#file', (el) => el.type).catch(() => null);
if (fileType !== 'file') record('dom', '#file is input[type=file]', false, `type=${fileType}`);

// (g) lexicon size
const opts = await page.$$eval('#word-select option', (os) => os.map((o) => o.value)).catch(() => []);
const wordOpts = opts.filter((v) => /^w\d+/.test(v));
record('g', `lexicon has ${EXPECTED_WORDS} words in #word-select`, wordOpts.length === EXPECTED_WORDS && new Set(wordOpts).size === wordOpts.length,
  `options=${opts.length} word-id options=${wordOpts.length} unique=${new Set(wordOpts).size}`);

// #word-search filters the picker (soft check)
try {
  await page.fill('#word-search', 'さくら');
  const visible = await page.$$eval('#word-select option', (os) => os.filter((o) => !o.hidden && o.style.display !== 'none' && !o.disabled).map((o) => o.value));
  record('search', '#word-search "さくら" narrows #word-select and keeps w0026', visible.includes('w0026') && visible.length < opts.length, `visible=${visible.length} [${visible.slice(0, 5).join(',')}]`);
  await page.fill('#word-search', '');
} catch (e) { record('search', '#word-search usable', false, e.message.split('\n')[0]); }

// (d) samples per word
for (const id of SAMPLE_WORDS) {
  try {
    await selectWord(page, id);
    for (const kind of ['correct', 'wrong']) {
      const r = await analyse(page, () => page.click(`button[data-sample="${kind}"]`));
      const want = kind === 'correct';
      const ok = r.state === 'done' && r.pass === want && r.dataPass === String(want) && (wordIdOf(r) ?? id) === id;
      record('d', `${id} ${kind} sample → pass=${want}`, ok,
        `state=${r.state} pass=${r.pass} data-pass=${r.dataPass} detectedK=${r.detectedK} word=${r.word} source=${JSON.stringify(r.source)} reason="${(r.reason ?? '').slice(0, 80)}"`);
    }
  } catch (e) { record('d', `${id} samples`, false, e.message.split('\n')[0]); }
}
await page.screenshot({ path: join(outDir, 'desktop-light.png'), fullPage: true });

// (e) fixture uploads
const decode = {}; // format → {ok, fail, errors:Set}
if (fixDir) {
  const manifest = JSON.parse(readFileSync(join(fixDir, 'manifest.json'), 'utf8'));
  let current = null;
  for (const f of manifest) {
    const d = (decode[f.format] ??= { ok: 0, fail: 0, msgs: new Set() });
    try {
      if (current !== f.wordId) { await selectWord(page, f.wordId); current = f.wordId; }
      const r = await analyse(page, () => page.setInputFiles("#file", join(fixDir, f.file)), 30000);
      const decodeFail = r.state === 'error' && /decode|デコード|読み込|形式|対応/i.test(`${r.error} ${r.reason} ${r.resultText}`);
      if (r.state === 'done') d.ok++; else { d.fail++; d.msgs.add(`${r.error ?? ''} | ${r.reason ?? r.resultText}`); }
      if (r.state === 'error') {
        record('e-err', `${f.file}: error message is Japanese and non-empty`, hasJa(r.reason || r.resultText), `error=${r.error} reason="${r.reason}"`);
        if (f.format === 'm4a') { notes.push(`m4a decode failed (${f.file}): ${r.reason}`); continue; } // environment limit, reported separately
      }
      const target = f.expectedPass;
      const ok = r.state === 'done' && r.pass === target && r.dataPass === String(target);
      const judgeNote = f.nodePass !== f.expectedPass ? ` (note: raw Node judge without utterance trimming gives k=${f.nodeDetectedK})` : '';
      record('e', `${f.file} → pass=${target}`, ok, `state=${r.state} pass=${r.pass} detectedK=${r.detectedK} data-pass=${r.dataPass} word=${r.word}${judgeNote}${decodeFail ? ' DECODE' : ''}${r.state === 'error' ? ` reason="${r.reason}"` : ''}`);
    } catch (e) { d.fail++; record('e', `${f.file}`, false, e.message.split('\n')[0]); }
  }
}

// (a) console errors and (b) network, for the main session
record('a', 'zero console errors (load + whole session)', log.errors.length === 0, log.errors.slice(0, 5).join(' || '));
const remote = log.requests.filter((u) => !/^(file|data|blob):/.test(u));
record('b', 'all requests are file:/data:/blob:', remote.length === 0, `${log.requests.length} requests; non-local: ${remote.slice(0, 5).join(', ') || 'none'}`);
await context.close();

// (f) mobile 390 px, light + dark
for (const scheme of ['light', 'dark']) {
  const m = await openPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
  try { await waitSettled(m.page); } catch {}
  const sw = await m.page.evaluate(() => document.documentElement.scrollWidth);
  record('f', `390px ${scheme}: scrollWidth <= 390`, sw <= 390, `scrollWidth=${sw}`);
  const bg = await m.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (scheme === 'dark') {
    const lum = (bg.match(/\d+/g) || [255, 255, 255]).slice(0, 3).reduce((a, b) => a + Number(b), 0) / 3;
    record('f-dark', 'dark scheme: body background is dark', lum < 90, `body bg=${bg}`);
  }
  await m.page.screenshot({ path: join(outDir, `mobile-390-${scheme}.png`), fullPage: true });
  if (m.log.errors.length) record('a-mobile', `${scheme} mobile: zero console errors`, false, m.log.errors.slice(0, 3).join(' || '));
  const rem = m.log.requests.filter((u) => !/^(file|data|blob):/.test(u));
  if (rem.length) record('b-mobile', `${scheme} mobile: no http(s)`, false, rem.join(', '));
  await m.context.close();
}
await browser.close();

// ---------------------------------------------------------------- report
const esc = (s) => String(s).replace(/\|/g, '\\|');
const lines = [];
const failed = results.filter((r) => !r.ok);
lines.push(`# P3 Pitch demo QA — ${new Date().toISOString()}`, '', `Page: ${htmlPath}`, `Result: ${results.length - failed.length}/${results.length} checks passed`, '');
lines.push('| # | check | result | detail |', '|---|---|---|---|');
for (const r of results) lines.push(`| ${r.id} | ${esc(r.check)} | ${r.ok ? 'PASS' : '**FAIL**'} | ${esc(r.detail)} |`);
if (Object.keys(decode).length) {
  lines.push('', '## Decode support by format (Chromium)', '', '| format | decoded | failed | messages |', '|---|---|---|---|');
  for (const [fmt, d] of Object.entries(decode)) lines.push(`| ${fmt} | ${d.ok} | ${d.fail} | ${esc([...d.msgs].slice(0, 2).join(' / '))} |`);
}
if (notes.length) lines.push('', '## Environment notes', '', ...[...new Set(notes)].slice(0, 5).map((n) => `- ${n}`));
lines.push('', `Screenshots: ${outDir}/desktop-light.png, mobile-390-light.png, mobile-390-dark.png`);
const report = lines.join('\n');
writeFileSync(join(outDir, 'report.md'), report + '\n');
console.log(report);
process.exit(failed.length ? 1 : 0);

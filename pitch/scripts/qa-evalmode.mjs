// 評価協力モードの end-to-end QA（Playwright/Chromium）。Artifact 版（dist/pitch-demo.html）と PWA（site/app/）の両方。
//
//   node scripts/qa-evalmode.mjs --fixtures <qa-make-fixtures.mjs の出力> [--out <dir>] [--port 5198]
//
// 流れ：既定はオフ → 同意（チェックするまで押せない）→ wav を2件判定 → 一覧に2件 → 合成サンプルは増えない →
// 1件削除 → zip を書き出し（Artifact 版は downloads 機能のスタブ、PWA はダウンロードイベント）→ unzip -t で検証 →
// 練習モードの録音も保存 → 再読み込み後も残る（モードはオフに戻る）→ 全件削除（ページ内の確認）。
// 外部へのリクエストが 0 件、390 px で横スクロールなし、コンソールエラーなし。先に build:demo と build:pwa を実行。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const root = new URL('..', import.meta.url).pathname;
const fixDir = resolve(arg('--fixtures', '/tmp/pitch-fx'));
const outDir = resolve(arg('--out', join(root, '.qa-out/evalmode')));
const port = Number(arg('--port', 5198));
mkdirSync(outDir, { recursive: true });

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return createRequire(join(g, 'noop.js'))('playwright');
}
const { chromium } = loadPlaywright();
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

const results = [];
const record = (id, check, ok, detail = '') => { results.push({ id, check, ok }); console.error(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}${detail ? ' — ' + detail : ''}`); };

const WAVS = [['w0001', 'w0001-correct-k1-memo.wav', { intent: 'dictionary' }], ['w0026', 'w0026-wrong-k1-memo.wav', { intent: 'other', k: '1' }]];

// Artifact 版：ホストがページを包むのと同じように包み、downloads 機能をスタブにする。
const body = readFileSync(join(root, 'dist/pitch-demo.html'), 'utf8');
const artifactPath = join(outDir, 'pitch-demo.wrapped.html');
writeFileSync(artifactPath, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
const stubDownloads = () => {
  window.__saved = [];
  window.claude = {
    use: async (name) => {
      if (name !== 'downloads') throw new Error('not granted');
      return { save: async ({ filename, data }) => { window.__saved.push({ filename, type: data.type, bytes: Array.from(new Uint8Array(await data.arrayBuffer())) }); } };
    },
  };
};

const count = (page) => page.$$eval('#eval-list li', (l) => l.length);
const status = (page) => page.textContent('#eval-status');

async function judgeFile(page, wordId, file, before) {
  await page.selectOption('#word-select', wordId);
  if (before) await before();
  await page.evaluate(() => { window.__pitchLast = null; });
  await page.setInputFiles('#file', join(fixDir, file));
  await page.waitForFunction(() => window.__pitchLast && ['done', 'error'].includes(document.querySelector('#result').dataset.state), null, { timeout: 30000 });
}

async function run(label, url, { artifact }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  if (artifact) await context.addInitScript(stubDownloads);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  context.on('request', (r) => requests.push(r.url()));
  await context.route((u) => !/^(file|data|blob):/.test(u.href) && !u.href.startsWith(`http://localhost:${port}/`), (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => window.__pitchLast && document.querySelector('#result').dataset.state === 'done', null, { timeout: 60000 });

  // 既定はオフ・何も保存しない
  record(label, '既定はオフ（バッジ非表示・フォーム非表示）', await page.evaluate(() => document.querySelector('#eval-state').dataset.on === 'false' && document.querySelector('#eval-badge').hidden && document.querySelector('#eval-form').hidden));
  await judgeFile(page, ...WAVS[0].slice(0, 2));
  record(label, 'オフのまま判定しても保存しない', (await count(page)) === 0);
  const dbBefore = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : ['?']));
  record(label, '同意前はデータベースも作らない', !dbBefore.includes('p3pitch-eval'), JSON.stringify(dbBefore));

  // 同意
  await page.click('#eval-toggle');
  record(label, '同意のチェック前は「オンにする」を押せない', await page.isDisabled('#eval-start'));
  await page.check('#eval-agree');
  await page.click('#eval-start');
  await page.waitForFunction(() => document.querySelector('#eval-state').dataset.on === 'true');
  record(label, '同意後にオン（バッジ表示）', await page.isVisible('#eval-badge'));
  await page.selectOption('#eval-speaker', 'native');
  await page.selectOption('#eval-region', 'tokyo');

  // wav を2件
  for (const [wordId, file, form] of WAVS) {
    const n0 = await count(page);
    await judgeFile(page, wordId, file, async () => {
      await page.selectOption('#eval-intent', form.intent);
      if (form.k) await page.selectOption('#eval-intent-k', form.k);
    });
    await page.waitForFunction((n) => document.querySelectorAll('#eval-list li').length === n + 1, n0, { timeout: 10000 }).catch(() => {});
  }
  record(label, 'wav を2件判定 → 一覧に2件', (await count(page)) === 2, await status(page));
  await page.selectOption('#word-select', 'w0001');
  await page.click('#sample-wrong');
  await page.waitForTimeout(1500);
  record(label, '合成サンプルは保存しない', (await count(page)) === 2);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  record(label, '390px: 横スクロールなし（フォーム・一覧表示中）', sw <= 390, `scrollWidth=${sw}`);
  await page.locator('#evalmode').screenshot({ path: join(outDir, `${label}-evalmode-390.png`) });

  // 1件削除
  const firstDel = await page.$eval('#eval-list li:last-child button', (b) => b.id); // 一番古い（w0001）を消す
  await page.click(`#${firstDel}`);
  await page.waitForFunction(() => document.querySelectorAll('#eval-list li').length === 1);
  record(label, '1件削除 → 1件', (await count(page)) === 1, firstDel);

  // 全件削除の確認ステップ（やめる）
  await page.click('#eval-clear');
  record(label, '全件削除はページ内で確認する', await page.isVisible('#eval-clear-confirm'));
  await page.click('#eval-clear-no');
  record(label, '確認で「やめる」→ 残る', (await count(page)) === 1 && !(await page.isVisible('#eval-clear-confirm')));

  // 書き出し
  let zipBytes, zipName;
  if (artifact) {
    await page.click('#eval-export');
    await page.waitForFunction(() => window.__saved.length > 0, null, { timeout: 10000 });
    const s = await page.evaluate(() => window.__saved[0]);
    zipBytes = Buffer.from(s.bytes); zipName = s.filename;
    record(label, 'downloads 機能で保存（application/zip）', s.type === 'application/zip', s.type);
  } else {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#eval-export')]);
    zipName = dl.suggestedFilename();
    const p = join(outDir, `${label}-${zipName}`);
    await dl.saveAs(p);
    zipBytes = readFileSync(p);
  }
  record(label, 'ファイル名 Pitch-eval-YYYYMMDD.zip', /^Pitch-eval-\d{8}\.zip$/.test(zipName), zipName);
  const zipPath = join(outDir, `${label}-export.zip`);
  writeFileSync(zipPath, zipBytes);
  let t = '';
  try { t = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }); } catch (e) { t = String(e.stdout ?? e); }
  record(label, 'unzip -t: エラーなし', /No errors detected/.test(t), t.split('\n').filter((l) => /testing/.test(l)).map((l) => l.trim().split(/\s+/)[1]).join(' '));
  const man = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }));
  const rec = man.records[0] ?? {};
  const one = rec.json ? JSON.parse(execFileSync('unzip', ['-p', zipPath, rec.json], { encoding: 'utf8' })) : {};
  record(label, 'manifest: 1件・単語・判定・ビルド番号', man.count === 1 && rec.wordId === 'w0026' && typeof rec.pass === 'boolean' && /\d{4}-\d{2}-\d{2}/.test(man.build), JSON.stringify({ count: man.count, rec: [rec.wordId, rec.pass, rec.detectedK], build: man.build }));
  record(label, 'JSON: 話者・意図・16 kHz、ファイル名なし', one.speaker?.category === 'native' && one.speaker?.region === 'tokyo' && one.intended?.kind === 'other' && one.intended?.k === 1 && one.audio?.sampleRate === 16000 && !JSON.stringify(one).includes('memo'), JSON.stringify(one.intended));

  // 練習モードの録音
  await page.setInputFiles('#pair-file', join(fixDir, 'w0001-correct-k1-memo.wav'));
  await page.waitForFunction(() => document.querySelectorAll('#eval-list li').length === 2, null, { timeout: 30000 }).catch(() => {});
  record(label, '練習モードの録音も保存（練習の印）', (await count(page)) === 2 && /練習/.test(await page.textContent('#eval-list')));
  await page.click('#pair-sample');
  await page.waitForTimeout(1500);
  record(label, '練習モードの合成サンプルは保存しない', (await count(page)) === 2);

  // 再読み込み：保存は残り、モードはオフに戻る
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#eval-list li').length === 2, null, { timeout: 15000 }).catch(() => {});
  record(label, '再読み込み後：2件残り、モードはオフ', (await count(page)) === 2 && (await page.evaluate(() => document.querySelector('#eval-state').dataset.on)) === 'false');

  // 全件削除
  await page.click('#eval-clear');
  await page.click('#eval-clear-yes');
  await page.waitForFunction(() => document.querySelectorAll('#eval-list li').length === 0);
  record(label, '全件削除 → 0件', (await count(page)) === 0);

  // すべての操作要素に id
  const noId = await page.$$eval('#evalmode button, #evalmode input, #evalmode select, #eval-badge a', (els) => els.filter((e) => !e.id).length);
  record(label, '操作要素はすべて id 付き', noId === 0, `${noId} without id`);
  const remote = requests.filter((u) => !/^(file|data|blob):/.test(u) && !u.startsWith(`http://localhost:${port}/`));
  record(label, '外部へのリクエスト 0 件', remote.length === 0, `${requests.length} requests; external: ${remote.slice(0, 3).join(', ') || 'none'}`);
  record(label, 'コンソールエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();
}

await run('artifact', pathToFileURL(artifactPath).href, { artifact: true });

const server = spawn(process.execPath, [join(root, 'scripts/serve.mjs'), String(port), '--root', 'site'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, ko) => { server.stdout.once('data', ok); server.once('exit', ko); });
try {
  await run('pwa', `http://localhost:${port}/app/`, { artifact: false });
} finally {
  server.kill();
  await browser.close();
}
const fails = results.filter((r) => !r.ok);
console.log(`qa-evalmode: ${results.length - fails.length}/${results.length} passed (screenshots and zips in ${outDir})`);
process.exit(fails.length ? 1 : 0);

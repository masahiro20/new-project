// 創設サポーターの end-to-end QA（Playwright / Chromium）。
//
//   node scripts/qa-supporter.mjs --out <scratch のフォルダ>
//
// 1. テスト用の鍵ペアを --out の中に作り（scripts/supporter-key.mjs init）、テストキーを発行する。
// 2. テスト用の公開鍵を差し込んだページ（SUPPORTER_PUBLIC_KEY 差し替え）と、本番と同じページ（未設定）を
//    --out の中にビルドする。dist/ と site/ には書かない（書こうとすると build-demo が拒否することも確認）。
// 3. テスト用のページ：無料で20語判定 → 21語目がブロック → テストキーで解除 → 無制限・単語リスト・
//    全範囲の Anki・全部の最小対・全期間の記録 → 再読み込みでも解除のまま → キー削除で無料に戻る。
// 4. 本番のページ：「準備中」と表示し、有効なテストキーでも何も解除しない（fail closed）。
// 5. dist/pitch-demo.html と site/app/index.html にテスト用の公開鍵が入っていないこと。
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { synthesizeWord } from '../src/synth.js';
import { encodeWav16 } from '../demo/evalmode.js';
import { buildMinimalPairs } from '../demo/practice.js';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const root = new URL('..', import.meta.url).pathname;
const outDir = resolve(arg('--out', join(root, '.qa-out/supporter')));
mkdirSync(outDir, { recursive: true });
const node = (script, a, env = {}) => execFileSync(process.execPath, [join(root, script), ...a], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });

const results = [];
const record = (id, check, ok, detail = '') => { results.push({ id, check, ok, detail }); console.error(`${ok ? 'PASS' : 'FAIL'} ${id} ${check}${detail ? ' — ' + detail : ''}`); };

// ---------------------------------------------------------------- 1. テスト鍵
const keyDir = join(outDir, 'keys');
rmSync(keyDir, { recursive: true, force: true });
const pubPath = join(keyDir, 'test-pubkey.js');
const privPath = join(keyDir, 'private', 'test-key.pem');
node('scripts/supporter-key.mjs', ['init', '--key', privPath, '--pubkey-out', pubPath]);
const testKey = node('scripts/supporter-key.mjs', ['issue', '--key', privPath, '--serial', '1', '--pubkey', pubPath]).trim();
const testX = /"x":"([^"]+)"/.exec(readFileSync(pubPath, 'utf8'))[1];
record('keys', 'テスト鍵ペアを scratch に作成・キーを発行', /^PITCH-/.test(testKey), testKey.slice(0, 24) + '…');

// ---------------------------------------------------------------- 2. ビルド
const testHtml = join(outDir, 'pitch-supporter-test.html');
const prodHtml = join(outDir, 'pitch-supporter-prod.html');
node('scripts/build-demo.mjs', [join(root, 'demo/template.html'), testHtml], { SUPPORTER_PUBKEY: pubPath, SUPPORTER_FREE_LIMITS: '1' });
node('scripts/build-demo.mjs', [join(root, 'demo/template.html'), prodHtml], { SUPPORTER_PUBKEY: '' });
record('build', 'テスト用ビルドにテスト公開鍵が入る', readFileSync(testHtml, 'utf8').includes(testX));
record('build', '本番と同じビルドにはテスト公開鍵が入らない', !readFileSync(prodHtml, 'utf8').includes(testX));
const refuse = spawnSync(process.execPath, [join(root, 'scripts/build-demo.mjs'), join(root, 'demo/template.html'), join(root, 'dist/should-not-exist.html')], { env: { ...process.env, SUPPORTER_PUBKEY: pubPath }, encoding: 'utf8' });
const refusePwa = spawnSync(process.execPath, [join(root, 'scripts/build-pwa.mjs')], { env: { ...process.env, SUPPORTER_PUBKEY: pubPath }, encoding: 'utf8' });
record('build', 'テスト公開鍵で dist/・site/ に書こうとすると拒否', refuse.status !== 0 && refusePwa.status !== 0 && !existsSync(join(root, 'dist/should-not-exist.html')), `${refuse.stderr.trim().slice(0, 80)} / ${refusePwa.stderr.trim().slice(0, 80)}`);
for (const f of ['dist/pitch-demo.html', 'site/app/index.html']) {
  const p = join(root, f);
  if (existsSync(p)) record('publish', `${f} にテスト公開鍵が入っていない`, !readFileSync(p, 'utf8').includes(testX));
}

// ---------------------------------------------------------------- 録音の代わり（合成音声の wav）
const lex = JSON.parse(readFileSync(join(root, 'data/lexicon-2000.json'), 'utf8')).words;
const lexById = new Map(lex.map((w) => [w.id, w]));
const inPairs = new Set(buildMinimalPairs(lex).flatMap((g) => g.options.flatMap((o) => o.words.map((w) => w.id))));
const wavDir = join(outDir, 'wav');
mkdirSync(wavDir, { recursive: true });
function wavFor(id) {
  const path = join(wavDir, `${id}.wav`);
  if (!existsSync(path)) {
    const w = lexById.get(id);
    const { audio, sampleRate } = synthesizeWord(w.morae, w.accent[0], { sampleRate: 16000, baseHz: 140, seed: 3 });
    const pad = new Float32Array(audio.length + 8000);
    pad.set(audio, 4000);
    writeFileSync(path, encodeWav16(pad, sampleRate));
  }
  return path;
}

// ---------------------------------------------------------------- browser
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const g = execFileSync('npm', ['root', '-g']).toString().trim();
  return createRequire(join(g, 'noop.js'))('playwright');
}
const { chromium } = loadPlaywright();
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }

function wrap(htmlPath) {
  const body = readFileSync(htmlPath, 'utf8');
  const p = htmlPath.replace(/\.html$/, '.wrapped.html');
  writeFileSync(p, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
  return pathToFileURL(p).href;
}

async function openPage(url, context) {
  const page = await context.newPage();
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  context.on('request', (r) => log.requests.push(r.url()));
  await context.route(/^https?:/, (route) => route.abort());
  await page.goto(url);
  await page.waitForFunction(() => window.__pitchLast && document.querySelector('#result').dataset.state === 'done' && window.__supporter, null, { timeout: 60000 });
  return { page, log };
}

async function judgeFile(page, id) {
  await page.selectOption('#word-select', id);
  await page.evaluate(() => { window.__pitchLast = null; });
  await page.setInputFiles('#file', wavFor(id));
  await page.waitForFunction(() => window.__pitchLast && ['done', 'error', 'limit'].includes(document.querySelector('#result').dataset.state), null, { timeout: 30000 });
  return page.evaluate(() => ({
    state: document.querySelector('#result').dataset.state,
    blocked: window.__pitchLast.blocked ?? null,
    error: window.__pitchLast.result?.error ?? null,
    reason: document.querySelector('#reason').textContent,
    limitNote: !document.querySelector('#limit-note').hidden,
    used: window.__supporter.used,
  }));
}
const sup = (page) => page.evaluate(() => ({ ...window.__supporter }));
const ankiScopes = (page) => page.$$eval('#anki-scope option', (os) => os.map((o) => ({ v: o.value, disabled: o.disabled, text: o.textContent })));
const openScopes = async (page) => (await ankiScopes(page)).filter((o) => !o.disabled).map((o) => o.v);

// ---------------------------------------------------------------- 3. テスト用のページ
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const url = wrap(testHtml);
  const { page, log } = await openPage(url, context);
  const L = 'test';
  let s = await sup(page);
  record(L, '開いた直後は無料（status=free）', s.status === 'free' && s.limit === 20, JSON.stringify(s));
  record(L, '購入リンクは URL 未定のため「準備中」（リンクなし）', (await page.textContent('#sup-buy')).includes('準備中') && (await page.locator('#sup-buy a').count()) === 0);
  record(L, '購入画面に「判定はベータ」を明記', (await page.textContent('#sup-beta')).includes('判定はベータで調整中です。精度を約束するものではありません'));
  record(L, '価格・買い切り・30日返金を表示', /\$19/.test(await page.textContent('#sup-price')) && /買い切り/.test(await page.textContent('#sup-price')) && /30日以内/.test(await page.textContent('#sup-refund')));
  record(L, '無料：単語リストは使えない（案内を表示）', await page.isVisible('#lists-locked') && await page.isHidden('#lists-body'));
  record(L, '無料：Anki は「不合格だった単語」だけ', JSON.stringify(await openScopes(page)) === '["failed"]', JSON.stringify(await ankiScopes(page)));
  const pairs = await page.$$eval('#pair-select option', (os) => os.map((o) => o.value));
  await page.selectOption('#pair-select', pairs[0]);
  const drill0 = await page.isEnabled('#drill-play');
  await page.selectOption('#pair-select', pairs[10]);
  const drill10 = await page.isEnabled('#drill-play');
  record(L, '無料：聞き分けドリルは最初の5組だけ', drill0 && !drill10 && (await page.textContent('#drill-feedback')).includes('サポーター'), `pairs=${pairs.length} [0]=${drill0} [10]=${drill10}`);
  record(L, '無料：練習の記録は直近7日', (await page.evaluate(() => window.__progress.window)) === 7);

  // 20語まで
  const ids = (await page.$$eval('#word-select option', (os) => os.map((o) => o.value))).filter((id) => !inPairs.has(id)).slice(0, 23);
  let okCount = 0;
  for (let i = 0; i < 20; i++) {
    const r = await judgeFile(page, ids[i]);
    if (r.state === 'done' && r.used === i + 1) okCount++;
    else console.error(`  word ${i + 1} ${ids[i]}: ${JSON.stringify(r)}`);
  }
  record(L, '無料：異なる20語を録音で判定できる（数は1ずつ増える）', okCount === 20, `ok=${okCount}`);
  const again = await judgeFile(page, ids[0]);
  record(L, '同じ語のやり直しは数えない', again.state === 'done' && again.used === 20, JSON.stringify(again));
  const r21 = await judgeFile(page, ids[20]);
  record(L, '無料：21語目はブロック（回数の案内＋サポーターの案内）', r21.state === 'limit' && r21.blocked === 'daily-limit' && r21.limitNote && /20語/.test(r21.reason) && /判定の中身は同じ/.test(r21.reason), JSON.stringify(r21).slice(0, 200));
  await page.evaluate(() => { window.__pitchLast = null; });
  await page.click('#sample-correct');
  await page.waitForFunction(() => window.__pitchLast && document.querySelector('#result').dataset.state === 'done');
  record(L, '合成音声のサンプルは上限後も使え、数えない', (await sup(page)).used === 20);
  // 練習の言い分けも同じ上限
  await page.selectOption('#pair-select', pairs[1]);
  await page.evaluate(() => { window.__practiceLast = null; });
  await page.setInputFiles('#pair-file', wavFor(ids[21]));
  await page.waitForFunction(() => window.__practiceLast);
  record(L, '無料：練習の言い分け（録音）も21語目からブロック', (await page.evaluate(() => window.__practiceLast.blocked)) === 'daily-limit');
  await page.screenshot({ path: join(outDir, 'test-free-limit.png'), fullPage: true });

  // 改ざんしたキーは通らない
  const bad = testKey.slice(0, 30) + (testKey[30] === 'A' ? 'B' : 'A') + testKey.slice(31);
  await page.fill('#sup-key', bad);
  await page.click('#sup-activate');
  await page.waitForFunction(() => document.querySelector('#sup-msg').dataset.kind === 'ng');
  record(L, '改ざんしたキーは通らない', (await sup(page)).status === 'free', await page.textContent('#sup-msg'));

  // テストキーで解除（小文字・改行・前後の空白）
  const messy = `  ${testKey.toLowerCase().slice(0, 50)}\n${testKey.toLowerCase().slice(50)}  \n`;
  await page.fill('#sup-key', messy);
  await page.click('#sup-activate');
  await page.waitForFunction(() => window.__supporter.status === 'supporter', null, { timeout: 10000 }).catch(() => {});
  s = await sup(page);
  record(L, 'テストキー（小文字・改行入り）で解除', s.status === 'supporter' && s.serial === 1, `${JSON.stringify(s)} msg=${await page.textContent('#sup-msg')}`);
  record(L, '解除状態の表示とキー削除ボタン', (await page.textContent('#sup-status')).includes('解除済み') && await page.isVisible('#sup-remove'));
  const stored = await page.evaluate(() => localStorage.getItem('pitch-supporter-key'));
  record(L, '検証済みのキーを localStorage に保存（表示形）', stored === testKey);

  const r21b = await judgeFile(page, ids[20]);
  const r22 = await judgeFile(page, ids[21]);
  record(L, 'サポーター：21語目以降も判定できる（無制限）', r21b.state === 'done' && r22.state === 'done', `${r21b.state} ${r22.state}`);
  await page.selectOption('#pair-select', pairs[10]);
  record(L, 'サポーター：すべての組で聞き分けドリル', await page.isEnabled('#drill-play'));
  record(L, 'サポーター：練習の記録は全期間', (await page.evaluate(() => window.__progress.window)) === 'all' && (await page.evaluate(() => window.__progress.total.n)) >= 22);

  // 単語リスト
  record(L, 'サポーター：単語リストが使える', await page.isVisible('#lists-body') && await page.isHidden('#lists-locked'));
  await page.fill('#list-name', 'テスト課');
  await page.click('#list-create');
  await page.selectOption('#word-select', ids[0]);
  await page.click('#list-add-current');
  await page.selectOption('#word-select', ids[1]);
  await page.click('#list-add-current');
  await page.click('#list-add-current'); // 重複は足さない
  const listItems = await page.$$eval('#list-words li', (ls) => ls.length);
  await page.fill('#list-name', '第2のリスト');
  await page.click('#list-create');
  const listCount = await page.$$eval('#list-select option', (os) => os.length);
  await page.selectOption('#list-select', { index: 0 });
  record(L, '単語リスト：名前つきで複数・語の追加（重複なし）', listItems === 2 && listCount === 2, `items=${listItems} lists=${listCount}`);
  await page.click('#list-next');
  const cur = await page.$eval('#word-select', (el) => el.value);
  record(L, '単語リストから練習（次の語を判定画面で選ぶ）', [ids[0], ids[1]].includes(cur), cur);

  // Anki 全範囲
  const scopes = await openScopes(page);
  record(L, 'サポーター：Anki の範囲がすべて選べる', ['current', 'results', 'list', 'pairs', 'failed'].every((x) => scopes.includes(x)), JSON.stringify(scopes));
  await page.selectOption('#anki-scope', 'list');
  await page.click('#anki-copy');
  const tsv = await page.$eval('#anki-text', (el) => el.value);
  const w0 = lexById.get(ids[0]).surface, w1 = lexById.get(ids[1]).surface;
  record(L, 'Anki：自分の単語リストを書き出せる', tsv.includes('pitch::mylist') && tsv.includes(w0) && tsv.includes(w1) && /# P3 Pitch — 2 notes/.test(tsv), tsv.split('\n')[6]);
  await page.selectOption('#anki-scope', 'pairs');
  await page.click('#anki-copy');
  record(L, 'Anki：最小対の全部を書き出せる', /pitch::minimal-pair/.test(await page.$eval('#anki-text', (el) => el.value)));
  await page.locator('#supporter').screenshot({ path: join(outDir, 'test-supporter-390.png') });
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  record(L, '390px：横スクロールなし（解除後）', sw <= 390, `scrollWidth=${sw}`);

  // 再読み込みでも解除のまま
  await page.reload();
  await page.waitForFunction(() => window.__supporter?.status === 'supporter', null, { timeout: 30000 }).catch(() => {});
  record(L, '再読み込みしても解除のまま（保存したキーを検証し直す）', (await sup(page)).status === 'supporter');
  record(L, '単語リストは端末に残る', (await page.$$eval('#list-select option', (os) => os.length)) === 2);

  // キーを削除 → 無料に戻る
  await page.click('#sup-remove');
  s = await sup(page);
  record(L, 'キー削除で無料に戻る', s.status === 'free' && (await page.evaluate(() => localStorage.getItem('pitch-supporter-key'))) === null, JSON.stringify(s));
  const r23 = await judgeFile(page, ids[22]);
  record(L, '削除後：新しい語はまたブロック（今日の数は残る）', r23.state === 'limit', JSON.stringify(r23).slice(0, 120));
  record(L, '削除後：Anki は「不合格だった単語」だけ・リストは使えない', JSON.stringify(await openScopes(page)) === '["failed"]' && await page.isVisible('#lists-locked'));
  await page.selectOption('#pair-select', pairs[10]);
  record(L, '削除後：6組目以降の聞き分けは使えない', !(await page.isEnabled('#drill-play')));

  record(L, 'コンソールエラーなし', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  const remote = log.requests.filter((u) => !/^(file|data|blob):/.test(u));
  record(L, '外部への通信なし', remote.length === 0, remote.slice(0, 3).join(', '));
  await context.close();
}

// ---------------------------------------------------------------- 4. 本番と同じページ（公開鍵が未設定）
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const url = wrap(prodHtml);
  const { page, log } = await openPage(url, context);
  const L = 'prod';
  let s = await sup(page);
  record(L, '公開鍵が未設定：status=unconfigured', s.status === 'unconfigured', JSON.stringify(s));
  record(L, 'キー入力欄は「準備中」で使えない', await page.isDisabled('#sup-key') && await page.isDisabled('#sup-activate')
    && (await page.getAttribute('#sup-key', 'placeholder')) === '準備中' && await page.isVisible('#sup-unconfigured'));
  record(L, '購入は「準備中」（外部リンクなし）', (await page.textContent('#sup-buy')).includes('準備中') && (await page.locator('#supporter a[href^="http"]').count()) === 0);
  // 無理に押しても解除しない
  await page.evaluate((k) => { const t = document.querySelector('#sup-key'); t.disabled = false; t.value = k; const b = document.querySelector('#sup-activate'); b.disabled = false; b.click(); }, testKey);
  await page.waitForFunction(() => document.querySelector('#sup-msg').dataset.kind === 'ng', null, { timeout: 5000 }).catch(() => {});
  s = await sup(page);
  record(L, '有効なテストキーを入れても解除しない（fail closed）', s.status === 'unconfigured' && (await page.textContent('#sup-msg')).includes('準備中'), await page.textContent('#sup-msg'));
  // 保存済みのキーがあっても
  await page.evaluate((k) => localStorage.setItem('pitch-supporter-key', k), testKey);
  await page.reload();
  await page.waitForFunction(() => window.__supporter && window.__pitchLast, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  s = await sup(page);
  // 販売開始前（freeLimitsActive = false）は全員がすべて使えるので、キーが「受け付けられていない」ことだけを確かめる
  record(L, '保存済みのテストキーでも受け付けない（サポーター扱いにならない）', s.status === 'unconfigured' && !s.serial, JSON.stringify(s));
  // 無料枠はそのまま（今日20語使った状態から）
  const ids = (await page.$$eval('#word-select option', (os) => os.map((o) => o.value))).filter((id) => !inPairs.has(id));
  await page.evaluate((words) => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    localStorage.setItem('pitch-usage-v1', JSON.stringify({ day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, words }));
  }, ids.slice(0, 20));
  const r = await judgeFile(page, ids[20]);
  record(L, '販売開始前は無料枠を適用しない（21語目も判定できる）', r.state === 'done', r.state);
  await page.locator('#supporter').screenshot({ path: join(outDir, 'prod-supporter.png') });
  record(L, 'コンソールエラーなし', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  const remote = log.requests.filter((u) => !/^(file|data|blob):/.test(u));
  record(L, '外部への通信なし', remote.length === 0, remote.slice(0, 3).join(', '));
  await context.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`qa-supporter: ${results.length - failed.length}/${results.length} checks passed (out: ${outDir})`);
for (const f of failed) console.log(`  FAIL ${f.id} ${f.check} — ${f.detail}`);
process.exit(failed.length ? 1 : 0);

// Build the single-file demo page: dist/pitch-demo.html.
//
//   node scripts/build-demo.mjs [--lexicon 2000|200|path.json] [template.html] [out.html]
//   (DEMO_ENTRY=path overrides the bundled entry, default demo/demo.js;
//    DEMO_LEXICON=… is the same as --lexicon; default data/lexicon-2000.json)
//   SUPPORTER_PUBKEY=path.js：テスト用に demo/supporter-pubkey.js を差し替える（scripts/qa-supporter.mjs）。
//   差し替えたビルドは dist/ と site/ には書けません（テスト鍵が公開用のページに入らないように）。
//   差し替えの一覧はテスト用の kid（240〜254）だけ、本番の一覧はテスト用の kid なし（validateKeyList）。
//   SUPPORTER_KEYS_SHA256=<指紋>：本番の公開鍵の一覧の指紋がこれと違えば失敗（オーナーから受け取った値と照合）。
//
// Inlines everything (bundled script, lexicon JSON, licence texts) so the page
// makes no network requests at all — it is published as a claude.ai Artifact,
// whose CSP blocks anything that isn't inline.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { splitMorae } from '../src/mora.js';
import { accentType } from '../src/accent.js';
import { validateKeyList, keysFingerprint } from '../demo/supporter.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
let lexiconOpt = process.env.DEMO_LEXICON ?? '2000';
const li = argv.indexOf('--lexicon');
if (li >= 0) lexiconOpt = argv.splice(li, 2)[1];
const lexiconPath = /^\d+$/.test(lexiconOpt) ? `${root}/data/lexicon-${lexiconOpt}.json` : resolve(lexiconOpt);
const templatePath = resolve(argv[0] ?? `${root}/demo/template.html`);
const outPath = resolve(argv[1] ?? `${root}/dist/pitch-demo.html`);
const entry = resolve(process.env.DEMO_ENTRY ?? `${root}/demo/demo.js`); // override for testing

const fail = (msg) => { console.error(`build-demo: ${msg}`); process.exit(1); };
const testPubkey = process.env.SUPPORTER_PUBKEY ? resolve(process.env.SUPPORTER_PUBKEY) : null;
if (testPubkey && [`${root}/dist/`, `${root}/site/`].some((d) => `${outPath}/`.startsWith(d) || outPath.startsWith(d))) {
  fail(`SUPPORTER_PUBKEY is set: refusing to write a test-key build into ${outPath} (use a scratch directory)`);
}
// 創設サポーターの公開鍵の一覧を確かめる（本番：テスト用の kid なし、テスト：テスト用の kid だけ）。
const keyModulePath = testPubkey ?? `${root}/demo/supporter-pubkey.js`;
const keyModule = await import(pathToFileURL(keyModulePath).href);
const keyErrs = validateKeyList({ keys: keyModule.SUPPORTER_KEYS, retired: keyModule.RETIRED_KIDS, revoked: keyModule.REVOKED_LIDS }, { test: !!testPubkey });
if (keyErrs.length) fail(`supporter key list ${keyModulePath}: ${keyErrs.join('; ')}`);
const keyFpr = await keysFingerprint(keyModule.SUPPORTER_KEYS);
if (!testPubkey && process.env.SUPPORTER_KEYS_SHA256 && process.env.SUPPORTER_KEYS_SHA256.toLowerCase() !== keyFpr) {
  fail(`supporter key list fingerprint ${keyFpr} ≠ SUPPORTER_KEYS_SHA256 ${process.env.SUPPORTER_KEYS_SHA256}`);
}
// 創設サポーターの公開鍵の差し替え（テスト用）。
const pubkeyPlugin = {
  name: 'supporter-pubkey',
  setup(b) { b.onResolve({ filter: /[\\/]supporter-pubkey\.js$/ }, () => ({ path: testPubkey })); },
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 1. Bundle demo.js and its imports into one classic IIFE script.
let js;
try {
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    write: false,
    legalComments: 'none', // full licence texts are inlined in the page instead
    alias: { 'fft.js': `${root}/vendor/fft.js`, pitchy: `${root}/vendor/pitchy.js` },
    plugins: testPubkey ? [pubkeyPlugin] : [],
    // テスト用ビルド（SUPPORTER_PUBKEY あり）に限り、SUPPORTER_FREE_LIMITS=1 で無料枠を適用した状態にできる
    define: { __PITCH_FREE_LIMITS__: testPubkey && process.env.SUPPORTER_FREE_LIMITS === '1' ? 'true' : 'undefined' },
    logLevel: 'warning',
  });
  js = res.outputFiles[0].text;
} catch (e) {
  fail(`esbuild failed for ${entry}: ${e.message}`);
}
if (/swiftf0|onnxruntime|ort\.wasm/i.test(js)) console.warn('build-demo: WARNING bundle seems to contain SwiftF0/ONNX code');
// A literal "</script" (or "<!--") inside the inline script would end it early.
js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// 2. Lexicon as inline JSON, in a compact form (decoded by demo/lexicon.js):
//    {"v":2, "count", "source", "words": [[idNum, surface, kana, accent, gloss], …]}
//    accent is a number when there is one accepted drop, else an array. morae and
//    type are not shipped: they are splitMorae(kana) and accentType(accent[0], n),
//    and the build checks that for every word.
//    Words held back for native review (data/needs-review-*.tsv, see needs_review()
//    in scripts/build_lexicon.py) are already left out of the lexicon files; the
//    same rule is re-applied here so a lexicon rebuilt with --include-unverified
//    can never reach the page.
const rawLex = JSON.parse(await readFile(lexiconPath, 'utf8').catch(() => fail(`lexicon not found: ${lexiconPath}`)));
const heldBack = new Set();
for (const f of ['data/needs-review-200.tsv', 'data/needs-review-2000.tsv']) {
  const tsv = await readFile(`${root}/${f}`, 'utf8').catch(() => '');
  for (const line of tsv.split('\n').slice(1)) {
    const [surface, reading] = line.split('\t');
    if (surface && reading) heldBack.add(`${surface}\t${reading}`);
  }
}
const needsReview = (w) => w.source === 'tdmelodic'
  || (w.source === 'unidic-rule' && ((w.rule ?? '').split(' + ')[0].includes('[P') || (w.rule ?? '').endsWith('つ[C3]')));
const excluded = [];
const compact = [];
for (const w of rawLex.words) {
  if (heldBack.has(`${w.surface}\t${w.kana}`) || needsReview(w)) { excluded.push(w.surface); continue; }
  const m = /^w(\d+)$/.exec(w.id);
  if (!m) fail(`unexpected word id ${w.id}`);
  if (JSON.stringify(splitMorae(w.kana)) !== JSON.stringify(w.morae)) fail(`${w.surface}: morae ≠ splitMorae(kana)`);
  if (accentType(w.accent[0], w.morae.length) !== w.type) fail(`${w.surface}: type ≠ accentType(accent)`);
  if (/[\t|]/.test(w.surface + w.kana + w.gloss)) fail(`${w.surface}: unexpected separator character`);
  compact.push([Number(m[1]), w.surface, w.kana, w.accent.length === 1 ? w.accent[0] : w.accent, w.gloss]);
}
const lexicon = JSON.stringify({ v: 2, count: compact.length, source: rawLex.source, words: compact });
const lexiconRawBytes = Buffer.byteLength(JSON.stringify(rawLex));
const lexiconTag = `<script type="application/json" id="lexicon-data">${lexicon.replace(/</g, '\\u003c')}</script>`;

// 3. Licence texts.
const licences = [
  ['pitchy 4.1.0 (MIT License)', 'vendor/pitchy.LICENSE'],
  ['fft.js 4.0.4 (MIT License)', 'vendor/fft.LICENSE'],
  ['@noble/ed25519 2.3.0 — supporter key verification fallback (MIT License)', 'vendor/noble-ed25519.LICENSE'],
  ['UniDic 2.1.2 — accent data (BSD License)', 'data/UNIDIC-BSD-LICENSE'],
  ['symphonia-codec-aac 0.5.4 — AAC tables in the m4a decoder (Mozilla Public License 2.0)', 'vendor/symphonia-aac-tables.LICENSE'],
];
let licenceHtml = '';
for (const [title, file] of licences) {
  const text = await readFile(`${root}/${file}`, 'utf8');
  licenceHtml += `<h3>${escapeHtml(title)}</h3>\n<pre tabindex="0">${escapeHtml(text.trimEnd())}</pre>\n`;
}

// 4. Build stamp.
let hash = '';
try { hash = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ }
const stamp = `${new Date().toISOString().slice(0, 10)}${hash ? ` · ${hash}` : ''}`;

// 5. Fill the template. Function replacements so "$&" etc. in content are literal.
let html = await readFile(templatePath, 'utf8').catch(() => fail(`template not found: ${templatePath}`));
const fills = {
  '<!--LEXICON-->': lexiconTag,
  '<!--LICENSES-->': licenceHtml,
  '<!--BUILD-->': escapeHtml(stamp),
  '<!--SCRIPT-->': `<script>${js}</script>`,
};
const missing = Object.keys(fills).filter((k) => !html.includes(k));
if (missing.length) fail(`placeholder(s) missing in ${templatePath}: ${missing.join(', ')}`);
// SCRIPT last, so placeholder-like text inside the bundle is never replaced.
for (const [k, v] of Object.entries(fills)) html = html.split(k).join(v);

// 6. No external resources: warn on anything that would hit the network.
const offenders = new Set();
const patterns = [
  /\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\/[^\s"'>]+/gi,
  /url\(\s*["']?\s*(?:https?:)?\/\/[^)\s"']+/gi,
  /@import\s+["']?(?:url\()?\s*["']?(?:https?:)?\/\/[^\s"')]+/gi,
  /\bfetch\s*\(/g,
  /\bimport\s*\(\s*["'`][^"'`]*/g,
  /\bnew\s+(?:WebSocket|EventSource|Worker|SharedWorker)\s*\(/g,
  /\bXMLHttpRequest\b/g,
  /\bsendBeacon\s*\(/g,
  /\bRTCPeerConnection\b/g,
  /\bimportScripts\s*\(/g,
];
// 秘密鍵の形（PEM・秘密の値の入った JWK）は公開物に入れない（Atlas REPORT §5-8）。
const SECRET_PATTERNS = [
  /-----BEGIN[A-Z0-9 ]*PRIVATE KEY-----/g,
  /PRIVATE KEY/g,
  /["']d["']\s*:\s*["'][A-Za-z0-9_-]{32,}={0,2}["']/g,
  /["']seed["']\s*:\s*["'][0-9a-fA-F]{64}["']/g,
];
const secrets = new Set();
for (const re of SECRET_PATTERNS) for (const m of html.matchAll(re)) secrets.add(m[0].slice(0, 60));
if (secrets.size) {
  console.error('build-demo: ERROR private-key-like text in output (never publish a private key):');
  for (const o of secrets) console.error(`  - ${o}`);
  process.exit(1);
}
for (const re of patterns) for (const m of html.matchAll(re)) offenders.add(m[0].slice(0, 120));
if (offenders.size) {
  // The page promises 「外部に送信されません」: fail the build instead of only warning.
  console.error('build-demo: ERROR possible external/network resources in output:');
  for (const o of offenders) console.error(`  - ${o}`);
  process.exit(1);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, html);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build-demo: wrote ${outPath} — ${kb(Buffer.byteLength(html))} (script ${kb(Buffer.byteLength(js))}, lexicon ${kb(Buffer.byteLength(lexicon))} from ${kb(lexiconRawBytes)} minified source) [${stamp}]`);
if (testPubkey) console.log(`build-demo: TEST supporter public key from ${testPubkey} (not for publishing)`);
console.log(`build-demo: supporter keys ${keyModule.SUPPORTER_KEYS.length ? keyModule.SUPPORTER_KEYS.map((k) => k.kid).join(',') : 'none (unconfigured: keys unlock nothing)'} — sha256 ${keyFpr}${testPubkey ? ' [TEST]' : ''}`);
console.log(`build-demo: lexicon ${lexiconPath.replace(`${root}/`, '')} — ${compact.length} words in the page${excluded.length ? `, ${excluded.length} held back for review: ${excluded.join(' ')}` : ', none held back (review hold-back already applied at lexicon build)'}`);

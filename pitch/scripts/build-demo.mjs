// Build the single-file demo page: dist/pitch-demo.html.
//
//   node scripts/build-demo.mjs [template.html] [out.html]
//   (DEMO_ENTRY=path overrides the bundled entry, default demo/demo.js)
//
// Inlines everything (bundled script, lexicon JSON, licence texts) so the page
// makes no network requests at all — it is published as a claude.ai Artifact,
// whose CSP blocks anything that isn't inline.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = resolve(process.argv[2] ?? `${root}/demo/template.html`);
const outPath = resolve(process.argv[3] ?? `${root}/dist/pitch-demo.html`);
const entry = resolve(process.env.DEMO_ENTRY ?? `${root}/demo/demo.js`); // override for testing

const fail = (msg) => { console.error(`build-demo: ${msg}`); process.exit(1); };

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
    logLevel: 'warning',
  });
  js = res.outputFiles[0].text;
} catch (e) {
  fail(`esbuild failed for ${entry}: ${e.message}`);
}
if (/swiftf0|onnxruntime|ort\.wasm/i.test(js)) console.warn('build-demo: WARNING bundle seems to contain SwiftF0/ONNX code');
// A literal "</script" (or "<!--") inside the inline script would end it early.
js = js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

// 2. Lexicon as inline JSON.
const lexicon = JSON.stringify(JSON.parse(await readFile(`${root}/data/lexicon-200.json`, 'utf8')));
const lexiconTag = `<script type="application/json" id="lexicon-data">${lexicon.replace(/</g, '\\u003c')}</script>`;

// 3. Licence texts.
const licences = [
  ['pitchy 4.1.0 (MIT License)', 'vendor/pitchy.LICENSE'],
  ['fft.js 4.0.4 (MIT License)', 'vendor/fft.LICENSE'],
  ['UniDic 2.1.2 — accent data (BSD License)', 'data/UNIDIC-BSD-LICENSE'],
];
let licenceHtml = '';
for (const [title, file] of licences) {
  const text = await readFile(`${root}/${file}`, 'utf8');
  licenceHtml += `<h3>${escapeHtml(title)}</h3>\n<pre>${escapeHtml(text.trimEnd())}</pre>\n`;
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
];
for (const re of patterns) for (const m of html.matchAll(re)) offenders.add(m[0].slice(0, 120));
if (offenders.size) {
  console.warn('build-demo: WARNING possible external/network resources in output:');
  for (const o of offenders) console.warn(`  - ${o}`);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, html);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build-demo: wrote ${outPath} — ${kb(Buffer.byteLength(html))} (script ${kb(Buffer.byteLength(js))}, lexicon ${kb(Buffer.byteLength(lexicon))}) [${stamp}]`);

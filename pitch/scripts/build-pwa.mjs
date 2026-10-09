// Build the installable, offline-capable PWA: site/app/.
//
//   node scripts/build-pwa.mjs [--lexicon 2000|200|path.json] [outDir]   (default outDir: site/app)
//
// Reuses scripts/build-demo.mjs unchanged: it builds the same inline page content as the
// claude.ai Artifact (dist/pitch-demo.html), written to a temporary file; this script
// wraps it in a full document (head metas, manifest, icons), adds the 「ホーム画面に追加」
// hint and the service-worker registration, and writes
//
//   index.html, manifest.webmanifest, sw.js, icons/*.png
//
// All URLs are relative, so the folder works under any sub-path on any static host.
// The Artifact build stays SW-free: nothing here touches demo/ or dist/.
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, renderIcon } from './pwa-icons.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const lexArgs = [];
const li = argv.indexOf('--lexicon');
if (li >= 0) lexArgs.push(...argv.splice(li, 2));
const outDir = resolve(argv[0] ?? `${root}/site/app`);
const fail = (msg) => { console.error(`build-pwa: ${msg}`); process.exit(1); };
// テスト用の公開鍵（SUPPORTER_PUBKEY）で site/ に書かない。
if (process.env.SUPPORTER_PUBKEY && `${outDir}/`.startsWith(`${root}/site/`)) fail(`SUPPORTER_PUBKEY is set: refusing to write a test-key build into ${outDir}`);

// Page tokens (demo/template.html :root) used outside the page.
const LIGHT_BG = '#f3f6f8';
const DARK_BG = '#0e141a';
const ACCENT = '#1c5a86';

// 1. Same page content as the Artifact build.
const tmp = await mkdtemp(join(tmpdir(), 'pitch-pwa-'));
let fragment;
try {
  const out = join(tmp, 'page.html');
  execFileSync(process.execPath, [join(root, 'scripts/build-demo.mjs'), ...lexArgs, join(root, 'demo/template.html'), out], { stdio: 'inherit' });
  fragment = await readFile(out, 'utf8');
} catch (e) {
  fail(`build-demo failed: ${e.message}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}

// 2. Split off <title> and the page <style> for the head; the rest is the body.
const take = (re, what) => {
  const m = re.exec(fragment);
  if (!m) fail(`${what} not found in build-demo output`);
  fragment = fragment.slice(0, m.index) + fragment.slice(m.index + m[0].length);
  return m[0];
};
const title = take(/<title>[\s\S]*?<\/title>\s*/, '<title>').trim();
const pageStyle = take(/<style>[\s\S]*?<\/style>\s*/, 'page <style>').trim();

// 3. PWA-only additions.
const pwaStyle = `<style>
/* PWA shell: full-bleed background, content clear of notches in standalone mode. */
html { background: var(--bg); }
body { margin: 0; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); min-height: 100vh; min-height: 100dvh; }
.install { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; font-size: .85rem; color: var(--muted); padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.install[hidden], .install [hidden] { display: none; }
.install p { flex: 1 1 14rem; }
.install button { min-height: 36px; padding: 4px 12px; font-size: .85rem; }
#install-btn { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
#install-close { min-width: 36px; padding: 4px 8px; background: transparent; border-color: transparent; color: var(--muted); }
.install .share { display: inline-block; width: 1em; height: 1em; vertical-align: -.15em; }
</style>`;

const installHint = `<div class="install" id="install-hint" hidden>
      <p id="install-text">ホーム画面に追加すると、アプリのように開けてオフラインでも使えます。</p>
      <p id="install-ios" hidden>オフラインでも使えるアプリにするには: 共有 <svg class="share" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v9M5 4l3-3 3 3M3.5 7H3v8h10V7h-.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> →「ホーム画面に追加」</p>
      <button type="button" id="install-btn" hidden>ホーム画面に追加</button>
      <button type="button" id="install-close" aria-label="閉じる">×</button>
    </div>`;

// Install hint + SW registration. Plain ES2017, no network access besides ./sw.js.
const pwaScript = `<script>
(function () {
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var hint = document.getElementById('install-hint');
  var KEY = 'pitch-install-hint-dismissed';
  var dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (hint && !standalone && !dismissed) {
    var btn = document.getElementById('install-btn');
    var text = document.getElementById('install-text');
    var ios = document.getElementById('install-ios');
    var deferred = null;
    var hide = function () { hint.hidden = true; };
    document.getElementById('install-close').addEventListener('click', function () {
      hide();
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
    });
    // Android / desktop Chrome, Edge: keep the prompt for our own button.
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
      hint.hidden = false;
    });
    btn.addEventListener('click', function () {
      if (!deferred) return;
      var e = deferred;
      deferred = null;
      hide();
      e.prompt();
      if (e.userChoice) e.userChoice.catch(function () {});
    });
    window.addEventListener('appinstalled', hide);
    // iOS / iPadOS: no install prompt; show the Share-sheet instruction instead.
    var ua = navigator.userAgent;
    var isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) { text.hidden = true; ios.hidden = false; hint.hidden = false; }
  }
  // Offline support: only on http(s) in a secure context (https or localhost).
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (err) {
        console.warn('Pitch: service worker registration failed', err);
      });
    });
  }
})();
</script>`;

const head = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<!--PITCH-CSP-->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${title}
<meta name="description" content="日本語の高低アクセント（下がり目）を、録音ファイルからブラウザ内で判定します。">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="${LIGHT_BG}">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${DARK_BG}">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Pitch">
${pageStyle}
${pwaStyle}
</head>
<body>
`;

if (!/<\/header>/.test(fragment)) fail('</header> not found — cannot place the install hint');
const body = fragment.replace(/(\n?\s*)<\/header>/, (m, ws) => `\n    ${installHint}${ws}</header>`).trim();
let html = `${head}${body}\n${pwaScript}\n</body>\n</html>\n`;

// Content-Security-Policy (GitHub Pages cannot send headers, so a <meta>): only this build's
// two inline scripts may run, and the page may not connect anywhere — recordings and the
// evaluation data stay in the browser even if injected markup or a vendored library misbehaves.
const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
if (scriptHashes.length !== 2) fail(`expected 2 inline scripts (app + PWA), found ${scriptHashes.length}`);
const csp = [
  "default-src 'none'", `script-src ${scriptHashes.join(' ')}`, "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:", "media-src 'self' data: blob:", "connect-src 'none'",
  "manifest-src 'self'", "worker-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
html = html.replace('<!--PITCH-CSP-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`);

// 4. Manifest and icons.
const manifest = {
  name: 'Pitch — Japanese pitch accent',
  short_name: 'Pitch',
  description: '日本語の高低アクセント（下がり目）を録音ファイルから判定 — Japanese pitch-accent checker',
  id: './',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  lang: 'ja',
  dir: 'ltr',
  background_color: LIGHT_BG,
  theme_color: LIGHT_BG,
  categories: ['education'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

await mkdir(join(outDir, 'icons'), { recursive: true });
const files = new Map([['index.html', html], ['manifest.webmanifest', manifestText]]);
for (const [name, size, maskable] of ICONS) files.set(`icons/${name}`, renderIcon(size, { maskable }));

// 5. Service worker; cache version = hash of everything it precaches plus the worker itself.
const precache = ['index.html', ...[...files.keys()].filter((f) => f !== 'index.html')];
// Expected SHA-256 of every precached file: the worker only stores (and only serves the page
// from) bytes that match this build, so a stale CDN copy, a half-finished deploy or a cache
// entry rewritten by another page on the shared origin is never served as the app.
const digests = precache.map((f) => createHash('sha256').update(files.get(f)).digest('hex'));
const sw = `// Pitch PWA service worker — generated by scripts/build-pwa.mjs, do not edit.
// Precaches the app shell (one self-contained page + manifest + icons) and serves it
// cache-first. Only same-origin GETs for those files and navigations within the app folder
// are handled; everything else (cross-origin, other paths) goes straight to the network and is
// never cached. Audio never passes through here: files are decoded in the page.
const VERSION = '__VERSION__';
const SCOPE = self.registration.scope;
const PREFIX = 'pitch-app:' + SCOPE + ':';
const CACHE = PREFIX + VERSION;
const PRECACHE = ${JSON.stringify(precache)}.map((p) => new URL(p, SCOPE).href);
const INDEX = PRECACHE[0];
const SHA256 = ${JSON.stringify(digests)};

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const matches = async (res, i) => !!res && hex(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer())) === SHA256[i];
// The cached page, only if it is byte-identical to this build's index.html.
const cachedIndex = async (cache) => { const hit = await cache.match(INDEX); return (await matches(hit, 0)) ? hit : null; };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(PRECACHE.map(async (url, i) => {
        // ?v= misses any CDN copy of an older deploy; stored under the plain URL.
        const res = await fetch(url + '?v=' + VERSION, { cache: 'reload' });
        if (!res.ok || res.redirected || !(await matches(res, i))) throw new Error('precache: unexpected response for ' + url);
        await cache.put(url, res);
      }));
    } catch (err) {
      await caches.delete(CACHE); // no half-filled cache left behind; the old version stays active
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  const path = url.origin + url.pathname;

  // Navigations to the app folder itself (./, ./index.html, ./?…, ./other.html): the app
  // shell is served for these, cache-first for the app URL, network-then-cache for the
  // rest. Deeper paths are left alone — the page's relative URLs would not resolve there.
  if (req.mode === 'navigate') {
    if (url.pathname.slice(new URL(SCOPE).pathname.length).includes('/')) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      if (path === SCOPE || path === INDEX) {
        const hit = await cachedIndex(cache);
        if (hit) return hit;
      }
      try {
        return await fetch(req);
      } catch (err) {
        const hit = await cachedIndex(cache);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (!PRECACHE.includes(path)) return;
  event.respondWith(
    caches.open(CACHE)
      .then((cache) => cache.match(path))
      .then((hit) => hit || fetch(req)),
  );
});
`;
const hasher = createHash('sha256');
for (const [name, data] of [...files, ['sw.js', sw]]) hasher.update(name).update('\0').update(data).update('\0');
const version = hasher.digest('hex').slice(0, 12);
files.set('sw.js', sw.replace('__VERSION__', version));

// 秘密鍵の形は公開物に入れない（build-demo と同じ検査を、PWA の全ファイルにも）。
for (const [name, data] of files) {
  if (typeof data === 'string' && (/PRIVATE KEY/.test(data) || /["']d["']\s*:\s*["'][A-Za-z0-9_-]{32,}={0,2}["']/.test(data))) fail(`private-key-like text in ${name}; refusing to publish`);
}
for (const [name, data] of files) await writeFile(join(outDir, name), data);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build-pwa: wrote ${outDir} — cache version ${version}`);
for (const [name, data] of files) console.log(`  ${name.padEnd(28)} ${kb(Buffer.byteLength(data))}`);

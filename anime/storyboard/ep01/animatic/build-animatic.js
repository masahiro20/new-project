#!/usr/bin/env node
/*
 * LEDGERBREAKER 第1話 絵コンテ → アニマティック動画（社外秘・公開しない）
 *
 *   node anime/storyboard/ep01/animatic/build-animatic.js [full|drawn|all]
 *
 * 1) ../data.js（統合カット表）を読む
 * 2) Playwright（Chromium）で「1フレーム・1状態につき1枚」の静止画を描く
 *      art-*.png      作画フレーム（SVG）  … カメラ移動があるものは 2 倍解像度
 *      ov-*.png       カット番号＋字幕（透過）
 *      card-*.png     文字コンテのカード、タイトル、セクション
 * 3) ffmpeg でセグメントごとに尺を付け（静止は -loop 1、PAN/T.U./T.B. は zoompan）、
 *    右上のタイムコードは drawtext で描く
 * 4) concat demuxer でつなぎ、+faststart で書き出す
 *
 * 中間ファイル：SCRATCH（下記）。環境変数 ANIMATIC_SCRATCH で変更可。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const HERE = __dirname;
const EP = path.resolve(HERE, '..');
const SCRATCH = process.env.ANIMATIC_SCRATCH ||
  '/tmp/claude-0/-home-user-new-project/619c54eb-da82-5799-8bb7-0ffabf842705/scratchpad/animatic';
const FPS = 24, W = 1920, H = 1080;
// Base is crf 23; raised so each file stays under 15MB (the moving line art and the text cards are what cost bytes).
// Measured: drawn 23 → 17.0MB, 28 → 11.5MB; full 28 → 17.9MB. Override with ANIMATIC_CRF.
const CRF_DEFAULT = { full: '31', drawn: '28' };
const crfFor = name => process.env.ANIMATIC_CRF || CRF_DEFAULT[name];
const MODE = process.argv[2] || 'all';

const STILL = path.join(SCRATCH, 'stills');
const SEG = path.join(SCRATCH, 'seg');
const FONTS = path.join(SCRATCH, 'fonts');
for (const d of [SCRATCH, STILL, SEG, FONTS]) fs.mkdirSync(d, { recursive: true });

// ---------- data ----------
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(EP, 'data.js'), 'utf8'), sandbox);
const D = sandbox.window.EP01;
if (!D || !D.cuts || D.cuts.length === 0) throw new Error('data.js が読めません');

const tc = s => { s = Math.max(0, Math.floor(s + 1e-6)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fr = t => Math.round(t * FPS);            // episode time → frame index (cumulative rounding, no drift)
const pad = (n, k = 3) => String(n).padStart(k, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- fonts (Google Fonts TTF, cached) ----------
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700';
function ensureFonts() {
  const manifest = path.join(FONTS, 'fonts.json');
  if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const css = execFileSync('curl', ['-sSf', FONT_CSS], { encoding: 'utf8' }); // curl's UA gets .ttf
  const faces = [];
  for (const m of css.matchAll(/font-family:\s*'([^']+)';[\s\S]*?font-weight:\s*(\d+);[\s\S]*?url\(([^)]+\.ttf)\)/g)) {
    const [, family, weight, url] = m;
    const file = path.join(FONTS, family.replace(/\s+/g, '') + '-' + weight + '.ttf');
    if (!fs.existsSync(file)) execFileSync('curl', ['-sSf', '-o', file, url]);
    faces.push({ family, weight, file });
  }
  if (faces.length < 6) throw new Error('フォントの取得に失敗しました');
  fs.writeFileSync(manifest, JSON.stringify(faces, null, 1));
  return faces;
}

// ---------- camera moves ----------
// Ken Burns only where the camera note says PAN, T.U. or T.B.
function parseCamera(cam) {
  const toks = [];
  const re = /FIX|PAN\s*(UP|DOWN|R\b|L\b|→|←|FOLLOW)?([^→／/]*)|T\.U\.|T\.B\./g;
  let m;
  while ((m = re.exec(cam))) {
    const t = m[0];
    if (t === 'FIX') toks.push(null);
    else if (t === 'T.U.') toks.push({ kind: 'tu' });
    else if (t === 'T.B.') toks.push({ kind: 'tb' });
    else {
      const d = m[1] || '';
      let dx = 0, dy = 0;
      if (d === 'UP') dy = -1; else if (d === 'DOWN') dy = 1;
      else if (d === 'L' || d === '←') dx = -1; else dx = 1;   // R, →, FOLLOW, bare PAN
      if (/右上/.test(m[2] || '')) dy = -1;
      toks.push({ kind: 'pan', dx, dy });
    }
  }
  return toks;
}
function movesForCut(c) {
  const toks = parseCamera(c.camera || '');
  const moves = toks.filter(Boolean);
  const n = c.frames.length;
  if (!moves.length) return Array(n).fill(null);
  if (n === 1) return [moves[0]];
  if (toks.length === n) return toks;              // e.g. FIX→T.B. over a/b, PAN DOWN→T.U. over a/b
  return Array(n).fill(moves[0]);                  // one move spanning all frames
}
function zoompanExpr(mv, N) {
  const p = N > 1 ? `(on/${N - 1})` : '1';
  const e = `((1-cos(PI*${p}))/2)`;                // ease in-out
  const Z = 1.10;
  const cx = 'iw/2-iw/zoom/2', cy = 'ih/2-ih/zoom/2';
  if (mv.kind === 'tu') return { z: `1+${Z - 1}*${e}`, x: cx, y: cy };
  if (mv.kind === 'tb') return { z: `${Z}-${Z - 1}*${e}`, x: cx, y: cy };
  const ax = mv.dx ? `(iw-iw/zoom)*(0.5+${mv.dx}*(${e}-0.5))` : cx;
  const ay = mv.dy ? `(ih-ih/zoom)*(0.5+${mv.dy}*(${e}-0.5))` : cy;
  return { z: String(Z), x: ax, y: ay };
}

// ---------- page ----------
function pageHtml(faces) {
  const ff = faces.map(f => `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url('file://${f.file}') format('truetype');}`).join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
${ff}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
#root{position:relative;width:${W}px;height:${H}px}
.art{position:absolute;inset:0;background:#fff}
.art svg{width:100%;height:100%;display:block}
.card{position:absolute;inset:0;background:#0D0E12;color:#ECE8DE;font-family:'Zen Kaku Gothic New',sans-serif;
  display:grid;align-content:center;gap:22px;padding:120px 190px 250px}
.card .k{font-family:'IBM Plex Mono',monospace;font-size:24px;letter-spacing:.14em;color:#9C988E}
.card .k b{color:#ECE8DE;font-weight:600}
.card .cam{font-family:'IBM Plex Mono','Zen Kaku Gothic New',monospace;font-size:30px;color:#6E9CF0;font-weight:600;line-height:1.5}
.card .pic{font-size:40px;line-height:1.65;font-weight:500;text-wrap:pretty}
.card .act{font-size:27px;line-height:1.6;color:#A9A59B;text-wrap:pretty}
.card .scene{font-size:24px;color:#9C988E}
.hud{position:absolute;top:26px;left:30px;font-family:'IBM Plex Mono',monospace;font-size:26px;font-weight:600;color:#fff;
  background:rgba(8,9,12,.72);padding:3px 14px;letter-spacing:.04em}
.hud small{font-weight:400;color:#C9C5BB;font-size:20px;margin-left:10px}
.sub{position:absolute;left:0;right:0;bottom:22px;display:flex;flex-direction:column;align-items:center;gap:3px;padding:0 12%;text-align:center}
.sub span{background:rgba(8,9,12,.74);color:#fff;font-family:'Zen Kaku Gothic New',sans-serif;font-weight:500;
  font-size:31px;line-height:1.34;padding:1px 14px;max-width:100%;text-wrap:balance;text-shadow:0 0 3px #000}
.sub span.en{font-weight:400;font-size:22px;color:#E6E2D8;line-height:1.36;padding:1px 12px}
.sub span.en.first{margin-top:5px}
.title{position:absolute;inset:0;background:#0D0E12;color:#ECE8DE;display:grid;align-content:center;justify-items:center;gap:28px;text-align:center;
  font-family:'Zen Kaku Gothic New',sans-serif;background-image:repeating-linear-gradient(180deg,transparent 0 71px,rgba(236,232,222,.06) 71px 72px)}
.title .eyebrow{font-family:'IBM Plex Mono',monospace;font-size:24px;letter-spacing:.24em;color:#9C988E}
.title .logo{font-family:'Dela Gothic One',sans-serif;font-size:132px;letter-spacing:.04em;line-height:1}
.title .ep{font-family:'Dela Gothic One',sans-serif;font-size:66px;line-height:1.2}
.title .ep .red{color:#F0344A}
.title .what{font-size:40px;font-weight:500}
.title .rule{width:220px;height:6px;background:#E5172F}
.title .note{font-size:24px;color:#9C988E;font-family:'IBM Plex Mono','Zen Kaku Gothic New',monospace;letter-spacing:.06em}
.title .sec{font-family:'Dela Gothic One',sans-serif;font-size:96px;line-height:1.15}
</style><div id="root"></div>`;
}

function overlayHtml(c) {
  // one tight box per speaker line (split on ／ and newlines) so the boxes cover as little art as possible
  const split = (t, re) => String(t || '').split(re).map(x => x.trim()).filter(Boolean);
  const ja = split(c.dialogue, /\s*[／\n]\s*/);
  const en = split(c.dialogue_en, /\s+\/\s+|\n/);
  const lines = [
    ...ja.map(t => `<span>${esc(t)}</span>`),
    ...en.map((t, i) => `<span class="en${i === 0 && ja.length ? ' first' : ''}">${esc(t)}</span>`),
  ];
  return `<div class="hud">C${c.no}<small>${c.seq.toUpperCase()}-${c.local}</small></div>` +
    (lines.length ? `<div class="sub">${lines.join('')}</div>` : '');
}
function cardHtml(c) {
  const cam = [c.shot, c.camera].filter(Boolean).join(' ／ ');
  return `<div class="card">
    <div class="k"><b>CUT ${c.no}</b> · ${tc(c.start)} · ${c.sec}″ · 文字コンテ</div>
    <div class="scene">${esc(c.scene || '')}</div>
    ${cam ? `<div class="cam">${esc(cam)}</div>` : ''}
    <div class="pic">${esc(c.picture || '')}</div>
    ${c.action ? `<div class="act">${esc(c.action)}</div>` : ''}
  </div>`;
}
const TITLE_HTML = `<div class="title">
  <div class="eyebrow">P7 ANIME · 社外秘 · INTERNAL PITCH MATERIAL</div>
  <div class="logo">LEDGERBREAKER</div>
  <div class="ep">第1話<span class="red">『払わねえよ。』</span></div>
  <div class="rule"></div>
  <div class="what">絵コンテ（アニマティック）</div>
  <div class="note">作画カットのみ · 実尺 · 音声なし（台詞は字幕）</div>
</div>`;
function sectionHtml(sec) {
  return `<div class="title">
    <div class="eyebrow">LEDGERBREAKER · EP01 · STORYBOARD</div>
    <div class="sec">${esc(sec.title)}</div>
    <div class="rule"></div>
    <div class="note">${esc(sec.sub)}</div>
  </div>`;
}

// ---------- plan ----------
const drawnSections = [
  { keys: ['s1', 's2'], title: 'アバン', sub: '' },
  { keys: ['s3'], title: 'Bパート　覚醒', sub: '' },
  { keys: ['s4'], title: 'タグ・次回予告', sub: '' },
];
for (const s of drawnSections) {
  const q = D.seqs.filter(x => s.keys.includes(x.key));
  const a = q[0], b = q[q.length - 1];
  s.sub = `${tc(a.start)}–${tc(b.end)} · C${a.first}–C${b.last} · ${q.map(x => x.label.replace(/\s+/g, ' ')).join(' / ')}`;
}

// segment: { id, still, overlay|null, frames, move|null, tcOff|null }
function cutSegments(c) {
  const segs = [];
  const f0 = fr(c.start), f1 = fr(c.start + c.sec);
  if (c.frames.length) {
    const moves = movesForCut(c);
    const n = c.frames.length;
    for (let i = 0; i < n; i++) {
      const a = fr(c.start + c.sec * i / n), b = i === n - 1 ? f1 : fr(c.start + c.sec * (i + 1) / n);
      const mv = moves[i];
      const base = c.frames[i].replace(/\.svg$/, '');
      segs.push({ id: `c${pad(c.no)}-${i}`, still: mv ? `art2x-${base}.png` : `art-${base}.png`, overlay: `ov-${pad(c.no)}.png`,
        frames: b - a, move: mv, tcOff: a / FPS });
    }
  } else {
    segs.push({ id: `c${pad(c.no)}`, still: `card-${pad(c.no)}.png`, overlay: `ov-${pad(c.no)}.png`, frames: f1 - f0, move: null, tcOff: f0 / FPS });
  }
  return segs;
}
const plans = {
  full: D.cuts.flatMap(cutSegments),
  drawn: [
    { id: 'title', still: 'title.png', overlay: null, frames: 6 * FPS, move: null, tcOff: null },
    ...drawnSections.flatMap((s, i) => [
      { id: `section${i + 1}`, still: `section-${i + 1}.png`, overlay: null, frames: 3 * FPS, move: null, tcOff: null },
      ...D.cuts.filter(c => c.frames.length && s.keys.includes(c.seq)).flatMap(cutSegments),
    ]),
  ],
};

// ---------- stills ----------
async function renderStills(faces, needed) {
  const htmlFile = path.join(SCRATCH, 'page.html');
  fs.writeFileSync(htmlFile, pageHtml(faces));
  const browser = await chromium.launch();
  const out = { n: 0 };
  async function withPage(scale, fn) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.goto('file://' + htmlFile);
    await page.evaluate(async fams => { await Promise.all(fams.map(f => document.fonts.load(f))); await document.fonts.ready; },
      ['400 20px "Zen Kaku Gothic New"', '500 20px "Zen Kaku Gothic New"', '700 20px "Zen Kaku Gothic New"', '20px "Dela Gothic One"', '400 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"']);
    await fn(page);
    await ctx.close();
  }
  async function shot(page, name, html, transparent) {
    const file = path.join(STILL, name);
    if (fs.existsSync(file) && !process.env.ANIMATIC_FORCE) return;
    await page.evaluate(h => { document.getElementById('root').innerHTML = h; return document.fonts.ready; }, html);
    await page.screenshot({ path: file, omitBackground: !!transparent });
    out.n++;
  }
  const svg = f => fs.readFileSync(path.join(EP, 'frames', f), 'utf8').replace(/<\?xml[^>]*>/, '');
  await withPage(1, async page => {
    for (const name of needed) {
      let m;
      if ((m = name.match(/^art-(.+)\.png$/))) await shot(page, name, `<div class="art">${svg(m[1] + '.svg')}</div>`);
      else if ((m = name.match(/^ov-(\d+)\.png$/))) await shot(page, name, overlayHtml(D.cuts[+m[1] - 1]), true);
      else if ((m = name.match(/^card-(\d+)\.png$/))) await shot(page, name, cardHtml(D.cuts[+m[1] - 1]));
      else if (name === 'title.png') await shot(page, name, TITLE_HTML);
      else if ((m = name.match(/^section-(\d)\.png$/))) await shot(page, name, sectionHtml(drawnSections[+m[1] - 1]));
    }
  });
  await withPage(2, async page => {   // 3840×2160 source for smooth zoompan
    for (const name of needed) {
      const m = name.match(/^art2x-(.+)\.png$/);
      if (m) await shot(page, name, `<div class="art">${svg(m[1] + '.svg')}</div>`);
    }
  });
  await browser.close();
  return out.n;
}

// ---------- ffmpeg ----------
const MONO = () => path.join(FONTS, 'IBMPlexMono-600.ttf');
function segArgs(s, outFile, crf) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const N = s.frames;
  if (s.move) args.push('-i', path.join(STILL, s.still));
  else args.push('-framerate', String(FPS), '-loop', '1', '-i', path.join(STILL, s.still));
  if (s.overlay) args.push('-framerate', String(FPS), '-loop', '1', '-i', path.join(STILL, s.overlay));
  const f = [];
  if (s.move) {
    const z = zoompanExpr(s.move, N);
    f.push(`[0:v]zoompan=z='${z.z}':x='${z.x}':y='${z.y}':d=${N}:s=${W}x${H}:fps=${FPS},setsar=1[a]`);
  } else f.push(`[0:v]scale=${W}:${H},setsar=1,fps=${FPS}[a]`);
  let last = 'a';
  if (s.overlay) { f.push(`[a][1:v]overlay=0:0:shortest=1[b]`); last = 'b'; }
  if (s.tcOff != null) {
    const o = s.tcOff.toFixed(4);
    const text = `%{eif\\:trunc((t+${o})/60)\\:d\\:2}\\:%{eif\\:mod(trunc(t+${o}+0.0001)\\,60)\\:d\\:2}`;
    f.push(`[${last}]drawtext=fontfile='${MONO()}':text='${text}':fontsize=26:fontcolor=0xFF6B7D:box=1:boxcolor=0x08090C@0.72:boxborderw=8|14:x=w-tw-44:y=34[c]`);
    last = 'c';
  }
  f.push(`[${last}]format=yuv420p[v]`);
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-frames:v', String(N), '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', crf, '-pix_fmt', 'yuv420p', '-g', '480', '-r', String(FPS),
    '-video_track_timescale', '12288', outFile);
  return args;
}
function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('close', code => code === 0 ? res() : rej(new Error(`${cmd} failed (${code}): ${err.slice(-2000)}`)));
  });
}
async function pool(items, k, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}
async function buildVideo(name, segs) {
  const dir = path.join(SEG, name);
  fs.mkdirSync(dir, { recursive: true });
  const jobs = segs.map(s => ({ s, file: path.join(dir, s.id + '.mp4') }));
  let done = 0;
  await pool(jobs, Math.max(2, os.cpus().length), async j => {
    await run('ffmpeg', segArgs(j.s, j.file, crfFor(name)));
    if (++done % 25 === 0) process.stdout.write(`  ${name}: ${done}/${jobs.length}\n`);
  });
  const list = path.join(dir, 'concat.txt');
  fs.writeFileSync(list, jobs.map(j => `file '${j.file}'`).join('\n') + '\n');
  const outFile = path.join(HERE, `ep01-animatic-${name}.mp4`);
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c', 'copy', '-an', '-movflags', '+faststart', outFile]);
  const frames = segs.reduce((a, s) => a + s.frames, 0);
  const mb = fs.statSync(outFile).size / 1e6;
  console.log(`${path.basename(outFile)}: ${segs.length} segments, ${frames} frames (${(frames / FPS).toFixed(2)}s), crf ${crfFor(name)}, ${mb.toFixed(2)} MB`);
  if (mb >= 15) console.warn(`  !! 15MB を超えています。ANIMATIC_CRF を上げて再実行してください（現在 ${crfFor(name)}）`);
}

(async () => {
  const t0 = Date.now();
  const faces = ensureFonts();
  const which = MODE === 'all' ? ['full', 'drawn'] : [MODE];
  if (!which.every(w => plans[w])) throw new Error('usage: build-animatic.js [full|drawn|all]');
  const needed = [...new Set(which.flatMap(w => plans[w].flatMap(s => [s.still, s.overlay].filter(Boolean))))];
  const n = await renderStills(faces, needed);
  console.log(`stills: ${needed.length} needed, ${n} rendered → ${STILL}`);
  for (const w of which) await buildVideo(w, plans[w]);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
})().catch(e => { console.error(e); process.exit(1); });

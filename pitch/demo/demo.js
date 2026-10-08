// P3 Pitch — single-file demo page (no microphone: the user picks a voice-memo file).
// Pipeline per analysis: decode → pickUtterance → normalize → extractF0 (pitchy) → judge.
// Everything runs in the page; nothing is fetched or sent anywhere.

import { PitchDetector } from '../vendor/pitchy.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { pitchPattern, accentType, TYPE_NAMES } from '../src/accent.js';
import { synthesizeWord } from '../src/synth.js';
import { decodeAudioFile, pickUtterance } from './decode.js';

const $ = (id) => document.getElementById(id);
const SR = 16000;
const DEFAULT_SURFACE = '橋';

// ---------- lexicon ----------
const lex = JSON.parse($('lexicon-data').textContent);
const words = lex.words;
const byKana = new Map();
for (const w of words) {
  if (!byKana.has(w.kana)) byKana.set(w.kana, []);
  byKana.get(w.kana).push(w);
}

let current = words.find((w) => w.surface === DEFAULT_SURFACE) ?? words[0];
let lastAudio = null; // { samples, rate }
let audioCtx = null;
let runId = 0;

// ---------- text helpers ----------
const n = (w) => w.morae.length;
const typeJa = (k, w) => TYPE_NAMES[accentType(k, n(w))].ja;

/** Where the pitch drops, in plain Japanese. */
function dropJa(k, w) {
  if (k === 0) return '下がり目なし（「が」まで高い）';
  if (k >= n(w)) return `「${w.kana}」の後、「が」で下がる`;
  return `「${w.morae[k - 1]}」の後で下がる`;
}
const typeWithDrop = (k, w) => `${typeJa(k, w)}［${k}］${dropJa(k, w)}`;

function reasonText(r, w) {
  const want = r.expectedK[0];
  const you = `（あなた: ${dropJa(r.detectedK, w)}／辞書: ${dropJa(want, w)}）`;
  switch (r.verdict) {
    case 'match': return '下がり目の位置が辞書と一致しました。';
    case 'missing-drop':
      return want >= n(w)
        ? `下がり目がありませんでした（辞書では「${w.kana}」の後、「が」で下がります）。`
        : `下がり目がありませんでした（辞書では「${w.morae[want - 1]}」の後で下がります）。`;
    case 'unexpected-drop': return `下がってしまいました（この語は「が」まで高く続きます）。${you}`;
    case 'drop-too-early': return `下がるのが早すぎます。${you}`;
    case 'drop-too-late': return `下がるのが遅すぎます。${you}`;
    default: return '';
  }
}

const ERROR_TEXT = {
  'no-voice': '声が検出できませんでした。静かな場所で、スマホを口から15〜20 cm 離し、ささやかずにはっきり録音し直してください。',
  'too-short': `録音が短すぎます。単語だけでなく「が」まで続けて、自然な速さで言ってください。`,
};

// ---------- word picker ----------
function matches(w, q, t) {
  if (t && w.type !== t) return false;
  if (!q) return true;
  return w.surface.includes(q) || w.kana.includes(q) || w.gloss.toLowerCase().includes(q.toLowerCase());
}

function renderSelect() {
  const q = $('word-search').value.trim();
  const t = $('type-filter').value;
  const list = words.filter((w) => matches(w, q, t));
  const sel = $('word-select');
  sel.textContent = '';
  for (const w of list) {
    const o = document.createElement('option');
    o.value = w.id;
    o.textContent = `${w.surface}（${w.kana}）${w.gloss} · ${TYPE_NAMES[w.type].ja}`;
    sel.append(o);
  }
  $('word-count').textContent = list.length === words.length
    ? `${words.length} 語`
    : `${list.length} / ${words.length} 語${list.length === 0 ? '（該当なし）' : ''}`;
  sel.disabled = list.length === 0;
  if (list.length === 0) return;
  if (list.includes(current)) sel.value = current.id;
  else selectWord(list[0]);
}

function selectWord(w) {
  current = w;
  $('word-select').value = w.id;
  $('word-surface').textContent = w.surface;
  $('word-kana').textContent = `「${w.kana}が」`;
  $('word-gloss').textContent = w.gloss;
  $('say-it').textContent = `「${w.kana}が」`;
  $('word-type').textContent = w.accent.map((k) => typeWithDrop(k, w)).join('／または ');
  // H/L pattern, word morae + が.
  const pat = pitchPattern(w.accent[0], n(w));
  const box = $('word-pattern');
  box.textContent = '';
  [...w.morae, 'が'].forEach((m, i) => {
    const d = document.createElement('span');
    d.className = `mora${pat[i] ? ' hi' : ''}${i === n(w) ? ' particle' : ''}${w.accent[0] > 0 && i === w.accent[0] - 1 ? ' drop-after' : ''}`;
    d.innerHTML = `<span class="tone">${pat[i] ? 'H' : 'L'}</span><span class="k"></span>`;
    d.querySelector('.k').textContent = m;
    box.append(d);
  });
  box.setAttribute('aria-label', `高低パターン: ${[...w.morae, 'が'].map((m, i) => `${m}${pat[i] ? '高' : '低'}`).join(' ')}`);
  const homs = (byKana.get(w.kana) ?? []).filter((h) => h !== w);
  const hp = $('word-homophones');
  hp.hidden = homs.length === 0;
  hp.textContent = homs.length
    ? `同音語: ${homs.map((h) => `${h.surface}（${h.gloss}・${typeJa(h.accent[0], h)}）`).join('、')} — 判定結果でどの型に近いかも表示します。`
    : '';
  setIdle();
}

// ---------- result rendering ----------
function setState(s) { $('result').dataset.state = s; }

function setIdle() {
  setState('idle');
  $('source').textContent = 'ファイルを選ぶか、合成音声のサンプルを試してください。';
  $('verdict').textContent = '—';
  $('verdict').dataset.pass = 'false';
  $('reason').textContent = `「${current.kana}が」を録音したファイルを選ぶと、ここに判定が出ます。`;
  $('homophone').hidden = true;
  $('flat-note').hidden = true;
  $('facts').hidden = true;
  drawPlot(current, null, null, 0);
}

function showError(msg, w) {
  setState('error');
  $('verdict').textContent = '✗ 判定できません';
  $('verdict').dataset.pass = 'false';
  $('reason').textContent = msg;
  $('homophone').hidden = true;
  $('flat-note').hidden = true;
  $('facts').hidden = true;
  drawPlot(w, null, null, 0);
}

function homophoneLine(r, w) {
  const homs = byKana.get(w.kana) ?? [];
  if (homs.length < 2) return null;
  const hit = homs.filter((h) => h.accent.includes(r.detectedK));
  if (hit.length === 0) return `あなたの発音は「${w.kana}」の同音語（${homs.map((h) => h.surface).join('・')}）のどの型とも一致しません。`;
  return `あなたの発音は${hit.map((h) => `『${h.surface}（${h.kana}・${h.gloss}）』`).join('・')}の型に近いです。`;
}

function showResult(r, w, tr, offset) {
  if (r.error) { showError(ERROR_TEXT[r.error] ?? r.error, w); return; }
  setState('done');
  const v = $('verdict');
  v.textContent = r.pass ? '✓ 合格' : '✗ もう一度';
  v.dataset.pass = String(r.pass);
  $('reason').textContent = reasonText(r, w);
  const hl = homophoneLine(r, w);
  $('homophone').hidden = !hl;
  $('homophone').textContent = hl ?? '';
  $('flat-note').hidden = !r.flat;
  $('flat-note').textContent = r.flat ? '声の高さがほとんど平らでした。高低の差が小さいため、平板型として判定しています。' : '';
  $('facts').hidden = false;
  $('fact-detected').textContent = typeWithDrop(r.detectedK, w);
  $('fact-expected').textContent = r.expectedK.map((k) => `${typeJa(k, w)}［${k}］`).join('／');
  $('fact-range').textContent = `${r.stepSt.toFixed(1)} 半音`;
  $('fact-confidence').textContent = `${Math.round(r.confidence * 100)}%`;
  drawPlot(w, r, tr, offset);
}

// ---------- plot ----------
const W = 440, H = 290, PAD = { l: 30, r: 10, t: 30, b: 56 };
const f1 = (x) => x.toFixed(1);

function niceStep(range, target) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function drawPlot(w, r, tr, offset = 0) {
  const svg = $('plot');
  const labels = [...w.morae, 'が'];
  const nn = n(w);
  const pat = pitchPattern(w.accent[0], nn);
  // Mora boundaries: real segment times when we have a result, else nominal 0.18 s slots.
  const segs = r
    ? r.segments.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset }))
    : labels.map((label, i) => ({ label, start: 0.1 + i * 0.18, end: 0.1 + (i + 1) * 0.18, value: NaN }));
  const t0 = segs[0].start - 0.12, t1 = segs[segs.length - 1].end + 0.12;
  // Semitones relative to the lowest mora value (0 = your low tone).
  const vals = segs.map((s) => s.value).filter((v) => !Number.isNaN(v));
  const ref = vals.length ? Math.min(...vals) : 0;
  const fit = r ? r.candidates.find((c) => c.k === r.expectedK[0]) : null;
  const model = segs.map((s, i) => (fit ? fit.a + fit.b * pat[i] + fit.c * i - ref : pat[i] * 3));
  const curve = [];
  if (r && tr) {
    tr.times.forEach((t, i) => {
      const st = r.st[i];
      const tt = t + offset;
      curve.push(Number.isNaN(st) || tt < t0 || tt > t1 ? null : [tt, st - ref]);
    });
  }
  const ys = [...model, ...curve.filter(Boolean).map((p) => p[1]), ...vals.map((v) => v - ref)];
  let lo = Math.min(-1, ...ys) - 0.5, hi = Math.max(4, ...ys) + 0.5;
  const X = (t) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const Y = (st) => PAD.t + (1 - (st - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const top = PAD.t, bot = H - PAD.b;
  let s = '';
  // Dictionary H shading + mora boundaries and labels.
  segs.forEach((g, i) => {
    if (pat[i]) s += `<rect x="${f1(X(g.start))}" y="${top}" width="${f1(X(g.end) - X(g.start))}" height="${bot - top}" fill="var(--hi-band)"/>`;
    s += `<text x="${f1((X(g.start) + X(g.end)) / 2)}" y="${top - 10}" text-anchor="middle" font-size="15" font-weight="700" fill="${pat[i] ? 'var(--accent)' : 'var(--muted)'}">${pat[i] ? 'H' : 'L'}</text>`;
    s += `<text x="${f1((X(g.start) + X(g.end)) / 2)}" y="${bot + 44}" text-anchor="middle" font-size="22" fill="currentColor">${g.label}</text>`;
  });
  // Axes: semitone grid.
  const ys0 = niceStep(hi - lo, 5);
  for (let v = Math.ceil(lo / ys0) * ys0; v <= hi; v += ys0) {
    s += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="var(--line)" stroke-width="1"/>`;
    s += `<text x="${PAD.l - 6}" y="${f1(Y(v) + 4)}" text-anchor="end" font-size="13" fill="var(--muted)">${Math.round(v)}</text>`;
  }
  s += `<text x="2" y="${top - 10}" font-size="13" fill="var(--muted)">半音</text>`;
  const bset = new Set();
  segs.forEach((g) => { bset.add(g.start); bset.add(g.end); });
  for (const b of bset) s += `<line x1="${f1(X(b))}" x2="${f1(X(b))}" y1="${top}" y2="${bot}" stroke="var(--line)" stroke-width="1.5"/>`;
  // Time ticks.
  const ts = niceStep(t1 - t0, 5);
  s += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${bot}" y2="${bot}" stroke="var(--muted)" stroke-width="1"/>`;
  for (let t = Math.ceil(t0 / ts) * ts; t <= t1 + 1e-9; t += ts) {
    s += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${bot}" y2="${bot + 5}" stroke="var(--muted)"/>`;
    s += `<text x="${f1(X(t))}" y="${bot + 19}" text-anchor="middle" font-size="13" fill="var(--muted)">${t.toFixed(ts < 0.1 ? 2 : 1)}</text>`;
  }
  s += `<text x="${W - PAD.r}" y="${H - 2}" text-anchor="end" font-size="13" fill="var(--muted)">秒</text>`;
  // Dictionary model line (fitted to the user's range when we have a result).
  let mp = '';
  segs.forEach((g, i) => { mp += `${i ? 'L' : 'M'}${f1(X(g.start))},${f1(Y(model[i]))} L${f1(X(g.end))},${f1(Y(model[i]))} `; });
  s += `<path d="${mp}" fill="none" stroke="var(--dict)" stroke-width="2" stroke-dasharray="6 5"/>`;
  // Drop markers.
  const k0 = r ? r.expectedK[0] : w.accent[0];
  const dropX = (k) => X(segs[k].start);
  if (k0 > 0) {
    s += `<line x1="${f1(dropX(k0))}" x2="${f1(dropX(k0))}" y1="${top}" y2="${bot}" stroke="var(--dict)" stroke-width="2" stroke-dasharray="4 4"/>`;
    s += `<text x="${f1(dropX(k0) + 4)}" y="${bot - 6}" font-size="13" font-weight="600" fill="var(--dict)">辞書↓</text>`;
  }
  if (r) {
    let path = '', pen = false;
    for (const p of curve) {
      if (!p) { pen = false; continue; }
      path += `${pen ? 'L' : 'M'}${f1(X(p[0]))},${f1(Y(p[1]))} `;
      pen = true;
    }
    s += `<path d="${path}" fill="none" stroke="var(--user)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    segs.forEach((g) => {
      if (!Number.isNaN(g.value)) s += `<circle cx="${f1((X(g.start) + X(g.end)) / 2)}" cy="${f1(Y(g.value - ref))}" r="5" fill="var(--user)" stroke="var(--surface)" stroke-width="1.5"/>`;
    });
    if (r.detectedK > 0) {
      const c = r.pass ? 'var(--ok)' : 'var(--ng)';
      const x = dropX(r.detectedK);
      s += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${top}" y2="${bot}" stroke="${c}" stroke-width="3"/>`;
      s += `<text x="${f1(x + 4)}" y="${top + 14}" font-size="14" font-weight="700" fill="${c}">あなた↓</text>`;
    }
  } else {
    s += `<text x="${W / 2}" y="${f1((top + bot) / 2)}" text-anchor="middle" font-size="14" fill="var(--muted)">録音を選ぶと声の高さを重ねます</text>`;
  }
  svg.innerHTML = s;
  svg.setAttribute('aria-label', r
    ? `声の高さのグラフ。検出: ${typeJa(r.detectedK, w)}、辞書: ${typeJa(k0, w)}`
    : `辞書の型: ${typeJa(w.accent[0], w)}`);
}

// ---------- analysis ----------
const nextFrame = () => new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));

async function analyze(samples, rate, w, source, offset = 0) {
  const id = ++runId;
  lastAudio = { samples, rate };
  $('play-last').disabled = false;
  const tr = extractF0(PitchDetector, normalize(samples), rate);
  if (id !== runId) return;
  const r = judge(tr, w);
  showResult(r, w, tr, offset);
  window.__pitchLast = { result: r, word: w, source };
}

function wrongK(w) {
  const k0 = w.accent[0];
  const alt = k0 === 0 ? n(w) : 0;
  if (!w.accent.includes(alt)) return alt;
  for (let k = 0; k <= n(w); k++) if (!w.accent.includes(k)) return k;
  return alt;
}

async function runSample(kind) {
  const w = current;
  const k = kind === 'wrong' ? wrongK(w) : w.accent[0];
  setState('busy');
  $('source').textContent = `合成音声のサンプル（${kind === 'wrong' ? '違う型' : '正しい型'}: ${typeWithDrop(k, w)}）`;
  await nextFrame();
  const seed = 1 + ((w.id.charCodeAt(w.id.length - 1) * 31 + k) % 997);
  const { audio, sampleRate } = synthesizeWord(w.morae, k, { sampleRate: SR, baseHz: 140, seed });
  await analyze(audio, sampleRate, w, { kind: 'sample', sample: kind, k });
}

async function runFile(file) {
  if (!file) return;
  const w = current;
  const id = ++runId;
  setState('busy');
  $('source').textContent = `${file.name} を読み込み中…`;
  $('verdict').textContent = '解析中…';
  await nextFrame();
  try {
    const buf = await file.arrayBuffer();
    const { samples, rate, duration } = await decodeAudioFile(buf);
    if (id !== runId) return;
    const u = pickUtterance(samples, rate, { maxSec: 4 });
    $('source').textContent = `${file.name}（全体 ${duration.toFixed(1)} 秒のうち ${u.start.toFixed(1)}–${u.end.toFixed(1)} 秒を判定）`;
    await analyze(u.samples, rate, w, { kind: 'file', name: file.name, duration, start: u.start, end: u.end }, u.start);
  } catch (e) {
    console.warn(e);
    if (id !== runId) return;
    $('source').textContent = file.name;
    showError(e && e.message ? e.message : 'ファイルを読み込めませんでした。', w);
    window.__pitchLast = { result: null, error: String(e && e.message), word: w, source: { kind: 'file', name: file.name } };
  }
}

// ---------- playback (click-started only) ----------
function play(samples, rate) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx ??= new Ctx();
  audioCtx.resume?.();
  const b = audioCtx.createBuffer(1, samples.length, rate);
  b.getChannelData(0).set(samples);
  const src = audioCtx.createBufferSource();
  src.buffer = b;
  src.connect(audioCtx.destination);
  src.start();
}

// ---------- wiring ----------
$('word-search').addEventListener('input', renderSelect);
$('type-filter').addEventListener('change', renderSelect);
$('word-select').addEventListener('change', () => {
  const w = words.find((x) => x.id === $('word-select').value);
  if (w) selectWord(w);
});
$('file').addEventListener('change', () => {
  const f = $('file').files[0];
  runFile(f);
  $('file').value = ''; // allow picking the same file again
});
for (const b of document.querySelectorAll('button[data-sample]')) {
  b.addEventListener('click', () => runSample(b.dataset.sample));
}
$('play-last').addEventListener('click', () => { if (lastAudio) play(lastAudio.samples, lastAudio.rate); });
$('play-model').addEventListener('click', () => {
  const { audio, sampleRate } = synthesizeWord(current.morae, current.accent[0], { sampleRate: SR, baseHz: 140, seed: 7 });
  play(audio, sampleRate);
});
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  runFile(e.dataTransfer?.files?.[0]);
});
// A file dropped outside the zone should not navigate away.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

renderSelect();
selectWord(current);
runSample('correct');

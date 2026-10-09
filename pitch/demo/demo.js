// P3 Pitch — single-file demo page (no microphone: the user picks a voice-memo file).
// Pipeline per analysis: decode → pickUtterance → normalize → extractF0 (pitchy) → judge.
// Everything runs in the page; nothing is fetched or sent anywhere.

import { DEFAULTS as JUDGE_DEFAULTS } from '../src/judge.js';
import { pitchPattern, accentType, TYPE_NAMES } from '../src/accent.js';
import { synthesizeWord } from '../src/synth.js';
import { decodeLexicon, fold, wrongK, sampleSeed } from './lexicon.js';
import { mountShare } from './share.js'; // 結果の共有カード画像
import { mountAnki } from './anki.js'; // Anki への書き出し
import { SR, loadUtterance, judgeSamples, play } from './pipeline.js'; // shared with practice.js
import { initPractice } from './practice.js'; // 最小対で練習
import { mountEvalMode } from './evalmode.js'; // 評価協力モード（端末内だけに保存）
import { createEntitlement, createJudgeGate, mountSupporter, gatesFor, pairOpen, safeStorage, PLAN } from './supporter.js'; // 創設サポーター
import { mountLists } from './mylists.js'; // 自分の単語リスト
import { mountProgress } from './progress.js'; // 練習の記録

const $ = (id) => document.getElementById(id);
const DEFAULT_SURFACE = '橋';

// ---------- lexicon ----------
const words = decodeLexicon(JSON.parse($('lexicon-data').textContent));
const byId = new Map(words.map((w) => [w.id, w]));
const byKana = new Map();
for (const w of words) {
  if (!byKana.has(w.kana)) byKana.set(w.kana, []);
  byKana.get(w.kana).push(w);
}
// Search keys, folded once: surface, kana (katakana queries match too), gloss.
const keys = new Map(words.map((w) => [w, { s: fold(w.surface), k: fold(w.kana), g: w.gloss.toLowerCase() }]));
// Famous minimal pairs / triples, offered as quick picks when the lexicon has them.
const QUICK_PICKS = ['はし', 'あめ', 'はな', 'かみ', 'かき'];

let current = words.find((w) => w.surface === DEFAULT_SURFACE) ?? words[0];
let lastAudio = null; // { samples, rate }
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
  'no-ga': '「が」の高さが聞き取れませんでした（声がかすれたり、小さくなったりしたかもしれません）。平板型と尾高型は「が」の高さでしか区別できないので、「が」までしっかり声を出して録音し直してください。',
};

// ---------- word picker ----------
/** 0 = exact, 1 = prefix, 2 = contains, -1 = no match (surface, kana, English gloss). */
function rank(w, q) {
  if (!q) return 2;
  const { s, k, g } = keys.get(w);
  if (s === q || k === q || g === q) return 0;
  if (s.startsWith(q) || k.startsWith(q) || g.startsWith(q) || g.includes(` ${q}`)) return 1;
  if (s.includes(q) || k.includes(q) || (q.length >= 3 && g.includes(q))) return 2; // 'a' ≠ every gloss with an a
  return -1;
}

const nf = new Intl.NumberFormat('ja-JP');

function renderSelect() {
  const q = fold($('word-search').value);
  const t = $('type-filter').value;
  const buckets = [[], [], []]; // exact matches first, then prefix, then the rest (lexicon order)
  for (const w of words) {
    if (t && w.type !== t) continue;
    const r = rank(w, q);
    if (r >= 0) buckets[r].push(w);
  }
  const list = buckets.flat();
  const sel = $('word-select');
  const frag = document.createDocumentFragment();
  for (const w of list) {
    const o = document.createElement('option');
    o.value = w.id;
    o.textContent = `${w.surface}（${w.kana}）${w.gloss} · ${TYPE_NAMES[w.type].ja}`;
    frag.append(o);
  }
  sel.replaceChildren(frag);
  $('word-count').textContent = list.length === words.length
    ? `全 ${nf.format(words.length)} 語`
    : `${nf.format(list.length)} / ${nf.format(words.length)} 語${list.length === 0 ? '（該当なし）' : ''}`;
  sel.disabled = list.length === 0;
  for (const c of $('word-picks').children) c.setAttribute('aria-pressed', String(fold(c.dataset.kana) === q));
  if (list.length === 0) return;
  if (list.includes(current)) sel.value = current.id;
  else selectWord(list[0]);
}

let searchTimer = 0;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderSelect, 150);
}

function renderPicks() {
  const box = $('word-picks');
  const frag = document.createDocumentFragment();
  for (const kana of QUICK_PICKS) {
    const group = byKana.get(kana) ?? [];
    if (group.length < 2) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.kana = kana;
    b.setAttribute('aria-pressed', 'false');
    b.textContent = group.map((w) => w.surface).join('・');
    b.title = `「${kana}」の同音語`;
    b.addEventListener('click', () => {
      clearTimeout(searchTimer);
      $('word-search').value = kana;
      $('type-filter').value = '';
      renderSelect();
    });
    frag.append(b);
  }
  box.replaceChildren(frag);
  box.hidden = box.children.length === 0;
  $('word-picks-label').hidden = box.hidden;
}

function selectWord(w) {
  current = w;
  runId++; // a file still decoding for the previous word must not overwrite this view
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
function setState(s) {
  $('result').dataset.state = s;
  $('limit-note').hidden = s !== 'limit'; // 創設サポーター：1日の上限の案内
}

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
  // 判定できなかったとき、前のファイルの音声を「再生」で流さない
  lastAudio = null;
  $('play-last').disabled = true;
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

/**
 * How clearly the detected template beats the next *plausible* one, as 高/中/低.
 * judge()'s own `confidence` compares against every template, including ones whose
 * H/L step is below minStep (or even inverted); those can fit with lower error and
 * pin the number at 0% even for a clear, correct result. Here only templates that
 * would themselves be valid detections count as alternatives. Thresholds are a rough
 * guide (synthetic samples: margin ≥ 0.12 for every word); real recordings are noisier.
 */
function certaintyJa(r) {
  if (r.flat) return '低（高低差が小さい）';
  const det = r.candidates.find((c) => c.k === r.detectedK);
  const alts = r.candidates.filter((c) => c.k !== r.detectedK && c.b >= JUDGE_DEFAULTS.minStep);
  if (!det || alts.length === 0) return '高';
  const vals = r.segments.map((g) => g.value).filter((v) => !Number.isNaN(v));
  const spread = Math.max(...vals) - Math.min(...vals);
  const best = Math.min(...alts.map((c) => c.sse));
  const margin = (best - det.sse) / Math.max(1e-6, spread * spread);
  if (margin >= 0.12) return '高';
  if (margin >= 0.04) return '中（ほかの型とも少し似ています）';
  return '低（ほかの型と紛らわしい）';
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
  $('fact-confidence').textContent = certaintyJa(r);
  drawPlot(w, r, tr, offset);
}

// ---------- plot ----------
const W = 440, H = 290, PAD = { l: 30, r: 10, t: 30, b: 56 };
const f1 = (x) => x.toFixed(1);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
  // The dictionary line keeps the dictionary's shape: if the fitted step is tiny or
  // inverted (the user said a different pattern), draw it with a minimum 2-semitone
  // step around the same mean level instead of showing H below L.
  let model;
  if (fit) {
    const b = Math.max(fit.b, 2);
    const pv = segs.map((g, i) => pat[i]).filter((_, i) => !Number.isNaN(segs[i].value));
    const pm = pv.length ? pv.reduce((x, y) => x + y, 0) / pv.length : 0.5;
    const a = fit.a + (fit.b - b) * pm;
    model = segs.map((g, i) => a + b * pat[i] + fit.c * i - ref);
  } else {
    model = segs.map((g, i) => pat[i] * 3);
  }
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
    s += `<text x="${f1((X(g.start) + X(g.end)) / 2)}" y="${bot + 44}" text-anchor="middle" font-size="22" fill="currentColor">${esc(g.label)}</text>`;
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
  const { tr, r } = judgeSamples(samples, rate, w);
  if (id !== runId) return;
  showResult(r, w, tr, offset);
  window.__pitchLast = { result: r, word: w, source };
  afterJudge({ result: r, word: w, track: tr, source, samples, rate }); // share card + Anki session list + 評価協力モード
}

async function runSample(kind) {
  const w = current;
  const k = kind === 'wrong' ? wrongK(w) : w.accent[0];
  setState('busy');
  $('source').textContent = `合成音声のサンプル（${kind === 'wrong' ? '違う型' : '正しい型'}: ${typeWithDrop(k, w)}）`;
  await nextFrame();
  const seed = sampleSeed(w, k);
  const { audio, sampleRate } = synthesizeWord(w.morae, k, { sampleRate: SR, baseHz: 140, seed });
  await analyze(audio, sampleRate, w, { kind: 'sample', sample: kind, k });
}

async function runFile(file) {
  if (!file) return;
  const w = current;
  const id = ++runId;
  const blocked = judgeGate.check(w); // 無料版の1日の上限（demo/supporter.js）
  if (blocked) {
    showError(blocked, w);
    setState('limit');
    $('source').textContent = file.name;
    $('verdict').textContent = '今日の無料の判定はここまでです';
    window.__pitchLast = { result: null, blocked: 'daily-limit', word: w, source: { kind: 'file', name: file.name } };
    return;
  }
  setState('busy');
  $('source').textContent = `${file.name} を読み込み中…`;
  $('verdict').textContent = '解析中…';
  await nextFrame();
  try {
    const u = await loadUtterance(file);
    const { rate, duration, decoder } = u;
    if (id !== runId) return;
    // decoder 'js-aac' / 'js-alac': the browser could not decode the m4a; the built-in decoder did.
    const via = decoder && decoder !== 'native' ? '・内蔵デコーダで読み込み' : '';
    $('source').textContent = `${file.name}（全体 ${duration.toFixed(1)} 秒のうち ${u.start.toFixed(1)}–${u.end.toFixed(1)} 秒を判定${via}）`;
    await analyze(u.samples, rate, w, { kind: 'file', name: file.name, duration, start: u.start, end: u.end, decoder }, u.start);
  } catch (e) {
    console.warn(e);
    if (id !== runId) return;
    $('source').textContent = file.name;
    showError(e && e.message ? e.message : 'ファイルを読み込めませんでした。', w);
    window.__pitchLast = { result: null, error: String(e && e.message), word: w, source: { kind: 'file', name: file.name } };
  }
}

// ---------- playback: play() from ./pipeline.js (click-started only) ----------

// ---------- wiring ----------
$('word-search').addEventListener('input', onSearch);
$('word-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(searchTimer); renderSelect(); } });
$('type-filter').addEventListener('change', renderSelect);
$('word-select').addEventListener('change', () => {
  const w = byId.get($('word-select').value);
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

// ---------- 創設サポーター・自分の単語リスト・練習の記録 (demo/supporter.js, mylists.js, progress.js) ----------
const storage = safeStorage();
const entitlement = createEntitlement({ storage });
const gates = () => gatesFor(entitlement.isSupporter());
const listed = () => [...$('word-select').options].map((o) => byId.get(o.value)).filter(Boolean);
const myLists = mountLists({ byId, storage, listed, getCurrent: () => current, selectWord, isOpen: () => gates().lists });
const progress = mountProgress({ storage, window: () => gates().historyDays });

// ---------- share card + Anki export (demo/share.js, demo/anki.js) ----------
const shareCard = mountShare();
const ankiExport = mountAnki({
  words, byId, getCurrent: () => current,
  scopeOpen: (s) => gates().ankiScopes.has(s), listWords: myLists.activeWords, listName: myLists.activeName,
});
const evalMode = mountEvalMode({ getCurrent: () => current, getBuild: () => $('build').textContent.trim() });
const judgeGate = createJudgeGate({ entitlement, storage, isExempt: evalMode.isOn });
const supporterPanel = mountSupporter({ entitlement, gate: judgeGate });
myLists.onChange?.(ankiExport.refresh);
function afterJudge(e) {
  shareCard.judged(e);
  ankiExport.judged(e);
  evalMode.judged(e); // 録音ファイルのときだけ、オンなら端末内に保存
  countJudgement(e);
}
/** 判定画面と練習の言い分けの両方から：1日の判定数と練習の記録（録音ファイルだけ）。 */
function countJudgement(e) {
  judgeGate.record(e);
  progress.judged(e);
  supporterPanel.refresh();
}

renderPicks();
renderSelect();
selectWord(current);
runSample('correct');

// ---------- 最小対で練習 (demo/practice.js) ----------
const practice = initPractice({
  words, loadUtterance, judgeSamples, play, synthesizeWord, sampleRate: SR, sampleSeed,
  onJudged: (e) => { evalMode.judged(e); countJudgement(e); },
  pairOpen: (i) => pairOpen(gates(), i),
  lockedText: `この組の聞き分けドリルは${PLAN.name}向けです（無料版は最初の${PLAN.freePracticePairs}組）。言い分け（録音で判定）はどの組でも使えます。`,
  beforeJudge: (w) => judgeGate.check(w),
});

// 解除の状態が変わったら、各機能の表示を合わせる。保存済みのキーはここで検証し直す。
entitlement.subscribe(() => {
  practice?.refresh();
  ankiExport.refresh?.();
  myLists.refresh();
  progress.refresh();
});
entitlement.load().then(() => supporterPanel.useIncoming()); // 保存済みのキーを検証し直し、#key=… で渡されたキーがあれば確かめる

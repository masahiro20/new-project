import { PitchDetector } from 'pitchy';
import { extractF0, energyAt, normalize } from './f0.js';
import { judge, hzToSt } from './judge.js';
import { pitchPattern, accentType, TYPE_NAMES, describeDrop } from './accent.js';
import { syntheticContour, renderVoice } from './synth.js';

const $ = (id) => document.getElementById(id);
const MAX_REC_SEC = 4;
const VERDICT_TEXT = {
  match: 'Your pitch drops in the right place.',
  'missing-drop': 'Your pitch never dropped — the dictionary has a drop here.',
  'unexpected-drop': 'Your pitch dropped — this word should stay high through が.',
  'drop-too-early': 'Your pitch dropped too early.',
  'drop-too-late': 'Your pitch dropped too late.',
};
const ERROR_TEXT = {
  'no-voice': 'Could not hear a voice. Try again a little louder, closer to the mic.',
  'too-short': 'That was very short. Say the whole word plus が.',
};

let words = [];
let current = null;
let audioCtx = null;
let recorder = null;

// ---------- word list ----------
async function loadWords() {
  const res = await fetch('data/lexicon-200.json');
  const lex = await res.json();
  words = lex.words;
  $('count').textContent = `${words.length} words · accent: ${lex.source.accent}`;
  renderList();
  select(words[0]);
}

function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const t = $('filter').value;
  const list = $('list');
  list.textContent = '';
  for (const w of words) {
    if (t && w.type !== t) continue;
    if (q && !(w.surface.includes(q) || w.kana.includes(q) || w.gloss.toLowerCase().includes(q))) continue;
    const b = document.createElement('button');
    b.setAttribute('role', 'option');
    b.setAttribute('aria-current', String(w === current));
    b.innerHTML = `<span>${w.surface}　<span class="muted">${w.kana}</span></span><span class="muted">${w.gloss} · ${TYPE_NAMES[w.type].ja}</span>`;
    b.onclick = () => select(w);
    list.append(b);
  }
}

function select(w) {
  current = w;
  const n = w.morae.length;
  $('word').innerHTML = `<span class="surface">${w.surface}</span><span class="kana">${w.kana}が</span><span class="muted">${w.gloss}</span>`;
  const types = w.accent.map((k) => `${TYPE_NAMES[accentType(k, n)].en} [${k}] — ${describeDrop(k, w.morae).en}`);
  $('pattern').textContent = `Dictionary: ${types.join(' / also: ')}`;
  $('verdict').textContent = '';
  $('verdict').className = 'verdict';
  $('detail').textContent = '';
  $('status').textContent = '';
  drawPlot(w, null);
  renderList();
  const sim = $('simType');
  sim.textContent = '';
  for (let k = 0; k <= n; k++) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = `say it as ${TYPE_NAMES[accentType(k, n)].en} [${k}]`;
    sim.append(o);
  }
  sim.value = w.accent[0];
}

// ---------- audio ----------
function ctx() {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

function playSamples(samples, rate) {
  const c = ctx();
  const buf = c.createBuffer(1, samples.length, rate);
  buf.copyToChannel(samples, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start();
}

function modelSamples(w, rate) {
  const k = w.accent[0];
  return renderVoice(syntheticContour(k, w.morae.length, { baseHz: Number($('voice').value), stepSt: 4 }), rate);
}

const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor('tap', Tap);`;

async function startRecording() {
  const c = ctx();
  await c.resume();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
  });
  await c.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  const src = c.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(c, 'tap');
  const chunks = [];
  node.port.onmessage = (e) => chunks.push(e.data);
  src.connect(node);
  const stop = () => {
    if (!recorder) return;
    clearTimeout(recorder.timer);
    recorder = null;
    src.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const all = new Float32Array(chunks.reduce((s, c2) => s + c2.length, 0));
    let off = 0;
    for (const ch of chunks) { all.set(ch, off); off += ch.length; }
    setRecButton(false);
    analyze(all, c.sampleRate);
  };
  recorder = { stop, timer: setTimeout(stop, MAX_REC_SEC * 1000) };
  setRecButton(true);
  $('status').textContent = `Recording… say “${current.kana}が” (stops after ${MAX_REC_SEC} s)`;
}

function setRecButton(on) {
  $('rec').textContent = on ? '■ Stop' : '● Record “…が”';
  $('rec').className = on ? 'rec' : 'primary';
}

// ---------- F0 engines ----------
let swift = null;
async function swiftEngine() {
  if (swift) return swift;
  $('status').textContent = 'Loading SwiftF0 model…';
  const ort = await import('../vendor/ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
  if (!self.crossOriginIsolated) ort.env.wasm.numThreads = 1;
  const { createSwiftF0, resampleLinear } = await import('./swiftf0.js');
  const model = await createSwiftF0(ort, new URL('../vendor/swiftf0/model.onnx', import.meta.url).href);
  swift = { model, resampleLinear };
  return swift;
}

async function track(samples, rate) {
  if ($('engine').value === 'swiftf0') {
    const { model, resampleLinear } = await swiftEngine();
    const x = resampleLinear(samples, rate, model.sampleRate);
    const r = await model.analyze(x);
    return {
      track: {
        times: r.times,
        f0: r.f0.map((v) => (Number.isFinite(v) ? v : 0)),
        clarity: r.confidence,
        energyDb: energyAt(x, model.sampleRate, r.times),
      },
      opts: { minClarity: 0.5, medianWidth: 3 }, // 16 ms frames
    };
  }
  return { track: extractF0(PitchDetector, samples, rate), opts: {} };
}

async function analyze(samples, rate) {
  $('status').textContent = 'Analysing…';
  try {
    const { track: tr, opts } = await track(normalize(samples), rate);
    const r = judge(tr, current, opts);
    show(r, tr);
    $('status').textContent = '';
  } catch (e) {
    console.error(e);
    $('status').textContent = `Error: ${e.message}`;
  }
}

function show(r, tr) {
  const v = $('verdict');
  if (r.error) {
    v.textContent = ERROR_TEXT[r.error];
    v.className = 'verdict ng';
    $('detail').textContent = '';
    drawPlot(current, null);
    return;
  }
  v.textContent = `${r.pass ? '✓ Pass' : '✗ Not yet'} — ${VERDICT_TEXT[r.verdict]}`;
  v.className = `verdict ${r.pass ? 'ok' : 'ng'}`;
  const n = current.morae.length;
  $('detail').textContent = `Heard: ${TYPE_NAMES[r.detectedType].en} [${r.detectedK}] — ${describeDrop(r.detectedK, current.morae).en}. ` +
    `Pitch range ${r.stepSt.toFixed(1)} semitones · confidence ${(r.confidence * 100).toFixed(0)}%` +
    (r.flat ? ' · your pitch was almost flat' : '') + `. Expected: ${current.accent.map((k) => `${TYPE_NAMES[accentType(k, n)].en} [${k}]`).join(' or ')}.`;
  drawPlot(current, r, tr);
}

// ---------- plot ----------
const W = 800, H = 300, PAD = { l: 40, r: 10, t: 16, b: 44 };

function drawPlot(w, r, tr) {
  const svg = $('plot');
  const n = w.morae.length, slots = n + 1;
  const sw = (W - PAD.l - PAD.r) / slots;
  const pat = pitchPattern(w.accent[0], n);
  // y scale: user's semitones if we have them, else a nominal 0..4 st range.
  let lo = -1, hi = 5, ref = { a: 0, b: 4 };
  if (r) {
    const vals = r.st.filter((v) => !Number.isNaN(v));
    lo = Math.min(...vals) - 1;
    hi = Math.max(...vals) + 1;
    // Place the model line on the user's own low/high levels.
    const segs = r.segments.map((s) => s.value).filter((v) => !Number.isNaN(v));
    ref = { a: Math.min(...segs), b: Math.max(2, Math.max(...segs) - Math.min(...segs)) };
    lo = Math.min(lo, ref.a - 1); hi = Math.max(hi, ref.a + ref.b + 1);
  }
  // Model line: synthetic contour on the user's own low/high levels.
  const model = syntheticContour(w.accent[0], n, { baseHz: 100, stepSt: ref.b, declSt: 0.3 });
  const [m0, m1] = [model.bounds[0][0], model.bounds[slots - 1][1]];
  const mvals = model.times.flatMap((t, i) => (model.f0[i] > 0 && t >= m0 && t <= m1 ? [[(t - m0) / (m1 - m0), hzToSt(model.f0[i]) + ref.a]] : []));
  lo = Math.min(lo, ...mvals.map((m) => m[1] - 0.5));
  hi = Math.max(hi, ...mvals.map((m) => m[1] + 0.5));
  const y = (st) => PAD.t + (H - PAD.t - PAD.b) * (1 - (st - lo) / (hi - lo));
  const x = (slot) => PAD.l + slot * sw; // slot may be fractional
  let s = '';
  for (let i = 0; i < slots; i++) {
    if (pat[i]) s += `<rect x="${x(i)}" y="${PAD.t}" width="${sw}" height="${H - PAD.t - PAD.b}" fill="var(--high)"/>`;
    s += `<line x1="${x(i)}" x2="${x(i)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--line)"/>`;
    const label = i < n ? w.morae[i] : 'が';
    s += `<text x="${x(i) + sw / 2}" y="${H - PAD.b + 26}" text-anchor="middle" font-size="22" fill="currentColor">${label}</text>`;
    s += `<text x="${x(i) + sw / 2}" y="${PAD.t + 14}" text-anchor="middle" font-size="12" fill="var(--muted)">${pat[i] ? 'H' : 'L'}</text>`;
  }
  s += `<line x1="${x(slots)}" x2="${x(slots)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--line)"/>`;
  const mpts = mvals.map(([f, v]) => [x(f * slots).toFixed(1), y(v).toFixed(1)]);
  s += `<polyline points="${mpts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--model)" stroke-width="3" stroke-dasharray="8 6"/>`;
  if (r) {
    const [t0, t1] = r.span;
    let path = '', pen = false;
    tr.times.forEach((t, i) => {
      const v = r.st[i];
      if (Number.isNaN(v) || t < t0 - 0.05 || t > t1 + 0.05) { pen = false; return; }
      path += `${pen ? 'L' : 'M'}${x(((t - t0) / (t1 - t0)) * slots).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    s += `<path d="${path}" fill="none" stroke="var(--user)" stroke-width="2.5"/>`;
    r.segments.forEach((seg, i) => {
      if (!Number.isNaN(seg.value)) s += `<circle cx="${x(i) + sw / 2}" cy="${y(seg.value)}" r="6" fill="var(--user)"/>`;
    });
    // Mark the detected drop.
    if (r.detectedK > 0) {
      s += `<line x1="${x(r.detectedK)}" x2="${x(r.detectedK)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="${r.pass ? 'var(--ok)' : 'var(--ng)'}" stroke-width="3"/>`;
    }
  }
  s += `<text x="4" y="${PAD.t + 10}" font-size="11" fill="var(--muted)">pitch</text>`;
  svg.innerHTML = s;
}

// ---------- wiring ----------
$('q').oninput = renderList;
$('filter').onchange = renderList;
$('random').onclick = () => {
  const t = $('filter').value;
  const pool = words.filter((w) => !t || w.type === t);
  select(pool[Math.floor(Math.random() * pool.length)]);
};
$('play').onclick = () => playSamples(modelSamples(current, ctx().sampleRate), ctx().sampleRate);
$('rec').onclick = async () => {
  if (recorder) return recorder.stop();
  try {
    await startRecording();
  } catch (e) {
    $('status').textContent = `Microphone unavailable: ${e.message}`;
  }
};
$('fileBtn').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0];
  if (!f) return;
  const buf = await ctx().decodeAudioData(await f.arrayBuffer());
  analyze(buf.getChannelData(0), buf.sampleRate);
};
$('simulate').onclick = () => {
  const k = Number($('simType').value);
  const rate = 16000;
  const audio = renderVoice(syntheticContour(k, current.morae.length, { baseHz: Number($('voice').value), stepSt: 3.5, jitterSt: 0.3, seed: Date.now() % 1e6 }), rate);
  analyze(audio, rate);
};

loadWords().catch((e) => { $('status').textContent = `Could not load the word list: ${e.message}`; });

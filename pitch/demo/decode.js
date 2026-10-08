// Audio-file decoding for the demo page, plus utterance picking.
// mixToMono and pickUtterance are pure (Node-testable); decodeAudioFile needs a
// browser AudioContext. Nothing here touches the network: audio stays in the page.

/** Average any number of channels into one Float32Array. */
export function mixToMono(channels) {
  if (!channels || channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const len = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(len);
  const n = channels.length;
  for (const ch of channels) {
    for (let i = 0; i < len; i++) out[i] += ch[i];
  }
  for (let i = 0; i < len; i++) out[i] /= n;
  return out;
}

const FLOOR_DB = -100;

function percentile(sorted, p) {
  if (sorted.length === 0) return FLOOR_DB;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

/**
 * Find the main speech region in a recording (phone voice memos often have
 * seconds of silence / handling noise around the word).
 *
 * Short-time energy on 20 ms frames (10 ms hop); threshold relative to the noise
 * floor and the loudest frames; runs above threshold separated by < mergeGap are
 * merged (っ and stop closures make gaps); the run with the most energy wins, and
 * close neighbours with real energy are added. Padded by `pad` on each side and
 * capped at maxSec, centred on the energy mass.
 *
 * @param {Float32Array} samples mono samples
 * @param {number} rate sample rate (Hz)
 * @returns {{ samples: Float32Array, start: number, end: number }} start/end in seconds
 */
export function pickUtterance(samples, rate, { maxSec = 4, pad = 0.15, mergeGap = 0.25, frame = 0.02, hop = 0.01 } = {}) {
  const total = samples.length / rate;
  const win = Math.max(1, Math.round(frame * rate));
  const step = Math.max(1, Math.round(hop * rate));
  const nFrames = samples.length >= win ? Math.floor((samples.length - win) / step) + 1 : 0;

  const cut = (s, e) => {
    s = Math.max(0, s); e = Math.min(total, e);
    const i0 = Math.max(0, Math.floor(s * rate)), i1 = Math.min(samples.length, Math.ceil(e * rate));
    return { samples: samples.slice(i0, i1), start: i0 / rate, end: i1 / rate };
  };
  // Cap a [s, e] region at maxSec, centred on the energy mass inside it.
  const capped = (s, e, power) => {
    if (e - s <= maxSec) return cut(s, e);
    let m = 0, mt = 0;
    const f0 = Math.max(0, Math.floor(s / hop)), f1 = Math.min(nFrames - 1, Math.floor(e / hop));
    for (let f = f0; f <= f1; f++) { const p = power ? power[f] : 1; m += p; mt += p * (f * hop + frame / 2); }
    const c = m > 0 ? mt / m : (s + e) / 2;
    let a = c - maxSec / 2;
    a = Math.min(Math.max(a, s), e - maxSec);
    return cut(a, a + maxSec);
  };

  if (nFrames < 3) return capped(0, total, null);

  const power = new Float64Array(nFrames);
  const db = new Float64Array(nFrames);
  for (let f = 0; f < nFrames; f++) {
    let acc = 0;
    const o = f * step;
    for (let i = 0; i < win; i++) { const v = samples[o + i]; acc += v * v; }
    power[f] = acc / win;
    db[f] = Math.max(FLOOR_DB, 10 * Math.log10(power[f] + 1e-12));
  }
  const sorted = Array.from(db).sort((a, b) => a - b);
  const floor = percentile(sorted, 0.1);
  const peak = percentile(sorted, 0.99);
  if (peak - floor < 6) return capped(0, total, power); // no clear speech/silence contrast

  const thr = Math.max(floor + 0.35 * (peak - floor), peak - 35, floor + 6);

  // Runs of frames above threshold.
  let runs = [];
  for (let f = 0; f < nFrames; f++) {
    if (db[f] <= thr) continue;
    const last = runs[runs.length - 1];
    if (last && last.f1 === f - 1) last.f1 = f;
    else runs.push({ f0: f, f1: f });
  }
  if (runs.length === 0) return capped(0, total, power);

  // Merge runs separated by short gaps.
  const gapFrames = Math.round(mergeGap / hop);
  const merged = [runs[0]];
  for (const r of runs.slice(1)) {
    const last = merged[merged.length - 1];
    if (r.f0 - last.f1 - 1 < gapFrames) last.f1 = r.f1;
    else merged.push({ ...r });
  }
  runs = merged;
  for (const r of runs) {
    r.mass = 0;
    for (let f = r.f0; f <= r.f1; f++) if (db[f] > thr) r.mass += power[f];
  }

  let bi = 0;
  for (let i = 1; i < runs.length; i++) if (runs[i].mass > runs[bi].mass) bi = i;
  // Add close neighbours with real energy (e.g. a slight pause before が).
  const nearFrames = Math.round(0.4 / hop);
  let lo = bi, hi = bi;
  while (lo > 0 && runs[lo].f0 - runs[lo - 1].f1 <= nearFrames && runs[lo - 1].mass >= 0.1 * runs[bi].mass) lo--;
  while (hi < runs.length - 1 && runs[hi + 1].f0 - runs[hi].f1 <= nearFrames && runs[hi + 1].mass >= 0.1 * runs[bi].mass) hi++;

  const s = runs[lo].f0 * hop - pad;
  const e = runs[hi].f1 * hop + frame + pad;
  return capped(Math.max(0, s), Math.min(total, e), power);
}

const DECODE_ERROR = 'このブラウザではこの音声ファイルを読み込めませんでした。iPhone は Safari、Android は Chrome で開くか、wav に変換して試してください';

/**
 * A context used only for decodeAudioData. This runs after `await file.arrayBuffer()`,
 * i.e. outside the user gesture: a suspended AudioContext still decodes (Safari
 * included), and it is closed right after. If no AudioContext can be constructed
 * (missing, or the browser's per-page limit is hit), fall back to an
 * OfflineAudioContext, which never touches the audio output at all.
 */
function makeDecodeContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) { try { return new Ctx(); } catch { /* fall through */ } }
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (Off) { try { return new Off(1, 1, 44100); } catch { /* unsupported */ } }
  return null;
}

/**
 * Decode an audio file (browser only) to mono samples.
 * @param {ArrayBuffer} arrayBuffer file contents
 * @returns {Promise<{ samples: Float32Array, rate: number, duration: number }>}
 */
export async function decodeAudioFile(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('ファイルが空です');
  const ctx = makeDecodeContext();
  if (!ctx) throw new Error('このブラウザは音声ファイルの読み込みに対応していません');
  try {
    // decodeAudioData detaches the buffer; pass a copy so callers keep theirs.
    const copy = arrayBuffer.slice(0);
    const buf = await new Promise((resolve, reject) => {
      let settled = false;
      const ok = (b) => { if (!settled) { settled = true; resolve(b); } };
      const fail = (e) => { if (!settled) { settled = true; reject(e); } };
      try {
        // Callback form for old Safari; promise form where it is returned.
        const p = ctx.decodeAudioData(copy, ok, fail);
        if (p && typeof p.then === 'function') p.then(ok, fail);
      } catch (e) { fail(e); }
    });
    if (!buf || !buf.length) throw new Error('empty');
    const channels = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c));
    const samples = mixToMono(channels);
    return { samples, rate: buf.sampleRate, duration: samples.length / buf.sampleRate };
  } catch (e) {
    const err = new Error(DECODE_ERROR);
    err.cause = e;
    throw err;
  } finally {
    try { const r = ctx.close && ctx.close(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
  }
}

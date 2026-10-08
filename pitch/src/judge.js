// Pass/fail judgement: where does the user's pitch drop?
//
// Pipeline: F0 track → clean (octave fix, median filter, semitones) →
// split the voiced span into n+1 equal mora slots (Japanese is mora-timed) →
// one value per mora → fit every possible H/L template (k = 0..n) →
// the best-fitting k is the detected downstep → compare with the dictionary.

import { accentType, pitchPattern } from './accent.js';
import { consonantClass } from './mora.js';

export const DEFAULTS = {
  fmin: 60, // Hz
  fmax: 600, // Hz
  minClarity: 0.8, // pitchy clarity / SwiftF0 confidence
  minRunFrames: 3, // ignore voiced blips shorter than this
  medianWidth: 5, // frames
  minStep: 1.2, // semitones; a smaller H/L contrast counts as "flat"
  maxDeclination: 0.6, // semitones per mora of natural downdrift the fit may absorb
  energyFloorDb: -30, // energy span threshold, relative to the loud frames
  segmentation: 'auto', // 'auto' = use energy/voicing cues when available, 'equal' = equal slots
  evidenceWeight: 1.0, // reward for putting a boundary on a cue (vs. the duration prior)
  particle: true, // false = isolated word without が (then flat and tail-high look the same)
};

/** Hz → semitones relative to 100 Hz. */
export const hzToSt = (hz) => 12 * Math.log2(hz / 100);

function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Clean an F0 track. Returns semitone values (NaN = unvoiced) per frame.
 * @param {{times:number[], f0:number[], clarity?:number[]}} track
 */
export function cleanTrack(track, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = track.f0.length;
  const st = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const hz = track.f0[i];
    const c = track.clarity ? track.clarity[i] : 1;
    if (hz >= o.fmin && hz <= o.fmax && c >= o.minClarity) st[i] = hzToSt(hz);
  }
  // Drop voiced runs that are too short to be speech.
  for (let i = 0; i < n; ) {
    if (Number.isNaN(st[i])) { i++; continue; }
    let j = i;
    while (j < n && !Number.isNaN(st[j])) j++;
    if (j - i < o.minRunFrames) for (let x = i; x < j; x++) st[x] = NaN;
    i = j;
  }
  // Octave-error fix: pull frames that sit ~an octave away from the utterance median.
  const med = median(st.filter((v) => !Number.isNaN(v)));
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(st[i])) continue;
    while (st[i] - med > 9) st[i] -= 12;
    while (med - st[i] > 9) st[i] += 12;
  }
  // Median filter over voiced neighbours only.
  const h = o.medianWidth >> 1;
  const out = st.slice();
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(st[i])) continue;
    const win = [];
    for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) if (!Number.isNaN(st[j])) win.push(st[j]);
    out[i] = median(win);
  }
  return out;
}

/**
 * Least-squares fit v ≈ a + b·p + c·i, where i is the mora index and c is a
 * downdrift slope limited to [−maxDecl, 0] (grid search; a, b closed form).
 * Bounding c keeps it from "explaining away" a real downstep.
 */
function fitTemplate(values, pattern, maxDecl) {
  let best = null;
  for (let step = 0; step <= 6; step++) {
    const c = -(maxDecl * step) / 6;
    const pts = values.flatMap((v, i) => (Number.isNaN(v) ? [] : [[pattern[i], v - c * i]]));
    const m = pts.length;
    const mp = pts.reduce((s, [p]) => s + p, 0) / m;
    const mv = pts.reduce((s, [, v]) => s + v, 0) / m;
    let spp = 0, spv = 0;
    for (const [p, v] of pts) { spp += (p - mp) ** 2; spv += (p - mp) * (v - mv); }
    const b = spp > 0 ? spv / spp : 0;
    const a = mv - b * mp;
    // Tiny penalty on c so a perfect fit without downdrift is preferred.
    const sse = pts.reduce((s, [p, v]) => s + (v - a - b * p) ** 2, 0) + 0.01 * c * c;
    if (!best || sse < best.sse) best = { a, b, c, sse };
  }
  return best;
}

/**
 * Start/end of the utterance. Voicing alone misses a devoiced first mora
 * (し in した), so extend to where the energy starts, by at most ~one mora.
 */
function utteranceSpan(track, voicedIdx, slots, o) {
  let t0 = track.times[voicedIdx[0]];
  let t1 = track.times[voicedIdx[voicedIdx.length - 1]];
  if (!track.energyDb) return [t0, t1];
  const db = track.energyDb;
  const loud = [...db].filter(Number.isFinite).sort((a, b) => a - b);
  const ref = loud[Math.floor(loud.length * 0.95)];
  const on = db.map((d) => d >= ref + o.energyFloorDb);
  const maxExt = (t1 - t0) / Math.max(1, slots - 1);
  let i = voicedIdx[0];
  while (i > 0 && on[i - 1] && t0 - track.times[i - 1] <= maxExt) i--;
  let j = voicedIdx[voicedIdx.length - 1];
  while (j < db.length - 1 && on[j + 1] && track.times[j + 1] - t1 <= maxExt) j++;
  return [track.times[i], track.times[j]];
}

/**
 * Mora boundaries from acoustic cues. Most morae start with a consonant, which
 * shows up as a voicing break (voiceless consonant, っ) or an energy fall
 * (nasal, voiced stop, flap). We know the morae, so we know which boundaries
 * should carry such a cue; vowel-initial morae (う in おとうと, ー) rely on the
 * duration prior only. A small dynamic programme picks the boundary set that
 * best trades "close to equal mora length" against "on a cue".
 * @returns {number[]} boundary frame indices, length slots + 1 (first = i0, last = i1 + 1)
 */
export function segmentFrames(track, st, i0, i1, labels, o = DEFAULTS) {
  const slots = labels.length;
  const F = i1 - i0 + 1;
  const equal = () => Array.from({ length: slots + 1 }, (_, j) => i0 + Math.round((j * F) / slots));
  if (o.segmentation === 'equal' || F < slots * 3) return equal();
  const voiced = (i) => i >= 0 && i < st.length && !Number.isNaN(st[i]);
  const E = track.energyDb
    ? track.energyDb.map((_, i) => {
        let s = 0, c = 0;
        for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < track.energyDb.length) { s += track.energyDb[j]; c++; }
        return s / c;
      })
    : null;
  const hop = track.times[1] - track.times[0];
  const look = Math.max(1, Math.round(0.03 / hop));
  // Cue strength at frame i = "a mora could start here".
  const cue = new Array(st.length).fill(0);
  // Skip the last few frames: the final vowel's decay is not a consonant.
  for (let i = i0 + 2; i <= i1 - look - 2; i++) {
    const off = voiced(i - 1) && !voiced(i) ? 1 : 0;
    const fall = E ? Math.max(0, Math.min(1, (E[i - 1] - Math.min(...E.slice(i, Math.min(i + look + 1, i1 - 1)))) / 12)) : 0;
    cue[i] = Math.max(off, fall);
  }
  const weight = labels.map((l) => (consonantClass(l) === 'vowel' ? 0 : 1));
  const prior = labels.map((_, j) => (j === slots - 1 ? 1.2 : 1));
  const ps = prior.reduce((a, b) => a + b, 0);
  const D = prior.map((p) => (p / ps) * F);
  // cost[j][b]: best cost with slot j ending at frame b (exclusive).
  const INF = Infinity;
  let prev = new Map([[i0, 0]]);
  const back = [];
  for (let j = 0; j < slots; j++) {
    const cur = new Map();
    const bk = new Map();
    const lo = Math.max(1, Math.round(0.35 * D[j])), hi = Math.round(2.5 * D[j]);
    const ends = j === slots - 1 ? [i1 + 1] : null;
    for (const [a, ca] of prev) {
      for (let L = lo; L <= hi; L++) {
        const b = a + L;
        if (b > i1 + 1 || (ends && b !== i1 + 1)) continue;
        if (!ends && b > i1) continue;
        const dur = ((L - D[j]) / D[j]) ** 2;
        const ev = j < slots - 1 ? weight[j + 1] * cue[b] : 0;
        const c = ca + dur - o.evidenceWeight * ev;
        if (c < (cur.get(b) ?? INF)) { cur.set(b, c); bk.set(b, a); }
      }
    }
    if (cur.size === 0) return equal();
    back.push(bk);
    prev = cur;
  }
  const out = [i1 + 1];
  for (let j = slots - 1; j >= 0; j--) out.unshift(back[j].get(out[0]));
  return out;
}

/**
 * Judge one "<word>が" recording.
 * @param {{times:number[], f0:number[], clarity?:number[], energyDb?:number[]}} track F0 track (Hz)
 * @param {{morae:string[], accent:number[]}} word morae of the word (without が), accepted downsteps
 * @returns judgement object, or {error} if there is not enough voice.
 */
export function judge(track, word, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = word.morae.length;
  const slots = o.particle ? n + 1 : n; // + が
  const st = cleanTrack(track, o);
  const voicedIdx = st.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (voicedIdx.length < 10) return { error: 'no-voice', st };

  const [t0, t1] = utteranceSpan(track, voicedIdx, slots, o);
  if (t1 - t0 < 0.15 * slots * 0.5) return { error: 'too-short', st };

  const labels = o.particle ? [...word.morae, 'が'] : [...word.morae];
  const i0 = track.times.findIndex((t) => t >= t0);
  let i1 = i0;
  while (i1 + 1 < track.times.length && track.times[i1 + 1] <= t1) i1++;
  const bounds = segmentFrames(track, st, i0, i1, labels, o);
  const hop = track.times[1] - track.times[0];
  const segments = [];
  for (let s = 0; s < slots; s++) {
    const vals = [];
    for (let i = bounds[s]; i < bounds[s + 1]; i++) if (!Number.isNaN(st[i])) vals.push(st[i]);
    const start = track.times[bounds[s]] - hop / 2;
    const end = (bounds[s + 1] <= i1 ? track.times[bounds[s + 1]] : track.times[i1] + hop) - hop / 2;
    segments.push({ label: labels[s], start, end, value: median(vals), voicedFrames: vals.length });
  }
  // A devoiced mora (e.g. し in した) has no F0 and simply drops out of the fit.
  const values = segments.map((s) => s.value);
  if (values.filter((v) => !Number.isNaN(v)).length < 2) return { error: 'no-voice', st };

  const candidates = [];
  // Without が, tail-high (k = n) is indistinguishable from flat: skip it.
  for (let k = 0; k <= (o.particle ? n : n - 1); k++) {
    const pattern = pitchPattern(k, n).slice(0, slots);
    const fit = fitTemplate(values, pattern, o.maxDeclination);
    candidates.push({ k, type: accentType(k, n), ...fit });
  }
  // A template only explains the data if high really is higher than low.
  const valid = candidates.filter((c) => c.b >= o.minStep);
  let detected;
  let flat = false;
  if (valid.length === 0) {
    // Monotone speech: no real rise or fall anywhere → reads as flat.
    detected = candidates[0];
    flat = true;
  } else {
    detected = valid.reduce((best, c) => (c.sse < best.sse ? c : best));
  }
  const ranked = [...candidates].sort((a, b) => a.sse - b.sse);
  const others = ranked.filter((c) => c.k !== detected.k);
  const spread = Math.max(...values.filter((v) => !Number.isNaN(v))) - Math.min(...values.filter((v) => !Number.isNaN(v)));
  const margin = others.length ? (others[0].sse - detected.sse) / Math.max(1e-6, spread * spread) : 1;

  const expected = o.particle ? word.accent : [...new Set(word.accent.map((k) => (k === n ? 0 : k)))];
  const pass = expected.includes(detected.k);
  return {
    pass,
    detectedK: detected.k,
    detectedType: detected.type,
    expectedK: expected,
    expectedType: expected.map((k) => accentType(k, n)),
    verdict: verdictFor(detected.k, expected[0]),
    flat,
    confidence: flat ? 0.3 : Math.max(0, Math.min(1, margin)),
    stepSt: detected.b,
    segments,
    candidates,
    st,
    span: [t0, t1],
  };
}

function verdictFor(got, want) {
  if (got === want) return 'match';
  if (want === 0) return 'unexpected-drop'; // should stay high through が
  if (got === 0) return 'missing-drop';
  return got < want ? 'drop-too-early' : 'drop-too-late';
}

// Pass/fail judgement: where does the user's pitch drop?
//
// Pipeline: F0 track → clean (octave fix, median filter, semitones) →
// split the voiced span into n+1 equal mora slots (Japanese is mora-timed) →
// one value per mora → fit every possible H/L template (k = 0..n) →
// the best-fitting k is the detected downstep → compare with the dictionary.

import { accentType, pitchPattern } from './accent.js';

export const DEFAULTS = {
  fmin: 60, // Hz
  fmax: 600, // Hz
  minClarity: 0.8, // pitchy clarity / SwiftF0 confidence
  minRunFrames: 3, // ignore voiced blips shorter than this
  medianWidth: 5, // frames
  minStep: 1.2, // semitones; a smaller H/L contrast counts as "flat"
  maxDeclination: 0.6, // semitones per mora of natural downdrift the fit may absorb
  energyFloorDb: -30, // energy span threshold, relative to the loud frames
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
 * Judge one "<word>が" recording.
 * @param {{times:number[], f0:number[], clarity?:number[], energyDb?:number[]}} track F0 track (Hz)
 * @param {{morae:string[], accent:number[]}} word morae of the word (without が), accepted downsteps
 * @returns judgement object, or {error} if there is not enough voice.
 */
export function judge(track, word, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = word.morae.length;
  const slots = n + 1; // + が
  const st = cleanTrack(track, o);
  const voicedIdx = st.flatMap((v, i) => (Number.isNaN(v) ? [] : [i]));
  if (voicedIdx.length < 10) return { error: 'no-voice', st };

  const [t0, t1] = utteranceSpan(track, voicedIdx, slots, o);
  if (t1 - t0 < 0.15 * slots * 0.5) return { error: 'too-short', st };

  const dur = (t1 - t0) / slots;
  const segments = [];
  for (let s = 0; s < slots; s++) {
    const start = t0 + s * dur, end = start + dur;
    const vals = [];
    for (const i of voicedIdx) if (track.times[i] >= start && (track.times[i] < end || s === slots - 1)) vals.push(st[i]);
    segments.push({ label: s < n ? word.morae[s] : 'が', start, end, value: median(vals), voicedFrames: vals.length });
  }
  // A devoiced mora (e.g. し in した) has no F0 and simply drops out of the fit.
  const values = segments.map((s) => s.value);
  if (values.filter((v) => !Number.isNaN(v)).length < 2) return { error: 'no-voice', st };

  const candidates = [];
  for (let k = 0; k <= n; k++) {
    const pattern = pitchPattern(k, n);
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

  const expected = word.accent;
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

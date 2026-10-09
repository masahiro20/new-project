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
  noiseMarginDb: 10, // … and at least this far above the noise floor (10th percentile of frame energies)
  bridgeGapS: 0.08, // the start may cross one silent gap this short (stop closure after a devoiced mora)
  tailDropDb: 6, // the utterance ends where the last syllable's energy has fallen this far (reverb tails)
  onsetRiseDb: 6, // energy rise (within 50 ms) that marks the onset of the last syllable
  segmentation: 'auto', // 'auto' = use energy/voicing cues when available, 'equal' = equal slots
  evidenceWeight: 1.0, // reward for putting a boundary on a cue (vs. the duration prior)
  particle: true, // false = isolated word without が (then flat and tail-high look the same)
  breakDipDb: [1, 3], // energy dip (dB) across a voicing break: below [0] not a consonant, full cue at [1]
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
 * Start/end of the utterance, as frame indices [i, j].
 *
 * 1. Start from the voiced span (first to last voiced frame).
 * 2. Voicing alone misses a devoiced first mora (し in した), so extend to where
 *    the energy starts, by at most ~one mora. "Energy" means clearly above both
 *    the loud frames − 30 dB and the recording's own noise floor (low percentile
 *    of the frame energies) + noiseMarginDb: otherwise, in a noisy recording every
 *    frame counts as sound and both ends always run out the full mora.
 *    Going backwards, a short silent gap (≤ bridgeGapS: the closure of a voiceless
 *    stop, as in し|た) is crossed when there is sound again before it, because a
 *    devoiced mora is nearly always followed by a voiceless consonant.
 * 3. The end is where the last syllable's energy has fallen tailDropDb below its
 *    own level (see finalDecayEnd), even if the pitch tracker still reports voice
 *    there: in a room, the reverberant tail keeps the last pitch alive for
 *    0.1–0.5 s after the voice has stopped.
 */
function utteranceSpan(track, voicedIdx, slots, o) {
  const a = voicedIdx[0], z = voicedIdx[voicedIdx.length - 1];
  if (!track.energyDb) return [a, z];
  const T = track.times, db = track.energyDb;
  const fin = [...db].filter(Number.isFinite).sort((x, y) => x - y);
  const ref = fin[Math.floor(fin.length * 0.95)];
  const floor = fin[Math.floor(fin.length * 0.1)];
  const thr = Math.max(ref + o.energyFloorDb, floor + o.noiseMarginDb);
  const on = db.map((d) => d >= thr);
  const maxExt = (T[z] - T[a]) / Math.max(1, slots - 1);

  // Start: extend backwards over sound, crossing at most one short silent gap.
  let i = a, gap = 0, bridged = 0;
  for (let x = a - 1; x >= 0; x--) {
    if (on[x]) {
      if (T[a] - T[x] > maxExt + bridged + gap) break;
      bridged += gap; gap = 0; i = x;
    } else {
      gap += T[x + 1] - T[x];
      if (gap > o.bridgeGapS || bridged > 0) break; // one closure at most
    }
  }
  // End: extend over sound (a devoiced final mora; no gap crossing), then cut the final decay.
  let j = z;
  while (j < db.length - 1 && on[j + 1] && T[j + 1] - T[z] <= maxExt) j++;
  j = Math.max(i, finalDecayEnd(db, i, j, ref, o));
  return [i, j];
}

/**
 * Last frame before the final decay: the end of the last syllable.
 * The last syllable starts at the last onset, i.e. the latest frame whose
 * energy rose at least onsetRiseDb above the lowest of the 50 ms before it
 * (が always has one: the g closure or nasal [ŋ] dips 6–20 dB). From there,
 * follow the running maximum; the end is the frame before the energy first
 * falls tailDropDb below it. With 32 ms energy frames an abrupt stop reaches
 * −3 dB right at the offset, so on clean speech this moves the end by a frame
 * or two at most. In a room the voice stops with a drop of a few dB (the direct
 * sound ends) and then decays at the room's rate while the pitch tracker still
 * hears the last pitch for 0.1–0.5 s; that tail is cut off. Only frames within
 * 25 dB of the loud frames count, so the fluctuations of a deep tail are never
 * taken for an onset.
 */
function finalDecayEnd(db, i0, j, ref, o) {
  const lowest = ref - 25;
  let p = j;
  while (p > i0 && db[p] < lowest) p--;
  let q = i0;
  for (let x = p; x > i0; x--) {
    if (db[x] < lowest) continue;
    let lo = Infinity;
    for (let y = Math.max(i0, x - 5); y < x; y++) lo = Math.min(lo, db[y]);
    if (db[x] - lo >= o.onsetRiseDb) { q = x; break; }
  }
  let peak = -Infinity;
  for (let x = q; x <= p; x++) {
    peak = Math.max(peak, db[x]);
    if (db[x] < peak - o.tailDropDb) return x - 1;
  }
  return p;
}

/**
 * How much a voicing break starting at frame i looks like a consonant.
 * A voiceless consonant (closure, frication, っ) takes energy out of the signal;
 * a pitch tracker that merely loses lock while F0 moves fast inside a vowel
 * (common at a rise or a fall — exactly where the accent is) leaves the energy
 * untouched (within the ~1 dB a steady vowel wobbles). So a break counts as a
 * cue only as far as energy dips across it: none below breakDipDb[0], full from
 * breakDipDb[1] (even a flap or glide dips ~2–4 dB; a stop or fricative 10+ dB).
 * Without an energy track every break counts fully, as before.
 */
function voicingBreakStrength(st, E, i, i1, look, o) {
  if (!E) return 1;
  let j = i;
  while (j <= i1 && Number.isNaN(st[j])) j++;
  // Energy frames are ~30 ms wide: look a little past the gap on both sides.
  const lo = Math.max(0, i - look), hi = Math.min(E.length - 1, j + look);
  let before = -Infinity, after = -Infinity, low = Infinity;
  for (let x = lo; x < i; x++) before = Math.max(before, E[x]);
  for (let x = j; x <= hi; x++) after = Math.max(after, E[x]);
  for (let x = i; x < Math.min(j + 1, E.length); x++) low = Math.min(low, E[x]);
  if (!Number.isFinite(low)) return 1;
  const ref = Number.isFinite(after) ? Math.min(before, after) : before;
  const [d0, d1] = o.breakDipDb;
  return Math.max(0, Math.min(1, (ref - low - d0) / (d1 - d0)));
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
    const off = voiced(i - 1) && !voiced(i) ? voicingBreakStrength(st, E, i, i1, look, o) : 0;
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

  const [i0, i1] = utteranceSpan(track, voicedIdx, slots, o);
  const t0 = track.times[i0], t1 = track.times[i1];
  if (t1 - t0 < 0.15 * slots * 0.5) return { error: 'too-short', st };

  const labels = o.particle ? [...word.morae, 'が'] : [...word.morae];
  const bounds = segmentFrames(track, st, i0, i1, labels, o);
  const hop = track.times[1] - track.times[0];
  const segments = [];
  for (let s = 0; s < slots; s++) {
    const vals = [];
    for (let i = bounds[s]; i < bounds[s + 1]; i++) if (!Number.isNaN(st[i])) vals.push(st[i]);
    const start = track.times[bounds[s]] - hop / 2;
    const end = (bounds[s + 1] <= i1 ? track.times[bounds[s + 1]] : track.times[i1] + hop) - hop / 2;
    // っ is a silent closure (or voiceless frication): it has no pitch of its own.
    // Voiced frames that land in its slot are the tracker window or coarticulation
    // smearing the neighbouring mora's F0 into it, so they are not evidence.
    const silent = consonantClass(labels[s]) === 'geminate';
    segments.push({ label: labels[s], start, end, value: silent ? NaN : median(vals), voicedFrames: vals.length, ...(silent ? { silent } : {}) });
  }
  // A devoiced mora (e.g. し in した) or っ has no F0 and simply drops out of the fit.
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
  // Templates that differ only on morae without F0 (っ, a devoiced mora) predict the
  // same audible contour, so the recording cannot tell them apart (e.g. a drop
  // before vs. after the っ of ごっこ). Treat them as one answer.
  const observable = values.map((v) => !Number.isNaN(v));
  const patternOf = (k) => pitchPattern(k, n).slice(0, slots);
  const sameAudible = (k1, k2) => {
    const p1 = patternOf(k1), p2 = patternOf(k2);
    return p1.every((p, i) => !observable[i] || p === p2[i]);
  };
  const equivalentK = flat ? [detected.k] : valid.filter((c) => sameAudible(c.k, detected.k)).map((c) => c.k);
  const ranked = [...candidates].sort((a, b) => a.sse - b.sse);
  const others = ranked.filter((c) => !equivalentK.includes(c.k));
  const spread = Math.max(...values.filter((v) => !Number.isNaN(v))) - Math.min(...values.filter((v) => !Number.isNaN(v)));
  const margin = others.length ? (others[0].sse - detected.sse) / Math.max(1e-6, spread * spread) : 1;

  const expected = o.particle ? word.accent : [...new Set(word.accent.map((k) => (k === n ? 0 : k)))];
  const hit = equivalentK.find((k) => expected.includes(k));
  if (hit !== undefined && hit !== detected.k) detected = candidates.find((c) => c.k === hit);
  const pass = hit !== undefined;
  return {
    pass,
    detectedK: detected.k,
    detectedType: detected.type,
    equivalentK, // all k the audible contour is consistent with (usually just [detectedK])
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

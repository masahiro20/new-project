// Synthetic pitch lines. Used (1) as the reference "model" contour in the UI
// while we have no licence-cleared native recordings, and (2) by the tests.

import { pitchPattern } from './accent.js';
import { consonantClass } from './mora.js';

export { consonantClass };

/** Small deterministic PRNG (mulberry32) so tests are reproducible. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic F0 track for "<word>が" with downstep k over n word morae.
 * Each mora gets a H/L target; targets are joined by smooth transitions and
 * a gentle declination, like natural Tokyo speech.
 */
export function syntheticContour(k, n, opts = {}) {
  const {
    baseHz = 120, // low tone level
    stepSt = 3.5, // H − L in semitones
    moraDur = 0.16, // seconds
    declSt = 0.4, // downdrift per mora, semitones
    transition = 0.06, // seconds of smoothing
    jitterSt = 0, // random frame noise, semitones
    hop = 0.01,
    lead = 0.2, // silence before/after
    devoiced = [], // mora indices (0-based) without voicing
    durations = null, // optional per-mora durations (seconds)
    seed = 1,
  } = opts;
  const pat = pitchPattern(k, n);
  const durs = durations ?? pat.map(() => moraDur);
  const total = lead * 2 + durs.reduce((a, b) => a + b, 0);
  const frames = Math.round(total / hop);
  const rand = rng(seed);
  const target = new Array(frames).fill(NaN);
  const voiced = new Array(frames).fill(false);
  const bounds = [];
  let t = lead;
  for (let m = 0; m < pat.length; m++) {
    bounds.push([t, t + durs[m]]);
    t += durs[m];
  }
  for (let i = 0; i < frames; i++) {
    const time = i * hop;
    const m = bounds.findIndex(([s, e]) => time >= s && time < e);
    if (m < 0) continue;
    target[i] = pat[m] * stepSt - declSt * m;
    voiced[i] = !devoiced.includes(m);
  }
  // Smooth the step targets (moving average over the transition window).
  const w = Math.max(1, Math.round(transition / hop));
  const times = [], f0 = [], clarity = [], energyDb = [];
  for (let i = 0; i < frames; i++) {
    times.push(i * hop);
    // Voiced ≈ 0 dB, devoiced (fricative noise) ≈ −20 dB, silence −80 dB.
    energyDb.push(voiced[i] ? 0 : Number.isNaN(target[i]) ? -80 : -20);
    if (!voiced[i]) { f0.push(0); clarity.push(0); continue; }
    let s = 0, c = 0;
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < frames && !Number.isNaN(target[j])) { s += target[j]; c++; }
    const st = s / c + (rand() * 2 - 1) * jitterSt;
    f0.push(baseHz * 2 ** (st / 12));
    clarity.push(0.95);
  }
  return { times, f0, clarity, energyDb, bounds };
}

/** Render an F0 track as a buzzy vowel-like waveform (for playback and tests). */
export function renderVoice(track, sampleRate = 16000, { seed = 1, noiseInGaps = true } = {}) {
  const hop = track.times[1] - track.times[0];
  const len = Math.round((track.times[track.times.length - 1] + hop) * sampleRate);
  const out = new Float32Array(len);
  const rand = rng(seed);
  let phase = 0;
  let amp = 0;
  for (let i = 0; i < len; i++) {
    const fi = Math.min(track.f0.length - 1, Math.floor(i / sampleRate / hop));
    const hz = track.f0[fi];
    const on = hz > 0;
    amp += ((on ? 0.5 : 0) - amp) * 0.005; // smooth attack/release
    if (on) phase += (2 * Math.PI * hz) / sampleRate;
    let s = 0;
    if (amp > 1e-4) for (let h = 1; h <= 8; h++) s += Math.sin(h * phase) / h;
    out[i] = amp * s * 0.5;
    // Noise for devoiced morae / voiceless consonants inside the utterance.
    const gap = track.energyDb ? track.energyDb[fi] > -60 : fi > 0 && fi < track.f0.length - 1 && track.f0[fi - 1] + track.f0[fi + 1] > 0;
    if (!on && noiseInGaps && gap) out[i] += (rand() * 2 - 1) * 0.08;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Word-level synthesis with consonants, for segmentation tests/evaluation.
// Each mora = optional consonant + vowel. Consonants are crude but have the
// acoustic cues that matter here: silence (stop closure), noise (fricative,
// burst), lower-energy voicing (nasal, voiced stop) and a voicing break.

// [duration s, voiced?, level dB (voicing), noise dB] for the consonant part.
const CONS = {
  vowel: null,
  stop: [[0.05, false, -80, -80], [0.02, false, -80, -22]], // closure + burst
  affricate: [[0.04, false, -80, -80], [0.05, false, -80, -20]],
  fricative: [[0.07, false, -80, -18]],
  'voiced-stop': [[0.035, true, -24, -80], [0.01, false, -80, -24]],
  'voiced-fricative': [[0.05, true, -18, -26]],
  nasal: [[0.05, true, -12, -80]],
  flap: [[0.02, true, -10, -80]],
  glide: [[0.03, true, -5, -80]],
};

/**
 * Synthesize "<word>が" with consonants and uneven mora durations.
 * @returns {{audio:Float32Array, sampleRate:number, boundaries:number[], track:object}}
 *   boundaries: true mora start times (n+1 slots → n+2 values incl. end)
 */
export function synthesizeWord(morae, k, opts = {}) {
  const {
    sampleRate = 16000, baseHz = 120, stepSt = 3.5, declSt = 0.4, moraDur = 0.15,
    durJitter = 0.25, finalStretch = 1.3, jitterSt = 0.15, seed = 1, lead = 0.25,
    devoiced = [],
  } = opts;
  const rand = rng(seed);
  const all = [...morae, 'が'];
  const pat = pitchPattern(k, morae.length);
  const hop = 0.005;
  // Build frame-level plan: voiced?, voice dB, noise dB, pitch target.
  const plan = [];
  const boundaries = [];
  for (let i = 0; i < Math.round(lead / hop); i++) plan.push(null);
  let t = plan.length * hop;
  const push = (dur, voiced, vdb, ndb, st) => {
    const nf = Math.max(1, Math.round(dur / hop));
    for (let i = 0; i < nf; i++) plan.push({ voiced, vdb, ndb, st });
    t += nf * hop;
  };
  for (let m = 0; m < all.length; m++) {
    boundaries.push(t);
    let dur = moraDur * (1 + (rand() * 2 - 1) * durJitter);
    if (m === all.length - 1) dur *= finalStretch;
    const st = pat[m] * stepSt - declSt * m;
    const cls = consonantClass(all[m]);
    if (cls === 'geminate') { push(dur, false, -80, -80, st); continue; }
    if (cls === 'moraic-nasal') { push(dur, true, -12, -80, st); continue; }
    let used = 0;
    for (const [d, v, vdb, ndb] of CONS[cls] ?? []) { push(d, v, vdb, ndb, st); used += d; }
    const dv = devoiced.includes(m);
    push(Math.max(0.04, dur - used), !dv, dv ? -80 : 0, dv ? -22 : -80, st);
  }
  boundaries.push(t);
  const total = t + lead;
  while (plan.length * hop < total) plan.push(null);
  // Smooth pitch targets across voiced frames (≈ 60 ms window), add jitter.
  const w = Math.round(0.03 / hop);
  const f0 = plan.map((p, i) => {
    if (!p || !p.voiced) return 0;
    let s = 0, c = 0;
    for (let j = i - w; j <= i + w; j++) if (plan[j]) { s += plan[j].st; c++; }
    return baseHz * 2 ** ((s / c + (rand() * 2 - 1) * jitterSt) / 12);
  });
  const len = Math.round(total * sampleRate);
  const audio = new Float32Array(len);
  let phase = 0, va = 0, na = 0, hz = baseHz;
  for (let i = 0; i < len; i++) {
    const fi = Math.min(plan.length - 1, Math.floor(i / sampleRate / hop));
    const p = plan[fi];
    const vt = p && p.voiced ? 10 ** (p.vdb / 20) * 0.5 : 0;
    const nt = p ? 10 ** (p.ndb / 20) * 0.5 : 0;
    va += (vt - va) * 0.01;
    na += (nt - na) * 0.02;
    if (f0[fi] > 0) hz = f0[fi];
    phase += (2 * Math.PI * hz) / sampleRate;
    let s = 0;
    if (va > 1e-5) for (let h = 1; h <= 10; h++) s += Math.sin(h * phase) / h;
    audio[i] = va * s * 0.5 + na * (rand() * 2 - 1);
  }
  return { audio, sampleRate, boundaries };
}

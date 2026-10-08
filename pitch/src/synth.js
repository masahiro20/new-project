// Synthetic pitch lines. Used (1) as the reference "model" contour in the UI
// while we have no licence-cleared native recordings, and (2) by the tests.

import { pitchPattern } from './accent.js';

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

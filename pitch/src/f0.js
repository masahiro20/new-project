// F0 extraction with pitchy (McLeod Pitch Method). The PitchDetector class is
// passed in so the same code runs in the browser (vendored pitchy) and in
// Node tests (node_modules).

/** Low-pass (box) + linear-interpolation resampling. Good enough for F0 work. */
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return Float32Array.from(samples);
  const ratio = fromRate / toRate;
  let src = samples;
  if (ratio > 1) {
    const w = Math.max(1, Math.round(ratio));
    src = new Float32Array(samples.length);
    let acc = 0;
    for (let i = 0; i < samples.length; i++) {
      acc += samples[i];
      if (i >= w) acc -= samples[i - w];
      src[i] = acc / Math.min(i + 1, w);
    }
  }
  const outLen = Math.floor(src.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio, x0 = Math.floor(x), f = x - x0;
    out[i] = src[x0] * (1 - f) + (src[Math.min(x0 + 1, src.length - 1)] ?? 0) * f;
  }
  return out;
}

/**
 * @param {typeof import('pitchy').PitchDetector} PitchDetector
 * @param {Float32Array} samples mono audio
 * @param {number} sampleRate
 * @returns {{times:number[], f0:number[], clarity:number[], energyDb:number[]}} 10 ms frames
 */
export function extractF0(PitchDetector, samples, sampleRate, { hop = 0.01, window = 1024, rate = 16000, minDb = -45 } = {}) {
  const x = resample(samples, sampleRate, rate);
  const detector = PitchDetector.forFloat32Array(window);
  detector.minVolumeDecibels = minDb;
  const step = Math.round(hop * rate);
  const times = [], f0 = [], clarity = [], energyDb = [];
  const buf = new Float32Array(window);
  for (let start = 0; start + window <= x.length; start += step) {
    buf.set(x.subarray(start, start + window));
    const [hz, c] = detector.findPitch(buf, rate);
    times.push((start + window / 2) / rate); // frame centre
    f0.push(Number.isFinite(hz) ? hz : 0);
    clarity.push(Number.isFinite(c) ? c : 0);
    let e = 0;
    for (let i = window / 4; i < (3 * window) / 4; i++) e += buf[i] * buf[i]; // centre half ≈ 32 ms
    energyDb.push(10 * Math.log10(e / (window / 2) + 1e-12));
  }
  return { times, f0, clarity, energyDb };
}

/** Frame energy (dB) at given frame-centre times, ±16 ms around each centre. */
export function energyAt(samples, sampleRate, times, half = 0.016) {
  const h = Math.round(half * sampleRate);
  return times.map((t) => {
    const c = Math.round(t * sampleRate);
    let e = 0, n = 0;
    for (let i = Math.max(0, c - h); i < Math.min(samples.length, c + h); i++) { e += samples[i] * samples[i]; n++; }
    return 10 * Math.log10(e / Math.max(1, n) + 1e-12);
  });
}

/** Scale so the peak sits at `peak` (quiet laptop mics otherwise lose frames). */
export function normalize(samples, peak = 0.9) {
  let m = 0;
  for (const s of samples) m = Math.max(m, Math.abs(s));
  if (m < 1e-4) return samples;
  const g = peak / m;
  return samples.map((s) => s * g);
}

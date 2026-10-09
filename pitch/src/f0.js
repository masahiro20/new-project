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
 * Remove mains hum (50 or 60 Hz and its harmonics) before pitch tracking.
 *
 * A laptop on its charger or a cheap USB mic adds a hum whose harmonics
 * (100, 150, 200 … or 120, 180 …) lie right in the range of the human voice;
 * at a low SNR the pitch tracker locks onto the hum (50 Hz: everything is
 * thrown out as below fmin; 60 Hz: 60/120 Hz is reported as the voice).
 * Hum is a set of stationary spectral lines, which a voice — whose pitch
 * moves, especially in a pitch-accent word — is not. So: measure the
 * long-term spectrum (Hann-windowed DFT of the whole clip) at each harmonic
 * of the best-fitting mains frequency (50/60 Hz ± 0.5 Hz), compare it with
 * the spectrum a few bins to either side. Hum is assumed only when at least
 * two harmonics stand out as lines (≥ minProminenceDb; one line alone can be a
 * voice holding its pitch); then every harmonic standing out by half that is
 * notched out. Each notch is a narrow biquad
 * (bandwidth Hz wide) run forwards and backwards (zero phase, no start-up
 * transient). Without hum nothing stands out and the signal is returned as is.
 * @returns {{samples: Float32Array, removed: number[]}} removed = notched frequencies (Hz)
 */
export function removeHum(samples, rate, { maxHarmonic = 10, minProminenceDb = 15, bandwidth = 3 } = {}) {
  const N = samples.length;
  const T = N / rate;
  if (T < 0.5) return { samples, removed: [] };
  const xw = new Float64Array(N);
  for (let i = 0; i < N; i++) xw[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const power = (f) => { // Goertzel
    const c = 2 * Math.cos((2 * Math.PI * f) / rate);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < N; i++) { const s0 = xw[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    return s1 * s1 + s2 * s2 - c * s1 * s2;
  };
  const prominenceDb = (f) => {
    if (f + 6 / T >= rate / 2) return -Infinity;
    const side = [];
    for (let k = 3; k <= 6; k++) side.push(power(f - k / T), power(f + k / T));
    side.sort((a, b) => a - b);
    return 10 * Math.log10(power(f) / ((side[3] + side[4]) / 2 + 1e-30));
  };
  let best = null;
  for (const mains of [50, 60]) {
    // Fine-tune the mains frequency on its first harmonics (grids drift by up to ~0.5 Hz).
    let fm = mains, top = -Infinity;
    for (let d = -0.5; d <= 0.5001; d += 0.05) {
      let e = 0;
      for (let h = 1; h <= 4; h++) e += power(h * (mains + d));
      if (e > top) { top = e; fm = mains + d; }
    }
    const prom = Array.from({ length: maxHarmonic }, (_, h) => prominenceDb((h + 1) * fm));
    // Hum shows up as several lines; one line alone can be a voice holding its pitch.
    if (prom.filter((p) => p >= minProminenceDb).length < 2) continue;
    // Once the hum is established, weaker harmonics of it are notched too.
    const lines = prom.flatMap((p, h) => (p >= minProminenceDb / 2 ? [(h + 1) * fm] : []));
    if (!best || lines.length > best.length) best = lines;
  }
  if (!best) return { samples, removed: [] };
  // Centre each notch on its line's own peak (the fundamental's estimate × h drifts).
  const peakNear = (f) => {
    let at = f, top = -Infinity;
    for (let d = -0.6; d <= 0.6001; d += 0.05) { const e = power(f + d); if (e > top) { top = e; at = f + d; } }
    return at;
  };
  best = best.map(peakNear);
  let y = Float64Array.from(samples);
  for (const f of best) y = notchZeroPhase(y, rate, f, f / bandwidth);
  return { samples: Float32Array.from(y), removed: best };
}

/** RBJ notch biquad at f (quality q), run forwards then backwards. */
function notchZeroPhase(x, rate, f, q) {
  const w0 = (2 * Math.PI * f) / rate, cw = Math.cos(w0), al = Math.sin(w0) / (2 * q);
  const b0 = 1 / (1 + al), b1 = (-2 * cw) / (1 + al), a1 = b1, a2 = (1 - al) / (1 + al);
  const pass = (src, out, from, to, step) => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = from; i !== to; i += step) {
      const v = b0 * src[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = src[i]; y2 = y1; y1 = v; out[i] = v;
    }
  };
  const y = new Float64Array(x.length);
  pass(x, y, 0, x.length, 1);
  pass(y, y, x.length - 1, -1, -1);
  return y;
}

/**
 * @param {typeof import('pitchy').PitchDetector} PitchDetector
 * @param {Float32Array} samples mono audio
 * @param {number} sampleRate
 * Mains hum is removed first (removeHum) unless dehum is false.
 * @returns {{times:number[], f0:number[], clarity:number[], energyDb:number[]}} 10 ms frames
 */
export function extractF0(PitchDetector, samples, sampleRate, { hop = 0.01, window = 1024, rate = 16000, minDb = -45, dehum = true } = {}) {
  let x = resample(samples, sampleRate, rate);
  if (dehum) x = removeHum(x, rate).samples;
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

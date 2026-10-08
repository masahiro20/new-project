// SwiftF0 pitch engine (optional second F0 engine) on top of ONNX Runtime.
//
// Model: vendor/swiftf0/model.onnx from SwiftF0 v0.3.0 (https://github.com/lars76/swift-f0,
// MIT, Copyright (c) 2025-2026 Lars Nieradzik; see vendor/swiftf0/LICENSE).
//
// This file mirrors swift_f0/core.py at commit d1ba77fe (SwiftF0.detect / SwiftF0._run):
//   SAMPLE_RATE = 16000, HOP = 256, FRAME_PERIOD = HOP / SAMPLE_RATE (16 ms)
//   FMIN = 46.875, FMAX = 2093.75, voiced when confidence >= 0.5
//   Inputs : audio float32 [1, samples], fmin float32 scalar, fmax float32 scalar
//   Outputs: pitch float64 [1, frames] (Hz), confidence float32 [1, frames] (0..1)
//   n frames = max(1, floor(len / HOP)); timestamps = frameIndex * FRAME_PERIOD (no half-hop offset)
//   Long input is processed in windows of WINDOW_FRAMES frames with LEFT_FRAMES of left context
//   and LOOKAHEAD_FRAMES of right context, which reproduces a single whole-signal run.
//   Frames whose hop of audio peaks below SILENCE_PEAK get confidence 0.
// The model does not normalize level; scale very quiet audio (peak < ~-35 dBFS) before calling.
//
// `ort` is passed in (onnxruntime-web in the browser, onnxruntime-node in tests) so this module
// has no import of its own.

export const SAMPLE_RATE = 16000;
export const HOP = 256;
export const FRAME_PERIOD = HOP / SAMPLE_RATE;
export const FMIN = 46.875;
export const FMAX = 2093.75;
export const VOICED_THRESHOLD = 0.5;
const BIN_RATIO = (FMAX / FMIN) ** (1 / 94);
const LOOKAHEAD_FRAMES = 10;
const LEFT_FRAMES = 11;
const WINDOW_FRAMES = 1875;
const SILENCE_PEAK = 1e-3;

/**
 * Resample by linear interpolation. When downsampling, a moving-average prefilter of width
 * round(fromRate/toRate) is applied first to reduce aliasing (SwiftF0's reference uses soxr).
 * @param {Float32Array|number[]} samples
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Float32Array}
 */
export function resampleLinear(samples, fromRate, toRate) {
  if (!(fromRate > 0) || !(toRate > 0)) throw new RangeError('rates must be positive');
  const n = samples.length;
  if (fromRate === toRate) return Float32Array.from(samples);
  if (n === 0) return new Float32Array(0);
  let src = samples;
  const width = Math.round(fromRate / toRate);
  if (width > 1) {
    // Centered moving average via a running sum.
    const out = new Float32Array(n);
    const half = width >> 1;
    let sum = 0;
    let lo = 0;
    let hi = -1;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - half);
      const b = Math.min(n - 1, i - half + width - 1);
      while (hi < b) sum += samples[++hi];
      while (lo < a) sum -= samples[lo++];
      out[i] = sum / (b - a + 1);
    }
    src = out;
  }
  const outLen = Math.max(1, Math.round((n * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const x = i * step;
    const i0 = Math.floor(x);
    if (i0 >= n - 1) {
      out[i] = src[n - 1];
    } else {
      const t = x - i0;
      out[i] = src[i0] * (1 - t) + src[i0 + 1] * t;
    }
  }
  return out;
}

function checkRange(fmin, fmax) {
  const lo = fmin == null ? FMIN : Math.max(FMIN, fmin);
  const hi = fmax == null ? FMAX : Math.min(FMAX, fmax);
  if (!(lo < hi)) throw new RangeError(`require fmin < fmax within ${FMIN}..${FMAX} Hz`);
  if (hi < lo * BIN_RATIO) throw new RangeError(`fmax must be at least ${BIN_RATIO.toFixed(5)} * fmin`);
  return [lo, hi];
}

/**
 * @param {object} ort  onnxruntime-web or onnxruntime-node module namespace
 * @param {string|URL|ArrayBuffer|Uint8Array} modelUrlOrBytes
 * @param {object} [sessionOptions]  passed to ort.InferenceSession.create
 */
export async function createSwiftF0(ort, modelUrlOrBytes, sessionOptions = {}) {
  let model = modelUrlOrBytes;
  if (model instanceof URL) model = model.protocol === 'file:' ? decodeURIComponent(model.pathname) : model.href;
  if (model instanceof ArrayBuffer) model = new Uint8Array(model);
  // Default EP: 'wasm' in onnxruntime-web, 'cpu' in onnxruntime-node.
  const session = await ort.InferenceSession.create(model, sessionOptions);

  // core.py SwiftF0._run: one model call plus the silence gate.
  async function run(audio, fmin, fmax) {
    const feeds = {
      audio: new ort.Tensor('float32', audio, [1, audio.length]),
      fmin: new ort.Tensor('float32', new Float32Array([fmin]), []),
      fmax: new ort.Tensor('float32', new Float32Array([fmax]), []),
    };
    const out = await session.run(feeds);
    const pitch = Float64Array.from(out.pitch.data, Number);
    const confidence = Float64Array.from(out.confidence.data, Number);
    const n = confidence.length;
    for (let f = 0; f < n; f++) {
      // hops = audio[:n*HOP].reshape(n, HOP) if len(audio) >= HOP else audio[None, :]
      const a = audio.length >= HOP ? f * HOP : 0;
      const b = audio.length >= HOP ? Math.min(a + HOP, audio.length) : audio.length;
      let peak = 0;
      for (let i = a; i < b; i++) {
        const v = Math.abs(audio[i]);
        if (v > peak) peak = v;
      }
      if (peak < SILENCE_PEAK) confidence[f] = 0;
    }
    return [pitch, confidence];
  }

  return {
    sampleRate: SAMPLE_RATE,
    framePeriod: FRAME_PERIOD,
    session,
    /**
     * @param {Float32Array} samples mono audio at 16 kHz
     * @param {{fmin?: number, fmax?: number, threshold?: number}} [opts]
     * @returns {Promise<{times:number[], f0:number[], confidence:number[], pitchRaw:number[]}>}
     *   f0 is NaN where confidence < threshold (default 0.5); pitchRaw is the unmasked model pitch.
     */
    async analyze(samples, opts = {}) {
      const [fmin, fmax] = checkRange(opts.fmin, opts.fmax);
      const threshold = opts.threshold ?? VOICED_THRESHOLD;
      const signal = samples instanceof Float32Array ? samples : Float32Array.from(samples);
      if (signal.length === 0) throw new RangeError('audio must not be empty');
      // core.py SwiftF0.detect: windowed batch processing.
      const n = Math.max(1, Math.floor(signal.length / HOP));
      const pitchAll = [];
      const confAll = [];
      for (let start = 0; start < n; start += WINDOW_FRAMES) {
        const end = Math.min(start + WINDOW_FRAMES, n);
        const left = Math.max(0, start - LEFT_FRAMES);
        const window =
          end < n
            ? signal.subarray(left * HOP, (end + LOOKAHEAD_FRAMES) * HOP)
            : signal.subarray(left * HOP);
        const [pitch, conf] = await run(window, fmin, fmax);
        for (let i = start - left; i < end - left && i < pitch.length; i++) {
          pitchAll.push(pitch[i]);
          confAll.push(conf[i]);
        }
      }
      const times = pitchAll.map((_, i) => i * FRAME_PERIOD);
      const f0 = pitchAll.map((p, i) => (confAll[i] >= threshold ? p : NaN));
      return { times, f0, confidence: confAll, pitchRaw: pitchAll };
    },
  };
}

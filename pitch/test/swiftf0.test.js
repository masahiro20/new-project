import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createSwiftF0, resampleLinear, FRAME_PERIOD } from '../src/swiftf0.js';

const MODEL = fileURLToPath(new URL('../vendor/swiftf0/model.onnx', import.meta.url));

let ort = null;
let loadError = null;
try {
  ort = (await import('onnxruntime-node')).default;
} catch (err) {
  loadError = err;
}
const skip = ort ? false : `onnxruntime-node not loadable: ${loadError?.message ?? 'unknown'}`;

// Harmonic-rich exponential sweep f0(t) = f0 * (f1/f0)^(t/T), phase-continuous.
function sweep(sr, seconds, f0, f1) {
  const n = Math.round(sr * seconds);
  const x = new Float32Array(n);
  const k = Math.log(f1 / f0) / seconds;
  const freqAt = (t) => f0 * Math.exp(k * t);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const phase = (2 * Math.PI * f0 * (Math.exp(k * t) - 1)) / k;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(h * phase) / h;
    const fade = Math.min(1, t / 0.02, (seconds - t) / 0.02);
    x[i] = 0.3 * v * fade;
  }
  return { x, freqAt };
}

function median(a) {
  const s = [...a].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

test('resampleLinear keeps length ratio and a low tone', () => {
  const sr = 48000;
  const x = new Float32Array(sr).map((_, i) => Math.sin((2 * Math.PI * 200 * i) / sr));
  const y = resampleLinear(x, sr, 16000);
  assert.equal(y.length, 16000);
  // sample 400 at 16 kHz == t=0.025 s
  assert.ok(Math.abs(y[400] - Math.sin(2 * Math.PI * 200 * 0.025)) < 0.05);
  assert.deepEqual(Array.from(resampleLinear([1, 2, 3], 16000, 16000)), [1, 2, 3]);
});

test('SwiftF0 tracks a 150->250 Hz harmonic sweep within 3% median error', { skip }, async () => {
  const engine = await createSwiftF0(ort, MODEL);
  assert.equal(engine.sampleRate, 16000);
  const { x, freqAt } = sweep(16000, 2, 150, 250);
  const { times, f0, confidence } = await engine.analyze(x);
  assert.equal(times.length, Math.floor(x.length / 256));
  assert.equal(times[1] - times[0], FRAME_PERIOD);
  const errs = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i] < 0.05 || times[i] > 1.95) continue;
    assert.ok(confidence[i] >= 0 && confidence[i] <= 1);
    if (Number.isNaN(f0[i])) continue;
    errs.push(Math.abs(f0[i] - freqAt(times[i])) / freqAt(times[i]));
  }
  const voicedFrac = errs.length / times.filter((t) => t >= 0.05 && t <= 1.95).length;
  const med = median(errs);
  console.log(`swiftf0: voiced ${(voicedFrac * 100).toFixed(1)}%, median rel err ${(med * 100).toFixed(2)}%`);
  assert.ok(voicedFrac > 0.9, `voiced fraction ${voicedFrac}`);
  assert.ok(med < 0.03, `median error ${med}`);
});

test('SwiftF0 reports silence as unvoiced', { skip }, async () => {
  const engine = await createSwiftF0(ort, MODEL);
  const { f0, confidence } = await engine.analyze(new Float32Array(16000));
  assert.ok(confidence.every((c) => c === 0));
  assert.ok(f0.every(Number.isNaN));
});

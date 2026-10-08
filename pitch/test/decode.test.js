import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixToMono, pickUtterance } from '../demo/decode.js';
import { rng } from '../src/synth.js';

const RATE = 16000;

/** Build a recording from [seconds, amplitude] pieces: amp 0 → low noise, else a 150 Hz tone + noise. */
function build(pieces, { noise = 0.002, seed = 3 } = {}) {
  const rand = rng(seed);
  const total = pieces.reduce((a, [d]) => a + d, 0);
  const out = new Float32Array(Math.round(total * RATE));
  let i = 0;
  for (const [d, amp] of pieces) {
    const n = Math.round(d * RATE);
    for (let k = 0; k < n && i < out.length; k++, i++) {
      out[i] = amp * Math.sin((2 * Math.PI * 150 * i) / RATE) + noise * (rand() * 2 - 1);
    }
  }
  return out;
}

test('mixToMono averages channels and copies a single channel', () => {
  const a = Float32Array.from([1, 0.5, -1]), b = Float32Array.from([0, 0.5, 1]);
  assert.deepEqual(Array.from(mixToMono([a, b])), [0.5, 0.5, 0]);
  const m = mixToMono([a]);
  assert.deepEqual(Array.from(m), Array.from(a));
  assert.notEqual(m, a);
  assert.equal(mixToMono([]).length, 0);
});

test('pickUtterance trims leading and trailing silence, with padding', () => {
  const s = build([[2, 0], [0.8, 0.5], [1.5, 0]]);
  const r = pickUtterance(s, RATE);
  assert.ok(Math.abs(r.start - (2 - 0.15)) < 0.05, `start ${r.start}`);
  assert.ok(Math.abs(r.end - (2.8 + 0.15)) < 0.05, `end ${r.end}`);
  assert.equal(r.samples.length, Math.round((r.end - r.start) * RATE));
});

test('pickUtterance keeps a short clean clip roughly as-is', () => {
  const s = build([[0.05, 0], [0.6, 0.5], [0.05, 0]]);
  const r = pickUtterance(s, RATE);
  assert.equal(r.start, 0);
  assert.ok(r.end > 0.69, `end ${r.end}`);
});

test('pickUtterance keeps a っ-like gap inside the word together', () => {
  const s = build([[1, 0], [0.3, 0.5], [0.15, 0], [0.4, 0.5], [1, 0]]);
  const r = pickUtterance(s, RATE);
  assert.ok(r.start < 1 && r.start > 0.8, `start ${r.start}`);
  assert.ok(r.end > 1.85 && r.end < 2.05, `end ${r.end}`);
});

test('pickUtterance picks the main burst in a long file with a click and caps at maxSec', () => {
  // 12 s: a loud short click at 1 s, the word at 7 s, noise elsewhere.
  const s = build([[1, 0], [0.03, 0.9], [5.97, 0], [0.9, 0.4], [4.1, 0]]);
  const r = pickUtterance(s, RATE);
  assert.ok(r.start > 6.7 && r.start < 7, `start ${r.start}`);
  assert.ok(r.end > 7.9 && r.end < 8.2, `end ${r.end}`);

  // Speech longer than maxSec: capped, centred on the energy.
  const long = build([[1, 0], [6, 0.4], [1, 0]]);
  const c = pickUtterance(long, RATE, { maxSec: 4 });
  assert.ok(Math.abs(c.end - c.start - 4) < 0.02, `len ${c.end - c.start}`);
  assert.ok(Math.abs((c.start + c.end) / 2 - 4) < 0.2, `centre ${(c.start + c.end) / 2}`);
});

test('pickUtterance on pure silence returns at most maxSec', () => {
  const r = pickUtterance(new Float32Array(10 * RATE), RATE, { maxSec: 4 });
  assert.ok(r.end - r.start <= 4.001);
  assert.equal(pickUtterance(new Float32Array(10), RATE).samples.length, 10);
});

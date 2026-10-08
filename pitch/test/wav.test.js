import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWav } from '../src/wav.js';

test('readWav decodes 16-bit PCM stereo to mono', () => {
  const frames = 4, ch = 2, rate = 16000;
  const buf = Buffer.alloc(44 + frames * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + frames * ch * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(frames * ch * 2, 40);
  const vals = [[16384, 16384], [-16384, -16384], [32767, -32768], [0, 0]];
  vals.forEach(([l, r], i) => { buf.writeInt16LE(l, 44 + i * 4); buf.writeInt16LE(r, 46 + i * 4); });
  const { samples, sampleRate } = readWav(buf);
  assert.equal(sampleRate, rate);
  assert.equal(samples.length, frames);
  assert.ok(Math.abs(samples[0] - 0.5) < 1e-6 && Math.abs(samples[1] + 0.5) < 1e-6 && Math.abs(samples[2]) < 1e-4);
});

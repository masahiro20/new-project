// Tests for the pure-JS m4a fallback decoder (demo/m4a/). ffmpeg is the oracle:
// fixtures are generated at test time (synthetic speech, tone, sweep) and
// encoded with ffmpeg's AAC / ALAC encoders, then decoded both by ffmpeg and by
// our decoder. The ffmpeg-dependent tests are skipped when ffmpeg is missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PitchDetector } from 'pitchy';
import { decodeM4A, looksLikeMp4 } from '../demo/m4a/index.js';
import { parseAudioSpecificConfig } from '../demo/m4a/aac.js';
import { SPECTRUM_LENS, SPECTRUM_CODES, SCF_LENS, SCF_CODES } from '../demo/m4a/tables.js';
import { decodeAudioFile, pickUtterance } from '../demo/decode.js';
import { synthesizeWord } from '../src/synth.js';
import { splitMorae } from '../src/mora.js';
import { readWav } from '../src/wav.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const skip = HAS_FFMPEG ? false : 'ffmpeg not installed';
const dir = mkdtempSync(join(tmpdir(), 'pitch-m4a-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

// ---- helpers ------------------------------------------------------------------------

/** Write 16-bit PCM WAV from channel arrays. */
function writeWav(path, chans, rate) {
  const n = chans[0].length, nc = chans.length, b = Buffer.alloc(44 + n * nc * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nc * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(nc, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * nc * 2, 28);
  b.writeUInt16LE(nc * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * nc * 2, 40);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), 44 + 2 * (i * nc + c));
  }
  writeFileSync(path, b);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** ffmpeg's decode, channels averaged to mono (as our decoder mixes). */
function ffmpegDecode(path, channels) {
  const raw = ffmpeg(['-i', path, '-f', 'f32le', '-']);
  const inter = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
  const out = new Float32Array(inter.length / channels);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += inter[i * channels + c];
    out[i] = s / channels;
  }
  return out;
}

/**
 * Best lag of x against ref (cross-correlation over ±maxLag, ≥ AAC's 2112-sample
 * priming). Lags are tried nearest-first and must win clearly, so a periodic
 * signal (a pure tone repeats every few periods) keeps the smallest lag.
 */
function bestLag(ref, x, maxLag = 2112) {
  let best = 0, bestC = -Infinity;
  const n = Math.min(ref.length, x.length);
  for (let a = 0; a <= maxLag; a++) {
    for (const lag of a ? [a, -a] : [0]) {
      let c = 0;
      for (let i = maxLag; i < n - maxLag; i += 2) c += ref[i] * x[i + lag];
      if (c > bestC + 1e-6 * Math.abs(bestC)) { bestC = c; best = lag; }
    }
  }
  return best;
}

/** SNR (dB) of x against ref after cross-correlation alignment, over the overlap. */
function alignedSnr(ref, x) {
  const lag = bestLag(ref, x);
  let sig = 0, err = 0;
  for (let i = 0; i < ref.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= x.length) continue;
    sig += ref[i] * ref[i];
    err += (ref[i] - x[j]) ** 2;
  }
  return { lag, snr: err === 0 ? Infinity : 10 * Math.log10(sig / err) };
}

/** Synthetic "<word>が" at a given rate. */
function speech(kana, k, rate, seed = 5) {
  return synthesizeWord(splitMorae(kana), k, { sampleRate: rate, seed, baseHz: 140 }).audio;
}

const tone = (rate, sec, hz = 440, amp = 0.5) => Float32Array.from({ length: Math.round(rate * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
/** Linear sine sweep f0 → f1 Hz. */
function sweep(rate, sec, f0 = 100, f1 = 4000) {
  const n = Math.round(rate * sec), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / rate; out[i] = 0.5 * Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) / (2 * sec)) * t * t)); }
  return out;
}

let fileNo = 0;
/** Encode channel arrays with ffmpeg; returns the m4a path. */
function encode(chans, rate, args) {
  const wav = join(dir, `in${fileNo}.wav`), out = join(dir, `out${fileNo++}.m4a`);
  writeWav(wav, chans, rate);
  ffmpeg(['-i', wav, ...args, out]);
  return { wav, out };
}

// ---- unit tests (no ffmpeg) ------------------------------------------------------------------

test('Huffman tables are complete prefix codes', () => {
  const check = (lens, codes) => {
    let kraft = 0;
    const seen = new Set();
    for (let i = 0; i < lens.length; i++) {
      kraft += 2 ** -lens[i];
      assert.ok(codes[i] < 2 ** lens[i]);
      seen.add(`${lens[i]}:${codes[i]}`);
    }
    assert.equal(kraft, 1);
    assert.equal(seen.size, lens.length);
  };
  assert.deepEqual(SPECTRUM_LENS.map((l) => l.length), [81, 81, 81, 81, 81, 81, 64, 64, 169, 169, 289]);
  SPECTRUM_LENS.forEach((l, i) => check(l, SPECTRUM_CODES[i]));
  check(SCF_LENS, SCF_CODES);
});

test('AudioSpecificConfig: AAC-LC, explicit HE-AAC (core decoded), unsupported types', () => {
  // AOT 2, 48 kHz (idx 3), mono: 00010 0011 0001 000 → 0x11 0x88
  assert.deepEqual(parseAudioSpecificConfig(Uint8Array.from([0x11, 0x88])),
    { objectType: 2, rate: 48000, rateIdx: 3, channelConfig: 1, sbr: false });
  // AOT 5 (SBR), core 24 kHz (idx 6), stereo, ext rate 48 kHz (idx 3), then AOT 2, GA config 0
  // 00101 0110 0010 0011 00010 0 00 → 0x2b 0x11 0x88 0x00
  assert.deepEqual(parseAudioSpecificConfig(Uint8Array.from([0x2b, 0x11, 0x88, 0x00])),
    { objectType: 2, rate: 24000, rateIdx: 6, channelConfig: 2, sbr: true });
  // AOT 39 (ER AAC-ELD): 11111 000111 …
  assert.throws(() => parseAudioSpecificConfig(Uint8Array.from([0xf8, 0xe6, 0x20, 0x00])), /unsupported audio object type 39/);
});

test('non-MP4 data is rejected with a clear error', () => {
  assert.equal(looksLikeMp4(new Uint8Array(32)), false);
  assert.throws(() => decodeM4A(new Uint8Array(64)), /m4a: no moov box/);
});

// ---- ffmpeg oracle ------------------------------------------------------------------------

const AAC_CASES = [
  { name: 'pure tone 440 Hz, 48 kHz mono, 64k', chans: () => [tone(48000, 2)], rate: 48000, args: ['-c:a', 'aac', '-b:a', '64k'] },
  { name: 'sine sweep, 44.1 kHz mono, 96k', chans: () => [sweep(44100, 3)], rate: 44100, args: ['-c:a', 'aac', '-b:a', '96k'] },
  { name: 'speech さくらが, iPhone-like (48k mono 64k, faststart)', chans: () => [speech('さくら', 0, 48000)], rate: 48000, args: ['-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart'] },
  { name: 'speech さくらが, iPhone-like, moov at end', chans: () => [speech('さくら', 0, 48000)], rate: 48000, args: ['-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1'] },
  { name: 'speech こころが, 44.1 kHz mono', chans: () => [speech('こころ', 2, 44100)], rate: 44100, args: ['-c:a', 'aac', '-b:a', '64k'] },
  { name: 'speech, stereo 48 kHz 128k (M/S)', chans: () => [speech('はし', 1, 48000), speech('はし', 1, 48000, 9).map((v) => 0.6 * v)], rate: 48000, args: ['-c:a', 'aac', '-b:a', '128k'] },
  { name: 'stereo sweep + tone, 44.1 kHz 40k (intensity stereo)', chans: () => [sweep(44100, 3), sweep(44100, 3).map((v, i) => 0.6 * v + 0.1 * Math.sin(i / 3))], rate: 44100, args: ['-c:a', 'aac', '-b:a', '40k', '-aac_is', '1'] },
  { name: 'speech, 16 kHz mono', chans: () => [speech('おとこ', 3, 16000)], rate: 16000, args: ['-c:a', 'aac', '-b:a', '32k'] },
  { name: 'speech, 22.05 kHz mono', chans: () => [speech('いのち', 1, 22050)], rate: 22050, args: ['-c:a', 'aac', '-b:a', '32k'] },
  { name: 'speech, 32 kHz mono', chans: () => [speech('いのち', 1, 32000)], rate: 32000, args: ['-c:a', 'aac', '-b:a', '48k'] },
];

for (const c of AAC_CASES) {
  test(`AAC vs ffmpeg: ${c.name}`, { skip }, (t) => {
    const chans = c.chans();
    const { out } = encode(chans, c.rate, c.args);
    const js = decodeM4A(readFileSync(out));
    assert.equal(js.codec, 'aac');
    assert.equal(js.rate, c.rate);
    assert.equal(js.channels, chans.length);
    // The edit list trims priming and padding: same length as the source.
    assert.equal(js.samples.length, chans[0].length);
    const ref = ffmpegDecode(out, chans.length);
    const { lag, snr } = alignedSnr(ref, js.samples);
    t.diagnostic(`SNR ${snr.toFixed(1)} dB (lag ${lag})`);
    assert.equal(lag, 0);
    assert.ok(snr >= 30, `SNR ${snr.toFixed(1)} dB`);
    // Without PNS (random noise substitution, which no two decoders reproduce
    // sample-for-sample), the output should match ffmpeg to float precision.
    const exact = encode(chans, c.rate, [...c.args, '-aac_pns', '0']).out;
    const r2 = alignedSnr(ffmpegDecode(exact, chans.length), decodeM4A(readFileSync(exact)).samples);
    t.diagnostic(`no-PNS SNR ${r2.snr.toFixed(1)} dB`);
    assert.ok(r2.snr >= 90, `no-PNS SNR ${r2.snr.toFixed(1)} dB`);
  });
}

test('faststart and moov-at-end files decode identically', { skip }, () => {
  const chans = [speech('みずうみ', 3, 48000)];
  const a = decodeM4A(readFileSync(encode(chans, 48000, ['-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart']).out));
  const b = decodeM4A(readFileSync(encode(chans, 48000, ['-c:a', 'aac', '-b:a', '64k']).out));
  assert.deepEqual(a.samples, b.samples);
});

test('ALAC (iPhone "lossless") decodes bit-exactly: 16-bit mono, 24-bit stereo', { skip }, () => {
  const mono = [speech('さくら', 0, 48000)];
  const r1 = decodeM4A(readFileSync(encode(mono, 48000, ['-c:a', 'alac']).out));
  assert.equal(r1.codec, 'alac');
  assert.equal(r1.samples.length, mono[0].length);
  let diff = 0;
  for (let i = 0; i < mono[0].length; i++) diff += Math.abs(r1.samples[i] - Math.round(mono[0][i] * 32767) / 32768);
  assert.equal(diff, 0); // exactly the 16-bit source samples
  const st = [sweep(44100, 1), tone(44100, 1, 330, 0.3)];
  const { out } = encode(st, 44100, ['-c:a', 'alac', '-sample_fmt', 's32p']);
  const r2 = decodeM4A(readFileSync(out));
  assert.equal(r2.channels, 2);
  assert.equal(alignedSnr(ffmpegDecode(out, 2), r2.samples).snr, Infinity);
});

test('fragmented MP4 is refused with a clear error', { skip }, () => {
  const { out } = encode([tone(48000, 1)], 48000, ['-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov']);
  assert.throws(() => decodeM4A(readFileSync(out)), /m4a: fragmented MP4 is not supported/);
});

test('decodeAudioFile falls back to the JS decoder when native decoding is unavailable', { skip }, async () => {
  const { out } = encode([speech('さくら', 0, 48000)], 48000, ['-c:a', 'aac', '-b:a', '64k']);
  const buf = readFileSync(out);
  const r = await decodeAudioFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  assert.equal(r.decoder, 'js-aac');
  assert.equal(r.rate, 48000);
  assert.ok(r.duration > 0.5);
});

// The demo's file path: pickUtterance → normalize → extractF0 → judge.
function demoJudge(samples, rate, kana, k) {
  const u = pickUtterance(samples, rate, { maxSec: 4 });
  return judge(extractF0(PitchDetector, normalize(u.samples), rate), { morae: splitMorae(kana), accent: [k] });
}

const PIPELINE_WORDS = [['さくら', 0], ['はし', 1], ['こころ', 2], ['おとこ', 3], ['いのち', 1], ['みずうみ', 3]];
for (const [kana, k] of PIPELINE_WORDS) {
  test(`pitch pipeline gives the same verdict on wav and iPhone-like m4a: ${kana}が [${k}]`, { skip }, (t) => {
    // Pad with half a second of silence either side, like a voice memo.
    const word = speech(kana, k, 48000, 11);
    const audio = new Float32Array(word.length + 48000);
    audio.set(word, 24000);
    const { wav, out } = encode([audio], 48000, ['-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart']);
    const orig = readWav(readFileSync(wav));
    const dec = decodeM4A(readFileSync(out));
    const a = demoJudge(orig.samples, orig.sampleRate, kana, k);
    const b = demoJudge(dec.samples, dec.rate, kana, k);
    t.diagnostic(`wav: pass=${a.pass} k=${a.detectedK}; m4a: pass=${b.pass} k=${b.detectedK}`);
    assert.equal(a.error, undefined);
    assert.equal(b.error, undefined);
    assert.equal(b.pass, a.pass);
    assert.equal(b.detectedK, a.detectedK);
  });
}

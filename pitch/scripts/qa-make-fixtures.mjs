// QA fixtures for the single-file demo: synthetic "<word>が" recordings dressed up
// like phone voice memos (44.1 kHz, quiet noise floor, 1.5 s lead-in, 1 s tail),
// plus a stereo variant and a long 12 s variant with the word in the middle.
// Each clip is written as .wav and converted with ffmpeg to .m4a (AAC) and .webm (Opus).
// Audio stays out of the repo: pass an output directory outside it.
//
// Usage: node scripts/qa-make-fixtures.mjs <outDir>
// Writes <outDir>/manifest.json: [{ file, format, wordId, kana, surface, accent, spokenK,
//   variant, expectedPass, nodePass, nodeDetectedK }]
//   expectedPass = what the spoken k should give; nodePass = what the Node pipeline
//   (pitchy + judge) actually gives on the .wav, to tell page bugs from judge limits.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { PitchDetector } from 'pitchy';
import { synthesizeWord, rng } from '../src/synth.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { readWav } from '../src/wav.js';

const outDir = resolve(process.argv[2] ?? '');
if (!process.argv[2]) { console.error('usage: node scripts/qa-make-fixtures.mjs <outDir>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const lexicon = JSON.parse(readFileSync(new URL('../data/lexicon-200.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(lexicon.words.map((w) => [w.id, w]));

// [word id, wrong k] — the correct k is the first dictionary k.
const WORDS = [
  ['w0001', 2], // 箸 はし k=1
  ['w0002', 0], // 橋 はし k=2
  ['w0003', 1], // 端 はし k=0
  ['w0026', 1], // 桜 さくら k=0
  ['w0020', 1], // 男 おとこ k=3
  ['w0006', 0], // 花 はな k=2
];
const SR = 44100;

/** 16-bit PCM WAV writer. channels: array of Float32Array (same length). */
function writeWav(path, channels, sampleRate) {
  const nch = channels.length, n = channels[0].length;
  const buf = Buffer.alloc(44 + n * nch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * nch * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(nch, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * nch * 2, 28); buf.writeUInt16LE(nch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * nch * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + (i * nch + c) * 2);
  }
  writeFileSync(path, buf);
}

/** Place `word` at `at` seconds in a buffer of `total` seconds with quiet noise (≈ −55 dBFS). */
function memo(word, at, total, seed, gain = 0.6) {
  const out = new Float32Array(Math.round(total * SR));
  const r = rng(seed);
  for (let i = 0; i < out.length; i++) out[i] = (r() * 2 - 1) * 0.003;
  const off = Math.round(at * SR);
  for (let i = 0; i < word.length && off + i < out.length; i++) out[off + i] += word[i] * gain;
  return out;
}

function nodeJudge(wavPath, w) {
  const { samples, sampleRate } = readWav(readFileSync(wavPath));
  const track = extractF0(PitchDetector, normalize(samples), sampleRate);
  return judge(track, { morae: w.morae, accent: w.accent });
}

const manifest = [];
let seed = 11;
for (const [id, wrongK] of WORDS) {
  const w = byId[id];
  for (const [kind, k] of [['correct', w.accent[0]], ['wrong', wrongK]]) {
    const s = seed++;
    const { audio } = synthesizeWord(w.morae, k, { sampleRate: SR, seed: s, lead: 0.05 });
    const wordDur = audio.length / SR;
    const variants = [['memo', [memo(audio, 1.5, 1.5 + wordDur + 1.0, s)]]];
    // Stereo and long variants for the first three words only (keeps the suite fast).
    if (['w0001', 'w0026', 'w0020'].includes(id)) {
      const L = memo(audio, 1.5, 1.5 + wordDur + 1.0, s, 0.6);
      const R = memo(audio, 1.5, 1.5 + wordDur + 1.0, s + 1000, 0.45);
      variants.push(['stereo', [L, R]]);
      variants.push(['long12s', [memo(audio, (12 - wordDur) / 2, 12, s)]]);
    }
    for (const [variant, chans] of variants) {
      const base = `${id}-${w.kana}-${kind}-k${k}-${variant}`;
      const wav = join(outDir, `${base}.wav`);
      writeWav(wav, chans, SR);
      const r = nodeJudge(wav, w);
      const expectedPass = w.accent.includes(k);
      const files = { wav: `${base}.wav`, m4a: `${base}.m4a`, webm: `${base}.webm` };
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '64k', join(outDir, files.m4a)]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', '48k', join(outDir, files.webm)]);
      for (const [format, file] of Object.entries(files)) {
        manifest.push({ file, format, wordId: id, surface: w.surface, kana: w.kana, accent: w.accent, spokenK: k, kind, variant,
          channels: chans.length, expectedPass, nodePass: r.error ? null : r.pass, nodeDetectedK: r.error ? r.error : r.detectedK });
      }
      console.log(`${base}: expected pass=${expectedPass}, node: ${r.error ?? `k=${r.detectedK} pass=${r.pass}`}`);
    }
  }
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} files → ${outDir}`);

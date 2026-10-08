// Synthetic evaluation of mora segmentation + accent judgement.
// Renders every lexicon word as audio with consonants and uneven mora lengths,
// runs F0 extraction and the judge with equal vs. cue-based segmentation.
// Usage: node scripts/eval-segmentation.mjs [lexicon] [--swiftf0]
import { readFileSync } from 'node:fs';
import { PitchDetector } from 'pitchy';
import { judge } from '../src/judge.js';
import { synthesizeWord } from '../src/synth.js';
import { extractF0 } from '../src/f0.js';

const args = process.argv.slice(2);
const lexFile = args.find((a) => !a.startsWith('--')) ?? 'data/lexicon-200.json';
const words = JSON.parse(readFileSync(new URL(`../${lexFile}`, import.meta.url))).words;

const engines = { pitchy: (audio, sr) => ({ track: extractF0(PitchDetector, audio, sr), opts: {} }) };
if (args.includes('--swiftf0')) {
  const ort = await import('onnxruntime-node');
  const { createSwiftF0 } = await import('../src/swiftf0.js');
  const { energyAt } = await import('../src/f0.js');
  const model = await createSwiftF0(ort, readFileSync(new URL('../vendor/swiftf0/model.onnx', import.meta.url)));
  engines.swiftf0 = async (audio, sr) => {
    const r = await model.analyze(audio);
    return {
      track: { times: r.times, f0: r.f0.map((v) => (Number.isFinite(v) ? v : 0)), clarity: r.confidence, energyDb: energyAt(audio, sr, r.times) },
      opts: { minClarity: 0.5, medianWidth: 3 },
    };
  };
}

// Speakers: [baseHz, stepSt, moraDur, durJitter, finalStretch]
const SPEAKERS = [
  { baseHz: 105, stepSt: 3.5, moraDur: 0.15, durJitter: 0.25, finalStretch: 1.3 },
  { baseHz: 190, stepSt: 3, moraDur: 0.13, durJitter: 0.3, finalStretch: 1.5 },
  { baseHz: 240, stepSt: 2.5, moraDur: 0.17, durJitter: 0.35, finalStretch: 1.1 },
];

const stats = {};
const bump = (key, field, v) => {
  stats[key] ??= { n: 0, correct: 0, passOk: 0, falsePass: 0, wrongN: 0, bErr: [], within: 0, bN: 0 };
  const s = stats[key];
  if (field === 'b') { s.bErr.push(v); s.bN++; if (v <= 0.04) s.within++; } else s[field] += v;
};

let seed = 1;
for (const w of words) {
  const n = w.morae.length;
  const k = w.accent[0];
  const wrong = k === 0 ? n : 0; // flat ↔ a drop: the classic learner error
  for (const sp of SPEAKERS) {
    for (const [spoken, isRight] of [[k, true], ...(w.accent.includes(wrong) ? [] : [[wrong, false]])]) {
      const { audio, sampleRate, boundaries } = synthesizeWord(w.morae, spoken, { ...sp, seed: seed++ });
      for (const [name, eng] of Object.entries(engines)) {
        const { track, opts } = await eng(audio, sampleRate);
        for (const segmentation of ['equal', 'auto']) {
          const key = `${name}/${segmentation}`;
          const r = judge(track, w, { ...opts, segmentation });
          if (r.error) { bump(key, isRight ? 'n' : 'wrongN', 1); continue; }
          if (isRight) {
            bump(key, 'n', 1);
            bump(key, 'correct', r.detectedK === spoken ? 1 : 0);
            bump(key, 'passOk', r.pass ? 1 : 0);
            // Interior boundaries only (word start/end are not mora-internal).
            for (let b = 1; b < r.segments.length; b++) bump(key, 'b', Math.abs(r.segments[b].start - boundaries[b]));
          } else {
            bump(key, 'wrongN', 1);
            bump(key, 'falsePass', r.pass ? 1 : 0);
          }
        }
      }
    }
  }
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '–');
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] ?? NaN; };
console.log(`Words: ${words.length} (${lexFile}), speakers: ${SPEAKERS.length}\n`);
console.log('| engine / segmentation | correct reading passes | detected k exact | wrong reading wrongly passes | boundary error median | boundaries within 40 ms |');
console.log('|---|---|---|---|---|---|');
for (const [key, s] of Object.entries(stats)) {
  console.log(`| ${key} | ${pct(s.passOk, s.n)} | ${pct(s.correct, s.n)} | ${pct(s.falsePass, s.wrongN)} | ${(med(s.bErr) * 1000).toFixed(0)} ms | ${pct(s.within, s.bN)} |`);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { judge } from '../src/judge.js';
import { syntheticContour, renderVoice } from '../src/synth.js';
import { extractF0 } from '../src/f0.js';
import { splitMorae } from '../src/mora.js';

// Representative words for each type ("<word>が").
const WORDS = [
  { kana: 'さくら', k: 0, type: 'heiban' },
  { kana: 'はし', k: 0, type: 'heiban' }, // 端
  { kana: 'ひ', k: 0, type: 'heiban' }, // 日
  { kana: 'がっこう', k: 0, type: 'heiban' },
  { kana: 'はし', k: 1, type: 'atamadaka' }, // 箸
  { kana: 'き', k: 1, type: 'atamadaka' }, // 木
  { kana: 'いのち', k: 1, type: 'atamadaka' },
  { kana: 'こころ', k: 2, type: 'nakadaka' },
  { kana: 'みずうみ', k: 3, type: 'nakadaka' },
  { kana: 'おかあさん', k: 2, type: 'nakadaka' },
  { kana: 'はし', k: 2, type: 'odaka' }, // 橋
  { kana: 'おとこ', k: 3, type: 'odaka' },
  { kana: 'おとうと', k: 4, type: 'odaka' },
];

// Speaker / style variations the judge must survive.
const VARIANTS = [
  { name: 'low voice', baseHz: 100, stepSt: 3.5 },
  { name: 'high voice', baseHz: 210, stepSt: 4 },
  { name: 'small range', baseHz: 130, stepSt: 2 },
  { name: 'strong downdrift', baseHz: 120, stepSt: 4, declSt: 0.8 },
  { name: 'jittery', baseHz: 150, stepSt: 3.5, jitterSt: 0.6, seed: 7 },
  { name: 'fast', baseHz: 120, stepSt: 3, moraDur: 0.11 },
  { name: 'slow, sluggish transitions', baseHz: 120, stepSt: 3, moraDur: 0.25, transition: 0.1 },
];

const word = (w) => ({ morae: splitMorae(w.kana), accent: [w.k] });

for (const w of WORDS) {
  for (const v of VARIANTS) {
    test(`synthetic F0: ${w.kana}が ${w.type} [${w.k}] — ${v.name}`, () => {
      const n = splitMorae(w.kana).length;
      const r = judge(syntheticContour(w.k, n, v), word(w));
      assert.equal(r.error, undefined);
      assert.equal(r.detectedType, w.type);
      assert.equal(r.detectedK, w.k);
      assert.equal(r.pass, true);
    });
  }
}

test('the four types are told apart on the same mora count (はしが ×3, おとこが ×4)', () => {
  for (const [kana, ks] of [['はし', [0, 1, 2]], ['おとこ', [0, 1, 2, 3]]]) {
    const n = splitMorae(kana).length;
    for (const spoken of ks) {
      const got = ks.map((dict) => judge(syntheticContour(spoken, n), { morae: splitMorae(kana), accent: [dict] }).pass);
      assert.deepEqual(got, ks.map((dict) => dict === spoken), `spoken k=${spoken}`);
    }
  }
});

test('odaka vs heiban hinges on が: saying 橋 flat fails with "missing-drop"', () => {
  const r = judge(syntheticContour(0, 2), { morae: ['は', 'し'], accent: [2] });
  assert.equal(r.pass, false);
  assert.equal(r.detectedType, 'heiban');
  assert.equal(r.verdict, 'missing-drop');
});

test('verdicts: too early / too late / unexpected drop', () => {
  const m = splitMorae('みずうみ');
  assert.equal(judge(syntheticContour(1, 4), { morae: m, accent: [3] }).verdict, 'drop-too-early');
  assert.equal(judge(syntheticContour(4, 4), { morae: m, accent: [3] }).verdict, 'drop-too-late');
  assert.equal(judge(syntheticContour(2, 3), { morae: splitMorae('さくら'), accent: [0] }).verdict, 'unexpected-drop');
});

test('a word with two accepted accents passes either way (頭 [2,3])', () => {
  const m = splitMorae('あたま');
  assert.equal(judge(syntheticContour(2, 3), { morae: m, accent: [3, 2] }).pass, true);
  assert.equal(judge(syntheticContour(3, 3), { morae: m, accent: [3, 2] }).pass, true);
  assert.equal(judge(syntheticContour(0, 3), { morae: m, accent: [3, 2] }).pass, false);
});

test('a devoiced mora does not break the judgement (した → し devoiced)', () => {
  // 下 した [0]: heiban, し is often devoiced
  const r = judge(syntheticContour(0, 2, { devoiced: [0] }), { morae: ['し', 'た'], accent: [0] });
  assert.equal(r.detectedType, 'heiban');
  // 舌 した [2]: odaka
  const r2 = judge(syntheticContour(2, 2, { devoiced: [0] }), { morae: ['し', 'た'], accent: [2] });
  assert.equal(r2.detectedType, 'odaka');
});

test('a drawn-out final が still lands in the right slot', () => {
  const r = judge(syntheticContour(3, 3, { durations: [0.15, 0.15, 0.15, 0.24] }), { morae: splitMorae('おとこ'), accent: [3] });
  assert.equal(r.detectedType, 'odaka');
});

test('monotone speech reads as flat', () => {
  const r = judge(syntheticContour(1, 3, { stepSt: 0.3 }), { morae: splitMorae('いのち'), accent: [1] });
  assert.equal(r.flat, true);
  assert.equal(r.detectedType, 'heiban');
  assert.equal(r.pass, false);
});

test('octave errors in the tracker are repaired', () => {
  const c = syntheticContour(2, 3, { baseHz: 110 });
  // Inject a burst of half-pitch errors in the high part.
  const v = c.f0.findIndex((x) => x > 0);
  for (let i = v + 18; i < v + 22; i++) c.f0[i] /= 2;
  assert.equal(judge(c, { morae: splitMorae('こころ'), accent: [2] }).detectedType, 'nakadaka');
});

test('silence → no-voice error', () => {
  const c = syntheticContour(0, 3);
  c.f0 = c.f0.map(() => 0);
  assert.equal(judge(c, { morae: splitMorae('さくら'), accent: [0] }).error, 'no-voice');
});

// End-to-end: render audio → pitchy → judge.
for (const w of WORDS.filter((x) => ['さくら', 'いのち', 'こころ', 'おとこ', 'はし'].includes(x.kana))) {
  for (const baseHz of [110, 200]) {
    test(`audio → pitchy → judge: ${w.kana}が ${w.type} @${baseHz}Hz`, () => {
      const n = splitMorae(w.kana).length;
      for (const sr of [16000, 48000]) {
        const audio = renderVoice(syntheticContour(w.k, n, { baseHz, devoiced: [] }), sr);
        const track = extractF0(PitchDetector, audio, sr);
        const r = judge(track, word(w));
        assert.equal(r.error, undefined);
        assert.equal(r.detectedType, w.type, `sr=${sr}`);
        assert.equal(r.pass, true);
      }
    });
  }
}

test('audio → pitchy → judge: devoiced first mora (舌 したが odaka vs 下 したが heiban)', () => {
  for (const [k, type] of [[2, 'odaka'], [0, 'heiban']]) {
    const audio = renderVoice(syntheticContour(k, 2, { devoiced: [0] }), 16000);
    const r = judge(extractF0(PitchDetector, audio, 16000), { morae: ['し', 'た'], accent: [k] });
    assert.equal(r.detectedType, type);
  }
});

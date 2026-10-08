import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { judge } from '../src/judge.js';
import { synthesizeWord } from '../src/synth.js';
import { extractF0 } from '../src/f0.js';
import { splitMorae, consonantClass } from '../src/mora.js';

test('consonant classes', () => {
  assert.equal(consonantClass('か'), 'stop');
  assert.equal(consonantClass('しゃ'), 'fricative');
  assert.equal(consonantClass('な'), 'nasal');
  assert.equal(consonantClass('う'), 'vowel');
  assert.equal(consonantClass('っ'), 'geminate');
  assert.equal(consonantClass('ん'), 'moraic-nasal');
});

// Words with every kind of mora onset, uneven timing, a stretched final が.
const CASES = [
  ['かがみ', 3], ['さくら', 0], ['こころ', 2], ['がっこう', 0], ['おとうと', 4], ['しんぶん', 0],
  ['いのち', 1], ['みずうみ', 3], ['たまご', 2], ['ちゃわん', 0], ['はし', 2], ['やすみ', 3],
];

test('cue-based segmentation beats equal slots on audio with consonants', () => {
  const err = { equal: [], auto: [] };
  const ok = { equal: 0, auto: 0 };
  let seed = 11;
  for (const [kana, k] of CASES) {
    const morae = splitMorae(kana);
    for (const sp of [{ baseHz: 110, durJitter: 0.3, finalStretch: 1.4 }, { baseHz: 210, durJitter: 0.3, finalStretch: 1.2, moraDur: 0.13 }]) {
      const { audio, sampleRate, boundaries } = synthesizeWord(morae, k, { ...sp, seed: seed++ });
      const track = extractF0(PitchDetector, audio, sampleRate);
      for (const segmentation of ['equal', 'auto']) {
        const r = judge(track, { morae, accent: [k] }, { segmentation });
        assert.equal(r.error, undefined);
        if (r.pass) ok[segmentation]++;
        for (let b = 1; b < r.segments.length; b++) err[segmentation].push(Math.abs(r.segments[b].start - boundaries[b]));
      }
    }
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  const total = CASES.length * 2;
  assert.ok(median(err.auto) < 0.025, `auto median ${median(err.auto)}`);
  assert.ok(median(err.auto) < median(err.equal), 'auto should beat equal');
  assert.ok(ok.auto >= total - 1, `auto passes ${ok.auto}/${total}`);
  assert.ok(ok.auto >= ok.equal);
});

test('isolated word mode (no が): tail-high counts as flat, other drops still found', () => {
  for (const [kana, k, expectK] of [['こころ', 2, 2], ['いのち', 1, 1], ['おとこ', 3, 0], ['さくら', 0, 0]]) {
    const morae = splitMorae(kana);
    const { audio, sampleRate } = synthesizeWord(morae, k, { seed: 3 });
    // Cut off the synthetic が: keep audio up to the end of the word.
    const { boundaries } = synthesizeWord(morae, k, { seed: 3 });
    const cut = audio.subarray(0, Math.round((boundaries[morae.length] + 0.02) * sampleRate));
    const r = judge(extractF0(PitchDetector, cut, sampleRate), { morae, accent: [k] }, { particle: false });
    assert.equal(r.detectedK, expectK, kana);
    assert.equal(r.pass, true, kana);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { judge, segmentFrames, cleanTrack } from '../src/judge.js';
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

// ---------------------------------------------------------------------------
// Boundaries the old cue model got wrong: vowel-initial morae after the drop
// (よ|う in すいようび) and っ.

test('a tracker dropout inside a vowel (no energy dip) is not a consonant cue', () => {
  // 10 ms frames, voiced 0 dB from frame 10 to 89. か: real consonant (energy dip)
  // at frames 56–60, が at 72–74. Frames 46–50: the tracker loses F0 (as pitchy
  // does during a fast pitch fall) but the energy does not move.
  const N = 100, times = [], f0 = [], clarity = [], energyDb = [];
  const inside = (i, a, b) => i >= a && i < b;
  for (let i = 0; i < N; i++) {
    times.push(i * 0.01);
    const utt = inside(i, 10, 90), cons = inside(i, 56, 61) || inside(i, 72, 75);
    const v = utt && !cons && !inside(i, 46, 51);
    energyDb.push(!utt ? -80 : cons ? -25 : 0);
    f0.push(v ? 150 : 0);
    clarity.push(v ? 0.95 : 0);
  }
  const track = { times, f0, clarity, energyDb };
  const b = segmentFrames(track, cleanTrack(track), 10, 89, ['あ', 'い', 'か', 'が']);
  assert.ok(b[2] >= 52 && b[2] <= 57, `か should start at the energy dip, got frame ${b[2]}`);
});

// Words whose drop lands right before a vowel-initial mora (no consonant cue at the
// drop) or next to っ, on three synthetic speakers.
const DROP_CASES = [
  ['すいようび', 3], ['にちようび', 3], ['あんない', 3], ['ざいりょう', 3], ['かかりいん', 3],
  ['かっそうろ', 3], ['こぜにいれ', 3], ['つまようじ', 3], ['おにごっこ', 3], ['かみこっぷ', 3], ['ほっきょく', 1],
];
const SPEAKERS3 = [
  { baseHz: 105, stepSt: 3.5, moraDur: 0.15, durJitter: 0.25, finalStretch: 1.3 },
  { baseHz: 160, stepSt: 2.5, moraDur: 0.17, durJitter: 0.3, finalStretch: 1.2 },
  { baseHz: 220, stepSt: 4, moraDur: 0.13, durJitter: 0.3, finalStretch: 1.5 },
];

test('drop before a vowel-initial mora or next to っ: right reading passes, flat/odaka reading fails', () => {
  let seed = 301;
  for (const [kana, k] of DROP_CASES) {
    const morae = splitMorae(kana);
    const n = morae.length;
    for (const sp of SPEAKERS3) {
      for (const [spoken, want] of [[k, true], [0, false], [n, false]]) {
        const { audio, sampleRate } = synthesizeWord(morae, spoken, { ...sp, seed: seed++ });
        const r = judge(extractF0(PitchDetector, audio, sampleRate), { morae, accent: [k] });
        assert.equal(r.pass, want, `${kana} spoken k=${spoken} (${sp.baseHz} Hz) → detected ${r.detectedK}`);
      }
    }
  }
});

test('っ has no pitch of its own: drops right before and right after it are one answer', () => {
  const morae = splitMorae('おにごっこ');
  const { audio, sampleRate } = synthesizeWord(morae, 3, { seed: 5 });
  const track = extractF0(PitchDetector, audio, sampleRate);
  const r = judge(track, { morae, accent: [3] });
  assert.ok(Number.isNaN(r.segments[3].value) && r.segments[3].silent, 'っ slot carries no value');
  assert.deepEqual([...r.equivalentK].sort(), [3, 4]);
  assert.equal(r.pass, true);
  assert.equal(r.detectedK, 3); // reported as the accepted one
  // A dictionary k = 4 would be the same audible contour (accent on っ does not occur in Tokyo
  // Japanese, but the judge must not pretend it could tell the two apart).
  assert.equal(judge(track, { morae, accent: [4] }).pass, true);
  // Other drops are still told apart: flat and drop-after-に fail.
  assert.equal(judge(track, { morae, accent: [0] }).pass, false);
  assert.equal(judge(track, { morae, accent: [2] }).pass, false);
});

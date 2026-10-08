import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMorae } from '../src/mora.js';
import { accentType, pitchPattern } from '../src/accent.js';

test('splitMorae handles small kana, ん, っ, ー', () => {
  assert.deepEqual(splitMorae('きょうと'), ['きょ', 'う', 'と']);
  assert.deepEqual(splitMorae('がっこう'), ['が', 'っ', 'こ', 'う']);
  assert.deepEqual(splitMorae('しんぶん'), ['し', 'ん', 'ぶ', 'ん']);
  assert.deepEqual(splitMorae('コーヒー'), ['こ', 'ー', 'ひ', 'ー']);
  assert.deepEqual(splitMorae('ちゃわん'), ['ちゃ', 'わ', 'ん']);
});

test('accent type names', () => {
  assert.equal(accentType(0, 3), 'heiban');
  assert.equal(accentType(1, 3), 'atamadaka');
  assert.equal(accentType(2, 3), 'nakadaka');
  assert.equal(accentType(3, 3), 'odaka');
  assert.equal(accentType(1, 1), 'atamadaka'); // 1-mora: k=1 is head-high
});

test('H/L patterns including が', () => {
  assert.deepEqual(pitchPattern(0, 3), [0, 1, 1, 1]); // さくらが
  assert.deepEqual(pitchPattern(1, 3), [1, 0, 0, 0]); // いのちが
  assert.deepEqual(pitchPattern(2, 3), [0, 1, 0, 0]); // こころが
  assert.deepEqual(pitchPattern(3, 3), [0, 1, 1, 0]); // おとこが
  assert.deepEqual(pitchPattern(0, 1), [0, 1]); // ひが (日)
  assert.deepEqual(pitchPattern(1, 1), [1, 0]); // きが (木)
});

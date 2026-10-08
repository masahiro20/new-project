import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitMorae } from '../src/mora.js';
import { accentType } from '../src/accent.js';
import { judge } from '../src/judge.js';
import { syntheticContour } from '../src/synth.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));

for (const [file, min] of [['lexicon-200.json', 200], ['lexicon-2000.json', 2000]]) {
  const lex = load(file);

  test(`${file}: well-formed, ≥${min} words, all four types`, () => {
    assert.ok(lex.words.length >= min, `${lex.words.length} words`);
    assert.match(lex.source.accent, /UniDic/);
    const types = new Set();
    for (const w of lex.words) {
      assert.deepEqual(w.morae, splitMorae(w.kana), w.surface);
      assert.ok(w.accent.length > 0 && w.accent.every((k) => k >= 0 && k <= w.morae.length), w.surface);
      assert.equal(w.type, accentType(w.accent[0], w.morae.length), w.surface);
      types.add(w.type);
    }
    assert.deepEqual([...types].sort(), ['atamadaka', 'heiban', 'nakadaka', 'odaka']);
  });

  test(`${file}: a synthetic model reading of every word passes, and a wrong one fails`, () => {
    for (const w of lex.words) {
      const n = w.morae.length;
      const k = w.accent[0];
      assert.equal(judge(syntheticContour(k, n), w).pass, true, `${w.surface} [${k}]`);
      // Flat vs. any drop: the opposite reading must not pass.
      const wrong = k === 0 ? n : 0;
      if (!w.accent.includes(wrong)) assert.equal(judge(syntheticContour(wrong, n), w).pass, false, `${w.surface} wrong [${wrong}]`);
    }
  });
}

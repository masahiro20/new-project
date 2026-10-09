import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMinimalPairs, classifyAgainstPair, filterPairs, drillQuestion, scoreAnswer, emptyScore, describeClassification, dropJa } from '../demo/practice.js';
import { splitMorae } from '../src/mora.js';
import { rng, synthesizeWord } from '../src/synth.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { PitchDetector } from '../vendor/pitchy.js';

let nid = 0;
const W = (surface, kana, accent, gloss = surface) => ({ id: `w${String(++nid).padStart(4, '0')}`, surface, kana, morae: splitMorae(kana), accent, gloss });

const hashi = [W('箸', 'はし', [1], 'chopsticks'), W('橋', 'はし', [2], 'bridge'), W('端', 'はし', [0], 'edge')];
const kami = [W('神', 'かみ', [1], 'god'), W('紙', 'かみ', [2], 'paper'), W('髪', 'かみ', [2], 'hair')];
const kawa = [W('川', 'かわ', [2]), W('皮', 'かわ', [2])];
const shika = [W('鹿', 'しか', [0, 2], 'deer'), W('歯科', 'しか', [1, 2], 'dentistry')];
const su = [W('酢', 'す', [1]), W('巣', 'す', [0, 1])];
const nou = [W('脳', 'のう', [1]), W('能', 'のう', [1, 0])];
const lone = [W('桜', 'さくら', [0], 'cherry blossom')];
const all = [...hashi, ...kami, ...kawa, ...shika, ...su, ...nou, ...lone];

test('buildMinimalPairs: groups by kana, keeps only groups with ≥ 2 distinguishable accents', () => {
  const g = buildMinimalPairs(all);
  assert.deepEqual(g.map((x) => x.kana), ['はし', 'かみ', 'しか']);
  const h = g[0];
  assert.deepEqual(h.options.map((o) => [o.label, o.k]), [['箸', 1], ['橋', 2], ['端', 0]]);
  assert.deepEqual(h.morae, ['は', 'し']);
});

test('buildMinimalPairs: same-accent homophones merge into one option (紙・髪), not a pair (川・皮)', () => {
  const g = buildMinimalPairs(all);
  const kamiG = g.find((x) => x.kana === 'かみ');
  assert.deepEqual(kamiG.options.map((o) => o.label), ['神', '紙・髪']);
  assert.deepEqual(kamiG.options[1].words.map((w) => w.surface), ['紙', '髪']);
  assert.ok(!g.some((x) => x.kana === 'かわ'));
});

test('buildMinimalPairs: multi-accent words use only their distinctive k', () => {
  const g = buildMinimalPairs(all);
  const s = g.find((x) => x.kana === 'しか');
  assert.deepEqual(s.options.map((o) => [o.label, o.distinct, o.k]), [['鹿', [0], 0], ['歯科', [1], 1]]);
  // 巣[0,1] vs 酢[1]: 酢 has no k of its own → only one usable option → no pair.
  assert.ok(!g.some((x) => x.kana === 'す'));
  // 能[1,0] vs 脳[1] (unsorted accent in the data): same.
  assert.ok(!g.some((x) => x.kana === 'のう'));
});

test('classifyAgainstPair: match / other / none / ambiguous', () => {
  const g = buildMinimalPairs(all);
  const h = g[0];
  const id = (s) => h.options.find((o) => o.label === s).id;
  let c = classifyAgainstPair(2, h, id('橋'));
  assert.equal(c.verdict, 'match');
  assert.equal(c.matchesTarget, true);
  c = classifyAgainstPair(1, h, id('橋'));
  assert.equal(c.verdict, 'other');
  assert.deepEqual(c.matches.map((o) => o.label), ['箸']);
  c = classifyAgainstPair(0, h, id('橋'));
  assert.deepEqual([c.verdict, c.others[0].label], ['other', '端']);
  // A 3-mora drop is not possible for a 2-mora word, but k outside every option → none.
  c = classifyAgainstPair(3, h, id('橋'));
  assert.equal(c.verdict, 'none');
  assert.equal(c.matches.length, 0);
  const s = g.find((x) => x.kana === 'しか');
  c = classifyAgainstPair(2, s, s.options[0].id); // 鹿 target, k=2 is accepted by both
  assert.equal(c.verdict, 'ambiguous');
  assert.equal(c.matchesTarget, true);
  assert.deepEqual(c.others.map((o) => o.label), ['歯科']);
});

test('describeClassification: Japanese verdicts name the word it sounded like', () => {
  const h = buildMinimalPairs(all)[0];
  const id = (s) => h.options.find((o) => o.label === s).id;
  const ok = describeClassification(classifyAgainstPair(2, h, id('橋')), h);
  assert.equal(ok.pass, true);
  assert.match(ok.verdict, /橋/);
  const ng = describeClassification(classifyAgainstPair(1, h, id('橋')), h);
  assert.equal(ng.pass, false);
  assert.match(ng.verdict, /箸/);
  assert.match(ng.reason, /尾高型/);
  const none = describeClassification(classifyAgainstPair(3, h, id('橋')), h);
  assert.match(none.verdict, /一致しません/);
  assert.equal(dropJa(2, ['は', 'し']), '「はし」の後、「が」で下がる');
});

test('filterPairs: kana, katakana, kanji and English gloss', () => {
  const g = buildMinimalPairs(all);
  assert.deepEqual(filterPairs(g, 'ハシ').map((x) => x.kana), ['はし']);
  assert.deepEqual(filterPairs(g, '髪').map((x) => x.kana), ['かみ']);
  assert.deepEqual(filterPairs(g, 'bridge').map((x) => x.kana), ['はし']);
  assert.equal(filterPairs(g, '').length, g.length);
  assert.equal(filterPairs(g, 'zzz').length, 0);
});

test('drillQuestion + scoreAnswer', () => {
  const h = buildMinimalPairs(all)[0];
  const rand = rng(3);
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const q = drillQuestion(h, rand);
    const o = h.options.find((x) => x.id === q.optionId);
    assert.ok(o);
    assert.equal(q.k, o.k);
    assert.ok(q.baseHz >= 115 && q.baseHz <= 200);
    seen.add(q.optionId);
  }
  assert.equal(seen.size, 3);
  let s = emptyScore();
  s = scoreAnswer(s, true); s = scoreAnswer(s, true); s = scoreAnswer(s, false); s = scoreAnswer(s, true);
  assert.deepEqual(s, { correct: 3, total: 4, streak: 1 });
});

test('real lexicon: はし triple, 紙・髪 merged, no same-accent pairs, every option distinguishable', () => {
  const lex = JSON.parse(readFileSync(new URL('../data/lexicon-2000.json', import.meta.url)));
  const g = buildMinimalPairs(lex.words);
  assert.ok(g.length >= 25, `${g.length} groups`);
  const h = g.find((x) => x.kana === 'はし');
  assert.deepEqual(h.options.map((o) => `${o.label}${o.k}`).sort(), ['橋2', '端0', '箸1']);
  assert.deepEqual(g.find((x) => x.kana === 'かみ').options.map((o) => o.label), ['神', '紙・髪']);
  for (const kana of ['かわ', 'くも', 'かぜ', 'じしん']) assert.ok(!g.some((x) => x.kana === kana), kana);
  for (const grp of g) {
    const ks = grp.options.map((o) => o.k);
    assert.equal(new Set(ks).size, ks.length, grp.kana);
    for (const o of grp.options) for (const other of grp.options) if (o !== other) assert.ok(!other.accent.includes(o.k), `${grp.kana} ${o.label}`);
  }
});

test('synthetic sample of each はし option is classified as that option (judge end to end)', () => {
  const h = buildMinimalPairs(hashi);
  for (const o of h[0].options) {
    const { audio, sampleRate } = synthesizeWord(h[0].morae, o.k, { sampleRate: 16000, baseHz: 140, seed: 11 });
    const tr = extractF0(PitchDetector, normalize(audio), sampleRate);
    const r = judge(tr, o.words[0]);
    const c = classifyAgainstPair(r.detectedK, h[0], o.id);
    assert.equal(c.verdict, 'match', `${o.label}: detected ${r.detectedK}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitMorae } from '../src/mora.js';
import {
  buildAnkiTsv, ankiFront, ankiBack, ankiTags, ankiHeader, escapeField, groupMinimalPairs,
  minimalPairGroups, failedWords, ATTRIBUTION,
} from '../demo/anki.js';

const lex = JSON.parse(readFileSync(new URL('../data/lexicon-2000.json', import.meta.url))).words;
const get = (s) => lex.find((w) => w.surface === s && w.kana === 'はし');
const [hashi1, hashi2, hashi0] = ['箸', '橋', '端'].map(get);

test('header: Anki file headers come first, with the UniDic attribution', () => {
  const tsv = buildAnkiTsv([hashi1]);
  const lines = tsv.split('\n');
  assert.deepEqual(lines.slice(0, 6), [
    '#separator:tab', '#html:true', '#notetype:Basic', '#deck:Pitch::Accent', '#columns:Front\tBack\tTags', '#tags column:3',
  ]);
  assert.ok(lines[6].startsWith('#') && lines[6].includes(ATTRIBUTION), lines[6]);
  assert.equal(ATTRIBUTION, 'Accent data: UniDic (NINJAL), BSD licence');
  assert.equal(lines.filter((l) => l && !l.startsWith('#')).length, 1);
  assert.ok(tsv.endsWith('\n'));
  assert.deepEqual(ankiHeader(3).slice(0, 2), ['#separator:tab', '#html:true']);
});

test('every data row has exactly three tab-separated fields', () => {
  const words = lex.slice(0, 300);
  const rows = buildAnkiTsv(words).split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(rows.length, 300);
  for (const r of rows) assert.equal(r.split('\t').length, 3, r);
});

test('escaping: HTML, quotes, tabs and newlines never break a field', () => {
  assert.equal(escapeField('a<b>&"c"'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  assert.equal(escapeField('x\ty'), 'x y');
  assert.equal(escapeField('x\r\ny\nz'), 'x<br>y<br>z');
  const evil = { id: 'w9999', surface: '橋<script>', kana: 'はし', morae: splitMorae('はし'), accent: [2], gloss: 'a\t"b"\nc & d' };
  const tsv = buildAnkiTsv([evil]);
  const row = tsv.split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(row.length, 1);
  const [front, back, tags] = row[0].split('\t');
  assert.ok(front.includes('橋&lt;script&gt;') && !front.includes('<script'));
  assert.ok(back.includes('a &quot;b&quot;<br>c &amp; d'), back);
  assert.equal(tags, 'pitch::odaka p3pitch');
});

test('箸・橋・端: front, back (H/L overline + drop), type, gloss, tags', () => {
  for (const w of [hashi1, hashi2, hashi0]) {
    assert.ok(w, 'word in lexicon');
    assert.match(ankiFront(w), new RegExp(`${w.surface}.*はし`));
  }
  const b1 = ankiBack(hashi1), b2 = ankiBack(hashi2), b0 = ankiBack(hashi0);
  // 箸 (1): H L ＋L — drop after は
  assert.match(b1, /class="h"[^>]*border-top:2px solid currentColor;border-right:2px solid currentColor[^>]*>は</);
  assert.match(b1, /H L ＋L/);
  assert.match(b1, /頭高型［1］ 「は」の後で下がる/);
  assert.match(b1, /chopsticks/);
  // 橋 (2): L H ＋L — drop after し, i.e. on が
  assert.match(b2, /class="l"[^>]*>は</);
  assert.match(b2, /class="h"[^>]*border-right:2px solid currentColor[^>]*>し</);
  assert.match(b2, /L H ＋L/);
  assert.match(b2, /尾高型［2］ 「はし」の後、「が」で下がる/);
  assert.match(b2, /bridge/);
  // 端 (0): L H ＋H — no drop
  assert.doesNotMatch(b0, /border-right/);
  assert.match(b0, /L H ＋H/);
  assert.match(b0, /平板型［0］ 下がり目なし/);
  assert.match(b0, /edge/);
  assert.equal(ankiTags(hashi1), 'pitch::atamadaka p3pitch');
  assert.equal(ankiTags(hashi2), 'pitch::odaka p3pitch');
  assert.equal(ankiTags(hashi0, ['pitch::minimal-pair']), 'pitch::heiban pitch::minimal-pair p3pitch');
});

test('multi-accent words list every accepted accent and tag each type once', () => {
  const w = lex.find((x) => x.accent.length > 1 && new Set(x.accent.map((k) => (k === 0 ? 'h' : k === 1 ? 'a' : k === x.morae.length ? 'o' : 'n'))).size > 1);
  assert.ok(w);
  assert.match(ankiBack(w), /または/);
  assert.equal(ankiTags(w).split(' ').length, new Set(ankiTags(w).split(' ')).size);
});

test('minimal pairs: はし group with three accents; duplicates exported once', () => {
  const own = groupMinimalPairs(lex);
  const g = own.find((x) => x[0].kana === 'はし');
  assert.deepEqual(g.map((w) => w.surface), ['箸', '橋', '端']);
  for (const grp of own) assert.ok(new Set(grp.map((w) => w.accent[0])).size >= 2);
  const groups = minimalPairGroups(lex); // practice.js buildMinimalPairs when available
  assert.ok(groups.length > 10);
  assert.ok(groups.some((x) => x.map((w) => w.surface).join() === '箸,橋,端'));
  const rows = buildAnkiTsv([hashi1, hashi1, hashi2]).split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(rows.length, 2);
});

test('failed words: unique words with at least one failed judgement', () => {
  const s = [{ word: hashi1, pass: true }, { word: hashi2, pass: false }, { word: hashi2, pass: false }, { word: hashi0, pass: false }, { word: hashi1, pass: true }];
  assert.deepEqual(failedWords(s).map((w) => w.surface), ['橋', '端']);
});

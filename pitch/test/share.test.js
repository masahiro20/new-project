import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge } from '../src/judge.js';
import { syntheticContour } from '../src/synth.js';
import { prepareShareCard, drawShareCard, cardAlt, CARD_MARK, CARD_W, CARD_H } from '../demo/share.js';

const lex = JSON.parse(readFileSync(new URL('../data/lexicon-2000.json', import.meta.url))).words;
const hashi = lex.find((w) => w.surface === '橋');

/** A judged synthetic contour (no audio decoding needed). */
function judged(w, k) {
  const track = syntheticContour(k, w.morae.length, { seed: 3 });
  return { word: w, result: judge(track, w), track };
}

test('syntheticContour fixture judges as expected', () => {
  const ok = judged(hashi, 2);
  assert.equal(ok.result.pass, true);
  const bad = judged(hashi, 0);
  assert.equal(bad.result.pass, false);
});

test('card data: word, dictionary H/L, verdict, short reason, mark', () => {
  const d = prepareShareCard(judged(hashi, 2));
  assert.equal(d.surface, '橋');
  assert.equal(d.kanaGa, 'はしが');
  assert.deepEqual(d.morae, ['は', 'し', 'が']);
  assert.deepEqual(d.pattern, [0, 1, 0]);
  assert.equal(d.dropAfter, 1);
  assert.equal(d.typeText, '尾高型［2］');
  assert.equal(d.pass, true);
  assert.equal(d.verdictText, '✓ 合格');
  assert.equal(d.reason, '下がり目の位置が辞書と一致');
  assert.equal(d.mark, CARD_MARK);
  assert.match(cardAlt(d), /橋.*合格/);
});

test('card data: failed attempt says what you did vs the dictionary', () => {
  const d = prepareShareCard(judged(hashi, 0));
  assert.equal(d.pass, false);
  assert.equal(d.verdictText, '✗ もう一度');
  assert.equal(d.reason, '下がり目がありませんでした');
  assert.match(d.reasonDetail, /あなた: 平板型［0］ ／ 辞書: 尾高型［2］/);
});

test('plot: normalised curve and mora boundaries in [0, 1], ordered, one slot per mora', () => {
  const { plot } = prepareShareCard(judged(hashi, 2));
  assert.equal(plot.segments.length, 3);
  assert.deepEqual(plot.segments.map((s) => s.label), ['は', 'し', 'が']);
  assert.deepEqual(plot.segments.map((s) => s.hi), [false, true, false]);
  let prev = 0;
  for (const s of plot.segments) {
    assert.ok(s.x0 >= prev - 1e-9 && s.x1 > s.x0 && s.x1 <= 1, JSON.stringify(s));
    assert.ok(s.y === null || (s.y >= 0 && s.y <= 1));
    prev = s.x1;
  }
  const pts = plot.curve.filter(Boolean);
  assert.ok(pts.length > 20, `${pts.length} points`);
  for (const [x, y] of pts) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
  assert.ok(plot.curve[0] && plot.curve[plot.curve.length - 1], 'no leading/trailing gaps');
  // し is high, が low: the user's dots say so too.
  assert.ok(plot.segments[1].y > plot.segments[2].y);
  assert.equal(plot.expectedDropX, plot.segments[2].x0);
  assert.equal(plot.detectedDropX, plot.segments[2].x0);
});

test('no personal data: no file name / source in the card data', () => {
  const e = { ...judged(hashi, 2), source: { kind: 'file', name: 'my-secret-memo.m4a' } };
  const s = JSON.stringify(prepareShareCard(e));
  assert.doesNotMatch(s, /secret|m4a/);
});

test('errors and missing input give no card', () => {
  assert.equal(prepareShareCard({ word: hashi, result: { error: 'no-voice', st: [] } }), null);
  assert.equal(prepareShareCard({ word: hashi, result: null }), null);
});

test('drawShareCard runs on a stub 2D context and draws the key texts', () => {
  const texts = [];
  const calls = new Set();
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * 20 });
      if (p === 'fillText') return (s, x, y) => { texts.push(String(s)); assert.ok(Number.isFinite(x) && Number.isFinite(y)); };
      return (...a) => { calls.add(p); for (const v of a) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${String(p)} ${a}`); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  for (const k of [2, 0]) {
    texts.length = 0;
    drawShareCard(ctx, prepareShareCard(judged(hashi, k)));
    for (const s of ['橋', CARD_MARK, k === 2 ? '✓ 合格' : '✗ もう一度', 'H', 'L', 'が']) assert.ok(texts.some((t) => t.includes(s)), `${s} drawn`);
  }
  assert.ok(calls.has('fillRect') && calls.has('lineTo') && calls.has('arc'));
  assert.equal(CARD_W, 1200);
  assert.equal(CARD_H, 630);
});

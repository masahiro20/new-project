// 劣化した録音での判定（docs/eval-robustness.md の「改善後」）：発話範囲の端・ハム除去・「が」が聞き取れない場合。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { judge } from '../src/judge.js';
import { extractF0, removeHum } from '../src/f0.js';
import { synthesizeWord, syntheticContour, rng } from '../src/synth.js';
import { splitMorae } from '../src/mora.js';

const SR = 16000;
const word = (kana, k) => ({ morae: splitMorae(kana), accent: [k] });

/** 発話範囲の端の誤差（モーラ単位）。始端の負＝早すぎ、終端の正＝遅すぎ。 */
function spanError(r, boundaries, lead = 0) {
  const b = boundaries.map((t) => t + lead);
  const mora = (b[b.length - 1] - b[0]) / (b.length - 1);
  return [(r.span[0] - b[0]) / mora, (r.span[1] - b[b.length - 1]) / mora];
}

function addNoise(x, snrDb, seed, kind = 'white') {
  const r = rng(seed);
  let n = Float32Array.from(x, () => r() * 2 - 1);
  if (kind === 'pink') { // 1 次の低域通過で近似（低域が強い雑音）
    let y = 0;
    n = n.map((v) => (y = 0.97 * y + 0.03 * v * 10));
  }
  const p = (a) => a.reduce((s, v) => s + v * v, 0) / a.length;
  const g = Math.sqrt(p(x) / p(n) / 10 ** (snrDb / 10));
  return x.map((v, i) => v + n[i] * g);
}

/** 部屋の響き：直接音 ＋ 指数減衰する雑音（RT60、直接音と残響のエネルギー比 DRR）。 */
function reverb(x, rt60, drrDb, seed) {
  const r = rng(seed);
  const len = Math.round(rt60 * SR);
  const h = new Float32Array(len);
  let e = 0;
  for (let i = 48; i < len; i++) { h[i] = (r() * 2 - 1) * Math.exp((-6.91 * i) / SR / rt60); e += h[i] * h[i]; }
  const g = Math.sqrt(10 ** (-drrDb / 10) / e);
  const y = new Float32Array(x.length + len);
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 0) continue;
    y[i] += x[i];
    for (let j = 48; j < len; j++) y[i + j] += x[i] * h[j] * g;
  }
  return y;
}

function hum(len, f, snrDb, ref, seed) {
  const r = rng(seed);
  const amps = [1, 0.5, 0.7, 0.25, 0.35, 0.15, 0.2];
  const ph = amps.map(() => r() * 2 * Math.PI);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) for (let h = 0; h < amps.length; h++) out[i] += amps[h] * Math.sin((2 * Math.PI * (h + 1) * f * i) / SR + ph[h]);
  const p = (a) => a.reduce((s, v) => s + v * v, 0) / a.length;
  const g = Math.sqrt(p(ref) / p(out) / 10 ** (snrDb / 10));
  return out.map((v) => v * g);
}

test('部屋の響き：残響の尾で発話の終わりが伸びない（尾高・平板とも正しく判定）', () => {
  for (const [kana, k] of [['はし', 2], ['はし', 0], ['おとこ', 3], ['こころ', 2]]) {
    const { audio, boundaries } = synthesizeWord(splitMorae(kana), k, { baseHz: 140, seed: 11 });
    const wet = reverb(audio, 0.8, 3, 5);
    const r = judge(extractF0(PitchDetector, wet, SR), word(kana, k));
    assert.equal(r.error, undefined, kana);
    const [, endErr] = spanError(r, boundaries);
    assert.ok(Math.abs(endErr) < 0.5, `${kana} k=${k}: 終端の誤差 ${endErr.toFixed(2)} モーラ`);
    assert.equal(r.pass, true, `${kana} k=${k}: detected ${r.detectedK}`);
  }
});

test('定常ノイズ：雑音の区間まで発話範囲を延ばさない（雑音床からの相対値と立ち上がり）', () => {
  for (const kind of ['white', 'pink']) {
    for (const [kana, k] of [['さくら', 0], ['おとこ', 3], ['いのち', 1]]) {
      const { audio, boundaries } = synthesizeWord(splitMorae(kana), k, { baseHz: 140, seed: 3 });
      const x = addNoise(audio, 15, 9, kind);
      const r = judge(extractF0(PitchDetector, x, SR), word(kana, k));
      assert.equal(r.error, undefined);
      const [s, e] = spanError(r, boundaries);
      assert.ok(s > -0.5 && Math.abs(e) < 0.5, `${kind} ${kana}: span の誤差 ${s.toFixed(2)} / ${e.toFixed(2)}`);
      assert.equal(r.pass, true, `${kind} ${kana}`);
    }
  }
});

test('語頭の無声化＋破裂音：閉鎖を越えて無声化したモーラの始まりまで延ばす（舌 したが・機械 きかいが）', () => {
  for (const [kana, k] of [['した', 2], ['した', 0], ['きかい', 2]]) {
    const { audio, boundaries } = synthesizeWord(splitMorae(kana), k, { baseHz: 140, seed: 4, devoiced: [0] });
    const r = judge(extractF0(PitchDetector, audio, SR), word(kana, k));
    assert.equal(r.error, undefined);
    const [s] = spanError(r, boundaries);
    assert.ok(Math.abs(s) < 0.5, `${kana}: 始端の誤差 ${s.toFixed(2)} モーラ`);
    assert.equal(r.pass, true, `${kana} k=${k}: detected ${r.detectedK}`);
  }
});

test('始端の延長は雑音の中ではなく立ち上がりから（息・環境音を発話に含めない）', () => {
  const { audio, boundaries } = synthesizeWord(splitMorae('さくら'), 0, { baseHz: 140, seed: 2, lead: 0.6 });
  // 発話の 0.6 s 前から一定の雑音（発話の −25 dB）：延長の閾値を超えるが、立ち上がりがない
  const r0 = rng(1);
  const x = Float32Array.from(audio);
  const s0 = Math.round(0.05 * SR), s1 = Math.round((boundaries[0] - 0.01) * SR);
  let peak = 0;
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  for (let i = s0; i < s1; i++) x[i] += (r0() * 2 - 1) * peak * 0.056;
  const r = judge(extractF0(PitchDetector, x, SR), word('さくら', 0));
  const [s] = spanError(r, boundaries);
  assert.ok(s > -0.5, `始端の誤差 ${s.toFixed(2)} モーラ`);
});

test('発話から離れた別の声（背景の話し声）で発話範囲が広がらない', () => {
  const { audio, boundaries } = synthesizeWord(splitMorae('おとこ'), 3, { baseHz: 140, seed: 6, lead: 1.2 });
  const other = synthesizeWord(splitMorae('て'), 1, { baseHz: 220, seed: 9, lead: 0.05 }).audio;
  const x = Float32Array.from(audio);
  for (let i = 0; i < other.length && i < 0.5 * SR; i++) x[i] += other[i] * 0.3; // 0.05–0.4 s に小さな別の声
  const r = judge(extractF0(PitchDetector, x, SR), word('おとこ', 3));
  const [s] = spanError(r, boundaries);
  assert.ok(s > -0.5, `始端の誤差 ${s.toFixed(2)} モーラ`);
  assert.equal(r.pass, true);
});

test('removeHum：50/60 Hz のハムとその倍音を見つけて除き、ハムがなければ何もしない', () => {
  const { audio } = synthesizeWord(splitMorae('さくら'), 0, { baseHz: 140, seed: 3 });
  const clean = removeHum(audio, SR);
  assert.deepEqual(clean.removed, []);
  assert.equal(clean.samples, audio); // そのまま返す
  for (const f of [50, 60]) {
    const x = audio.map((v, i) => v + hum(audio.length, f, 5, audio, 7)[i]);
    const r = removeHum(x, SR);
    const near = (g) => r.removed.some((h) => Math.abs(h - g) < 1);
    assert.ok(near(f) && near(2 * f) && near(3 * f) || (near(f) && near(2 * f)), `${f} Hz: ${r.removed.map((h) => h.toFixed(1))}`);
    assert.ok(r.removed.every((h) => Math.abs(h / f - Math.round(h / f)) < 0.05), '倍音以外は除かない');
  }
});

test('removeHum：一定の高さで伸ばした声（倍音が線状に見える）はハムと見なさない', () => {
  for (const baseHz of [100, 120, 150]) {
    const { audio } = synthesizeWord(splitMorae('ふぉーく'), 0, { baseHz, declSt: 0, jitterSt: 0.05, seed: 1 });
    assert.deepEqual(removeHum(audio, SR).removed, [], `${baseHz} Hz`);
  }
});

test('電源ハム SNR 5 dB でも判定できる（50 Hz は声なし、60 Hz はハムを F0 と誤認していた）', () => {
  for (const f of [50, 60]) {
    for (const [kana, k] of [['はし', 2], ['さくら', 0], ['いのち', 1]]) {
      const { audio } = synthesizeWord(splitMorae(kana), k, { baseHz: 140, seed: 5 });
      const x = audio.map((v, i) => v + hum(audio.length, f, 5, audio, 8)[i]);
      const r = judge(extractF0(PitchDetector, x, SR), word(kana, k));
      assert.equal(r.error, undefined, `${f} Hz ${kana}`);
      assert.equal(r.pass, true, `${f} Hz ${kana}: detected ${r.detectedK}`);
    }
  }
});

/** 「が」の枠の F0 を消した（きしみ声・かすれ：エネルギーはあるが高さがない）合成トラック。 */
function creakyGa(k, n, opts = {}) {
  const tr = syntheticContour(k, n, { baseHz: 130, ...opts });
  const [gs, ge] = tr.bounds[n];
  const f0 = tr.f0.map((v, i) => (tr.times[i] >= gs + 0.02 && tr.times[i] < ge ? 0 : v));
  return { ...tr, f0 };
}

test('「が」の高さが聞き取れないとき、平板と尾高の区別を合格にしない（no-ga）', () => {
  // 平板の語を尾高で言った（が が低い）が、が がきしんで高さがない → 以前は合格になっていた
  const r1 = judge(creakyGa(2, 2), word('さけ', 0));
  assert.equal(r1.error, 'no-ga');
  // 正しく平板で言っても、が が聞き取れなければ同じ（区別できない）
  assert.equal(judge(creakyGa(0, 2), word('さけ', 0)).error, 'no-ga');
  // 頭高・中高は が がなくても語の中で区別できるので、そのまま判定する
  const r3 = judge(creakyGa(1, 2), word('はし', 1));
  assert.equal(r3.error, undefined);
  assert.equal(r3.pass, true);
  const r4 = judge(creakyGa(2, 3), word('こころ', 2));
  assert.equal(r4.pass, true);
});

test('「が」の始めの数フレーム（前のモーラの高さのにじみ）だけでは が の高さとみなさない', () => {
  // が の最初の 20 ms だけに直前の高い F0 が残り、あとは高さがない
  const tr = syntheticContour(2, 2, { baseHz: 130 });
  const [gs, ge] = tr.bounds[2];
  const hiHz = tr.f0[tr.times.findIndex((t) => t >= gs) - 3];
  const f0 = tr.f0.map((v, i) => {
    const t = tr.times[i];
    if (t >= gs && t < gs + 0.02) return hiHz;
    if (t >= gs + 0.02 && t < ge) return 0;
    return v;
  });
  assert.equal(judge({ ...tr, f0 }, word('さけ', 0)).error, 'no-ga');
});

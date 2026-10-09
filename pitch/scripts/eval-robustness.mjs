// 劣化条件での頑健性評価（人の声の評価の代わり）。
//
//   node scripts/eval-robustness.mjs [--words 300] [--seeds 3] [--conditions baseline,noise,reverb-0.8 …]
//                                    [--workers N] [--md out.md] [--csv fails.csv] [--fails 5] [--list]
//
// 合成音声（src/synth.js の synthesizeWord と同じ手順。下の synth() はそれを写し、きしみ声の
// オプションと「正解の F0／有声区間」の出力だけを足したもの。起動時にきしみ声なしで
// synthesizeWord とビット単位で一致することを確認する）に、実際の録音に近い劣化を1軸ずつ
// （＋代表的な組み合わせ）加え、アプリと同じ流れ
//   pickUtterance → normalize → extractF0（vendor/pitchy）→ judge
// で判定する。語は data/lexicon-2000.json から（モーラ数 × 型）で層化サンプル（固定 seed）し、
// 同じかなでアクセントの違う語（最小対）は必ず含める。各語を辞書どおりの k と、
// demo/lexicon.js の wrongK（ページの「違う発音」ボタンと同じ k）で言わせる。
//
// 外部通信なし。ffmpeg があれば AAC 64 kbps の往復（エンコードは ffmpeg、デコードはアプリの
// 内蔵デコーダ demo/m4a）も測る。なければその条件はスキップと表示する。
//
// 失敗の切り分けのため、各サンプルについて中間値を記録する：
//   vadMiss  … pickUtterance が切り落とした発話の長さ（発話区間検出の失敗）
//   spanErr  … judge の span（有声区間＋エネルギーによる延長）の始端・終端の誤差（モーラ単位）
//   voicing  … 正解で有声のフレームのうち、cleanTrack 後に F0 が残った割合（有声フレーム率）
//   f0Gross  … 有声と判定されたフレームのうち、正解 F0 から 2 半音以上ずれた割合
//   bErr     … 語の内部のモーラ境界の誤差（中央値）
//   oracle   … 正解のモーラ境界で区切り直し、同じテンプレート当てはめをした場合の合否
// 失敗の主因は次の順で決める：切り出し(VAD)（pickUtterance が発話を 50 ms 超切り落とした）
// → 判定不能（有声率 < 50% なら F0 追跡）→ 発話範囲(span)（端が 0.5 モーラ超ずれた）
// → 区切り（正解の境界なら合格）→ F0 追跡（正解の境界でも F0 の残らないモーラがある、
// 有声率 < 50%、または F0 大誤差 ≥ 10%）→ 段差不足(minStep)（F0 は正しいが H/L 差が閾値未満）
// → 当てはめ(テンプレート)（F0 も境界も正しいのに型の当てはめが外れる。例：強い下がり傾向）。
// --from-json で保存した記録から集計だけやり直せる。
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { PitchDetector } from '../vendor/pitchy.js';
import FFT from '../vendor/fft.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge, hzToSt, DEFAULTS } from '../src/judge.js';
import { synthesizeWord, rng } from '../src/synth.js';
import { pitchPattern } from '../src/accent.js';
import { consonantClass } from '../src/mora.js';
import { pickUtterance } from '../demo/decode.js';
import { decodeLexicon, wrongK } from '../demo/lexicon.js';

const ROOT = new URL('..', import.meta.url).pathname;

// ============================================================================
// 条件
// ============================================================================
// 基準（ベースライン）話者：demo-sanity と同じ 140 Hz、synthesizeWord の既定値。
const BASE = { baseHz: 140, stepSt: 3.5, declSt: 0.4, moraDur: 0.15, durJitter: 0.25, finalStretch: 1.3, jitterSt: 0.15 };

function buildConditions() {
  const C = [];
  const add = (axis, id, label, spec = {}) => C.push({ axis, id, label, ...spec });
  add('baseline', 'baseline', '基準（140 Hz、3.5 半音、0.15 s/モーラ、16 kHz、無雑音）');
  for (const hz of [85, 110, 190, 240, 280]) add('話者', `f0-${hz}`, `基本周波数 ${hz} Hz`, { synth: { baseHz: hz } });
  for (const d of [0.09, 0.11, 0.13, 0.18, 0.22]) add('話速', `mora-${d}`, `モーラ長 ${d} s`, { synth: { moraDur: d } });
  for (const s of [1.0, 1.5, 2.0, 2.5, 6]) add('ピッチの幅', `step-${s}`, `下がり目 ${s} 半音`, { synth: { stepSt: s } });
  for (const s of [0, 0.8, 1.2]) add('ピッチの幅', `decl-${s}`, `下がり傾向 ${s} 半音/モーラ`, { synth: { declSt: s } });
  for (const s of [0.3, 0.6, 1.0]) add('ピッチの幅', `jitter-${s}`, `ゆらぎ ±${s} 半音`, { synth: { jitterSt: s } });
  for (const type of ['white', 'pink', 'babble', 'hum50', 'hum60']) {
    const name = { white: '白色', pink: 'ピンク', babble: 'バブル', hum50: 'ハム 50 Hz', hum60: 'ハム 60 Hz' }[type];
    for (const snr of [30, 20, 10, 5]) add('ノイズ', `${type}-${snr}`, `${name}ノイズ SNR ${snr} dB`, { noise: { type, snr } });
  }
  for (const rt of [0.2, 0.4, 0.8, 1.2]) add('響き', `reverb-${rt}`, `RT60 ${rt} s（DRR +3 dB）`, { reverb: { rt60: rt, drr: 3 } });
  add('響き', 'reverb-0.8-far', 'RT60 0.8 s・離れて録音（DRR −3 dB）', { reverb: { rt60: 0.8, drr: -3 } });
  add('マイク', 'band-100-7000', '帯域 100–7000 Hz', { band: [100, 7000] });
  add('マイク', 'band-300-3400', '電話帯域 300–3400 Hz', { band: [300, 3400] });
  add('マイク', 'agc', 'AGC（自動利得、最大 +30 dB、雑音床 SNR 40 dB）', { noise: { type: 'pink', snr: 40 }, agc: true });
  add('マイク', 'comp', 'コンプレッサ（−18 dB、4:1）', { comp: true });
  for (const g of [6, 12, 20]) add('マイク', `clip-${g}`, `クリッピング（+${g} dB 過大入力）`, { clipDb: g });
  add('マイク', 'aac-64k', 'AAC 64 kbps 往復（44.1 kHz）', { sr: 44100, aac: '64k' });
  add('マイク', 'aac-32k', 'AAC 32 kbps 往復（44.1 kHz）', { sr: 44100, aac: '32k' });
  for (const sr of [8000, 44100, 48000]) add('マイク', `sr-${sr}`, `サンプルレート ${sr / 1000} kHz`, { sr });
  add('録音の前後', 'lead-0', '前後の無音なし（発話ちょうどで切れた録音）', { synth: { lead: 0 } });
  add('録音の前後', 'pad-3s', '前後に無音 3 s', { pad: [3, 3] });
  add('録音の前後', 'env-3s', '前後に環境音 3 s（ピンク SNR 30 dB）', { pad: [3, 3], noise: { type: 'pink', snr: 30 } });
  add('録音の前後', 'env-5s-babble', '前 5 s・後 2 s に話し声の環境音（SNR 20 dB）', { pad: [5, 2], noise: { type: 'babble', snr: 20 } });
  add('録音の前後', 'breath', '発話直前に吸気音（−20 dB、150 ms 前）', { events: ['breath'] });
  add('録音の前後', 'click', '前後にクリック音（発話の 2 倍の振幅）', { events: ['click'] });
  add('録音の前後', 'thump', '1 s 前に操作音（ドン、発話と同程度の強さ 0.15 s）', { events: ['thump'] });
  add('発話の性質', 'devoiced', '無声化（i/u が無声子音に挟まれるモーラ）', { devoice: true });
  for (const f of [1.0, 2.0, 2.5]) add('発話の性質', `final-${f}`, `「が」の長さ ×${f}`, { synth: { finalStretch: f } });
  add('発話の性質', 'creak-mild', 'きしみ声・弱（後半の低いモーラ、半周期混入 30%、周期ゆらぎ 3%）', { creak: { depth: 0.3, jitter: 0.03, where: 'lowLate' } });
  add('発話の性質', 'creak-strong', 'きしみ声・強（低いモーラ全部、半周期混入 60%、周期ゆらぎ 8%）', { creak: { depth: 0.6, jitter: 0.08, where: 'low' } });
  add('発話の性質', 'creak-final', '語末きしみ（「が」のみ、半周期混入 80%、周期ゆらぎ 12%）', { creak: { depth: 0.8, jitter: 0.12, where: 'final' } });
  // 代表的な組み合わせ
  add('組み合わせ', 'combo-phone-quiet', 'スマホ・静かな部屋（48 kHz、100–7000 Hz、AGC、AAC 64k、RT60 0.4、ピンク 30 dB、前後 0.8 s）',
    { sr: 48000, band: [100, 7000], agc: true, aac: '64k', reverb: { rt60: 0.4, drr: 6 }, noise: { type: 'pink', snr: 30 }, pad: [0.8, 0.8] });
  add('組み合わせ', 'combo-phone-cafe', 'スマホ・カフェ（48 kHz、100–7000 Hz、AGC、AAC 64k、RT60 0.6、バブル 10 dB、前後 1 s）',
    { sr: 48000, band: [100, 7000], agc: true, aac: '64k', reverb: { rt60: 0.6, drr: 3 }, noise: { type: 'babble', snr: 10 }, pad: [1, 1] });
  add('組み合わせ', 'combo-phone-call', '電話（8 kHz、300–3400 Hz、ピンク 20 dB）', { sr: 8000, band: [300, 3400], noise: { type: 'pink', snr: 20 } });
  add('組み合わせ', 'combo-learner-flat-noisy', '平板気味の学習者（段差 1.5 半音）＋ピンク 20 dB', { synth: { stepSt: 1.5 }, noise: { type: 'pink', snr: 20 } });
  add('組み合わせ', 'combo-learner-flat-fast', '平板気味（2.0 半音）＋速い（0.11 s）', { synth: { stepSt: 2.0, moraDur: 0.11 } });
  add('組み合わせ', 'combo-lowmale-fast-reverb', '低い男性 85 Hz＋速い 0.11 s＋RT60 0.8', { synth: { baseHz: 85, moraDur: 0.11 }, reverb: { rt60: 0.8, drr: 3 } });
  add('組み合わせ', 'combo-child-phoneband', '子ども 280 Hz＋速め 0.12 s＋300–3400 Hz', { synth: { baseHz: 280, moraDur: 0.12 }, band: [300, 3400] });
  add('組み合わせ', 'combo-creak-lowmale-noise', '低い男性 85 Hz＋きしみ声・弱＋ピンク 20 dB', { synth: { baseHz: 85 }, creak: { depth: 0.3, jitter: 0.03, where: 'lowLate' }, noise: { type: 'pink', snr: 20 } });
  add('組み合わせ', 'combo-laptop-hum-room', 'ノート PC（ハム 50 Hz 20 dB＋コンプレッサ＋RT60 0.8）', { noise: { type: 'hum50', snr: 20 }, comp: true, reverb: { rt60: 0.8, drr: 3 } });
  return C;
}

// ============================================================================
// 合成（synthesizeWord の写し＋きしみ声＋正解の出力）
// ============================================================================
const CONS = {
  vowel: null,
  stop: [[0.05, false, -80, -80], [0.02, false, -80, -22]],
  affricate: [[0.04, false, -80, -80], [0.05, false, -80, -20]],
  fricative: [[0.07, false, -80, -18]],
  'voiced-stop': [[0.035, true, -24, -80], [0.01, false, -80, -24]],
  'voiced-fricative': [[0.05, true, -18, -26]],
  nasal: [[0.05, true, -12, -80]],
  flap: [[0.02, true, -10, -80]],
  glide: [[0.03, true, -5, -80]],
};

/**
 * synthesizeWord と同じ音声（creak なしならビット単位で同一）に加えて、
 * 正解の F0（5 ms フレーム、無声は 0）を返す。
 * creak: { depth（1周期おきに振幅を (1−depth) 倍＝半分の周期の成分）, jitter（周期ごとの F0 の乱れ、比）,
 *          where: 'final'（が のみ）| 'low'（L のモーラ全部）| 'lowLate'（後半の L のモーラ） }
 */
function synth(morae, k, opts = {}) {
  const {
    sampleRate = 16000, baseHz = 120, stepSt = 3.5, declSt = 0.4, moraDur = 0.15,
    durJitter = 0.25, finalStretch = 1.3, jitterSt = 0.15, seed = 1, lead = 0.25,
    devoiced = [], creak = null,
  } = opts;
  const rand = rng(seed);
  const all = [...morae, 'が'];
  const pat = pitchPattern(k, morae.length);
  const hop = 0.005;
  const plan = [];
  const boundaries = [];
  for (let i = 0; i < Math.round(lead / hop); i++) plan.push(null);
  let t = plan.length * hop;
  let curM = 0;
  const creakOn = (m) => {
    if (!creak) return false;
    if (creak.where === 'final') return m === all.length - 1;
    if (creak.where === 'low') return pat[m] === 0;
    return pat[m] === 0 && m >= all.length / 2;
  };
  const push = (dur, voiced, vdb, ndb, st) => {
    const nf = Math.max(1, Math.round(dur / hop));
    for (let i = 0; i < nf; i++) plan.push({ voiced, vdb, ndb, st, creak: creakOn(curM) });
    t += nf * hop;
  };
  for (let m = 0; m < all.length; m++) {
    curM = m;
    boundaries.push(t);
    let dur = moraDur * (1 + (rand() * 2 - 1) * durJitter);
    if (m === all.length - 1) dur *= finalStretch;
    const st = pat[m] * stepSt - declSt * m;
    const cls = consonantClass(all[m]);
    if (cls === 'geminate') { push(dur, false, -80, -80, st); continue; }
    if (cls === 'moraic-nasal') { push(dur, true, -12, -80, st); continue; }
    let used = 0;
    for (const [d, v, vdb, ndb] of CONS[cls] ?? []) { push(d, v, vdb, ndb, st); used += d; }
    const dv = devoiced.includes(m);
    push(Math.max(0.04, dur - used), !dv, dv ? -80 : 0, dv ? -22 : -80, st);
  }
  boundaries.push(t);
  const total = t + lead;
  while (plan.length * hop < total) plan.push(null);
  const w = Math.round(0.03 / hop);
  const f0 = plan.map((p, i) => {
    if (!p || !p.voiced) return 0;
    let s = 0, c = 0;
    for (let j = i - w; j <= i + w; j++) if (plan[j]) { s += plan[j].st; c++; }
    return baseHz * 2 ** ((s / c + (rand() * 2 - 1) * jitterSt) / 12);
  });
  const len = Math.round(total * sampleRate);
  const audio = new Float32Array(len);
  const crand = rng(seed ^ 0x5bd1e995); // separate stream: creak never perturbs the base synthesis
  let phase = 0, va = 0, na = 0, hz = baseHz;
  let cyc = 0, cycAmp = 1, cycF = 1;
  for (let i = 0; i < len; i++) {
    const fi = Math.min(plan.length - 1, Math.floor(i / sampleRate / hop));
    const p = plan[fi];
    const vt = p && p.voiced ? 10 ** (p.vdb / 20) * 0.5 : 0;
    const nt = p ? 10 ** (p.ndb / 20) * 0.5 : 0;
    va += (vt - va) * 0.01;
    na += (nt - na) * 0.02;
    if (f0[fi] > 0) hz = f0[fi];
    if (creak) {
      const on = p && p.creak;
      phase += (2 * Math.PI * hz * (on ? cycF : 1)) / sampleRate;
      if (phase >= 2 * Math.PI * (cyc + 1)) {
        cyc = Math.floor(phase / (2 * Math.PI));
        cycAmp = on && cyc % 2 ? 1 - creak.depth : 1;
        cycF = on ? 1 + (crand() * 2 - 1) * creak.jitter : 1;
      }
    } else {
      phase += (2 * Math.PI * hz) / sampleRate;
    }
    let s = 0;
    if (va > 1e-5) for (let h = 1; h <= 10; h++) s += Math.sin(h * phase) / h;
    audio[i] = va * s * 0.5 * (creak ? cycAmp : 1) + na * (rand() * 2 - 1);
  }
  return { audio, sampleRate, boundaries, f0, hop };
}

/** 無声化しやすいモーラ：i/u の段で無声子音始まり、次のモーラ（語内）も無声子音始まり。 */
function devoiceable(morae) {
  const HIGH = new Set([...'きしちひぴくすつふぷ']);
  const vl = (m) => ['stop', 'affricate', 'fricative'].includes(consonantClass(m));
  const out = [];
  for (let m = 0; m < morae.length - 1; m++) if (HIGH.has(morae[m][0]) && morae[m].length === 1 && vl(morae[m + 1])) out.push(m);
  return out;
}

// ============================================================================
// 劣化
// ============================================================================
const power = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return s / Math.max(1, b - a); };
const peakOf = (x) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };

function pinkNoise(len, r) {
  const out = new Float32Array(len);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
  }
  return out;
}

function humNoise(len, sr, f, r) {
  const amps = [1, 0.5, 0.7, 0.25, 0.35, 0.15, 0.2];
  const ph = amps.map(() => r() * 2 * Math.PI);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let h = 0; h < amps.length; h++) if ((h + 1) * f < sr / 2) s += amps[h] * Math.sin((2 * Math.PI * (h + 1) * f * i) / sr + ph[h]);
    out[i] = s;
  }
  return out;
}

// バブル：6人の合成話者が語を言い続ける（話者ごとに基本周波数と話速が違う）。サンプルレートごとに1回作る。
const babbleBanks = new Map();
function babbleBank(sr, lexWords) {
  if (babbleBanks.has(sr)) return babbleBanks.get(sr);
  const secs = 14, len = Math.round(secs * sr);
  const bank = new Float32Array(len);
  const r = rng(777);
  for (let talker = 0; talker < 6; talker++) {
    const stream = new Float32Array(len);
    const baseHz = 95 + r() * 170, moraDur = 0.12 + r() * 0.05;
    let pos = Math.floor(r() * 0.5 * sr);
    while (pos < len) {
      const w = lexWords[Math.floor(r() * lexWords.length)];
      let { audio } = synthesizeWord(w.morae, w.accent[0], { baseHz, moraDur, lead: 0.03, seed: 1 + Math.floor(r() * 1e6) });
      if (sr !== 16000) audio = resampleSinc(audio, 16000, sr);
      for (let i = 0; i < audio.length && pos + i < len; i++) stream[pos + i] += audio[i];
      pos += audio.length + Math.floor(r() * 0.15 * sr);
    }
    const g = 1 / Math.sqrt(power(stream) + 1e-12);
    for (let i = 0; i < len; i++) bank[i] += stream[i] * g;
  }
  babbleBanks.set(sr, bank);
  return bank;
}

function makeNoise(type, len, sr, r, lexWords) {
  if (type === 'white') return Float32Array.from({ length: len }, () => r() * 2 - 1);
  if (type === 'pink') return pinkNoise(len, r);
  if (type === 'hum50') return humNoise(len, sr, 50, r);
  if (type === 'hum60') return humNoise(len, sr, 60, r);
  if (type === 'babble') {
    const bank = babbleBank(sr, lexWords);
    const out = new Float32Array(len);
    let off = Math.floor(r() * bank.length);
    for (let i = 0; i < len; i++) out[i] = bank[(off + i) % bank.length];
    return out;
  }
  throw new Error(`noise ${type}`);
}

/** FFT 畳み込み（長さ x.length + h.length − 1）。 */
function convolve(x, h) {
  const n = x.length + h.length - 1;
  let N = 2;
  while (N < n) N <<= 1;
  const f = new FFT(N);
  const X = f.createComplexArray(), H = f.createComplexArray(), Y = f.createComplexArray();
  const xa = new Float64Array(N); xa.set(x);
  const ha = new Float64Array(N); ha.set(h);
  f.realTransform(X, xa); f.completeSpectrum(X);
  f.realTransform(H, ha); f.completeSpectrum(H);
  for (let i = 0; i < N; i++) {
    const a = X[2 * i], b = X[2 * i + 1], c = H[2 * i], d = H[2 * i + 1];
    Y[2 * i] = a * c - b * d; Y[2 * i + 1] = a * d + b * c;
  }
  const y = f.createComplexArray();
  f.inverseTransform(y, Y);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = y[2 * i];
  return out;
}

/** 合成インパルス応答：直接音 1 ＋ 指数減衰する雑音の残響（DRR で強さを決める）。 */
function roomIR(sr, rt60, drr, r) {
  const len = Math.round(rt60 * 1.1 * sr);
  const h = new Float32Array(len);
  const t0 = Math.round(0.003 * sr); // 最初の反射まで 3 ms
  let e = 0;
  for (let i = t0; i < len; i++) {
    const t = i / sr;
    const ramp = Math.min(1, (i - t0) / (0.005 * sr));
    h[i] = (r() * 2 - 1) * Math.exp((-6.91 * t) / rt60) * ramp;
    e += h[i] * h[i];
  }
  const g = Math.sqrt(10 ** (-drr / 10) / e);
  for (let i = t0; i < len; i++) h[i] *= g;
  h[0] = 1;
  return h;
}

/** RBJ biquad（Butterworth、Q = 1/√2）を2段 → 4次。 */
function biquad(x, sr, type, fc) {
  const w0 = (2 * Math.PI * fc) / sr, cw = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; } else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function bandLimit(x, sr, lo, hi) {
  let y = biquad(biquad(x, sr, 'hp', lo), sr, 'hp', lo);
  if (hi < sr / 2 * 0.95) y = biquad(biquad(y, sr, 'lp', hi), sr, 'lp', hi);
  return y;
}

/** スマホ風 AGC：20 ms の RMS を目標 −20 dBFS に寄せる（最大 +30 dB、下げは 10 ms、上げは 0.5 s で追従）。 */
function agc(x, sr) {
  const target = 10 ** (-20 / 20), maxG = 10 ** (30 / 20);
  const aEnv = 1 - Math.exp(-1 / (0.02 * sr)), aDown = 1 - Math.exp(-1 / (0.01 * sr)), aUp = 1 - Math.exp(-1 / (0.5 * sr));
  let env = 0, g = 1;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    env += (x[i] * x[i] - env) * aEnv;
    const want = Math.min(maxG, target / Math.sqrt(env + 1e-12));
    g += (want - g) * (want < g ? aDown : aUp);
    y[i] = Math.max(-1, Math.min(1, x[i] * g));
  }
  return y;
}

/** コンプレッサ：ピーク包絡（立ち上がり 5 ms、戻り 80 ms）、しきい値 = ピーク −18 dB、比 4:1。 */
function compress(x, sr) {
  const thr = peakOf(x) * 10 ** (-18 / 20), ratio = 4;
  const aA = 1 - Math.exp(-1 / (0.005 * sr)), aR = 1 - Math.exp(-1 / (0.08 * sr));
  let env = 0;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env += (a - env) * (a > env ? aA : aR);
    const g = env > thr ? (thr * (env / thr) ** (1 / ratio)) / env : 1;
    y[i] = x[i] * g;
  }
  return y;
}

/** 窓付き sinc による任意比のサンプルレート変換（評価用。アプリの resample とは別物）。 */
function resampleSinc(x, from, to, half = 16) {
  const ratio = from / to;
  const fc = Math.min(1, to / from) * 0.95;
  const span = half * Math.max(1, ratio);
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const t = i * ratio;
    const j0 = Math.max(0, Math.ceil(t - span)), j1 = Math.min(x.length - 1, Math.floor(t + span));
    let s = 0;
    for (let j = j0; j <= j1; j++) {
      const d = t - j;
      const a = Math.PI * fc * d;
      const sinc = d === 0 ? 1 : Math.sin(a) / a;
      s += x[j] * fc * sinc * (0.5 + 0.5 * Math.cos((Math.PI * d) / span));
    }
    out[i] = s;
  }
  return out;
}

// ---- AAC 往復（ffmpeg でエンコード、アプリの demo/m4a でデコード） ----
const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
let tmp = null, decodeM4A = null;
const aacLag = new Map();
function wav16(x, sr) {
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + 2 * i);
  return b;
}
async function aacRoundTrip(x, sr, rate) {
  if (!tmp) {
    tmp = mkdtempSync(join(tmpdir(), 'pitch-robust-'));
    process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
    ({ decodeM4A } = await import('../demo/m4a/index.js'));
  }
  const g = 0.9 / Math.max(1e-6, peakOf(x));
  const inp = join(tmp, 'in.wav'), out = join(tmp, 'out.m4a');
  writeFileSync(inp, wav16(x.map((v) => v * g), sr));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', inp, '-c:a', 'aac', '-b:a', rate, '-ar', String(sr), '-ac', '1', '-movflags', '+faststart', out]);
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  const buf = readFileSync(out);
  const dec = decodeM4A(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  return { samples: dec.samples, rate: dec.rate };
}
/** デコード後の時間ずれ（priming の扱い）を1回だけ相互相関で測る。 */
async function calibrateAac(sr, rate) {
  const key = `${sr}/${rate}`;
  if (aacLag.has(key)) return aacLag.get(key);
  const audio = resampleSinc(synthesizeWord(['さ', 'く', 'ら'], 0, { baseHz: 150, seed: 3 }).audio, 16000, sr);
  const dec = (await aacRoundTrip(audio, sr, rate)).samples;
  let best = 0, bestC = -Infinity;
  for (let lag = -2200; lag <= 2200; lag++) {
    let c = 0;
    for (let i = 2200; i < Math.min(audio.length, dec.length) - 2200; i += 3) c += audio[i] * dec[i + lag];
    if (c > bestC) { bestC = c; best = lag; }
  }
  aacLag.set(key, best / sr);
  return best / sr;
}

// ============================================================================
// 1サンプルの評価
// ============================================================================
function median(xs) {
  const s = xs.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// judge.js の fitTemplate と同じ当てはめ（正解の境界での「オラクル」判定に使う）。
function fitTemplate(values, pattern, maxDecl) {
  let best = null;
  for (let step = 0; step <= 6; step++) {
    const c = -(maxDecl * step) / 6;
    const pts = values.flatMap((v, i) => (Number.isNaN(v) ? [] : [[pattern[i], v - c * i]]));
    const m = pts.length;
    const mp = pts.reduce((s, [p]) => s + p, 0) / m;
    const mv = pts.reduce((s, [, v]) => s + v, 0) / m;
    let spp = 0, spv = 0;
    for (const [p, v] of pts) { spp += (p - mp) ** 2; spv += (p - mp) * (v - mv); }
    const b = spp > 0 ? spv / spp : 0;
    const a = mv - b * mp;
    const sse = pts.reduce((s, [p, v]) => s + (v - a - b * p) ** 2, 0) + 0.01 * c * c;
    if (!best || sse < best.sse) best = { a, b, c, sse };
  }
  return best;
}
function oracleJudge(values, n, accent, o = DEFAULTS) {
  if (values.filter((v) => !Number.isNaN(v)).length < 2) return { pass: false, flat: false, k: null };
  const cands = [];
  for (let k = 0; k <= n; k++) cands.push({ k, ...fitTemplate(values, pitchPattern(k, n), o.maxDeclination) });
  const valid = cands.filter((c) => c.b >= o.minStep);
  if (!valid.length) return { pass: accent.includes(0), flat: true, k: 0 };
  const det = valid.reduce((a, c) => (c.sse < a.sse ? c : a));
  const obs = values.map((v) => !Number.isNaN(v));
  const same = (k1, k2) => { const p1 = pitchPattern(k1, n), p2 = pitchPattern(k2, n); return p1.every((p, i) => !obs[i] || p === p2[i]); };
  const eq = valid.filter((c) => same(c.k, det.k)).map((c) => c.k);
  return { pass: eq.some((k) => accent.includes(k)), flat: false, k: det.k };
}

async function runSample(w, k, isRight, cond, seed, lexWords) {
  const sr = cond.sr ?? 16000;
  const r = rng((seed * 2654435761) ^ hashStr(cond.id));
  const dv = cond.devoice ? devoiceable(w.morae) : [];
  // 合成は常に 16 kHz（synthesizeWord の振幅の平滑化はサンプル単位なので、別のレートで合成すると
  // 声の立ち上がり・余韻の長さが変わってしまう）。録音のサンプルレートへは窓付き sinc で変換する。
  const syn = synth(w.morae, k, { ...BASE, ...(cond.synth ?? {}), sampleRate: 16000, seed, devoiced: dv, creak: cond.creak ?? null });
  const b = syn.boundaries;
  let x = sr === 16000 ? syn.audio : resampleSinc(syn.audio, 16000, sr);
  let offset = 0; // 劣化後の音声で、合成音声の 0 秒がどこにあるか
  const speechPeak = peakOf(x);
  const ps = power(x, Math.floor(b[0] * sr), Math.ceil(b[b.length - 1] * sr));
  // 前後の延長
  if (cond.pad) {
    const [pre, post] = cond.pad;
    const y = new Float32Array(x.length + Math.round((pre + post) * sr));
    y.set(x, Math.round(pre * sr));
    x = y; offset = Math.round(pre * sr) / sr;
  }
  // 息・クリック・操作音
  for (const ev of cond.events ?? []) {
    const add = (startSec, buf) => { const s = Math.round(startSec * sr); for (let i = 0; i < buf.length; i++) if (s + i >= 0 && s + i < x.length) x[s + i] += buf[i]; };
    if (ev === 'breath') {
      const len = Math.round(0.3 * sr);
      let br = bandLimit(Float32Array.from({ length: len }, () => r() * 2 - 1), sr, 400, Math.min(3000, sr * 0.45));
      const target = speechPeak * 10 ** (-20 / 20);
      const g = target / Math.max(1e-9, peakOf(br));
      br = br.map((v, i) => v * g * Math.sin((Math.PI * i) / len));
      add(offset + b[0] - 0.15 - 0.3, br);
    } else if (ev === 'click') {
      const len = Math.round(0.004 * sr);
      const cl = Float32Array.from({ length: len }, (_, i) => (r() * 2 - 1) * Math.exp(-i / (0.0007 * sr)) * speechPeak * 2);
      cl[0] = speechPeak * 2;
      add(Math.max(0.01, offset + b[0] - 0.2), cl);
      add(offset + b[b.length - 1] + 0.15, cl);
    } else if (ev === 'thump') {
      const len = Math.round(0.15 * sr);
      let th = bandLimit(Float32Array.from({ length: len }, () => r() * 2 - 1), sr, 40, 400);
      const g = speechPeak / Math.max(1e-9, peakOf(th));
      th = th.map((v, i) => v * g * Math.exp(-i / (0.04 * sr)));
      if (offset + b[0] - 1 < 0) { const y = new Float32Array(x.length + sr); y.set(x, sr); x = y; offset += 1; }
      add(offset + b[0] - 1.0, th);
    }
  }
  if (cond.reverb) x = convolve(x, roomIR(sr, cond.reverb.rt60, cond.reverb.drr, r));
  if (cond.noise) {
    const nz = makeNoise(cond.noise.type, x.length, sr, r, lexWords);
    const g = Math.sqrt(ps / 10 ** (cond.noise.snr / 10) / Math.max(1e-20, power(nz)));
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i] + nz[i] * g;
    x = y;
  }
  if (cond.band) x = bandLimit(x, sr, cond.band[0], Math.min(cond.band[1], sr * 0.45));
  if (cond.agc) x = agc(x.map((v) => v * (0.3 / Math.max(1e-6, speechPeak))), sr);
  if (cond.comp) x = compress(x, sr);
  if (cond.clipDb) {
    const g = 10 ** (cond.clipDb / 20) / Math.max(1e-6, peakOf(x));
    x = x.map((v) => Math.max(-1, Math.min(1, v * g)));
  }
  let rate = sr;
  if (cond.aac) {
    const lag = await calibrateAac(sr, cond.aac);
    const d = await aacRoundTrip(x, sr, cond.aac);
    x = d.samples; rate = d.rate; offset += lag;
  }

  // ---- アプリと同じ流れ ----
  const u = pickUtterance(x, rate, { maxSec: 4 });
  const tr = extractF0(PitchDetector, normalize(u.samples), rate);
  const res = judge(tr, w);

  // ---- 診断 ----
  const slots = w.morae.length + 1;
  const tStart = offset + b[0], tEnd = offset + b[b.length - 1];
  const vadMiss = Math.max(0, u.start - tStart) + Math.max(0, tEnd - u.end);
  const tb = b.map((v) => v + offset - u.start); // 切り出し後の時間での正解境界
  const moraLen = (tb[tb.length - 1] - tb[0]) / slots;
  const st = res.st ?? [];
  let trueV = 0, hitV = 0, cmp = 0, gross = 0, falseV = 0;
  const errs = [];
  for (let i = 0; i < tr.times.length; i++) {
    const ts = tr.times[i] + u.start - offset; // 合成音声の時間
    const pi = Math.floor(ts / syn.hop);
    const f = pi >= 0 && pi < syn.f0.length ? syn.f0[pi] : 0;
    const tracked = !Number.isNaN(st[i]);
    if (f > 0) {
      trueV++;
      if (tracked) {
        hitV++; cmp++;
        const d = Math.abs(st[i] - hzToSt(f));
        errs.push(d);
        if (d > 2) gross++;
      }
    } else if (tracked && (ts < b[0] - 0.03 || ts > b[b.length - 1] + 0.03)) falseV++;
  }
  // 正解の境界での判定（区切りの失敗か、値そのものの失敗かを分ける）
  const ovals = [];
  let oracleMissing = 0; // 正解では有声なのに、F0 が1フレームも残らなかったモーラの数
  for (let s = 0; s < slots; s++) {
    if (consonantClass(s < w.morae.length ? w.morae[s] : 'が') === 'geminate') { ovals.push(NaN); continue; }
    const vals = [];
    for (let i = 0; i < tr.times.length; i++) if (tr.times[i] >= tb[s] && tr.times[i] < tb[s + 1] && !Number.isNaN(st[i])) vals.push(st[i]);
    if (!vals.length && !dv.includes(s)) oracleMissing++;
    ovals.push(median(vals));
  }
  const orc = oracleJudge(ovals, w.morae.length, w.accent);
  const rec = {
    c: cond.id, id: w.id, n: w.morae.length, type: w.type, k, right: isRight, seed,
    pass: res.error ? false : res.pass, error: res.error ?? null, dk: res.error ? null : res.detectedK,
    flat: !!res.flat, step: res.error ? null : +res.stepSt.toFixed(2), verdict: res.verdict ?? null,
    vadMiss: +vadMiss.toFixed(3), cut: [+u.start.toFixed(2), +u.end.toFixed(2)],
    voicing: trueV ? +(hitV / trueV).toFixed(3) : 0, f0Gross: cmp ? +(gross / cmp).toFixed(3) : null,
    f0Med: errs.length ? +median(errs).toFixed(2) : null, falseVoicedS: +(falseV * 0.01).toFixed(2),
    spanS: null, spanE: null, bErr: null, oracle: orc.pass, oracleFlat: orc.flat, oracleK: orc.k, oracleMissing,
  };
  if (!res.error) {
    rec.spanS = +((res.span[0] - tb[0]) / moraLen).toFixed(2);
    rec.spanE = +((res.span[1] - tb[tb.length - 1]) / moraLen).toFixed(2);
    const be = [];
    for (let s = 1; s < res.segments.length; s++) be.push(Math.abs(res.segments[s].start - tb[s]));
    rec.bErr = +(median(be) * 1000).toFixed(0);
  }
  rec.cause = causeOf(rec);
  return rec;
}

/** 失敗（正しい読みの不合格、違う読みの合格）の主因。 */
function causeOf(r) {
  const failed = r.right ? !r.pass : r.pass;
  if (!failed) return null;
  if (r.vadMiss > 0.05) return '切り出し(VAD)';
  if (r.error) return r.voicing < 0.5 ? 'F0追跡' : '判定不能(その他)';
  if (Math.abs(r.spanS) > 0.5 || Math.abs(r.spanE) > 0.5) return '発話範囲(span)';
  const oracleOk = r.right ? r.oracle : !r.oracle;
  if (oracleOk) return '区切り';
  // 正解の境界でも外れる → 値そのもの。F0 が欠けた／ずれたなら F0 追跡、そうでなければ判定モデル側。
  if (r.oracleMissing > 0 || r.voicing < 0.5 || (r.f0Gross ?? 0) >= 0.1) return 'F0追跡';
  if (r.oracleFlat) return '段差不足(minStep)';
  return '当てはめ(テンプレート)';
}

function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ============================================================================
// 語の選び方
// ============================================================================
function loadWords() {
  return decodeLexicon(JSON.parse(readFileSync(join(ROOT, 'data/lexicon-2000.json'), 'utf8')));
}
/** 同じかなで、アクセントの組が違う語（箸・橋・端 …）。 */
function minimalPairWords(words) {
  const byKana = new Map();
  for (const w of words) { if (!byKana.has(w.kana)) byKana.set(w.kana, []); byKana.get(w.kana).push(w); }
  const out = [];
  for (const ws of byKana.values()) if (new Set(ws.map((w) => [...w.accent].sort().join(','))).size >= 2) out.push(...ws);
  return out;
}
function selectWords(words, N, seed = 20261009) {
  const r = rng(seed);
  const strata = new Map();
  for (const w of words) { const key = `${w.morae.length}/${w.type}`; if (!strata.has(key)) strata.set(key, []); strata.get(key).push(w); }
  const groups = [...strata.entries()].sort();
  for (const [, ws] of groups) for (let i = ws.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ws[i], ws[j]] = [ws[j], ws[i]]; }
  const quota = new Map(groups.map(([key, ws]) => [key, Math.min(ws.length, Math.max(3, Math.round((N * ws.length) / words.length)))]));
  let total = [...quota.values()].reduce((a, b) => a + b, 0);
  while (total > N) { // 大きい層から減らす
    const [key] = [...quota.entries()].sort((a, b) => b[1] - a[1])[0];
    quota.set(key, quota.get(key) - 1); total--;
  }
  const picked = new Set(groups.flatMap(([key, ws]) => ws.slice(0, quota.get(key))));
  const mp = minimalPairWords(words);
  for (const w of mp) picked.add(w);
  return { list: words.filter((w) => picked.has(w)), minimalPairs: mp.length };
}

// ============================================================================
// ワーカー
// ============================================================================
if (!isMainThread) {
  const { wordIds, seeds, condIds } = workerData;
  const lex = loadWords();
  const byId = new Map(lex.map((w) => [w.id, w]));
  const conds = buildConditions().filter((c) => condIds.includes(c.id));
  const out = [];
  let done = 0;
  for (const id of wordIds) {
    const w = byId.get(id);
    const kRight = w.accent[0], kWrong = wrongK(w);
    for (const s of seeds) {
      for (const cond of conds) {
        if (cond.devoice && devoiceable(w.morae).length === 0) continue;
        const seed = 1 + (hashStr(`${w.id}/${s}`) % 1000003);
        out.push({ ...(await runSample(w, kRight, true, cond, seed, lex)), seedIdx: s });
        if (!w.accent.includes(kWrong)) out.push({ ...(await runSample(w, kWrong, false, cond, seed + 7919, lex)), seedIdx: s });
      }
    }
    done++;
    if (done % 5 === 0) parentPort.postMessage({ progress: 5 });
  }
  parentPort.postMessage({ progress: done % 5, records: out });
}

// ============================================================================
// メイン
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
  const ALL = buildConditions();
  if (args.includes('--list')) {
    for (const c of ALL) console.log(`${c.id.padEnd(28)} ${c.axis.padEnd(8)} ${c.label}`);
    return;
  }
  // 起動時の確認：きしみ声なしの synth() は synthesizeWord とビット単位で一致すること。
  for (const [m, k, o] of [[['か', 'が', 'み'], 3, { seed: 5 }], [['が', 'っ', 'こ', 'う'], 0, { seed: 9, sampleRate: 44100, baseHz: 230, devoiced: [2] }]]) {
    const a = synthesizeWord(m, k, o).audio, b = synth(m, k, o).audio;
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw new Error('synth() と synthesizeWord がずれています（src/synth.js が変わった？）');
  }

  const nWords = Number(arg('--words', 300));
  const seedArg = arg('--seeds', '3');
  const seeds = seedArg.includes(',') ? seedArg.split(',').map(Number) : Array.from({ length: Number(seedArg) }, (_, i) => i + 1);
  const pat = arg('--conditions', null);
  let conds = ALL;
  if (pat) {
    const toks = pat.split(',');
    conds = ALL.filter((c) => c.id === 'baseline' || toks.some((t) => c.id === t || c.axis === t || (t.endsWith('*') ? c.id.startsWith(t.slice(0, -1)) : c.id.startsWith(`${t}-`))));
  }
  const skipped = [];
  if (!HAS_FFMPEG) { for (const c of conds) if (c.aac) skipped.push(c.id); conds = conds.filter((c) => !c.aac); }
  const lex = loadWords();
  const { list: words, minimalPairs } = selectWords(lex, nWords);
  if (arg('--from-json')) { // 保存した記録から集計だけやり直す（主因の判定も新しい規則で）
    const records = JSON.parse(readFileSync(arg('--from-json'), 'utf8'));
    for (const r of records) r.cause = causeOf(r);
    const ids = new Set(records.map((r) => r.c));
    const md = report(records, conds.filter((c) => ids.has(c.id)), { words, minimalPairs, seeds, secs: 0, skipped, nWords, fails: Number(arg('--fails', 0)) });
    console.log(md);
    if (arg('--md')) writeFileSync(arg('--md'), md);
    return;
  }
  const nWorkers = Math.max(1, Math.min(Number(arg('--workers', cpus().length)), words.length));

  const t0 = performance.now();
  const parts = Array.from({ length: nWorkers }, () => []);
  words.forEach((w, i) => parts[i % nWorkers].push(w.id));
  let progress = 0;
  const records = (await Promise.all(parts.map((wordIds) => new Promise((resolve, reject) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { wordIds, seeds, condIds: conds.map((c) => c.id) } });
    wk.on('message', (m) => {
      progress += m.progress ?? 0;
      process.stderr.write(`\r  ${progress}/${words.length} 語  ${((performance.now() - t0) / 1000).toFixed(0)} s   `);
      if (m.records) resolve(m.records);
    });
    wk.on('error', reject);
  })))).flat();
  process.stderr.write('\n');
  const secs = (performance.now() - t0) / 1000;

  const md = report(records, conds, { words, minimalPairs, seeds, secs, skipped, nWords, fails: Number(arg('--fails', 0)) });
  console.log(md);
  if (arg('--md')) writeFileSync(arg('--md'), md);
  if (arg('--csv')) {
    const cols = ['c', 'id', 'n', 'type', 'k', 'right', 'seed', 'pass', 'error', 'dk', 'flat', 'step', 'verdict', 'cause', 'vadMiss', 'spanS', 'spanE', 'voicing', 'f0Gross', 'f0Med', 'falseVoicedS', 'bErr', 'oracle', 'oracleFlat', 'oracleK', 'oracleMissing'];
    const rows = records.filter((r) => r.cause).map((r) => cols.map((c) => r[c] ?? '').join(','));
    writeFileSync(arg('--csv'), [cols.join(','), ...rows].join('\n') + '\n');
  }
  if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(records));
}

// ============================================================================
// 集計
// ============================================================================
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
const f1 = (v) => (v == null || Number.isNaN(v) ? '–' : (100 * v).toFixed(0) + '%');
const f1d = (v) => (v == null || Number.isNaN(v) ? '–' : (100 * v).toFixed(1));

/** 語ごとのまとまりで再標本化するブートストラップ（同じ語の seed 間は独立でないため）。 */
function clusterBootstrap(byWord, iters = 1000, seed = 99) {
  const ws = [...byWord.values()];
  if (!ws.length) return [NaN, NaN];
  const r = rng(seed);
  const vals = [];
  for (let it = 0; it < iters; it++) {
    let a = 0, n = 0;
    for (let i = 0; i < ws.length; i++) { const w = ws[Math.floor(r() * ws.length)]; a += w[0]; n += w[1]; }
    vals.push(n ? a / n : NaN);
  }
  vals.sort((x, y) => x - y);
  return [vals[Math.floor(0.025 * iters)], vals[Math.floor(0.975 * iters)]];
}

function mean(xs) { const v = xs.filter((x) => !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; }

function summarize(recs) {
  const right = recs.filter((r) => r.right), wrong = recs.filter((r) => !r.right);
  const bw = (rs, ok) => { const m = new Map(); for (const r of rs) { const e = m.get(r.id) ?? [0, 0]; e[0] += ok(r) ? 1 : 0; e[1]++; m.set(r.id, e); } return m; };
  const bySeed = new Map();
  for (const r of right) { const s = r.seedIdx; const e = bySeed.get(s) ?? [0, 0]; e[0] += r.pass ? 1 : 0; e[1]++; bySeed.set(s, e); }
  const seedRates = [...bySeed.values()].map(([a, n]) => a / n);
  const causes = {};
  for (const r of recs) if (r.cause) { const key = `${r.right ? 'R' : 'W'}:${r.cause}`; causes[key] = (causes[key] ?? 0) + 1; }
  const rf = right.filter((r) => !r.pass);
  const verdicts = {};
  for (const r of rf) { const v = r.error ?? (r.flat ? 'flat' : r.dk < r.k ? 'early' : 'late'); verdicts[v] = (verdicts[v] ?? 0) + 1; }
  return {
    nR: right.length, passR: right.filter((r) => r.pass).length,
    ciR: clusterBootstrap(bw(right, (r) => r.pass)),
    exact: right.filter((r) => r.dk === r.k).length,
    err: right.filter((r) => r.error).length,
    nW: wrong.length, fpW: wrong.filter((r) => r.pass).length,
    ciW: clusterBootstrap(bw(wrong, (r) => r.pass)),
    seedMin: Math.min(...seedRates), seedMax: Math.max(...seedRates),
    voicing: median(right.map((r) => r.voicing)), f0Gross: mean(right.map((r) => r.f0Gross ?? NaN)),
    f0GrossFail: mean(rf.map((r) => r.f0Gross ?? NaN)), voicingFail: median(rf.map((r) => r.voicing)),
    bErr: median(right.map((r) => r.bErr ?? NaN)), bErrFail: median(rf.map((r) => r.bErr ?? NaN)),
    spanS: median(right.map((r) => r.spanS ?? NaN)), spanE: median(right.map((r) => r.spanE ?? NaN)),
    nWords: new Set(right.map((r) => r.id)).size,
    vadMiss: right.filter((r) => r.vadMiss > 0.05).length,
    falseV: median(right.map((r) => r.falseVoicedS)),
    oracleR: right.filter((r) => r.oracle).length,
    causes, verdicts, fails: rf,
  };
}

function topCause(s) {
  const e = Object.entries(s.causes).filter(([k]) => k.startsWith('R:')).sort((a, b) => b[1] - a[1]);
  if (!e.length) return '–';
  const tot = e.reduce((a, [, v]) => a + v, 0);
  return e.slice(0, 2).map(([k, v]) => `${k.slice(2)} ${Math.round((100 * v) / tot)}%`).join('、');
}
function topCauseW(s) {
  const e = Object.entries(s.causes).filter(([k]) => k.startsWith('W:')).sort((a, b) => b[1] - a[1]);
  return e.length ? e.slice(0, 2).map(([k, v]) => `${k.slice(2)} ${v}`).join('、') : '–';
}

function report(records, conds, meta) {
  const byCond = new Map(conds.map((c) => [c.id, []]));
  for (const r of records) byCond.get(r.c)?.push(r);
  const S = new Map(conds.map((c) => [c.id, summarize(byCond.get(c.id))]));
  const base = S.get('baseline');
  const L = [];
  const nRight = meta.words.length * meta.seeds.length;
  L.push(`語：${meta.words.length}（層化 ${meta.nWords} ＋ 最小対 ${meta.minimalPairs} 語、重複は1回）、seed：${meta.seeds.join(', ')}、条件：${conds.length}、` +
    `サンプル：${records.length}（1条件あたり正しい読み ≈ ${nRight}）、実行時間 ${meta.secs.toFixed(0)} s`);
  if (meta.skipped.length) L.push(`\n**スキップ（ffmpeg がない）：** ${meta.skipped.join(', ')}`);
  L.push('');
  L.push('区間は語単位のクラスタ・ブートストラップの 95% 区間（同じ語の seed 違いは独立でないため）。「seed 幅」は seed ごとの合格率の最小–最大。');
  L.push('有声率 = 正解で有声のフレームのうち F0 が残った割合（中央値）、F0 大誤差 = 残ったフレームのうち正解から 2 半音以上ずれた割合（平均）、');
  L.push('境界誤差 = 語内のモーラ境界の誤差の中央値（正しい読み）、span = judge の発話範囲の始端 / 終端の誤差（モーラ単位、符号付き中央値。始端の負＝早すぎ、終端の正＝遅すぎ）、');
  L.push('オラクル = 正解のモーラ境界で区切った場合の正しい読みの合格率。主因は正しい読みの不合格の内訳（上位2つ）。');
  L.push('');
  const axes = [...new Set(conds.map((c) => c.axis))];
  for (const axis of axes) {
    L.push(`### ${axis}`);
    L.push('');
    L.push('| 条件 | 正しい読みの合格率 [95%] | 語数 | seed 幅 | k 一致 | 判定不能 | 誤合格率 [95%] | 有声率 | F0 大誤差 | 境界誤差 | span | オラクル | 不合格の主因 | 誤合格の主因 |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const c of conds.filter((x) => x.axis === axis)) {
      const s = S.get(c.id);
      L.push(`| ${c.label} | **${pct(s.passR, s.nR)}** [${f1d(s.ciR[0])}–${f1d(s.ciR[1])}] | ${s.nWords} | ${f1(s.seedMin)}–${f1(s.seedMax)} | ${pct(s.exact, s.nR)} | ${pct(s.err, s.nR)} | ${pct(s.fpW, s.nW)} [${f1d(s.ciW[0])}–${f1d(s.ciW[1])}] | ${f1(s.voicing)} | ${f1(s.f0Gross)} | ${Number.isNaN(s.bErr) ? '–' : s.bErr + ' ms'} | ${Number.isNaN(s.spanS) ? '–' : `${s.spanS.toFixed(2)} / ${s.spanE.toFixed(2)}`} | ${pct(s.oracleR, s.nR)} | ${topCause(s)} | ${topCauseW(s)} |`);
    }
    L.push('');
  }
  // 弱い条件の一覧
  L.push('### 弱い条件（正しい読みの合格率の低い順）');
  L.push('');
  L.push('| # | 条件 | 合格率 | 基準との差 | 誤合格率 | 不合格の内訳（件） | 不合格の型 | 失敗時の有声率 / F0 大誤差 / 境界誤差 |');
  L.push('|---|---|---|---|---|---|---|---|');
  const ranked = conds.filter((c) => c.id !== 'baseline').map((c) => [c, S.get(c.id)]).sort((a, b) => a[1].passR / a[1].nR - b[1].passR / b[1].nR);
  ranked.forEach(([c, s], i) => {
    const rc = Object.entries(s.causes).filter(([k]) => k.startsWith('R:')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(2)} ${v}`).join('、') || '–';
    const vd = Object.entries(s.verdicts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${{ early: '早い', late: '遅い', flat: '平板', 'no-voice': '声なし', 'too-short': '短すぎ' }[k] ?? k} ${v}`).join('、') || '–';
    const d = (100 * (s.passR / s.nR - base.passR / base.nR)).toFixed(1);
    L.push(`| ${i + 1} | ${c.label} | ${pct(s.passR, s.nR)} | ${d} pt | ${pct(s.fpW, s.nW)} | ${rc} | ${vd} | ${f1(s.voicingFail)} / ${f1(s.f0GrossFail)} / ${Number.isNaN(s.bErrFail) ? '–' : s.bErrFail + ' ms'} |`);
  });
  L.push('');
  // 誤合格の多い順
  L.push('### 誤合格率の高い条件（上位10）');
  L.push('');
  L.push('| 条件 | 誤合格率 | 主因 |');
  L.push('|---|---|---|');
  for (const [c, s] of conds.map((c) => [c, S.get(c.id)]).sort((a, b) => b[1].fpW / Math.max(1, b[1].nW) - a[1].fpW / Math.max(1, a[1].nW)).slice(0, 10)) {
    L.push(`| ${c.label} | ${pct(s.fpW, s.nW)} | ${topCauseW(s)} |`);
  }
  L.push('');
  // モーラ数・型別（ベースラインと最悪条件の比較に使う）
  L.push('### モーラ数 × 型（全条件をまとめた正しい読みの合格率）');
  L.push('');
  const cell = new Map();
  for (const r of records) if (r.right) { const key = `${r.n}/${r.type}`; const e = cell.get(key) ?? [0, 0]; e[0] += r.pass ? 1 : 0; e[1]++; cell.set(key, e); }
  L.push('| モーラ数 | 平板 | 頭高 | 中高 | 尾高 |');
  L.push('|---|---|---|---|---|');
  for (const n of [...new Set(records.map((r) => r.n))].sort()) {
    L.push(`| ${n} | ${['heiban', 'atamadaka', 'nakadaka', 'odaka'].map((t) => { const e = cell.get(`${n}/${t}`); return e ? pct(e[0], e[1]) : '–'; }).join(' | ')} |`);
  }
  L.push('');
  if (meta.fails > 0) {
    L.push('### 失敗例（条件ごとに先頭から）');
    L.push('');
    const byId = new Map(meta.words.map((w) => [w.id, w]));
    for (const c of conds) {
      const fs = S.get(c.id).fails.slice(0, meta.fails);
      if (!fs.length) continue;
      L.push(`- **${c.id}**`);
      for (const r of fs) {
        const w = byId.get(r.id);
        L.push(`  - ${w.surface}（${w.kana}）k=${r.k} → ${r.error ? `error=${r.error}` : `detectedK=${r.dk}${r.flat ? ' flat' : ''} step=${r.step}st`}；主因=${r.cause}；有声率 ${f1(r.voicing)}、F0 大誤差 ${f1(r.f0Gross)}、span ${r.spanS}/${r.spanE}、境界誤差 ${r.bErr} ms、切り出し欠け ${r.vadMiss} s、オラクル ${r.oracle ? '合格' : '不合格'}${r.oracleFlat ? '(平板)' : ''}`);
      }
    }
  }
  return L.join('\n');
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });

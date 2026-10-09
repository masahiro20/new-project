// P3 Pitch — 評価協力モード（録音と判定結果を端末内だけに保存し、本人が zip で書き出す）
//
// 純粋な部分（test/evalmode.test.js でテスト）：CRC32、無圧縮 zip（STORE）、16 kHz モノラル wav、
// 保存レコードの組み立て、書き出す zip の中身（wav＋JSON、manifest.json、README.txt）。
// 画面の部分（mountEvalMode）：同意、話者情報の入力、一覧・削除、書き出し。
// 保存先はこのブラウザの IndexedDB だけ。ページは何も送信しない（fetch などは使わない）。
import { resample } from '../src/f0.js';
import { saveBlob, saverReady, downloadCapable } from './anki.js';

export const SCHEMA = 'p3pitch-eval/1';
export const EVAL_SR = 16000;
export const DB_NAME = 'p3pitch-eval';
export const DB_STORE = 'records';
export const F0_STEP = 2; // F0 列は 10 ms フレームを 2 つに 1 つへ間引く（20 ms 間隔）

// ---------- 選択肢（自由記述は持たない） ----------
export const SPEAKERS = {
  '': '答えない',
  native: '日本語ネイティブ',
  'learner-beginner': '学習者（入門・初級）',
  'learner-intermediate': '学習者（中級）',
  'learner-advanced': '学習者（上級）',
};
export const REGIONS = { '': '答えない', tokyo: '東京方言圏', other: 'それ以外' };
export const INTENTS = { unknown: 'わからない', dictionary: '辞書どおり', other: '違う型で言った' };

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- zip（無圧縮 STORE、UTF-8 ファイル名） ----------
const enc = new TextEncoder();
const toBytes = (d) => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));

/** Date → MS-DOS の日付・時刻（ローカル時刻、1980 年より前は 1980-01-01 に丸める）。 */
export function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * 無圧縮の zip を作る。files: [{ name, data: string|Uint8Array|ArrayBuffer }]。
 * @returns {Uint8Array}
 */
export function makeZip(files, { date = new Date() } = {}) {
  const { time, date: dday } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = toBytes(f.data);
    const crc = crc32(data);
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // 展開に必要なバージョン 2.0
    lv.setUint16(6, 0x0800, true); // bit 11: ファイル名は UTF-8
    lv.setUint16(8, 0, true); // STORE
    lv.setUint16(10, time, true);
    lv.setUint16(12, dday, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, dday, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, data);
    centrals.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length; }
  return out;
}

// ---------- wav ----------
/** モノラル 16 bit PCM の wav。 */
export function encodeWav16(samples, rate) {
  const n = samples.length;
  const buf = new Uint8Array(44 + n * 2);
  const v = new DataView(buf.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return buf;
}

/** 判定した部分の音声 → 16 kHz モノラル wav。 */
export const toEvalWav = (samples, rate) => encodeWav16(rate === EVAL_SR ? samples : resample(samples, rate, EVAL_SR), EVAL_SR);

// ---------- 保存レコード ----------
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const r2 = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null);

/** 保存してよい判定か：録音ファイル（source.kind === 'file'）で、音声があるときだけ。合成音声は保存しない。 */
export function shouldSave(e) {
  return !!(e && e.source && e.source.kind === 'file' && e.samples && e.samples.length && e.rate && e.word && e.result);
}

/** F0 列（10 ms）を間引く。時刻は秒、Hz は小数1桁、半音は小数2桁。無声は null。 */
export function thinF0(track, st, step = F0_STEP) {
  if (!track || !track.times) return null;
  const t = [], hz = [], sts = [];
  for (let i = 0; i < track.times.length; i += step) {
    t.push(r3(track.times[i]));
    const f = track.f0?.[i];
    hz.push(Number.isFinite(f) && f > 0 ? Math.round(f * 10) / 10 : null);
    const s = st?.[i];
    sts.push(Number.isFinite(s) ? Math.round(s * 100) / 100 : null);
  }
  return { stepSec: r3((track.times[1] - track.times[0]) * step) ?? null, t, hz, st: sts };
}

/** 判定結果のうち保存する部分。 */
export function resultSummary(r, track) {
  if (!r) return null;
  if (r.error) return { error: r.error, f0: thinF0(track, r.st) };
  return {
    pass: !!r.pass,
    verdict: r.verdict,
    detectedK: r.detectedK,
    expectedK: r.expectedK,
    equivalentK: r.equivalentK,
    flat: !!r.flat,
    stepSt: r3(r.stepSt),
    span: Array.isArray(r.span) ? r.span.map(r3) : null,
    segments: (r.segments ?? []).map((g) => ({ label: g.label, start: r3(g.start), end: r3(g.end), value: Number.isFinite(g.value) ? r3(g.value) : null })),
    f0: thinF0(track, r.st),
  };
}

/**
 * 「どの型で言ったつもりか」。form: { intent: 'unknown'|'dictionary'|'other', k }。
 * 練習モードでは、選んだターゲットの型で言ったつもりとして扱う。
 */
export function intendedFrom(form, word, practice) {
  if (practice) return { kind: 'practice-target', k: practice.targetK };
  const kind = form && INTENTS[form.intent] ? form.intent : 'unknown';
  if (kind === 'dictionary') return { kind, k: word.accent[0] };
  if (kind === 'other') {
    const k = Number(form.k);
    return Number.isInteger(k) && k >= 0 && k <= word.morae.length ? { kind, k } : { kind: 'unknown', k: null };
  }
  return { kind: 'unknown', k: null };
}

/**
 * 1 回の判定 → 保存レコード { meta, wav }。保存しないもの（合成音声など）は null。
 * e: { result, word, track, source, samples, rate, practice? }
 * ctx: { build, profile: { speaker, region }, form: { intent, k }, now: Date }
 * ファイル名は保存しない（個人名などが入っていることがある）。
 */
export function buildRecord(e, ctx = {}) {
  if (!shouldSave(e)) return null;
  const w = e.word;
  const wav = toEvalWav(e.samples, e.rate);
  const now = ctx.now ?? new Date();
  const s = e.source;
  const speaker = ctx.profile && SPEAKERS[ctx.profile.speaker] !== undefined ? ctx.profile.speaker : '';
  const region = ctx.profile && REGIONS[ctx.profile.region] !== undefined ? ctx.profile.region : '';
  const meta = {
    schema: SCHEMA,
    savedAt: now.toISOString(),
    build: String(ctx.build ?? ''),
    mode: e.practice ? 'practice' : 'check',
    word: { id: w.id, surface: w.surface, kana: w.kana, morae: w.morae, accent: w.accent, type: w.type ?? null },
    practice: e.practice ? { group: e.practice.group, target: e.practice.target, targetK: e.practice.targetK, classification: e.practice.classification ?? null } : null,
    speaker: { category: speaker || 'no-answer', region: region || 'no-answer' },
    intended: intendedFrom(ctx.form, w, e.practice),
    audio: {
      format: 'wav-pcm16-mono',
      sampleRate: EVAL_SR,
      durationSec: r3((wav.length - 44) / 2 / EVAL_SR),
      original: {
        sampleRate: e.rate,
        durationSec: r3(s.duration),
        utteranceStartSec: r3(s.start),
        utteranceEndSec: r3(s.end),
        decoder: s.decoder ?? null,
      },
    },
    result: resultSummary(e.result, e.track),
  };
  return { meta, wav };
}

/** 一覧の 1 行（日本語）。 */
export function verdictJa(meta) {
  const r = meta.result;
  if (!r) return '—';
  if (r.error) return '判定できず';
  return `${r.pass ? '✓ 合格' : '✗ 不合格'}（検出 k=${r.detectedK}）`;
}

// ---------- 書き出し ----------
const pad = (n, w = 2) => String(n).padStart(w, '0');
export const exportFileName = (d = new Date()) => `Pitch-eval-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.zip`;

export const README_TEXT = `P3 Pitch 評価協力データ
==========================

このファイルは、P3 Pitch（日本語の高低アクセント判定）の「評価協力モード」で、
あなたの端末のブラウザ内に保存した録音と判定結果を、あなた自身が書き出したものです。
アプリやページがこのファイルを自動で送信することはありません。

■ 中身
- manifest.json … 全体の一覧（件数、各録音の単語・判定・ファイル名、アプリのビルド番号、書き出し日時）
- rec-NNN-wXXXX.wav … 判定に使った部分の音声（16 kHz・モノラル・16 bit、最長約4秒）。
  元の録音ファイルそのもの・ファイル名・前後の無音や雑音部分は含みません。
- rec-NNN-wXXXX.json … その録音の情報
    word      : 単語（id・表記・かな・辞書のアクセント型）
    speaker   : 話者の区分・出身地域（選んだ場合だけ。no-answer＝答えない）
    intended  : どの型で言ったつもりか（dictionary＝辞書どおり／other＝違う型 k／unknown＝わからない／
                practice-target＝練習モードのターゲットの型）
    result    : 判定結果（合否、検出した下がり目 k、理由、モーラごとの時刻と高さ、間引いた声の高さの列）
    build     : アプリのビルド番号、savedAt: 保存日時

氏名・メールアドレスなど、個人を特定する情報は集めていません。
ただし、声そのものは個人に結びつく情報です。渡す相手は慎重に選んでください。

■ 権利とライセンス
- 録音の著作権・その他の権利は、話者であるあなたにあります。
- このファイルを書き出しただけでは、誰にも利用を許可したことになりません。

■ 開発者に渡す場合の同意文
このファイルを P3 Pitch の開発者に渡すことで、次のことに同意したものとします。

  1. 開発者は、この録音と結果を P3 Pitch の判定精度の検証と改善のためだけに使います。
  2. 録音を公開したり、第三者に渡したりしません。アプリの見本音声などに使う場合は、
     改めてあなたの許可を求めます（断っても構いません）。
  3. 開発者は検証が終わったら録音を削除します（保管期間は渡すときに確認してください）。
  4. あなたはいつでも、渡した録音の削除を開発者に求めることができます。

同意しない場合は、このファイルを渡さないでください。
渡し方（メール、ファイル共有など）は、あなたが選んでください。

■ 端末内のデータの消し方
アプリの「評価協力モード」の一覧で、1件ずつ、またはすべて削除できます。
ブラウザのサイトデータ（このサイトの保存データ）を消しても削除されます。
`;

/**
 * 保存済みレコード [{ id, meta, wav }] → zip に入れるファイルの一覧。
 */
export function buildExportFiles(records, { now = new Date(), build = '' } = {}) {
  const files = [];
  const list = [];
  records.forEach((rec, i) => {
    const base = `rec-${pad(i + 1, 3)}-${String(rec.meta.word?.id ?? 'w').replace(/[^\w-]/g, '')}`;
    const meta = { ...rec.meta, audio: { ...rec.meta.audio, file: `${base}.wav` } };
    files.push({ name: `${base}.wav`, data: toBytes(rec.wav) });
    files.push({ name: `${base}.json`, data: `${JSON.stringify(meta, null, 2)}\n` });
    const r = meta.result ?? {};
    list.push({
      n: i + 1, wav: `${base}.wav`, json: `${base}.json`, savedAt: meta.savedAt, build: meta.build, mode: meta.mode,
      wordId: meta.word?.id, surface: meta.word?.surface, kana: meta.word?.kana, accent: meta.word?.accent,
      pass: r.error ? null : r.pass ?? null, detectedK: r.error ? null : r.detectedK ?? null, verdict: r.error ? null : r.verdict ?? null, error: r.error ?? null,
      speaker: meta.speaker, intended: meta.intended,
    });
  });
  const manifest = {
    schema: SCHEMA,
    app: 'P3 Pitch',
    exportedAt: now.toISOString(),
    build: String(build),
    count: records.length,
    audioFormat: { container: 'wav', encoding: 'pcm16', channels: 1, sampleRate: EVAL_SR },
    records: list,
  };
  return [
    { name: 'README.txt', data: README_TEXT },
    { name: 'manifest.json', data: `${JSON.stringify(manifest, null, 2)}\n` },
    ...files,
  ];
}

/** レコード → zip（Uint8Array）。 */
export const buildExportZip = (records, opts = {}) => makeZip(buildExportFiles(records, opts), { date: opts.now ?? new Date() });

// ---------- 判定 → 保存（DOM なし。テストでは偽の store を渡す） ----------
/**
 * store: { add({ meta, wav }) → Promise<id> }。getCtx() → { build, profile, form }。
 * enabled() が true のときだけ、録音ファイルの判定を保存する。
 */
export function createRecorder({ store, enabled, getCtx, onSaved }) {
  return {
    async judged(e) {
      if (!enabled() || !shouldSave(e)) return null;
      const rec = buildRecord(e, { ...getCtx(), now: new Date() });
      if (!rec) return null;
      const id = await store.add(rec);
      onSaved?.(id, rec);
      return id;
    },
  };
}

// ---------- IndexedDB ----------
const req2p = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

/** 開く（なければ作る）。使えない環境では例外。 */
export async function openStore(idb = globalThis.indexedDB) {
  if (!idb) throw new Error('IndexedDB がありません');
  const db = await new Promise((ok, ko) => {
    let r;
    try { r = idb.open(DB_NAME, 1); } catch (e) { ko(e); return; }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
    r.onblocked = () => ko(new Error('blocked'));
  });
  const tx = (mode, fn) => {
    const t = db.transaction(DB_STORE, mode);
    const out = fn(t.objectStore(DB_STORE));
    return new Promise((ok, ko) => { t.oncomplete = () => ok(out); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); });
  };
  return {
    async add(rec) {
      // wav は ArrayBuffer で保存（Blob を IndexedDB に入れられない古いブラウザがあるため）。
      const buf = rec.wav.buffer.slice(rec.wav.byteOffset, rec.wav.byteOffset + rec.wav.byteLength);
      let req;
      await tx('readwrite', (s) => { req = s.add({ meta: rec.meta, wav: buf }); });
      return req.result;
    },
    async all() {
      let req;
      await tx('readonly', (s) => { req = s.getAll(); });
      return (req.result ?? []).map((r) => ({ id: r.id, meta: r.meta, wav: new Uint8Array(r.wav) }));
    },
    async metas() {
      // 一覧用：音声を読まずに済ませたいが、getAll で十分小さい（1件 ≤ 約128 KB）。
      return (await this.all()).map(({ id, meta, wav }) => ({ id, meta, bytes: wav.length }));
    },
    remove: (id) => tx('readwrite', (s) => { s.delete(id); }),
    clear: () => tx('readwrite', (s) => { s.clear(); }),
    close: () => db.close(),
  };
}

/** 既存のデータベースがあるか（作らずに調べる）。調べられない環境では null。 */
async function storeExists(idb) {
  try {
    if (!idb || typeof idb.databases !== 'function') return null;
    return (await idb.databases()).some((d) => d.name === DB_NAME);
  } catch { return null; }
}

// ---------- 画面 ----------
/**
 * 「評価協力モード」パネル（demo/template.html の #eval-*）をつなぐ。
 * ctx: { getCurrent() → 判定画面の単語, getBuild() → ビルド番号 }
 * 戻り値 { judged(e) }：demo.js（判定画面）と練習モードから、判定のたびに呼ぶ。
 */
export function mountEvalMode(ctx) {
  const $ = (id) => document.getElementById(id);
  if (!$('evalmode')) return { judged() {} };
  let store = null;
  let on = false;
  let count = 0;
  const status = (t) => { $('eval-status').textContent = t; };
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function unavailable(reason) {
    on = false;
    store = null;
    $('eval-unavailable').hidden = false;
    $('eval-unavailable').textContent = `この環境ではブラウザ内に保存できないため、評価協力モードは使えません（${reason}）。プライベートブラウズやサイトデータの保存をブロックしている場合に起こります。`;
    $('eval-toggle').disabled = true;
    $('eval-consent').hidden = true;
    render();
  }

  async function ensureStore() {
    if (store) return store;
    try {
      let idb;
      try { idb = globalThis.indexedDB; } catch (e) { throw new Error(e?.name || 'アクセスできません'); }
      if (!idb) throw new Error('IndexedDB がありません');
      store = await openStore(idb);
      return store;
    } catch (e) {
      unavailable(e?.name && e.name !== 'Error' ? e.name : e?.message || '不明なエラー');
      return null;
    }
  }

  function render() {
    $('eval-state').textContent = on ? 'オン：録音ファイルで判定すると、この端末に保存します' : 'オフ（何も保存していません）';
    $('eval-state').dataset.on = String(on);
    $('eval-toggle').hidden = on;
    $('eval-form').hidden = !on;
    $('eval-badge').hidden = !on;
    $('eval-badge-count').textContent = `${count} 件`;
    $('eval-count').textContent = `保存件数: ${count} 件`;
    $('eval-export').disabled = count === 0 || !downloadCapable();
    $('eval-clear').disabled = count === 0;
    $('eval-export-note').hidden = downloadCapable();
    if (count === 0) $('eval-clear-confirm').hidden = true;
  }

  function renderIntentK() {
    const w = ctx.getCurrent();
    const sel = $('eval-intent-k');
    const keep = sel.value;
    const frag = document.createDocumentFragment();
    for (let k = 0; k <= w.morae.length; k++) {
      if (w.accent.includes(k)) continue;
      const o = document.createElement('option');
      o.value = String(k);
      o.textContent = k === 0 ? 'k=0（平板・下がらない）' : k === w.morae.length ? `k=${k}（「が」で下がる）` : `k=${k}（「${w.morae[k - 1]}」の後で下がる）`;
      frag.append(o);
    }
    sel.replaceChildren(frag);
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
    $('eval-intent-k-wrap').hidden = $('eval-intent').value !== 'other' || sel.options.length === 0;
    $('eval-intent-word').textContent = `「${w.kana}が」`;
  }

  async function refreshList() {
    if (!store) { count = 0; $('eval-list').replaceChildren(); render(); return; }
    let rows = [];
    try { rows = await store.metas(); } catch (e) { status(`一覧を読めませんでした（${e?.name || e}）`); }
    count = rows.length;
    const frag = document.createDocumentFragment();
    for (const { id, meta } of rows.slice().reverse()) {
      const li = document.createElement('li');
      li.className = 'eval-item';
      const text = document.createElement('span');
      text.className = 'eval-item-text';
      const head = document.createElement('b');
      head.textContent = `${meta.word.surface}（${meta.word.kana}）`;
      const v = document.createElement('span');
      v.textContent = ` ${verdictJa(meta)}`;
      if (meta.result && !meta.result.error) v.dataset.pass = String(meta.result.pass === true);
      const sub = document.createElement('span');
      sub.className = 'eval-item-sub muted small';
      sub.textContent = `${fmtDate(meta.savedAt)}${meta.mode === 'practice' ? '・練習' : ''}`;
      text.append(head, v, sub);
      const del = document.createElement('button');
      del.type = 'button';
      del.id = `eval-del-${id}`;
      del.className = 'eval-del';
      del.textContent = '削除';
      del.setAttribute('aria-label', `${meta.word.surface} ${fmtDate(meta.savedAt)} の録音を削除`);
      del.addEventListener('click', async () => {
        try { await store.remove(id); status(`「${meta.word.surface}」の録音を1件削除しました。`); } catch (e) { status(`削除できませんでした（${e?.name || e}）`); }
        await refreshList();
      });
      li.append(text, del);
      frag.append(li);
    }
    $('eval-list').replaceChildren(frag);
    render();
  }

  const recorder = createRecorder({
    store: { add: (rec) => store.add(rec) },
    enabled: () => on && !!store,
    getCtx: () => ({
      build: ctx.getBuild(),
      profile: { speaker: $('eval-speaker').value, region: $('eval-region').value },
      form: { intent: $('eval-intent').value, k: $('eval-intent-k').value },
    }),
    onSaved: async (id, rec) => {
      await refreshList();
      status(`「${rec.meta.word.surface}」の録音と判定を保存しました（${count} 件）。`);
    },
  });

  // ----- 同意
  $('eval-toggle').addEventListener('click', () => {
    $('eval-consent').hidden = false;
    $('eval-agree').checked = false;
    $('eval-start').disabled = true;
    $('eval-agree').focus();
  });
  $('eval-agree').addEventListener('change', () => { $('eval-start').disabled = !$('eval-agree').checked; });
  $('eval-cancel').addEventListener('click', () => { $('eval-consent').hidden = true; $('eval-toggle').focus(); });
  $('eval-start').addEventListener('click', async () => {
    if (!$('eval-agree').checked) return;
    if (!(await ensureStore())) return;
    on = true;
    $('eval-consent').hidden = true;
    renderIntentK();
    await refreshList();
    status('評価協力モードをオンにしました。録音ファイルで判定すると、この端末に保存します。');
  });
  $('eval-off').addEventListener('click', () => {
    on = false;
    render();
    status('評価協力モードをオフにしました。保存済みの録音は、削除するまで残ります。');
  });
  $('eval-intent').addEventListener('change', renderIntentK);
  new MutationObserver(() => { if (on) renderIntentK(); }).observe($('word-surface'), { childList: true, characterData: true, subtree: true });

  // ----- 削除（全件はページ内の確認ステップ）
  $('eval-clear').addEventListener('click', () => {
    $('eval-clear-msg').textContent = `保存した ${count} 件をすべて削除します。元に戻せません。`;
    $('eval-clear-confirm').hidden = false;
    $('eval-clear-no').focus();
  });
  $('eval-clear-no').addEventListener('click', () => { $('eval-clear-confirm').hidden = true; $('eval-clear').focus(); });
  $('eval-clear-yes').addEventListener('click', async () => {
    $('eval-clear-confirm').hidden = true;
    try { await store?.clear(); status('すべて削除しました。'); } catch (e) { status(`削除できませんでした（${e?.name || e}）`); }
    await refreshList();
  });

  // ----- 書き出し
  $('eval-export').addEventListener('click', async () => {
    if (!store) return;
    $('eval-export').disabled = true;
    try {
      const recs = await store.all();
      const now = new Date();
      const zip = buildExportZip(recs, { now, build: ctx.getBuild() });
      const name = exportFileName(now);
      const ok = await saveBlob(new Blob([zip], { type: 'application/zip' }), name);
      status(ok ? `${name}（${recs.length} 件）を書き出しました。渡すかどうか、どう渡すかはご自身で決めてください。` : '書き出しませんでした。');
    } catch (e) {
      status(`書き出せませんでした（${e?.name || e}）`);
    }
    render();
  });

  // ----- 読み込み時：すでに保存がある場合だけ開いて一覧を出す（ない場合はデータベースを作らない）
  (async () => {
    let idb = null;
    try { idb = globalThis.indexedDB; } catch { idb = null; }
    if (!idb) { unavailable('IndexedDB がありません'); return; }
    const exists = await storeExists(idb);
    if (exists === true) { if (await ensureStore()) await refreshList(); }
    else if (exists === null) $('eval-show').hidden = false;
    render();
  })();
  $('eval-show').addEventListener('click', async () => {
    $('eval-show').hidden = true;
    if (await ensureStore()) await refreshList();
  });
  saverReady.then(render);
  render();

  return {
    judged(e) {
      recorder.judged(e).catch((err) => { console.warn(err); status(`保存できませんでした（${err?.name || err}）。容量が足りない可能性があります。`); });
    },
  };
}

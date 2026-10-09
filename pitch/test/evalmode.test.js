// 評価協力モード（demo/evalmode.js）の純粋な部分：zip の構造と CRC、manifest、保存レコードの形、
// 合成サンプルを保存しないこと。zip は実際に書き出して `unzip -t` でも検証する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  crc32, makeZip, dosDateTime, encodeWav16, toEvalWav, buildRecord, buildExportFiles, buildExportZip, shouldSave,
  createRecorder, exportFileName, intendedFrom, thinF0, README_TEXT, SCHEMA, EVAL_SR,
} from '../demo/evalmode.js';
import { readWav } from '../src/wav.js';
import { splitMorae } from '../src/mora.js';
import { synthesizeWord } from '../src/synth.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { PitchDetector } from '../vendor/pitchy.js';

const td = new TextDecoder();
const hashi = { id: 'w0001', surface: '橋', kana: 'はし', morae: splitMorae('はし'), accent: [2], type: 'odaka', gloss: 'bridge' };

/** zip を読む（中央ディレクトリから）。CRC とローカルヘッダの整合も確かめる。 */
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'EOCD signature');
  const n = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  assert.equal(cdOff + cdSize, eocd, 'central directory ends at EOCD');
  const out = [];
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, 'central header signature');
    assert.equal(dv.getUint16(p + 10, true), 0, 'STORE');
    assert.equal(dv.getUint16(p + 8, true) & 0x0800, 0x0800, 'UTF-8 flag');
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true), loc = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nameLen));
    assert.equal(size, usize);
    assert.equal(dv.getUint32(loc, true), 0x04034b50, 'local header signature');
    assert.equal(dv.getUint32(loc + 14, true), crc, 'local CRC = central CRC');
    const lName = dv.getUint16(loc + 26, true), lExtra = dv.getUint16(loc + 28, true);
    const data = buf.subarray(loc + 30 + lName + lExtra, loc + 30 + lName + lExtra + size);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    out.push({ name, data });
    p += 46 + nameLen;
  }
  return out;
}

function unzipTest(zip) {
  const dir = mkdtempSync(join(tmpdir(), 'pitch-eval-'));
  try {
    const f = join(dir, 'test.zip');
    writeFileSync(f, zip);
    return execFileSync('unzip', ['-t', f], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function synthJudged(k = 2, rate = 16000) {
  const { audio, sampleRate } = synthesizeWord(hashi.morae, k, { sampleRate: rate, baseHz: 140, seed: 3 });
  const tr = extractF0(PitchDetector, normalize(audio), sampleRate);
  return { samples: audio, rate: sampleRate, track: tr, result: judge(tr, hashi) };
}
const fileSource = { kind: 'file', name: '山田太郎_はし.m4a', duration: 2.4, start: 0.3, end: 1.6, decoder: 'native' };

test('crc32: 既知の値', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('makeZip: 構造・CRC・UTF-8 名、unzip -t で OK', () => {
  const bin = new Uint8Array(1000).map((_, i) => (i * 7) & 0xff);
  const zip = makeZip([{ name: 'a.txt', data: 'hello' }, { name: '日本語.json', data: '{"k":1}' }, { name: 'b.bin', data: bin }], { date: new Date(2026, 9, 9, 12, 34, 56) });
  const files = readZip(zip);
  assert.deepEqual(files.map((f) => f.name), ['a.txt', '日本語.json', 'b.bin']);
  assert.equal(td.decode(files[0].data), 'hello');
  assert.deepEqual([...files[2].data], [...bin]);
  const out = unzipTest(zip);
  assert.match(out, /No errors detected/);
});

test('encodeWav16 / toEvalWav: 16 kHz モノラル 16 bit、readWav で読める', () => {
  const s = Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 200 * i) / 48000));
  const wav = toEvalWav(s, 48000);
  const dv = new DataView(wav.buffer);
  assert.equal(td.decode(wav.subarray(0, 4)), 'RIFF');
  assert.equal(dv.getUint16(22, true), 1); // channels
  assert.equal(dv.getUint32(24, true), EVAL_SR);
  assert.equal(dv.getUint16(34, true), 16);
  const back = readWav(wav);
  assert.equal(back.sampleRate, 16000);
  assert.equal(back.samples.length, 1600);
  assert.ok(Math.max(...back.samples) > 0.4 && Math.max(...back.samples) < 0.55);
  assert.equal(encodeWav16(new Float32Array([2, -2]), 16000).length, 48); // クリップ
});

test('shouldSave: 録音ファイルだけ。合成サンプルは保存しない', () => {
  const j = synthJudged();
  assert.equal(shouldSave({ ...j, word: hashi, source: fileSource }), true);
  assert.equal(shouldSave({ ...j, word: hashi, source: { kind: 'sample', sample: 'correct', k: 2 } }), false);
  assert.equal(shouldSave({ ...j, word: hashi, source: { kind: 'sample', k: 2 }, practice: { targetK: 2 } }), false);
  assert.equal(shouldSave({ ...j, word: hashi, source: fileSource, samples: null }), false);
  assert.equal(buildRecord({ ...j, word: hashi, source: { kind: 'sample' } }), null);
});

test('buildRecord: 保存レコードの形（ファイル名・氏名は入らない）', () => {
  const j = synthJudged(2, 48000);
  const rec = buildRecord({ ...j, word: hashi, source: fileSource }, {
    build: '2026-10-09 · abc1234', profile: { speaker: 'learner-intermediate', region: 'other' }, form: { intent: 'dictionary' }, now: new Date('2026-10-09T05:00:00Z'),
  });
  const m = rec.meta;
  assert.equal(m.schema, SCHEMA);
  assert.equal(m.savedAt, '2026-10-09T05:00:00.000Z');
  assert.equal(m.build, '2026-10-09 · abc1234');
  assert.equal(m.mode, 'check');
  assert.deepEqual(m.word, { id: 'w0001', surface: '橋', kana: 'はし', morae: ['は', 'し'], accent: [2], type: 'odaka' });
  assert.deepEqual(m.speaker, { category: 'learner-intermediate', region: 'other' });
  assert.deepEqual(m.intended, { kind: 'dictionary', k: 2 });
  assert.equal(m.audio.sampleRate, 16000);
  assert.equal(m.audio.original.sampleRate, 48000);
  assert.equal(m.audio.original.utteranceStartSec, 0.3);
  assert.equal(readWav(rec.wav).sampleRate, 16000);
  assert.ok(Math.abs(m.audio.durationSec - j.samples.length / 48000) < 0.01);
  const r = m.result;
  assert.equal(r.pass, true);
  assert.equal(r.detectedK, 2);
  assert.equal(r.verdict, 'match');
  assert.equal(r.segments.length, 3);
  for (const g of r.segments) assert.deepEqual(Object.keys(g), ['label', 'start', 'end', 'value']);
  assert.deepEqual(r.segments.map((g) => g.label), ['は', 'し', 'が']);
  assert.ok(r.f0.t.length <= Math.ceil(j.track.times.length / 2) && r.f0.t.length > 10, 'F0 は間引く');
  assert.equal(r.f0.t.length, r.f0.hz.length);
  assert.equal(r.f0.st.length, r.f0.hz.length);
  assert.ok(!('candidates' in r) && !('st' in r));
  const json = JSON.stringify(m);
  assert.ok(!json.includes('山田') && !json.includes('.m4a'), 'ファイル名は保存しない');
  assert.ok(!/name|mail/i.test(Object.keys(m).join(' ')));
});

test('buildRecord: 判定できない録音も保存（error）、任意項目は答えないが既定', () => {
  const silent = new Float32Array(16000);
  const tr = extractF0(PitchDetector, silent, 16000);
  const rec = buildRecord({ result: judge(tr, hashi), track: tr, samples: silent, rate: 16000, word: hashi, source: fileSource }, {});
  assert.equal(rec.meta.result.error, 'no-voice');
  assert.deepEqual(rec.meta.speaker, { category: 'no-answer', region: 'no-answer' });
  assert.deepEqual(rec.meta.intended, { kind: 'unknown', k: null });
});

test('intendedFrom: 違う型（k）、範囲外は unknown、練習はターゲット', () => {
  assert.deepEqual(intendedFrom({ intent: 'other', k: '1' }, hashi), { kind: 'other', k: 1 });
  assert.deepEqual(intendedFrom({ intent: 'other', k: '9' }, hashi), { kind: 'unknown', k: null });
  assert.deepEqual(intendedFrom({ intent: 'evil' }, hashi), { kind: 'unknown', k: null });
  assert.deepEqual(intendedFrom({ intent: 'dictionary' }, hashi, { targetK: 0 }), { kind: 'practice-target', k: 0 });
});

test('thinF0: 2 フレームに 1 つ、無声は null', () => {
  const t = thinF0({ times: [0, 0.01, 0.02, 0.03, 0.04], f0: [0, 150.04, 151.26, 0, 149] }, [NaN, 1, 2.345, NaN, 3]);
  assert.deepEqual(t, { stepSec: 0.02, t: [0, 0.02, 0.04], hz: [null, 151.3, 149], st: [null, 2.35, 3] });
});

test('createRecorder: オンのときだけ、録音ファイルだけ保存する', async () => {
  const saved = [];
  let on = false;
  const rc = createRecorder({ store: { add: async (r) => { saved.push(r); return saved.length; } }, enabled: () => on, getCtx: () => ({ build: 'b' }) });
  const j = synthJudged();
  assert.equal(await rc.judged({ ...j, word: hashi, source: fileSource }), null, 'オフ');
  on = true;
  assert.equal(await rc.judged({ ...j, word: hashi, source: { kind: 'sample', sample: 'correct', k: 2 } }), null, '合成サンプル');
  assert.equal(await rc.judged({ ...j, word: hashi, source: { kind: 'sample', k: 2 }, practice: { group: 'はし', target: 'x', targetK: 2 } }), null, '練習の合成サンプル');
  assert.equal(saved.length, 0);
  assert.equal(await rc.judged({ ...j, word: hashi, source: fileSource }), 1);
  assert.equal(await rc.judged({ ...j, word: hashi, source: fileSource, practice: { group: 'はし', target: 'o2', targetK: 2, classification: 'match' } }), 2);
  assert.equal(saved[1].meta.mode, 'practice');
  assert.deepEqual(saved[1].meta.intended, { kind: 'practice-target', k: 2 });
});

test('書き出し: README・manifest・wav＋JSON、unzip -t で OK', () => {
  const j = synthJudged();
  const now = new Date(2026, 9, 9, 15, 0, 0);
  const recs = [1, 2].map((id) => ({ id, ...buildRecord({ ...j, word: hashi, source: fileSource }, { build: 'B1', now }) }));
  const files = buildExportFiles(recs, { now, build: 'B1' });
  assert.deepEqual(files.map((f) => f.name), ['README.txt', 'manifest.json', 'rec-001-w0001.wav', 'rec-001-w0001.json', 'rec-002-w0001.wav', 'rec-002-w0001.json']);
  const zip = buildExportZip(recs, { now, build: 'B1' });
  const got = readZip(zip);
  assert.deepEqual(got.map((f) => f.name), files.map((f) => f.name));
  const manifest = JSON.parse(td.decode(got[1].data));
  assert.equal(manifest.schema, SCHEMA);
  assert.equal(manifest.count, 2);
  assert.equal(manifest.build, 'B1');
  assert.match(manifest.exportId, /^[0-9a-f-]{32,36}$/, '削除の依頼に使う exportId');
  assert.notEqual(JSON.parse(buildExportFiles(recs, { now, build: 'B1' })[1].data).exportId, manifest.exportId, '書き出しごとに変わる');
  assert.deepEqual(manifest.audioFormat, { container: 'wav', encoding: 'pcm16', channels: 1, sampleRate: 16000 });
  assert.deepEqual(manifest.records.map((r) => [r.wav, r.json, r.wordId, r.pass, r.detectedK]), [
    ['rec-001-w0001.wav', 'rec-001-w0001.json', 'w0001', true, 2], ['rec-002-w0001.wav', 'rec-002-w0001.json', 'w0001', true, 2],
  ]);
  const one = JSON.parse(td.decode(got[3].data));
  assert.equal(one.audio.file, 'rec-001-w0001.wav');
  assert.equal(readWav(got[2].data).sampleRate, 16000);
  const readme = td.decode(got[0].data);
  assert.equal(readme, README_TEXT);
  assert.match(readme, /権利.*話者/);
  assert.match(readme, /同意文/);
  assert.match(readme, /exportId/);
  assert.match(unzipTest(zip), /No errors detected/);
  assert.match(unzipTest(buildExportZip([], { now })), /No errors detected/);
});

test('dosDateTime: UTC で書く（タイムゾーンを zip に残さない）', () => {
  const d = new Date('2026-10-09T05:02:40Z');
  assert.deepEqual(dosDateTime(d), { time: (5 << 11) | (2 << 5) | 20, date: (46 << 9) | (10 << 5) | 9 });
});

test('exportFileName: Pitch-eval-YYYYMMDD.zip', () => {
  assert.equal(exportFileName(new Date(2026, 0, 5, 23, 59)), 'Pitch-eval-20260105.zip');
});

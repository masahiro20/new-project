// 創設サポーター：キーの発行→検証、形式の揺れ、改ざん・別鍵・取り消し、未設定の公開鍵（fail closed）、
// 1日の判定数の数え方と日付の切り替わり、各機能のゲート、単語リストと練習の記録の純粋関数、CLI。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLAN, signKey, verifyKey, parseKey, normalizeKeyText, base32Encode, base32Decode, encodePayload, decodePayload,
  createEntitlement, memoryStorage, createJudgeGate, gatesFor, pairOpen, usageCheck, usageRecord, localDay,
  countsAsJudgement, STORAGE_KEYS, ECDSA, isConfiguredKey, planRows,
} from '../demo/supporter.js';

// 販売開始前は PLAN.freeLimitsActive = false。無料枠のテストは適用した状態で行う
const LIMITED = { ...PLAN, freeLimitsActive: true };
import { SUPPORTER_PUBLIC_KEY, REVOKED_SERIALS } from '../demo/supporter-pubkey.js';
import { emptyLists, createList, renameList, deleteList, addWords, removeWord, setActive, activeList, listWords, sanitizeLists } from '../demo/mylists.js';
import { emptyHistory, recordJudgement, summarize, addDays, sanitizeHistory } from '../demo/progress.js';

const { subtle } = globalThis.crypto;
const pubOf = async (pair) => { const j = await subtle.exportKey('jwk', pair.publicKey); return { kty: 'EC', crv: 'P-256', x: j.x, y: j.y }; };
const pairA = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
const pairB = await subtle.generateKey(ECDSA, true, ['sign', 'verify']);
const pubA = await pubOf(pairA);
const pubB = await pubOf(pairB);
const keyA = await signKey(pairA.privateKey, { serial: 42, issued: '2026-10-09', flags: 1 });

test('base32 (Crockford): 往復し、余りのビットが 0 でない書き方は拒否', () => {
  for (const n of [0, 1, 5, 9, 73]) {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
    assert.deepEqual(base32Decode(base32Encode(b)), b);
  }
  assert.equal(base32Decode('U'), null); // U は使わない
  assert.equal(base32Decode('01'), null); // 余りのビットが 0 でない
  assert.deepEqual(base32Decode('O0'), base32Decode('00'));
  assert.deepEqual(base32Decode('IL'), base32Decode('11'));
});

test('中身：版・通し番号・発行日・機能フラグだけ（個人情報なし）', () => {
  const p = encodePayload({ serial: 123456, issued: '2026-10-09', flags: 3 });
  assert.equal(p.length, 9);
  assert.deepEqual(decodePayload(p), { version: 1, serial: 123456, issued: '2026-10-09', flags: 3 });
  assert.throws(() => encodePayload({ serial: 0, issued: '2026-10-09' }));
  assert.throws(() => encodePayload({ serial: 1, issued: '2026-02-30' }));
  assert.throws(() => encodePayload({ serial: 1, issued: '2023-12-31' }));
  const r = parseKey(keyA);
  assert.deepEqual(Object.keys(r.info).sort(), ['flags', 'issued', 'serial', 'version']);
});

test('発行→検証：正しいキーは通り、中身が読める', async () => {
  assert.match(keyA, /^PITCH(-[0-9A-HJKMNP-TV-Z]{1,5})+$/);
  const r = await verifyKey(keyA, { publicKey: pubA, revoked: [] });
  assert.equal(r.ok, true);
  assert.equal(r.serial, 42);
  assert.equal(r.issued, '2026-10-09');
  assert.equal(r.flags, 1);
  assert.equal(r.key, keyA);
});

test('形式の揺れ：前後の空白・改行・小文字・全角・ハイフンの有無・別のダッシュ・O と 0 の取り違え', async () => {
  const body = keyA.slice('PITCH-'.length);
  const variants = [
    `  ${keyA}\n`,
    keyA.toLowerCase(),
    keyA.replace(/-/g, ''),
    keyA.replace(/-/g, ' '),
    keyA.replace(/-/g, '\n'),
    body, // PITCH- なし
    keyA.replace(/-/g, 'ー'), // 日本語入力の長音
    keyA.replace(/-/g, '－'), // 全角ハイフン
    keyA.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)), // 全角英数
    keyA.replace(/0/g, 'O'),
    keyA.replace(/1/g, 'l'),
    `\t${keyA.slice(0, 40)}\r\n${keyA.slice(40)}  `,
  ];
  for (const v of variants) {
    const r = await verifyKey(v, { publicKey: pubA, revoked: [] });
    assert.equal(r.ok, true, `variant failed: ${JSON.stringify(v)}`);
    assert.equal(r.key, keyA);
  }
  assert.equal(normalizeKeyText(' pitch-ab cd '), 'ABCD');
});

test('改ざん・別鍵・取り消し・壊れた入力は通らない', async () => {
  const opts = { publicKey: pubA, revoked: [] };
  // 1文字ずつ変える（中身でも署名でも）
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (const pos of [6, 7, 12, 20, 60, keyA.length - 3]) {
    const c = keyA[pos];
    if (c === '-') continue;
    const swapped = keyA.slice(0, pos) + chars[(chars.indexOf(c) + 1) % 32] + keyA.slice(pos + 1);
    const r = await verifyKey(swapped, opts);
    assert.equal(r.ok, false, `tampered at ${pos}`);
  }
  // 別の鍵で署名したキー／別の公開鍵
  const keyB = await signKey(pairB.privateKey, { serial: 42, issued: '2026-10-09', flags: 1 });
  assert.deepEqual(await verifyKey(keyB, opts), { ok: false, reason: 'signature' });
  assert.equal((await verifyKey(keyA, { publicKey: pubB, revoked: [] })).reason, 'signature');
  // 取り消し
  const rv = await verifyKey(keyA, { publicKey: pubA, revoked: [42] });
  assert.equal(rv.ok, false);
  assert.equal(rv.reason, 'revoked');
  assert.equal((await verifyKey(keyA, { publicKey: pubA, revoked: [41, 43] })).ok, true);
  // 形式
  assert.equal((await verifyKey('', opts)).reason, 'empty');
  assert.equal((await verifyKey('PITCH-HELLO', opts)).reason, 'format');
  assert.equal((await verifyKey(keyA.slice(0, -2), opts)).reason, 'format');
  assert.equal((await verifyKey(`${keyA}00`, opts)).reason, 'format');
  assert.equal((await verifyKey('PITCH-UUUUU', opts)).reason, 'format');
  // 版が違う（同じ長さで先頭のバイトだけ 2）
  const bytes = base32Decode(normalizeKeyText(keyA));
  bytes[0] = 2;
  assert.equal((await verifyKey(base32Encode(bytes), opts)).reason, 'version');
});

test('未設定の公開鍵では何も解除しない（fail closed）', async () => {
  assert.equal(SUPPORTER_PUBLIC_KEY, null, 'リポジトリの demo/supporter-pubkey.js は未設定のまま（本番の鍵はオーナー判断）');
  assert.deepEqual(REVOKED_SERIALS, []);
  assert.equal(isConfiguredKey(null), false);
  assert.equal(isConfiguredKey({ kty: 'EC', crv: 'P-384', x: 'a', y: 'b' }), false);
  assert.equal(isConfiguredKey({ ...pubA, d: 'secret' }), false); // 秘密鍵入りの JWK は公開鍵として使わない
  assert.equal((await verifyKey(keyA)).reason, 'unconfigured'); // 既定 = リポジトリの公開鍵ファイル
  assert.equal((await verifyKey(keyA, { publicKey: null })).reason, 'unconfigured');
  assert.equal((await verifyKey(keyA, { publicKey: pubA, subtle: null })).reason, 'unsupported');
  assert.equal((await verifyKey(keyA, { publicKey: { kty: 'EC', crv: 'P-256', x: 'AAAA', y: 'AAAA' } })).reason, 'signature'); // 壊れた公開鍵

  const storage = memoryStorage({ [STORAGE_KEYS.key]: keyA }); // 有効なキーが保存されていても
  const ent = createEntitlement({ publicKey: null, revoked: [], storage });
  assert.equal(ent.configured, false);
  await ent.load();
  assert.equal(ent.state.status, 'unconfigured');
  assert.equal(ent.isSupporter(), false);
  const r = await ent.activate(keyA);
  assert.equal(r.ok, false);
  assert.equal(ent.isSupporter(), false);
  assert.deepEqual(gatesFor(ent.isSupporter()), gatesFor(false));
});

test('解除の状態：検証済みのキーを保存し、読み直し、削除で無料に戻る', async () => {
  const storage = memoryStorage();
  const ent = createEntitlement({ publicKey: pubA, revoked: [], storage });
  const seen = [];
  ent.subscribe((s) => seen.push(s.status));
  assert.equal(ent.state.status, 'free');
  assert.equal((await ent.activate('not a key')).ok, false);
  assert.equal(storage.get(STORAGE_KEYS.key), null, '通らないキーは保存しない');
  const r = await ent.activate(` ${keyA.toLowerCase()} `);
  assert.equal(r.ok, true);
  assert.equal(r.saved, true);
  assert.equal(storage.get(STORAGE_KEYS.key), keyA, '表示形で保存');
  assert.equal(ent.isSupporter(), true);

  const again = createEntitlement({ publicKey: pubA, revoked: [], storage });
  await again.load();
  assert.equal(again.isSupporter(), true);
  assert.equal(again.state.info.serial, 42);
  // あとで取り消された
  const revoked = createEntitlement({ publicKey: pubA, revoked: [42], storage });
  await revoked.load();
  assert.equal(revoked.isSupporter(), false);
  assert.equal(revoked.state.stored, 'revoked');
  // 削除
  ent.remove();
  assert.equal(ent.isSupporter(), false);
  assert.equal(storage.get(STORAGE_KEYS.key), null);
  assert.deepEqual(seen, ['supporter', 'free']);
  // 保存できない環境でも、そのページの間は解除できる
  const broken = { get: () => null, set: () => false, remove: () => false, getJSON: () => null, setJSON: () => false };
  const e2 = createEntitlement({ publicKey: pubA, revoked: [], storage: broken });
  const r2 = await e2.activate(keyA);
  assert.equal(r2.ok, true);
  assert.equal(r2.saved, false);
  assert.equal(e2.isSupporter(), true);
});

test('1日20語：異なる語を数え、同じ語のやり直しは数えない。21語目で止まる', () => {
  const limit = PLAN.freeDailyJudgeLimit;
  assert.equal(limit, 20);
  let s = null;
  const day = '2026-10-09';
  for (let i = 1; i <= limit; i++) {
    assert.equal(usageCheck(s, `w${i}`, day, limit).allowed, true, `word ${i}`);
    s = usageRecord(s, `w${i}`, day);
    s = usageRecord(s, `w${i}`, day); // やり直し
  }
  assert.equal(s.words.length, limit);
  const c21 = usageCheck(s, 'w21', day, limit);
  assert.equal(c21.allowed, false);
  assert.equal(c21.used, 20);
  assert.equal(usageCheck(s, 'w5', day, limit).allowed, true, '今日すでに判定した語はもう一度できる');
  // 日付が変わると 0 から
  const next = usageCheck(s, 'w21', '2026-10-10', limit);
  assert.equal(next.allowed, true);
  assert.equal(next.used, 0);
  assert.deepEqual(usageRecord(s, 'w21', '2026-10-10'), { day: '2026-10-10', words: ['w21'] });
  // 壊れた保存データ
  assert.equal(usageCheck({ day, words: 'x' }, 'w1', day, limit).allowed, true);
});

test('判定の門番：端末の日付で数え、合成音声・エラー・評価協力モードは数えない', async () => {
  const storage = memoryStorage();
  let clock = new Date(2026, 9, 9, 23, 50); // ローカル時刻
  let exempt = false;
  const ent = createEntitlement({ publicKey: pubA, revoked: [], storage });
  const gate = createJudgeGate({ entitlement: ent, storage, now: () => clock, isExempt: () => exempt, plan: LIMITED });
  const word = (i) => ({ id: `w${String(i).padStart(4, '0')}` });
  const fileJudge = (w, extra = {}) => ({ word: w, result: { pass: true }, source: { kind: 'file' }, ...extra });

  assert.equal(countsAsJudgement({ word: word(1), result: { pass: true }, source: { kind: 'sample' } }), false);
  assert.equal(countsAsJudgement({ word: word(1), result: { error: 'no-voice' }, source: { kind: 'file' } }), false);
  assert.equal(countsAsJudgement(fileJudge(word(1))), true);

  for (let i = 1; i <= 20; i++) {
    assert.equal(gate.check(word(i)), null);
    gate.record(fileJudge(word(i)));
    gate.record({ word: word(100 + i), result: { pass: true }, source: { kind: 'sample' } }); // 数えない
    gate.record({ word: word(200 + i), result: { error: 'too-short' }, source: { kind: 'file' } }); // 数えない
  }
  assert.equal(gate.used(), 20);
  const msg = gate.check(word(21));
  assert.match(msg, /20語/);
  assert.match(msg, /判定の中身は同じ/); // 判定の質ではなく回数の話
  assert.equal(gate.check(word(3)), null);
  assert.equal(JSON.parse(storage.get(STORAGE_KEYS.usage)).day, '2026-10-09');

  // 評価協力モード中は止めないし数えない
  exempt = true;
  assert.equal(gate.check(word(21)), null);
  assert.equal(gate.record(fileJudge(word(21))), false);
  exempt = false;
  assert.notEqual(gate.check(word(21)), null);

  // サポーターは無制限
  await ent.activate(keyA);
  assert.equal(gate.limit(), Infinity);
  assert.equal(gate.check(word(21)), null);
  ent.remove();
  assert.notEqual(gate.check(word(21)), null);

  // 端末の時計で日付が変わる（ローカルの 0 時）
  clock = new Date(2026, 9, 10, 0, 5);
  assert.equal(localDay(clock), '2026-10-10');
  assert.equal(gate.used(), 0);
  assert.equal(gate.check(word(21)), null);
});

test('各機能のゲート：無料とサポーター（文書の表どおり）', () => {
  const free = gatesFor(false, LIMITED);
  assert.equal(free.dailyJudgeLimit, 20);
  assert.equal(free.practicePairs, PLAN.freePracticePairs);
  assert.deepEqual([...free.ankiScopes], ['failed']);
  assert.equal(free.lists, false);
  assert.equal(free.historyDays, 7);
  assert.equal(pairOpen(free, 0), true);
  assert.equal(pairOpen(free, PLAN.freePracticePairs - 1), true);
  assert.equal(pairOpen(free, PLAN.freePracticePairs), false);

  const sup = gatesFor(true, LIMITED);
  assert.equal(sup.dailyJudgeLimit, Infinity);
  assert.equal(pairOpen(sup, 28), true);
  assert.deepEqual([...sup.ankiScopes].sort(), ['current', 'failed', 'list', 'pairs', 'results']);
  assert.equal(sup.lists, true);
  assert.equal(sup.historyDays, Infinity);

  // 無料枠を止める定数（販売前の扱いはオーナー判断）
  const off = gatesFor(false, { ...PLAN, freeLimitsActive: false });
  assert.equal(off.dailyJudgeLimit, Infinity);
  assert.equal(off.supporter, false);

  // 表の文言は定数から
  const rows = planRows();
  assert.ok(rows.some((r) => r[1].includes('1日20語')));
  assert.ok(rows.some((r) => r[0].includes('共有カード') && r[1] === '○' && r[2] === '○'));
  assert.equal(PLAN.kofiUrl, '', 'Ko-fi の URL は未定（空 = 準備中）');
  assert.match(PLAN.betaNote, /ベータ/);
  assert.match(PLAN.betaNote, /精度を約束するものではありません/);
});

test('自分の単語リスト：作成・名前・追加（重複なし）・外す・削除・壊れたデータ', () => {
  let s = emptyLists();
  let r = createList(s, '  第5課  の単語 ');
  s = r.state;
  assert.equal(activeList(s).name, '第5課 の単語');
  r = createList(s, '');
  s = r.state;
  assert.equal(activeList(s).name, '単語リスト 2');
  assert.equal(s.active, r.id);
  s = setActive(s, 'l1');
  let a = addWords(s, 'l1', ['w0001', 'w0002', 'w0001']);
  s = a.state;
  assert.equal(a.added, 2);
  a = addWords(s, 'l1', ['w0002', 'w0003']);
  s = a.state;
  assert.equal(a.added, 1);
  assert.deepEqual(activeList(s).words, ['w0001', 'w0002', 'w0003']);
  s = removeWord(s, 'l1', 'w0002');
  const byId = new Map([['w0001', { id: 'w0001' }], ['w0003', { id: 'w0003' }]]);
  assert.deepEqual(listWords(activeList(s), byId).map((w) => w.id), ['w0001', 'w0003']);
  s = renameList(s, 'l1', 'x'.repeat(60));
  assert.equal(activeList(s).name.length, 40);
  s = deleteList(s, 'l1');
  assert.equal(s.active, 'l2');
  assert.equal(createList(s, 'c').id, 'l3');
  assert.deepEqual(sanitizeLists({ v: 1, lists: [{ id: 'l9', name: 'n', words: ['w1', 3, 'w1'] }, null], active: 'zz' }), { v: 1, lists: [{ id: 'l9', name: 'n', words: ['w1'] }], active: 'l9' });
  assert.deepEqual(sanitizeLists('garbage'), emptyLists());
});

test('練習の記録：日ごと・型ごと、無料は直近7日、サポーターは全期間', () => {
  let h = emptyHistory();
  const add = (day, type, pass) => { h = recordJudgement(h, { day, type, pass }); };
  add('2026-10-09', 'heiban', true);
  add('2026-10-09', 'heiban', false);
  add('2026-10-09', 'atamadaka', true);
  add('2026-10-03', 'odaka', true); // 7日前の端（含む）
  add('2026-10-02', 'odaka', false); // 8日前（無料では見えない）
  add('2025-12-31', 'nakadaka', true);
  assert.equal(addDays('2026-10-09', -6), '2026-10-03');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  const free = summarize(h, { today: '2026-10-09', window: 7 });
  assert.deepEqual(free.days.map((d) => d.day), ['2026-10-09', '2026-10-03']);
  assert.deepEqual(free.total, { n: 4, pass: 3 });
  assert.deepEqual(free.byType.heiban, { n: 2, pass: 1 });
  assert.equal(free.hiddenDays, 2);
  const all = summarize(h, { today: '2026-10-09' });
  assert.equal(all.days.length, 4);
  assert.deepEqual(all.total, { n: 6, pass: 4 });
  assert.deepEqual(all.byType.nakadaka, { n: 1, pass: 1 });
  assert.equal(all.hiddenDays, 0);
  assert.deepEqual(sanitizeHistory(JSON.parse(JSON.stringify(h))), h);
  assert.deepEqual(sanitizeHistory({ v: 1, days: { bad: {}, '2026-01-01': { n: '2', pass: 1, t: { heiban: [2, 1], x: [1, 1] } } } }).days, { '2026-01-01': { n: 2, pass: 1, t: { heiban: [2, 1] } } });
});

test('scripts/supporter-key.mjs：init（リポジトリ外・0600）→ issue → verify → revoke', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pitch-sk-'));
  try {
    const script = new URL('../scripts/supporter-key.mjs', import.meta.url).pathname;
    const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8' });
    const pub = join(dir, 'pub.js');
    const priv = join(dir, 'secret', 'k.pem');
    // リポジトリの中には書かない
    const inside = run('init', '--key', new URL('../tmp-should-not-exist.pem', import.meta.url).pathname, '--pubkey-out', pub);
    assert.notEqual(inside.status, 0);
    assert.match(inside.stderr, /refusing/);
    assert.equal(run('init', '--key', priv, '--pubkey-out', pub).status, 0);
    assert.equal(statSync(priv).mode & 0o777, 0o600);
    assert.match(readFileSync(priv, 'utf8'), /BEGIN PRIVATE KEY/);
    assert.doesNotMatch(readFileSync(pub, 'utf8'), /"d"/, '公開鍵ファイルに秘密の値を書かない');
    assert.notEqual(run('init', '--key', priv, '--pubkey-out', pub).status, 0, '既存の秘密鍵を上書きしない');
    assert.notEqual(run('init', '--key', join(dir, 'other.pem'), '--pubkey-out', pub).status, 0, '設定済みの公開鍵は --force なしで置き換えない');
    const key = execFileSync(process.execPath, [script, 'issue', '--key', priv, '--serial', '5', '--date', '2026-10-01', '--pubkey', pub], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    assert.match(key, /^PITCH-/);
    const ok = run('verify', key.toLowerCase(), '--pubkey', pub);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /OK serial=5 issued=2026-10-01 flags=1/);
    assert.equal(run('verify', key).status, 2, 'リポジトリの未設定の公開鍵では通らない');
    // 別の鍵ペアの秘密鍵では発行しない
    const pub2 = join(dir, 'pub2.js');
    assert.equal(run('init', '--key', join(dir, 'k2.pem'), '--pubkey-out', pub2).status, 0);
    assert.notEqual(run('issue', '--key', join(dir, 'k2.pem'), '--serial', '6', '--pubkey', pub).status, 0);
    // 取り消し
    assert.equal(run('revoke', '--serial', '5', '--pubkey', pub).status, 0);
    const ng = run('verify', key, '--pubkey', pub);
    assert.equal(ng.status, 2);
    assert.match(ng.stdout, /NG revoked/);
    assert.notEqual(run('issue', '--key', priv, '--serial', '5', '--pubkey', pub).status, 0, '取り消した番号では発行しない');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

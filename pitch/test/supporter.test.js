// 創設サポーター：Ed25519 のキー（Atlas REPORT §5 の要件）、RFC 8032 のテストベクタ（2つの経路）、
// §5-9 の偽造のテストパターン、保存・#key=・漏らさないこと、1日の判定数、各機能のゲート、
// 単語リストと練習の記録の純粋関数、テスト用の鍵の道具（CLI）、公開物の秘密鍵の検査。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, statSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PLAN, verifyKey, parseKey, normalizeKeyText, base32Encode, base32Decode, encodePayload, decodePayload, signedMessage, assembleKey,
  createEntitlement, memoryStorage, createJudgeGate, gatesFor, pairOpen, usageCheck, usageRecord, localDay,
  countsAsJudgement, STORAGE_KEYS, LEGACY_STORAGE_KEYS, isConfigured, planRows, validateKeyList, keysFingerprint, takeKeyFromLocation,
  REASON_TEXT, KEY_CHARS, MAX_INPUT, DOMAIN, TEST_KID_MIN, shortId,
} from '../demo/supporter.js';
import { ed25519Verify, precheck, strongPoint, L, publicKeyFromSeed, signWithSeed } from '../demo/ed25519.js';
import { Point } from '../vendor/noble-ed25519.js';
import { SUPPORTER_KEYS, RETIRED_KIDS, REVOKED_LIDS } from '../demo/supporter-pubkey.js';
import { signKey, pubHex } from '../scripts/supporter-sign.mjs';
import { buildExportFiles } from '../demo/evalmode.js';
import { emptyLists, createList, renameList, deleteList, addWords, removeWord, setActive, activeList, listWords, sanitizeLists } from '../demo/mylists.js';
import { emptyHistory, recordJudgement, summarize, addDays, sanitizeHistory } from '../demo/progress.js';

// 販売開始前は PLAN.freeLimitsActive = false。無料枠のテストは適用した状態で行う
const LIMITED = { ...PLAN, freeLimitsActive: true };

const h2b = (s) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
const b2h = (b) => Buffer.from(b).toString('hex');
const seedOf = (n) => Uint8Array.from({ length: 32 }, (_, i) => (i * 29 + n * 101 + 7) & 255);

// 鍵A（kid 1）・鍵B（kid 2）・鍵A を名乗る別の鍵（kid 1 で署名）
const seedA = seedOf(1), seedB = seedOf(2), seedEvil = seedOf(3);
const KEYS = [{ kid: 1, pub: await pubHex(seedA) }, { kid: 2, pub: await pubHex(seedB) }];
const OPTS = { keys: KEYS, retired: [], revoked: [] };
const LID1 = '00112233445566778899aabbccddeeff';
const LID2 = 'ffeeddccbbaa99887766554433221100';
const keyA = await signKey(seedA, { kid: 1, lid: LID1, plan: 1, iat: '2026-10-09' });
const keyA2 = await signKey(seedA, { kid: 1, lid: LID2, plan: 1, iat: '2026-10-10' });
const keyB = await signKey(seedB, { kid: 2, lid: LID2, plan: 1, iat: '2026-10-09' });

/** キー文字列 → バイト列（85）／バイト列 → キー文字列 */
const bytesOf = (k) => base32Decode(normalizeKeyText(k).slice('PITCH1'.length));
const keyOf = (bytes) => `PITCH1-${base32Encode(bytes)}`;
/** 2つの経路（WebCrypto・純 JS）で同じ結果になることも確かめる */
async function both(input, opts = OPTS) {
  const a = await verifyKey(input, { ...opts, webcrypto: true });
  const b = await verifyKey(input, { ...opts, webcrypto: false });
  const strip = ({ path, ...r }) => r;
  assert.deepEqual(strip(a), strip(b), `paths disagree for ${String(input).slice(0, 30)}…`);
  if (a.ok) { assert.equal(a.path, 'webcrypto'); assert.equal(b.path, 'noble'); }
  return a;
}

// ---------------------------------------------------------------- RFC 8032
const RFC8032 = [
  ['9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '', 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'],
  ['4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', '72', '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'],
  ['c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', 'af82', '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a'],
  ['833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42', 'ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf', 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f', 'dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704'],
];

test('RFC 8032 のテストベクタ：WebCrypto と純 JS の両方で通り、1ビット変えると両方で落ちる', async () => {
  for (const [sk, pk, msg, sig] of RFC8032) {
    assert.equal(b2h(await publicKeyFromSeed(h2b(sk))), pk);
    assert.equal(b2h(await signWithSeed(h2b(msg), h2b(sk))), sig);
    const w = await ed25519Verify(h2b(sig), h2b(msg), h2b(pk));
    const n = await ed25519Verify(h2b(sig), h2b(msg), h2b(pk), { webcrypto: false });
    assert.deepEqual(w, { ok: true, path: 'webcrypto' });
    assert.deepEqual(n, { ok: true, path: 'noble' });
    const bad = h2b(sig);
    bad[10] ^= 1;
    assert.equal((await ed25519Verify(bad, h2b(msg), h2b(pk))).ok, false);
    assert.equal((await ed25519Verify(bad, h2b(msg), h2b(pk), { webcrypto: false })).ok, false);
  }
});

test('WebCrypto の Ed25519 が無いブラウザ：純 JS に切り替わり、結果は同じ', async () => {
  const real = globalThis.crypto.subtle;
  const noEd = {
    digest: (...a) => real.digest(...a),
    importKey: async () => { throw Object.assign(new Error('Unrecognized name.'), { name: 'NotSupportedError' }); },
    verify: async () => { throw new Error('should not be called'); },
  };
  const r = await verifyKey(keyA, { ...OPTS, subtle: noEd });
  assert.equal(r.ok, true);
  assert.equal(r.path, 'noble');
  assert.equal((await verifyKey(keyB.replace(/.$/, (c) => (c === '0' ? '2' : '0')), { ...OPTS, subtle: noEd })).ok, false);
});

// ---------------------------------------------------------------- 形式
test('形式：PITCH1- ＋ Crockford base32（136文字）、21バイトの固定長ペイロード、個人情報なし', async () => {
  assert.equal(KEY_CHARS, 136);
  assert.match(keyA, /^PITCH1(-[0-9A-HJKMNP-TV-Z]{1,8})+$/);
  assert.ok(keyA.length < MAX_INPUT);
  const p = parseKey(keyA);
  assert.equal(p.payload.length, 21);
  assert.equal(p.signature.length, 64);
  const info = decodePayload(p.payload);
  assert.deepEqual(Object.keys(info).sort(), ['iat', 'kid', 'lid', 'plan', 'short', 'v']);
  assert.deepEqual({ ...info }, { v: 1, kid: 1, lid: LID1, plan: 1, iat: '2026-10-09', short: shortId(LID1) });
  assert.match(info.short, /^#[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(new TextDecoder().decode(signedMessage(p.payload).slice(0, DOMAIN.length)), 'pitch-supporter-v1\0');
  assert.throws(() => encodePayload({ kid: 1, lid: 'abcd', iat: '2026-10-09' }), /16 bytes/);
  assert.throws(() => encodePayload({ kid: 0, lid: LID1, iat: '2026-10-09' }));
  assert.throws(() => encodePayload({ kid: 1, lid: LID1, iat: '2023-12-31' }));
  assert.throws(() => encodePayload({ kid: 1, lid: LID1, iat: '2026-02-30' }));
  const r = await both(keyA);
  assert.equal(r.ok, true);
  assert.equal(r.key, keyA);
  assert.equal(r.short, info.short);
});

test('正規化は空白・大文字小文字・ハイフンだけ', async () => {
  const body = keyA.replace(/-/g, '').slice(6);
  for (const v of [
    `  ${keyA}\n`, keyA.toLowerCase(), keyA.replace(/-/g, ''), keyA.replace(/-/g, ' '), keyA.replace(/-/g, '\n'),
    `\t${keyA.slice(0, 40)}\r\n${keyA.slice(40)}  `, `PITCH1${body}`, `pitch1-${body.toLowerCase()}`, keyA.replace(/-/g, '　'),
  ]) {
    const r = await verifyKey(v, OPTS);
    assert.equal(r.ok, true, `variant failed: ${JSON.stringify(v.slice(0, 20))}`);
    assert.equal(r.key, keyA);
  }
  assert.equal(normalizeKeyText(' pitch1-ab cd '), 'PITCH1ABCD');
});

// ---------------------------------------------------------------- §5-9 偽造のテストパターン
test('§5-9 偽造：別の秘密鍵で同じ kid を名乗る', async () => {
  const forged = await signKey(seedEvil, { kid: 1, lid: LID1, plan: 1, iat: '2026-10-09' });
  assert.deepEqual(await both(forged), { ok: false, reason: 'signature' });
});

test('§5-9 偽造：ペイロードの改ざん（各フィールド・各文字）', async () => {
  const base = bytesOf(keyA);
  for (const i of [1, 2, 10, 17, 18, 19, 20]) { // kid・lid・plan・iat（v は「版の接頭辞の違い」で）
    const b = base.slice();
    b[i] ^= 1;
    const r = await both(keyOf(b));
    assert.equal(r.ok, false, `byte ${i}`);
    assert.ok(['signature', 'unknown-kid'].includes(r.reason), `byte ${i}: ${r.reason}`);
  }
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (const pos of [7, 9, 20, 40, 70, 100, keyA.length - 2]) {
    const c = keyA[pos];
    if (c === '-') continue;
    const swapped = keyA.slice(0, pos) + chars[(chars.indexOf(c) + 1) % 32] + keyA.slice(pos + 1);
    assert.equal((await both(swapped)).ok, false, `tampered at ${pos}`);
  }
});

test('§5-9 偽造：2つの正しいキーの署名の入れ替え', async () => {
  const a = bytesOf(keyA), a2 = bytesOf(keyA2), b = bytesOf(keyB);
  const mix = (p, s) => { const x = new Uint8Array(85); x.set(p.subarray(0, 21)); x.set(s.subarray(21), 21); return keyOf(x); };
  assert.equal((await both(mix(a, a2))).reason, 'signature'); // 同じ鍵の別のキーの署名
  assert.equal((await both(mix(a2, a))).reason, 'signature');
  assert.equal((await both(mix(a, b))).reason, 'signature'); // 別の鍵の署名
  assert.equal((await both(keyA2)).ok, true);
  assert.equal((await both(keyB)).ok, true);
});

test('§5-9 偽造：未知の kid・外した kid', async () => {
  const k9 = await signKey(seedA, { kid: 9, lid: LID1, plan: 1, iat: '2026-10-09' });
  assert.deepEqual(await both(k9), { ok: false, reason: 'unknown-kid' });
  assert.deepEqual(await both(keyB, { ...OPTS, keys: [KEYS[0]], retired: [2] }), { ok: false, reason: 'retired-kid' });
  assert.deepEqual(await both(keyB, { ...OPTS, retired: [2] }), { ok: false, reason: 'retired-kid' }, '一覧に残っていても外した kid は通さない');
  assert.equal((await both(keyA, { ...OPTS, retired: [2] })).ok, true, 'ほかの kid は通る');
  assert.match(REASON_TEXT['retired-kid'], /新しいキーをお送りします/);
});

test('§5-9 偽造：署名が64バイトでない', async () => {
  const b = bytesOf(keyA);
  assert.equal((await both(keyOf(b.slice(0, 84)))).reason, 'format');
  assert.equal((await both(keyOf(Uint8Array.from([...b, 0])))).reason, 'format');
  const p = parseKey(keyA);
  const pub = h2b(KEYS[0].pub);
  for (const n of [0, 63, 65]) {
    assert.equal(precheck(new Uint8Array(n), pub), 'sig-length');
    assert.equal((await ed25519Verify(new Uint8Array(n), signedMessage(p.payload), pub)).ok, false);
  }
});

test('§5-9 偽造：S ≥ L（S + L の書き換え）', async () => {
  const b = bytesOf(keyA);
  const sLE = b.slice(21 + 32, 85);
  let s = 0n;
  for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(sLE[i]);
  for (const s2 of [s + L, L, (1n << 253n) - 1n]) {
    if (s2 >= 1n << 256n) continue;
    const x = b.slice();
    let t = s2;
    for (let i = 0; i < 32; i++) { x[21 + 32 + i] = Number(t & 255n); t >>= 8n; }
    assert.equal(precheck(x.slice(21), h2b(KEYS[0].pub)), 's-not-canonical');
    assert.deepEqual(await both(keyOf(x)), { ok: false, reason: 'signature' });
  }
});

test('§5-9 偽造：小さい位数の点（R、公開鍵 A）と、部分群の外の点', async () => {
  const SMALL = [
    '0100000000000000000000000000000000000000000000000000000000000000', // 単位元
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', // 位数2
    '0000000000000000000000000000000000000000000000000000000000000000', // 位数4
    '0000000000000000000000000000000000000000000000000000000000000080', // 位数4
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', // 位数8
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05', // 位数8
  ];
  for (const hx of SMALL) assert.equal(strongPoint(h2b(hx)), false, hx);
  // 公開鍵が単位元なら「R = 単位元、S = 0」がどの文にも通ってしまう（cofactor つきの検証）。先に拒否する
  const weakKeys = [{ kid: 7, pub: SMALL[0] }];
  assert.ok(validateKeyList({ keys: weakKeys }).some((e) => /not a usable/.test(e)));
  const payload = encodePayload({ kid: 7, lid: LID1, plan: 1, iat: '2026-10-09' });
  const sig = new Uint8Array(64);
  sig.set(h2b(SMALL[0]));
  assert.deepEqual(await both(assembleKey(payload, sig), { keys: weakKeys }), { ok: false, reason: 'signature' });
  // R が小さい位数の点
  for (const hx of SMALL) {
    const x = bytesOf(keyA);
    x.set(h2b(hx), 21);
    assert.deepEqual(await both(keyOf(x)), { ok: false, reason: 'signature' });
  }
  // 位数 L の部分群の外（正しい点＋位数2の点）
  const T = Point.fromHex(SMALL[1], false);
  const mixed = Point.fromHex(KEYS[0].pub, false).add(T).toBytes();
  assert.equal(strongPoint(mixed), false);
  assert.equal(strongPoint(h2b(KEYS[0].pub)), true);
  // 正規でない符号化（y ≥ p）
  assert.equal(strongPoint(h2b('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f')), false);
});

test('§5-9 偽造：正規でない base32（読み替え・全角・記号・余計な文字）', async () => {
  const withChar = (c) => keyA.slice(0, 20) + c + keyA.slice(21);
  for (const v of [
    withChar('O'), withChar('I'), withChar('L'), withChar('U'), withChar('*'),
    keyA.replace(/-/g, 'ー'), keyA.replace(/-/g, '－'), keyA.replace(/-/g, '_'), keyA.replace(/-/g, '.'),
    keyA.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)), // 全角
    withChar('ſ'), // 大文字にすると S になる文字も読み替えない
    `${keyA}0`, keyA.slice(0, -1),
  ]) {
    const r = await both(v);
    assert.equal(r.ok, false, JSON.stringify(v.slice(0, 24)));
    assert.equal(r.reason, 'format', JSON.stringify(v.slice(15, 25)));
  }
  assert.equal(base32Decode('U'), null);
  assert.equal(base32Decode('O'), null);
  assert.equal(base32Decode('01'), null); // 余りのビットが 0 でない
});

test('§5-9 偽造：版の接頭辞の違い', async () => {
  const body = keyA.slice('PITCH1-'.length);
  assert.equal((await both(`PITCH2-${body}`)).reason, 'version');
  assert.equal((await both(`PITCH0-${body}`)).reason, 'version');
  assert.equal((await both(`PITCH-${body}`)).reason, 'version'); // 本体が「04…」で始まるので PITCH0 と読める
  assert.equal((await both(`PITCHX-${body}`)).reason, 'format');
  assert.equal((await both(`PICTH1-${body}`)).reason, 'format');
  assert.equal((await both(`KOTO1-${body}`)).reason, 'format');
  const b = bytesOf(keyA);
  b[0] = 2; // ペイロードの v
  assert.equal((await both(keyOf(b))).reason, 'version');
  // 以前の形式（PITCH- の ECDSA キー）は受け付けない
  assert.equal((await both('PITCH-04000-0010F-AAAAA-BBBBB')).reason, 'version');
});

test('§5-9 偽造：別の用途（Kotomark）の署名・前置きなしの署名', async () => {
  for (const domain of ['kotomark-v1\0', 'pitch-supporter-v2\0', 'pitch-supporter-v1', '']) {
    const k = await signKey(seedA, { kid: 1, lid: LID1, plan: 1, iat: '2026-10-09' }, { domain });
    assert.deepEqual(await both(k), { ok: false, reason: 'signature' }, JSON.stringify(domain));
  }
});

test('§5-9 偽造：大きすぎる入力・空の入力・文字列でない入力', async () => {
  assert.equal((await both(`${keyA}${' '.repeat(MAX_INPUT - keyA.length)}`)).ok, true, '512文字ちょうど（空白込み）は通る');
  assert.equal((await both(`${keyA}${' '.repeat(MAX_INPUT - keyA.length + 1)}`)).reason, 'too-long');
  assert.equal((await both('A'.repeat(100000))).reason, 'too-long');
  for (const v of ['', '   ', '\n\t', null, undefined]) assert.equal((await both(v)).reason, 'empty');
  for (const v of [123, {}, [keyA], { toString: () => keyA }]) assert.equal((await both(v)).reason, 'format');
});

test('§5-9 偽造：失効した lid・未知の plan', async () => {
  const r = await both(keyA, { ...OPTS, revoked: [LID1] });
  assert.deepEqual(r, { ok: false, reason: 'revoked', short: shortId(LID1) });
  assert.equal((await both(keyA2, { ...OPTS, revoked: [LID1] })).ok, true, 'ほかの lid は通る');
  const p0 = await signKey(seedA, { kid: 1, lid: LID1, plan: 0, iat: '2026-10-09' });
  const p9 = await signKey(seedA, { kid: 1, lid: LID1, plan: 9, iat: '2026-10-09' });
  assert.equal((await both(p0)).reason, 'plan');
  assert.equal((await both(p9)).reason, 'plan');
});

test('§5-9 偽造：localStorage に「解除済み」の印だけを書いても解除されない', async () => {
  for (const v of ['true', '1', 'unlocked', '{"unlocked":true}', '{"status":"supporter"}', 'PITCH1-', JSON.stringify({ key: keyA })]) {
    const storage = memoryStorage({ [STORAGE_KEYS.key]: v, 'pitch:supporter:unlocked': 'true', supporter: '1' });
    const ent = createEntitlement({ ...OPTS, storage, persist: async () => true });
    await ent.load();
    assert.equal(ent.isSupporter(), false, v);
    assert.equal(ent.state.status, 'free');
  }
  // 印ではなくキーそのものなら（毎回検証して）解除
  const ent = createEntitlement({ ...OPTS, storage: memoryStorage({ [STORAGE_KEYS.key]: keyA }), persist: async () => true });
  await ent.load();
  assert.equal(ent.isSupporter(), true);
});

test('§5-9：WebCrypto の Ed25519 を無効にしても、すべてのパターンで同じ結果', async () => {
  // both() が各テストで2つの経路を比べている。ここでは代表を一覧でもう一度
  const b = bytesOf(keyA);
  const sPlusL = b.slice(); { let s = 0n; for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(b[53 + i]); s += L; for (let i = 0; i < 32; i++) { sPlusL[53 + i] = Number(s & 255n); s >>= 8n; } }
  const cases = [keyA, keyB, keyA.toLowerCase(), await signKey(seedEvil, { kid: 1, lid: LID1, iat: '2026-10-09' }), keyOf(sPlusL), 'PITCH2-' + keyA.slice(7), '', 'x'.repeat(600)];
  for (const c of cases) {
    const w = await verifyKey(c, { ...OPTS, webcrypto: true });
    const n = await verifyKey(c, { ...OPTS, webcrypto: false });
    assert.equal(w.ok, n.ok);
    assert.equal(w.reason, n.reason);
  }
});

// ---------------------------------------------------------------- 一覧・未設定
test('公開鍵の一覧：未設定なら何も解除しない（fail closed）・テスト用の kid は本番に入れられない', async () => {
  assert.deepEqual(SUPPORTER_KEYS, [], 'リポジトリの一覧は未設定のまま（本番の鍵は販売開始時にオーナーの端末で作る）');
  assert.deepEqual(RETIRED_KIDS, []);
  assert.deepEqual(REVOKED_LIDS, []);
  assert.deepEqual(validateKeyList({ keys: SUPPORTER_KEYS, retired: RETIRED_KIDS, revoked: REVOKED_LIDS }), []);
  assert.equal(isConfigured(SUPPORTER_KEYS), false);
  assert.equal((await verifyKey(keyA)).reason, 'unconfigured'); // 既定 = リポジトリの一覧
  assert.equal((await verifyKey(keyA, { keys: [] })).reason, 'unconfigured');
  assert.equal(await keysFingerprint([]), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

  assert.deepEqual(validateKeyList(OPTS), []);
  assert.ok(validateKeyList({ keys: [{ kid: TEST_KID_MIN, pub: KEYS[0].pub }] }).some((e) => /reserved for test/.test(e)));
  assert.ok(validateKeyList({ keys: KEYS }, { test: true }).some((e) => /test key lists may only/.test(e)));
  assert.ok(validateKeyList({ keys: [{ ...KEYS[0], d: 'x' }] }).some((e) => /never a private key/.test(e)));
  assert.ok(validateKeyList({ keys: [KEYS[0], KEYS[0]] }).some((e) => /duplicate/.test(e)));
  assert.ok(validateKeyList({ keys: KEYS, retired: [1] }).some((e) => /both/.test(e)));
  assert.ok(validateKeyList({ keys: KEYS, revoked: ['XYZ'] }).length > 0);
  assert.ok(validateKeyList({ keys: [{ kid: 1, pub: KEYS[0].pub.toUpperCase() }] }).length > 0);

  const storage = memoryStorage({ [STORAGE_KEYS.key]: keyA }); // 有効なキーが保存されていても
  const ent = createEntitlement({ keys: [], storage });
  assert.equal(ent.configured, false);
  await ent.load();
  assert.equal(ent.state.status, 'unconfigured');
  assert.equal((await ent.activate(keyA)).ok, false);
  assert.equal(ent.isSupporter(), false);
  assert.deepEqual(gatesFor(ent.isSupporter()), gatesFor(false));
});

// ---------------------------------------------------------------- 保存・#key=・漏らさない
test('保存：キーの文字列だけを pitch:supporter:v1 に。起動のたびに検証し、persist() を要求する', async () => {
  const storage = memoryStorage({ 'pitch-supporter-key': 'PITCH-OLD' });
  let persistCalls = 0;
  const persist = async () => { persistCalls++; return true; };
  const ent = createEntitlement({ ...OPTS, storage, persist });
  const seen = [];
  ent.subscribe((s) => seen.push(s.status));
  await ent.load();
  for (const k of LEGACY_STORAGE_KEYS) assert.equal(storage.get(k), null, '以前の形式の保存は消す');
  assert.equal(STORAGE_KEYS.key, 'pitch:supporter:v1');
  assert.equal((await ent.activate('not a key')).ok, false);
  assert.equal(storage.get(STORAGE_KEYS.key), null, '通らないキーは保存しない');
  assert.equal(persistCalls, 0);
  const r = await ent.activate(` ${keyA.toLowerCase()} `);
  assert.deepEqual(r, { ok: true, saved: true, persisted: true, short: shortId(LID1) });
  assert.equal(storage.get(STORAGE_KEYS.key), keyA, '表示形のキーの文字列だけ');
  assert.deepEqual(Object.keys(storage.dump()), [STORAGE_KEYS.key], 'ほかに印を書かない');
  assert.equal(persistCalls, 1);
  assert.equal(ent.isSupporter(), true);

  const again = createEntitlement({ ...OPTS, storage, persist });
  await again.load();
  assert.equal(again.isSupporter(), true);
  assert.equal(again.state.info.short, shortId(LID1));
  // あとで失効した（次のリリース）
  const revoked = createEntitlement({ ...OPTS, revoked: [LID1], storage, persist });
  await revoked.load();
  assert.equal(revoked.isSupporter(), false);
  assert.equal(revoked.state.stored, 'revoked');
  // kid を外した
  const retired = createEntitlement({ keys: [KEYS[1]], retired: [1], revoked: [], storage, persist });
  await retired.load();
  assert.equal(retired.state.stored, 'retired-kid');
  // 削除
  ent.remove();
  assert.equal(ent.isSupporter(), false);
  assert.equal(storage.get(STORAGE_KEYS.key), null);
  assert.deepEqual(seen, ['free', 'supporter', 'free']);
  // 保存できない環境でも、そのページの間は解除できる
  const broken = { get: () => null, set: () => false, remove: () => false, getJSON: () => null, setJSON: () => false };
  const e2 = createEntitlement({ ...OPTS, storage: broken, persist: async () => { throw new Error('x'); } });
  const r2 = await e2.activate(keyA);
  assert.equal(r2.ok, true);
  assert.equal(r2.saved, false);
  assert.equal(e2.isSupporter(), true);
});

test('#key=…：受け取ったら URL から消す（ほかの項目は残す）', () => {
  const mk = (hash) => {
    const calls = [];
    const loc = { hash, pathname: '/new-project/pitch/app/', search: '?word=w0001' };
    const hist = { state: { a: 1 }, replaceState: (...a) => calls.push(a) };
    return { loc, hist, calls };
  };
  let m = mk(`#key=${encodeURIComponent(keyA)}`);
  assert.equal(takeKeyFromLocation(m.loc, m.hist), keyA);
  assert.deepEqual(m.calls, [[{ a: 1 }, '', '/new-project/pitch/app/?word=w0001']]);
  m = mk(`#x=1&key=${keyA}&y=2`);
  assert.equal(takeKeyFromLocation(m.loc, m.hist), keyA);
  assert.equal(m.calls[0][2], '/new-project/pitch/app/?word=w0001#x=1&y=2');
  m = mk('#supporter');
  assert.equal(takeKeyFromLocation(m.loc, m.hist), null);
  assert.equal(m.calls.length, 0);
  m = mk('');
  assert.equal(takeKeyFromLocation(m.loc, m.hist), null);
  // replaceState が使えない環境では hash を書き換える
  const loc = { hash: `#key=${keyA}`, pathname: '/', search: '' };
  assert.equal(takeKeyFromLocation(loc, { replaceState() { throw new Error('sandbox'); } }), keyA);
  assert.equal(loc.hash, '');
  assert.equal(takeKeyFromLocation(undefined, undefined), null);
});

test('キーを漏らさない：理由の文・状態・コンソール・評価協力の書き出し・Anki・共有カード', async () => {
  const storage = memoryStorage();
  const ent = createEntitlement({ ...OPTS, storage, persist: async () => true });
  const r = await ent.activate(keyA);
  const body = keyA.replace(/-/g, '').slice(6);
  const leaks = (x) => { const t = JSON.stringify(x); return t.includes(body.slice(0, 20)) || t.includes(keyA.slice(7, 30)); };
  assert.equal(leaks(r), false, 'activate の結果にキーの文字列を入れない');
  assert.equal(leaks(ent.state), false, '状態にキーの文字列を入れない');
  for (const t of Object.values(REASON_TEXT)) assert.doesNotMatch(t, /PITCH1-[0-9A-Z]{8}/);
  const bad = await verifyKey(keyA.slice(0, -3), OPTS);
  assert.equal(leaks(bad), false);
  // ソースの静的な確認
  const src = (f) => readFileSync(new URL(`../demo/${f}`, import.meta.url), 'utf8');
  for (const f of ['supporter.js', 'ed25519.js']) assert.doesNotMatch(src(f), /\bconsole\./, `${f} はコンソールに書かない`);
  for (const f of ['evalmode.js', 'anki.js', 'share.js']) {
    assert.doesNotMatch(src(f), /supporter:v1|STORAGE_KEYS\.key|entitlement|verifyKey|from '\.\/supporter\.js'/, `${f} はサポーターの状態を読まない`);
  }
  // 検証を飛ばす経路を作らない（?supporter=1 のような URL・印・公開鍵の差し替え）
  assert.doesNotMatch(src('supporter.js'), /URLSearchParams|location\.search|['"]\?supporter|unlocked\s*[:=]\s*true/);
  assert.doesNotMatch(src('demo.js'), /createEntitlement\(\{[^}]*keys/, 'ページは公開鍵の一覧を渡さない（既定 = 埋め込みの一覧だけ）');
  // 評価協力の書き出し：localStorage にキーがあっても、サポーターかどうかは入らない
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k === STORAGE_KEYS.key ? keyA : null), setItem() {}, removeItem() {} };
  try {
    const files = buildExportFiles([{ id: 1, meta: { word: { id: 'w0001' }, result: { pass: true }, audio: {} }, wav: new Uint8Array(4) }], { exportId: 'x' });
    const text = files.map((f) => (typeof f.data === 'string' ? f.data : '')).join('\n');
    assert.doesNotMatch(text, /PITCH1|supporter|サポーター/i);
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
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
  const ent = createEntitlement({ ...OPTS, storage, persist: async () => true });
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

test('scripts/supporter-key.mjs：テスト用の鍵だけを作る（リポジトリの外・0600・テスト用の kid）→ 発行 → 検証・失効', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pitch-sk-'));
  try {
    const script = new URL('../scripts/supporter-key.mjs', import.meta.url).pathname;
    const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: 'utf8' });
    // リポジトリの中には書かない・テスト用の範囲の外の kid は使わない
    const inside = run('test-init', '--out', new URL('../.qa-out/should-not-exist', import.meta.url).pathname);
    assert.notEqual(inside.status, 0);
    assert.match(inside.stderr, /refusing/);
    assert.notEqual(run('test-init', '--out', join(dir, 'k1'), '--kid', '1').status, 0);
    const out = join(dir, 'keys');
    assert.equal(run('test-init', '--out', out).status, 0);
    const seed = join(out, 'test-seed.json'), pub = join(out, 'test-pubkey.js');
    assert.equal(statSync(seed).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(seed, 'utf8')).test, true);
    assert.doesNotMatch(readFileSync(pub, 'utf8'), /seed|PRIVATE/, '公開鍵ファイルに秘密の値を書かない');
    assert.notEqual(run('test-init', '--out', out).status, 0, '既存のテスト鍵を上書きしない');
    const lid = 'aa'.repeat(16);
    const key = execFileSync(process.execPath, [script, 'test-issue', '--seed', seed, '--pubkey', pub, '--lid', lid, '--iat', '2026-10-01'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    assert.match(key, /^PITCH1-/);
    const ok = run('verify', key.toLowerCase(), '--pubkey', pub);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, new RegExp(`OK kid=240 lid=${lid} plan=1 iat=2026-10-01 short=#`));
    const prod = run('verify', key);
    assert.equal(prod.status, 2, 'リポジトリの（未設定の）一覧では通らない');
    assert.match(prod.stdout, /NG unconfigured/);
    // 本番の一覧を相手にする操作は拒否
    const prodFile = new URL('../demo/supporter-pubkey.js', import.meta.url).pathname;
    assert.notEqual(run('test-issue', '--seed', seed, '--pubkey', prodFile).status, 0);
    assert.notEqual(run('test-revoke', '--lid', lid, '--pubkey', prodFile).status, 0);
    // 失効（テスト用の一覧だけ）
    assert.equal(run('test-revoke', '--lid', lid, '--pubkey', pub).status, 0);
    const ng = run('verify', key, '--pubkey', pub);
    assert.equal(ng.status, 2);
    assert.match(ng.stdout, /NG revoked short=#/);
    // 公開鍵の PEM → 16進。秘密鍵の PEM は読まずに拒否
    const pair = execFileSync(process.execPath, ['-e', "const c=require('node:crypto');const k=c.generateKeyPairSync('ed25519');process.stdout.write(JSON.stringify({pub:k.publicKey.export({type:'spki',format:'pem'}),priv:k.privateKey.export({type:'pkcs8',format:'pem'}),x:k.publicKey.export({format:'jwk'}).x}))"], { encoding: 'utf8' });
    const { pub: pubPem, priv: privPem, x } = JSON.parse(pair);
    writeFileSync(join(dir, 'public.pem'), pubPem);
    writeFileSync(join(dir, 'private.pem'), privPem);
    const hexOut = run('pubkey-hex', join(dir, 'public.pem'));
    assert.equal(hexOut.stdout.trim(), Buffer.from(x, 'base64url').toString('hex'));
    const refuse = run('pubkey-hex', join(dir, 'private.pem'));
    assert.notEqual(refuse.status, 0);
    assert.match(refuse.stderr, /PRIVATE key/);
    assert.match(run('fingerprint').stdout, /^e3b0c442.* \(0 key\(s\): none\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('公開物の検査：秘密鍵の形（PEM・JWK の d）があればビルドを止める・テスト用の一覧は本番の場所に書けない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pitch-bd-'));
  try {
    const root = new URL('..', import.meta.url).pathname;
    const tpl = readFileSync(join(root, 'demo/template.html'), 'utf8');
    const build = (template, env = {}, out = join(dir, 'out.html')) => {
      const t = join(dir, 'tpl.html');
      writeFileSync(t, template);
      return spawnSync(process.execPath, [join(root, 'scripts/build-demo.mjs'), '--lexicon', '200', t, out], { encoding: 'utf8', env: { ...process.env, ...env } });
    };
    const secrets = [
      '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----',
      '{"kty":"OKP","crv":"Ed25519","d":"nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}',
    ];
    for (const secret of secrets) {
      const r = build(tpl.replace('<!--SCRIPT-->', `<!--SCRIPT--><p hidden>${secret}</p>`));
      assert.notEqual(r.status, 0, secret.slice(0, 20));
      assert.match(r.stderr, /private-key-like/);
    }
    const ok = build(tpl);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /supporter keys none \(unconfigured/);
    // 本番の一覧の指紋の照合
    const fpr = build(tpl, { SUPPORTER_KEYS_SHA256: '00'.repeat(32) });
    assert.notEqual(fpr.status, 0);
    assert.match(fpr.stderr, /fingerprint/);
    // テスト用の一覧に本番の kid → 拒否。テスト用の一覧で dist/ に書く → 拒否
    const badList = join(dir, 'bad-pubkey.js');
    writeFileSync(badList, `export const SUPPORTER_KEYS = ${JSON.stringify(KEYS)};\nexport const RETIRED_KIDS = [];\nexport const REVOKED_LIDS = [];\n`);
    const b1 = build(tpl, { SUPPORTER_PUBKEY: badList });
    assert.notEqual(b1.status, 0);
    assert.match(b1.stderr, /test key lists may only/);
    const b2 = build(tpl, { SUPPORTER_PUBKEY: badList }, join(root, 'dist/should-not-exist.html'));
    assert.notEqual(b2.status, 0);
    assert.equal(existsSync(join(root, 'dist/should-not-exist.html')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

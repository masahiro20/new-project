// Atlas K3 レビューで足したテスト：precheck() が2つの経路の差を実際に消していること（生の検証器は食い違う入力）、
// RFC 8032 TEST 1024、部分群の外の点の正規でない符号化、Unicode の空白の扱いの固定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyKey, encodePayload, signedMessage, assembleKey, parseKey, normalizeKeyText, base32Decode, formatKey, base32Encode, DOMAIN } from '../demo/supporter.js';
import { ed25519Verify, precheck, verifyNoble, L } from '../demo/ed25519.js';
import { Point, utils } from '../vendor/noble-ed25519.js';

const h2b = (s) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));
const b2h = (b) => Buffer.from(b).toString('hex');
const le = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
const toLE = (n) => { const o = new Uint8Array(32); for (let i = 0; i < 32; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
const cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]));
const sha512 = async (...m) => new Uint8Array(await crypto.subtle.digest('SHA-512', cat(...m)));
const modL = (n) => ((n % L) + L) % L;
const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 74) & 255);
const ext = await utils.getExtendedPublicKeyAsync(seed);
const KEYS = [{ kid: 240, pub: b2h(ext.pointBytes) }];
const OPTS = { keys: KEYS, retired: [], revoked: [] };
const T8 = Point.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', false);
const payload = encodePayload({ kid: 240, lid: '0f1e2d3c4b5a69788796a5b4c3d2e1f0', plan: 1, iat: '2026-10-09' });
const msg = signedMessage(payload);

/** 秘密鍵の持ち主が R に位数8の点を足して作った署名（cofactor つきの検証だけが通す）。 */
async function signMixedR() {
  const r = modL(le(await sha512(ext.prefix, msg)));
  const R = Point.BASE.multiply(r).add(T8).toBytes();
  const k = modL(le(await sha512(R, ext.pointBytes, msg)));
  return cat(R, toLE(modL(r + k * ext.scalar)));
}

async function both(input, opts = OPTS) {
  const a = await verifyKey(input, { ...opts, webcrypto: true });
  const b = await verifyKey(input, { ...opts, webcrypto: false });
  assert.equal(a.ok, b.ok);
  assert.equal(a.reason, b.reason);
  return a;
}

test('precheck は必要：純 JS は位数の混ざった R を通すが、ed25519Verify は両方の経路で拒否する', async () => {
  const sig = await signMixedR();
  assert.equal(await verifyNoble(sig, msg, ext.pointBytes), true, '前提：生の noble（cofactor つき）は通す');
  assert.equal(precheck(sig, ext.pointBytes), 'r-weak');
  assert.equal((await ed25519Verify(sig, msg, ext.pointBytes)).ok, false);
  assert.equal((await ed25519Verify(sig, msg, ext.pointBytes, { webcrypto: false })).ok, false);
  assert.deepEqual(await both(assembleKey(payload, sig)), { ok: false, reason: 'signature' });
});

test('precheck は必要：公開鍵が単位元・正規でない符号化なら「R = 単位元、S = 0」を両方の経路で拒否する', async () => {
  const id = '0100000000000000000000000000000000000000000000000000000000000000';
  for (const A of [id, 'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', '0100000000000000000000000000000000000000000000000000000000000080']) {
    const sig = cat(h2b(id), new Uint8Array(32));
    const pub = h2b(A);
    assert.notEqual(precheck(sig, pub), null);
    assert.equal((await ed25519Verify(sig, msg, pub)).ok, false, A);
    assert.equal((await ed25519Verify(sig, msg, pub, { webcrypto: false })).ok, false, A);
    assert.equal((await both(assembleKey(payload, sig), { keys: [{ kid: 240, pub: A }] })).ok, false, A);
  }
});

test('RFC 8032 TEST 1024：両方の経路で通る', async () => {
  const pk = h2b('278117fc144c72340f67d0f2316e8386ceffbf2b2428c9c51fef7c597f1d426e');
  const m = h2b('08b8b2b733424243760fe426a4b54908632110a66c2f6591eabd3345e3e4eb98fa6e264bf09efe12ee50f8f54e9f77b1e355f6c50544e23fb1433ddf73be84d879de7c0046dc4996d9e773f4bc9efe5738829adb26c81b37c93a1b270b20329d658675fc6ea534e0810a4432826bf58c941efb65d57a338bbd2e26640f89ffbc1a858efcb8550ee3a5e1998bd177e93a7363c344fe6b199ee5d02e82d522c4feba15452f80288a821a579116ec6dad2b3b310da903401aa62100ab5d1a36553e06203b33890cc9b832f79ef80560ccb9a39ce767967ed628c6ad573cb116dbefefd75499da96bd68a8a97b928a8bbc103b6621fcde2beca1231d206be6cd9ec7aff6f6c94fcd7204ed3455c68c83f4a41da4af2b74ef5c53f1d8ac70bdcb7ed185ce81bd84359d44254d95629e9855a94a7c1958d1f8ada5d0532ed8a5aa3fb2d17ba70eb6248e594e1a2297acbbb39d502f1a8c6eb6f1ce22b3de1a1f40cc24554119a831a9aad6079cad88425de6bde1a9187ebb6092cf67bf2b13fd65f27088d78b7e883c8759d2c4f5c65adb7553878ad575f9fad878e80a0c9ba63bcbcc2732e69485bbc9c90bfbd62481d9089beccf80cfe2df16a2cf65bd92dd597b0707e0917af48bbb75fed413d238f5555a7a569d80c3414a8d0859dc65a46128bab27af87a71314f318c782b23ebfe808b82b0ce26401d2e22f04d83d1255dc51addd3b75a2b1ae0784504df543af8969be3ea7082ff7fc9888c144da2af58429ec96031dbcad3dad9af0dcbaaaf268cb8fcffead94f3c7ca495e056a9b47acdb751fb73e666c6c655ade8297297d07ad1ba5e43f1bca32301651339e22904cc8c42f58c30c04aafdb038dda0847dd988dcda6f3bfd15c4b4c4525004aa06eeff8ca61783aacec57fb3d1f92b0fe2fd1a85f6724517b65e614ad6808d6f6ee34dff7310fdc82aebfd904b01e1dc54b2927094b2db68d6f903b68401adebf5a7e08d78ff4ef5d63653a65040cf9bfd4aca7984a74d37145986780fc0b16ac451649de6188a7dbdf191f64b5fc5e2ab47b57f7f7276cd419c17a3ca8e1b939ae49e488acba6b965610b5480109c8b17b80e1b7b750dfc7598d5d5011fd2dcc5600a32ef5b52a1ecc820e308aa342721aac0943bf6686b64b2579376504ccc493d97e6aed3fb0f9cd71a43dd497f01f17c0e2cb3797aa2a2f256656168e6c496afc5fb93246f6b1116398a346f1a641f3b041e989f7914f90cc2c7fff357876e506b50d334ba77c225bc307ba537152f3f1610e4eafe595f6d9d90d11faa933a15ef1369546868a7f3a45a96768d40fd9d03412c091c6315cf4fde7cb68606937380db2eaaa707b4c4185c32eddcdd306705e4dc1ffc872eeee475a64dfac86aba41c0618983f8741c5ef68d3a101e8a3b8cac60c905c15fc910840b94c00a0b9d0');
  const sig = h2b('0aab4c900501b3e24d7cdf4663326a3a87df5e4843b2cbdb67cbf6e460fec350aa5371b1508f9f4528ecea23c436d94b5e8fcd4f681e30a6ac00a9704a188a03');
  assert.deepEqual(await ed25519Verify(sig, m, pk), { ok: true, path: 'webcrypto' });
  assert.deepEqual(await ed25519Verify(sig, m, pk, { webcrypto: false }), { ok: true, path: 'noble' });
});

test('R の正規でない符号化（y = p + k、ZIP215 なら読める点）はすべて両方の経路で拒否', async () => {
  const P = (1n << 255n) - 19n;
  const good = await verifyKey(assembleKey(payload, cat(...[await (async () => { const r = modL(le(await sha512(ext.prefix, msg))); const R = Point.BASE.multiply(r).toBytes(); const k = modL(le(await sha512(R, ext.pointBytes, msg))); return cat(R, toLE(modL(r + k * ext.scalar))); })()])), OPTS);
  assert.equal(good.ok, true, '対照：正しい署名は通る');
  let n = 0;
  for (let k = 0n; k < 19n; k++) for (const sign of [0, 1]) {
    const R = toLE(P + k); if (sign) R[31] |= 0x80;
    try { Point.fromHex(R, true); } catch { continue; }
    n++;
    const s = cat(R, toLE(1n));
    assert.equal(precheck(s, ext.pointBytes), 'r-weak');
    assert.deepEqual(await both(assembleKey(payload, s)), { ok: false, reason: 'signature' });
  }
  assert.ok(n >= 20, `ZIP215 で読める正規でない符号化 ${n}`);
});

test('Unicode の空白：JS の \\s に入るもの（NBSP・全角空白・BOM・U+2028）は除き、ゼロ幅スペースは拒否（現状の固定）', async () => {
  const r = modL(le(await sha512(ext.prefix, msg)));
  const R = Point.BASE.multiply(r).toBytes();
  const k = modL(le(await sha512(R, ext.pointBytes, msg)));
  const key = assembleKey(payload, cat(R, toLE(modL(r + k * ext.scalar))));
  for (const ws of [' ', '　', '﻿', ' ']) assert.equal((await both(key.slice(0, 20) + ws + key.slice(20))).ok, true, JSON.stringify(ws));
  for (const z of ['​', '⁠', '­']) assert.equal((await both(key.slice(0, 20) + z + key.slice(20))).reason, 'format', JSON.stringify(z));
  assert.equal(formatKey(base32Encode(base32Decode(normalizeKeyText(key).slice(6)))), key);
  assert.equal(parseKey(key).payload.length, 21);
  assert.equal(DOMAIN, 'pitch-supporter-v1\0');
});

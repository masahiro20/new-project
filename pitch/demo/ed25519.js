// Ed25519 の検証（創設サポーターキー用）。2つの経路で同じ結果になるようにする。
//
//   1. WebCrypto の Ed25519（Chrome 137 以降、Firefox 129 以降、Safari 17 以降、Node 20 以降）
//   2. 使えないときは純 JS の @noble/ed25519 2.3.0（vendor/noble-ed25519.js、MIT。版は固定）
//
// どちらの経路でも、先に precheck() で次を拒否する（実装ごとの差をなくすため）：
//   - 署名が64バイトでない、公開鍵が32バイトでない
//   - S ≥ L（正規でない署名。署名の改変で別の正しい署名が作れてしまう）
//   - R・A が正規の符号化でない（y ≥ p、x = 0 で符号ビットが 1）
//   - R・A が小さい位数の点、または位数 L の部分群の外の点（cofactor の有無で実装の結果が分かれるため）
// RFC 8032 のテストベクタは test/supporter.test.js で両方の経路に通す。
import { Point, verifyAsync as nobleVerifyAsync, signAsync as nobleSignAsync, getPublicKeyAsync as noblePublicAsync } from '../vendor/noble-ed25519.js';

/** 群の位数 L = 2^252 + 27742317777372353535851937790883648493 */
export const L = (1n << 252n) + 27742317777372353535851937790883648493n;

const leToBig = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };

/** 署名の後半（S、リトルエンディアン）が L より小さいか。 */
export const scalarCanonical = (sig) => sig instanceof Uint8Array && sig.length === 64 && leToBig(sig.subarray(32)) < L;

/** 32バイトを点として厳密に読む（RFC 8032）。正規でない符号化・曲線上にないときは null。 */
export function decodePoint(bytes) {
  try { return Point.fromHex(bytes, false); } catch { return null; }
}

/** 使ってよい点か：正規の符号化で、小さい位数ではなく、位数 L の部分群にある。 */
export function strongPoint(bytes) {
  const p = decodePoint(bytes);
  if (!p) return false;
  try { return !p.isSmallOrder() && p.isTorsionFree(); } catch { return false; }
}

/** 暗号の計算の前に拒否する。→ null（通してよい）または理由。 */
export function precheck(sig, pub) {
  if (!(sig instanceof Uint8Array) || sig.length !== 64) return 'sig-length';
  if (!(pub instanceof Uint8Array) || pub.length !== 32) return 'pub-length';
  if (!scalarCanonical(sig)) return 's-not-canonical';
  if (!strongPoint(sig.subarray(0, 32))) return 'r-weak';
  if (!strongPoint(pub)) return 'a-weak';
  return null;
}

// ---------------------------------------------------------------- 経路1：WebCrypto
const ED = { name: 'Ed25519' };
const keyCache = new WeakMap(); // subtle → Map(hex → Promise<CryptoKey>)
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** WebCrypto で検証。Ed25519 が使えないときは null（予備の経路へ）。 */
export async function verifyWebCrypto(subtle, sig, msg, pub) {
  if (!subtle || typeof subtle.importKey !== 'function') return null;
  let m = keyCache.get(subtle);
  if (!m) { m = new Map(); keyCache.set(subtle, m); }
  const id = hex(pub);
  let key;
  try {
    if (!m.has(id)) m.set(id, subtle.importKey('raw', pub, ED, false, ['verify']));
    key = await m.get(id);
  } catch {
    m.delete(id);
    return null; // NotSupportedError など：このブラウザでは使えない
  }
  try {
    return (await subtle.verify(ED, key, sig, msg)) === true;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 経路2：純 JS
/** @noble/ed25519 で検証（RFC 8032 の厳密な形。zip215: false）。SHA-512 は crypto.subtle.digest を使う。 */
export async function verifyNoble(sig, msg, pub) {
  try { return (await nobleVerifyAsync(sig, msg, pub, { zip215: false })) === true; } catch { return null; }
}

/**
 * 検証する。→ { ok: boolean, path: 'webcrypto' | 'noble' | null, reason?: string }
 * opts.webcrypto = false で経路1を使わない（テスト用。WebCrypto が無いブラウザと同じ）。
 * 例外は投げない。どちらの経路も使えないときは { ok: false, path: null, reason: 'unsupported' }。
 */
export async function ed25519Verify(sig, msg, pub, { subtle = globalThis.crypto?.subtle, webcrypto = true } = {}) {
  const bad = precheck(sig, pub);
  if (bad) return { ok: false, path: null, reason: bad };
  if (webcrypto) {
    const r = await verifyWebCrypto(subtle, sig, msg, pub);
    if (r !== null) return { ok: r, path: 'webcrypto' };
  }
  const r = await verifyNoble(sig, msg, pub);
  if (r !== null) return { ok: r, path: 'noble' };
  return { ok: false, path: null, reason: 'unsupported' };
}

// ---------------------------------------------------------------- テストと、テスト用の鍵の道具だけで使う
/** 32バイトの秘密鍵（seed）から公開鍵。 */
export const publicKeyFromSeed = (seed) => noblePublicAsync(seed);
/** 署名（決定的。RFC 8032）。 */
export const signWithSeed = (msg, seed) => nobleSignAsync(msg, seed);

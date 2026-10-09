// 創設サポーターキーの署名（テストと、テスト用の鍵の道具 scripts/supporter-key.mjs だけが使う）。
// ページ（demo/）からは import しない。本番のキーを発行する道具はこのリポジトリに置かない（docs/decisions.md）。
import { webcrypto } from 'node:crypto';
import { encodePayload, signedMessage, assembleKey, DOMAIN, LID_BYTES } from '../demo/supporter.js';
import { signWithSeed, publicKeyFromSeed } from '../demo/ed25519.js';

/** 128ビットの乱数の lid。 */
export const randomLid = () => webcrypto.getRandomValues(new Uint8Array(LID_BYTES));

/** seed（32バイト）で署名したキー文字列。domain を変えるのは「別の用途の署名」のテストだけ。 */
export async function signKey(seed, { kid, lid = randomLid(), plan = 1, iat, v = 1 }, { domain = DOMAIN } = {}) {
  const payload = encodePayload({ v, kid, lid, plan, iat });
  const sig = await signWithSeed(signedMessage(payload, domain), seed);
  return assembleKey(payload, sig);
}

export const hex = (b) => Buffer.from(b).toString('hex');
export async function pubHex(seed) { return hex(await publicKeyFromSeed(seed)); }

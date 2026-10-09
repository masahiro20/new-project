// 創設サポーター — サポーターキーの検証（オフライン）、無料／サポーターの差、1日の判定数。
//
// キーの設計は Atlas のセキュリティレビュー（peter-hq/qa/p3-security/REPORT.md §5）の要件どおり：
//   署名：Ed25519。署名の対象は "pitch-supporter-v1\0" ‖ ペイロード（ほかの用途の署名と取り違えない）。
//         受け取ったバイト列のまま検証してから中身を読む。WebCrypto の Ed25519 が第一の経路、使えなければ
//         純 JS（vendor/noble-ed25519.js）。S ≥ L・小さい位数の点などは先に拒否（demo/ed25519.js）。
//   形式：PITCH1- ＋ Crockford base32（136文字）。正規化は空白・大文字小文字・ハイフンだけ。入力は512文字まで。
//   ペイロード（21バイト・固定長）：v(1) kid(1) lid(16・128ビットの乱数) plan(1) iat(2・2024-01-01 からの日数)
//         氏名・メールアドレス・Ko-fi の注文番号などの個人情報は入れない。
//   公開鍵：demo/supporter-pubkey.js（kid → 32バイト）。外した kid と失効した lid も同じファイル。
//         本番の公開鍵を差し替える経路・検証を飛ばす経路は作らない（テスト用の差し替えは build-demo の
//         SUPPORTER_PUBKEY だけで、dist/・site/ への書き込みは拒否される）。
//   保存：localStorage の "pitch:supporter:v1" にキーの文字列だけ。起動のたびに検証し直す。
//   キーはコンソール・エラーの文・評価協力の書き出し・Anki・共有カードに出さない。
//
// 純粋な部分（キーの符号化・検証、ゲート、1日の数え方）は test/supporter.test.js でテストします。
// mountSupporter() は「創設サポーター」節（demo/template.html の #sup-*）をつなぎます。
// 運用（鍵の作成・発行・失効）は docs/supporter-ops.md。キーを発行する道具はこのリポジトリに置きません。
import { SUPPORTER_KEYS, RETIRED_KIDS, REVOKED_LIDS } from './supporter-pubkey.js';
import { ed25519Verify, strongPoint } from './ed25519.js';

// ---------------------------------------------------------------- お金・無料枠の定数（ここだけ）
/**
 * お金に関わる表示と、無料枠の数字はすべてここに置きます（docs/decisions.md「創設サポーター」）。
 * 本部の決定 d31：最初の有料は「創設サポーター」買い切り。判定とは関係ない機能を売る。
 * 本部の決定 d32：価格 $19・30日返金は決定。キーの販売は専用のオリジンに移ってから始める。
 */
export const PLAN = {
  name: '創設サポーター',
  price: '$19', // 決定（d32）。TODO(オーナー): 通貨・税込みの書き方は Ko-fi の表示に合わせて確認
  priceNote: '買い切り・1回払い。月額ではありません',
  refundDays: 30, // 決定（d32）：30日以内なら理由を問わず返金
  kofiUrl: '', // TODO(オーナー): Ko-fi ショップの URL。空のあいだは「準備中」と表示し、リンクを作らない
  betaNote: '判定はベータで調整中です。精度を約束するものではありません。',
  // eslint-disable-next-line no-undef -- テスト用ビルドだけ build-demo の define で true になる
  freeLimitsActive: (typeof __PITCH_FREE_LIMITS__ !== 'undefined' && __PITCH_FREE_LIMITS__) || false, // 販売開始（本番の鍵と Ko-fi の URL がそろう）まで無料枠は適用しない（Kana 判断 2026-10-09）。true で適用
  freeDailyJudgeLimit: 20, // 確定（Kana、ルール3）：無料で1日に判定できる語の数
  freePracticePairs: 5, // 確定（Kana、ルール3）：無料で聞き分けドリルに使える最小対（先頭から）
  freeHistoryDays: 7, // 確定（Kana、ルール3）：無料で見られる練習の記録（直近の日数）
};

/** 「何が増えるか」の表（画面に出す）。[機能, 無料, サポーター] */
export function planRows(plan = PLAN) {
  return [
    ['録音の判定（判定の中身は同じ）', `1日${plan.freeDailyJudgeLimit}語まで`, '回数の上限なし'],
    ['アクセントの辞書引き・お手本の再生', '○', '○'],
    ['最小対の聞き分けドリル', `最初の${plan.freePracticePairs}組`, 'すべての組'],
    ['Anki への書き出し', '不合格だった語だけ', '自分の単語リスト・検索結果・最小対など全部'],
    ['自分の単語リスト（名前つきで複数）', '—', '○'],
    ['練習の記録（日ごとの判定数・型ごとの合格率）', `直近${plan.freeHistoryDays}日`, '全期間'],
    ['結果の共有カード', '○', '○'],
  ];
}

// ---------------------------------------------------------------- キーの形式
export const KEY_PREFIX = 'PITCH1';
export const KEY_VERSION = 1;
export const MAX_INPUT = 512;
export const PAYLOAD_BYTES = 21;
export const SIG_BYTES = 64;
export const KEY_BYTES = PAYLOAD_BYTES + SIG_BYTES; // 85 バイト → base32 でちょうど 136 文字（余りのビットなし）
export const KEY_CHARS = (KEY_BYTES * 8) / 5;
export const LID_BYTES = 16; // 128 ビット
const GROUP = 8;
const EPOCH = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;
/** 署名の対象の前置き（REPORT §5-2）。 */
export const DOMAIN = 'pitch-supporter-v1\0';
/** plan の値 → 解除する機能の組（アプリ側で決める）。1 = 創設サポーター。 */
export const PLANS = Object.freeze({ 1: 'founding' });
/** テスト用の鍵だけが使う kid の範囲。本番の公開鍵の一覧には入れられない（validateKeyList）。 */
export const TEST_KID_MIN = 0xf0;
export const TEST_KID_MAX = 0xfe;
export const isTestKid = (kid) => kid >= TEST_KID_MIN && kid <= TEST_KID_MAX;

// Crockford base32（正規の文字だけ。O・I・L・U などの読み替えはしない）。
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODE = new Map([...ALPHA].map((c, i) => [c, i]));

export function base32Encode(bytes) {
  let out = '', buf = 0, bits = 0;
  for (const b of bytes) {
    buf = (buf << 8) | b;
    bits += 8;
    while (bits >= 5) { out += ALPHA[(buf >> (bits - 5)) & 31]; bits -= 5; }
    buf &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHA[(buf << (5 - bits)) & 31];
  return out;
}

/** 復号。正規の文字以外、または余りのビットが 0 でないときは null（1つのバイト列に1つの書き方だけ）。 */
export function base32Decode(text) {
  const out = [];
  let buf = 0, bits = 0;
  for (const c of text) {
    const v = DECODE.get(c);
    if (v === undefined) return null;
    buf = (buf << 5) | v;
    bits += 5;
    if (bits >= 8) { out.push((buf >> (bits - 8)) & 255); bits -= 8; }
    buf &= (1 << bits) - 1;
  }
  if (buf !== 0) return null;
  return Uint8Array.from(out);
}

/** 正規化：空白（改行を含む）と ASCII のハイフンを除き、大文字にする。それ以外の読み替えはしない。 */
export function normalizeKeyText(input) {
  return String(input ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

/** 本体（base32）→ 表示形 "PITCH1-XXXXXXXX-…"。 */
export function formatKey(body) {
  const groups = [];
  for (let i = 0; i < body.length; i += GROUP) groups.push(body.slice(i, i + GROUP));
  return [KEY_PREFIX, ...groups].join('-');
}

/** 'YYYY-MM-DD'（UTC）↔ 2024-01-01 からの日数。 */
export const dateToDays = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / DAY_MS);
export const daysToDate = (n) => new Date(EPOCH + n * DAY_MS).toISOString().slice(0, 10);

const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (s) => (typeof s === 'string' && /^(?:[0-9a-f]{2})*$/.test(s) ? Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16)) : null);

/** lid → 短い表示（"#A7K3"）。共有の抑止のため、画面にだけ出す（キーそのものは出さない）。 */
export const shortId = (lidHex) => `#${base32Encode(fromHex(lidHex) ?? new Uint8Array()).slice(0, 4)}`;

/** ペイロードを作る（テスト用の鍵の道具とテストだけが使う）。lid: 16バイトの Uint8Array か 32文字の16進。 */
export function encodePayload({ v = KEY_VERSION, kid, lid, plan = 1, iat }) {
  const lidBytes = typeof lid === 'string' ? fromHex(lid) : lid;
  if (!(lidBytes instanceof Uint8Array) || lidBytes.length !== LID_BYTES) throw new Error('lid must be 16 bytes');
  if (!Number.isInteger(kid) || kid < 1 || kid > 254) throw new Error(`kid must be 1…254: ${kid}`);
  if (!Number.isInteger(plan) || plan < 0 || plan > 255) throw new Error(`plan must be 0…255: ${plan}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iat ?? '')) throw new Error(`iat must be YYYY-MM-DD: ${iat}`);
  const days = dateToDays(iat);
  if (!(days >= 0 && days <= 0xffff) || daysToDate(days) !== iat) throw new Error(`iat out of range: ${iat}`);
  const b = new Uint8Array(PAYLOAD_BYTES);
  b[0] = v;
  b[1] = kid;
  b.set(lidBytes, 2);
  b[18] = plan;
  b[19] = days >> 8;
  b[20] = days & 255;
  return b;
}

/** ペイロード → 中身（署名を確かめたあとにだけ呼ぶ）。 */
export function decodePayload(b) {
  const lid = toHex(b.subarray(2, 18));
  return { v: b[0], kid: b[1], lid, plan: b[18], iat: daysToDate((b[19] << 8) | b[20]), short: shortId(lid) };
}

const utf8 = (s) => new TextEncoder().encode(s);
/** 署名の対象 = "pitch-supporter-v1\0" ‖ ペイロード。 */
export function signedMessage(payload, domain = DOMAIN) {
  const d = utf8(domain);
  const m = new Uint8Array(d.length + payload.length);
  m.set(d);
  m.set(payload, d.length);
  return m;
}

/** 署名とペイロードからキー文字列（表示形）を作る。 */
export function assembleKey(payload, signature) {
  if (payload.length !== PAYLOAD_BYTES || signature.length !== SIG_BYTES) throw new Error('bad payload/signature length');
  const all = new Uint8Array(KEY_BYTES);
  all.set(payload);
  all.set(signature, PAYLOAD_BYTES);
  return formatKey(base32Encode(all));
}

/**
 * 文字列 → { body, payload, signature, kid } または { error }。署名はまだ確かめていない
 * （kid は公開鍵を選ぶためだけに読む）。error: 'empty' | 'too-long' | 'format' | 'version'
 */
export function parseKey(input) {
  if (input != null && typeof input !== 'string') return { error: 'format' };
  const raw = input ?? '';
  if (raw.length > MAX_INPUT) return { error: 'too-long' };
  const s0 = raw.replace(/[\s-]+/g, '');
  if (!s0) return { error: 'empty' };
  if (!/^[0-9A-Za-z]+$/.test(s0)) return { error: 'format' }; // 全角・記号などは読み替えずに拒否
  const s = s0.toUpperCase();
  if (!s.startsWith('PITCH')) return { error: 'format' };
  if (s[5] !== '1') return { error: /[0-9]/.test(s[5] ?? '') ? 'version' : 'format' };
  const body = s.slice(KEY_PREFIX.length);
  if (body.length !== KEY_CHARS) return { error: 'format' };
  const bytes = base32Decode(body);
  if (!bytes || bytes.length !== KEY_BYTES) return { error: 'format' };
  if (bytes[0] !== KEY_VERSION) return { error: 'version' };
  return { body, payload: bytes.slice(0, PAYLOAD_BYTES), signature: bytes.slice(PAYLOAD_BYTES), kid: bytes[1] };
}

// ---------------------------------------------------------------- 公開鍵の一覧
const tables = new WeakMap();
/** [{ kid, pub }] → Map(kid → 32バイト)。形の合わない項目は使わない。 */
export function keyTable(keys) {
  if (!Array.isArray(keys)) return new Map();
  if (tables.has(keys)) return tables.get(keys);
  const t = new Map();
  for (const k of keys) {
    const pub = fromHex(k?.pub);
    if (Number.isInteger(k?.kid) && k.kid >= 1 && k.kid <= 254 && pub?.length === 32 && !t.has(k.kid)) t.set(k.kid, pub);
  }
  tables.set(keys, t);
  return t;
}

/** 公開鍵の一覧として使える形か。空 = 未設定（何も解除しない）。 */
export const isConfigured = (keys) => keyTable(keys).size > 0;

/**
 * 公開鍵の一覧・外した kid・失効した lid を確かめる（build-demo とテストが使う）。→ 問題の一覧（空なら OK）。
 * test: true はテスト用の一覧（kid はテスト用の範囲だけ）、false は本番（テスト用の kid は不可）。
 */
export function validateKeyList({ keys, retired = [], revoked = [] }, { test = false } = {}) {
  const errs = [];
  if (!Array.isArray(keys)) return ['SUPPORTER_KEYS must be an array'];
  const seen = new Set();
  for (const k of keys) {
    const extra = Object.keys(k ?? {}).filter((f) => !['kid', 'pub', 'added'].includes(f));
    if (extra.length) errs.push(`kid ${k?.kid}: unexpected field(s) ${extra.join(', ')} (only kid, pub, added; never a private key)`);
    if (!Number.isInteger(k?.kid) || k.kid < 1 || k.kid > 254) { errs.push(`bad kid ${k?.kid}`); continue; }
    if (seen.has(k.kid)) errs.push(`duplicate kid ${k.kid}`);
    seen.add(k.kid);
    if (test && !isTestKid(k.kid)) errs.push(`kid ${k.kid}: test key lists may only use kid ${TEST_KID_MIN}…${TEST_KID_MAX}`);
    if (!test && isTestKid(k.kid)) errs.push(`kid ${k.kid}: reserved for test keys`);
    if (typeof k.pub !== 'string' || !/^[0-9a-f]{64}$/.test(k.pub)) errs.push(`kid ${k.kid}: pub must be 64 lowercase hex characters`);
    else if (!strongPoint(fromHex(k.pub))) errs.push(`kid ${k.kid}: pub is not a usable Ed25519 point`);
  }
  if (!Array.isArray(retired) || !retired.every((x) => Number.isInteger(x) && x >= 1 && x <= 254)) errs.push('RETIRED_KIDS must be kids (1…254)');
  else for (const x of retired) if (seen.has(x)) errs.push(`kid ${x} is both in SUPPORTER_KEYS and RETIRED_KIDS`);
  if (!Array.isArray(revoked) || !revoked.every((x) => typeof x === 'string' && /^[0-9a-f]{32}$/.test(x))) errs.push('REVOKED_LIDS must be 32 lowercase hex characters each');
  return errs;
}

/** 公開鍵の一覧の指紋（SHA-256、16進）。ビルドの表示と、オーナーから受け取った値との照合に使う。 */
export async function keysFingerprint(keys, subtle = globalThis.crypto?.subtle) {
  const canon = [...keyTable(keys)].sort((a, b) => a[0] - b[0]).map(([kid, pub]) => `${kid}:${toHex(pub)}`).join('\n');
  return toHex(new Uint8Array(await subtle.digest('SHA-256', utf8(canon))));
}

// ---------------------------------------------------------------- 検証
const DEFAULTS = { keys: SUPPORTER_KEYS, retired: RETIRED_KIDS, revoked: REVOKED_LIDS };

/**
 * キーを検証する。オフライン、例外を投げない。
 * → { ok: true, key（表示形）, v, kid, lid, plan, iat, short, path }
 *   または { ok: false, reason }。reason: 'unconfigured' | 'unsupported' | 'empty' | 'too-long' | 'format' |
 *   'version' | 'unknown-kid' | 'retired-kid' | 'signature' | 'plan' | 'revoked'
 * opts.webcrypto = false は純 JS の経路だけを使う（テスト用）。
 */
export async function verifyKey(input, { keys = DEFAULTS.keys, retired = DEFAULTS.retired, revoked = DEFAULTS.revoked, subtle = globalThis.crypto?.subtle, webcrypto = true } = {}) {
  try {
    const table = keyTable(keys);
    if (!table.size) return { ok: false, reason: 'unconfigured' };
    const p = parseKey(input);
    if (p.error) return { ok: false, reason: p.error };
    if ((retired ?? []).includes(p.kid)) return { ok: false, reason: 'retired-kid' };
    const pub = table.get(p.kid);
    if (!pub) return { ok: false, reason: 'unknown-kid' };
    const r = await ed25519Verify(p.signature, signedMessage(p.payload), pub, { subtle, webcrypto });
    if (r.reason === 'unsupported') return { ok: false, reason: 'unsupported' };
    if (!r.ok) return { ok: false, reason: 'signature' };
    // ここから先は署名を確かめた中身
    const info = decodePayload(p.payload);
    if (!PLANS[info.plan]) return { ok: false, reason: 'plan' };
    if ((revoked ?? []).includes(info.lid)) return { ok: false, reason: 'revoked', short: info.short };
    return { ok: true, key: formatKey(p.body), path: r.path, ...info };
  } catch {
    return { ok: false, reason: 'signature' };
  }
}

/** 画面に出す理由の文。キーそのものは入れない。 */
export const REASON_TEXT = {
  unconfigured: '準備中です。サポーターキーの受付はまだ始まっていません。',
  unsupported: 'このブラウザではキーを確認できません（暗号の機能が使えません）。最新のブラウザでお試しください。',
  empty: 'キーを貼り付けてください。',
  'too-long': '入力が長すぎます。届いたキー（PITCH1- で始まる1行）だけを貼り付けてください。',
  format: 'キーの形式が正しくありません。届いたキーを「PITCH1-」から最後まで全部貼り付けてください。',
  version: 'このページでは使えない種類のキーです。ページを最新にしてからもう一度お試しください。',
  'unknown-kid': 'このページでは確認できないキーです。ページを最新にしてからもう一度お試しください。',
  'retired-kid': 'このキーは使えなくなりました。新しいキーをお送りしますので、購入先からご連絡ください。',
  signature: 'キーを確認できませんでした。1文字でも違うと使えません。届いたキーをそのまま貼り付けてください。',
  plan: 'このページでは使えない種類のキーです。ページを最新にしてからもう一度お試しください。',
  revoked: 'このキーは無効になっています（返金済み、または広く共有されたため）。心当たりがない場合は、購入先からご連絡ください。',
};

// ---------------------------------------------------------------- 端末内の保存
export const STORAGE_KEYS = {
  key: 'pitch:supporter:v1', // キーの文字列だけ（「解除済み」の印は保存しない）
  usage: 'pitch-usage-v1',
  lists: 'pitch-lists-v1',
  history: 'pitch-history-v1',
};
/** 以前の形式（ECDSA。本番のキーは発行していない）の保存場所。読み込み時に消す。 */
export const LEGACY_STORAGE_KEYS = ['pitch-supporter-key'];

/** localStorage を例外なしで使う。使えない環境（プライベートブラウズなど）では null／false。 */
export function safeStorage(get = () => globalThis.localStorage) {
  const ls = () => { try { return get() ?? null; } catch { return null; } };
  return {
    get(k) { try { return ls()?.getItem(k) ?? null; } catch { return null; } },
    set(k, v) { try { const s = ls(); if (!s) return false; s.setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { ls()?.removeItem(k); return true; } catch { return false; } },
    getJSON(k) { try { const t = this.get(k); return t ? JSON.parse(t) : null; } catch { return null; } },
    setJSON(k, v) { return this.set(k, JSON.stringify(v)); },
  };
}

/** メモリだけの保存（テスト・保存できない環境の代わり）。 */
export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, String(v)); return true; },
    remove: (k) => { m.delete(k); return true; },
    getJSON(k) { try { const t = this.get(k); return t ? JSON.parse(t) : null; } catch { return null; } },
    setJSON(k, v) { return this.set(k, JSON.stringify(v)); },
    dump: () => Object.fromEntries(m),
  };
}

/** 保存を消されにくくする（navigator.storage.persist()）。結果は true／false、例外なし。 */
export async function requestPersist(nav = globalThis.navigator) {
  try { return !!(await nav?.storage?.persist?.()); } catch { return false; }
}

/**
 * リンクで渡されたキー（"#key=…"）を受け取り、すぐに URL から消す。→ キーの文字列または null。
 * ほかの "#…&…" の項目は残す。消すのは history.replaceState（履歴に残さない）。
 */
export function takeKeyFromLocation(loc = globalThis.location, hist = globalThis.history) {
  try {
    const h = loc?.hash ?? '';
    if (h.length < 2) return null;
    const parts = h.slice(1).split('&');
    const hit = parts.find((p) => p.startsWith('key='));
    if (hit === undefined) return null;
    const rest = parts.filter((p) => !p.startsWith('key=')).join('&');
    try {
      hist.replaceState(hist.state, '', `${loc.pathname}${loc.search}${rest ? `#${rest}` : ''}`);
    } catch {
      try { loc.hash = rest; } catch { /* 消せない環境 */ }
    }
    let v = hit.slice(4);
    try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* そのまま */ }
    return v;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- 解除の状態
/**
 * 解除の状態（ページ内）。status: 'unconfigured'（公開鍵が未設定）| 'free' | 'supporter'。
 * 検証済みのキーは storage に保存し、ページを開くたびに検証し直します。
 */
export function createEntitlement({ keys = DEFAULTS.keys, retired = DEFAULTS.retired, revoked = DEFAULTS.revoked, storage = safeStorage(), subtle = globalThis.crypto?.subtle, webcrypto = true, persist = requestPersist } = {}) {
  const configured = isConfigured(keys);
  const base = () => ({ status: configured ? 'free' : 'unconfigured', info: null, stored: null, saved: false, persisted: false });
  let state = base();
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(state); };
  const opts = { keys, retired, revoked, subtle, webcrypto };
  const askPersist = async () => { try { return !!(await persist()); } catch { return false; } };
  const publicInfo = (r) => ({ kid: r.kid, lid: r.lid, plan: r.plan, iat: r.iat, short: r.short }); // キーの文字列は持たない

  return {
    configured,
    get state() { return state; },
    isSupporter: () => state.status === 'supporter' && PLANS[state.info?.plan] === 'founding',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** 保存されたキーを読み直す（ページを開いたとき）。 */
    async load() {
      for (const k of LEGACY_STORAGE_KEYS) storage.remove(k);
      const saved = storage.get(STORAGE_KEYS.key);
      if (!saved || !configured) { state = { ...base(), stored: saved ? 'unconfigured' : null }; notify(); return state; }
      const r = await verifyKey(saved, opts);
      state = r.ok ? { status: 'supporter', info: publicInfo(r), stored: 'ok', saved: true, persisted: await askPersist() } : { ...base(), stored: r.reason };
      notify();
      return state;
    },
    /** 入力されたキーで解除する。→ { ok, reason?, saved, short? }（キーの文字列は返さない）。 */
    async activate(input) {
      const r = await verifyKey(input, opts);
      if (!r.ok) return { ok: false, reason: r.reason };
      const saved = storage.set(STORAGE_KEYS.key, r.key);
      const persisted = saved ? await askPersist() : false;
      state = { status: 'supporter', info: publicInfo(r), stored: 'ok', saved, persisted };
      notify();
      return { ok: true, saved, persisted, short: r.short };
    },
    /** この端末からキーを消す（無料に戻る）。 */
    remove() {
      storage.remove(STORAGE_KEYS.key);
      state = base();
      notify();
      return state;
    },
  };
}

// ---------------------------------------------------------------- 無料／サポーターの差
export const ANKI_SCOPES = ['current', 'results', 'list', 'pairs', 'failed'];

/** いま使える範囲。Infinity = 上限なし。 */
export function gatesFor(isSupporter, plan = PLAN) {
  if (isSupporter || !plan.freeLimitsActive) {
    return { supporter: !!isSupporter, dailyJudgeLimit: Infinity, practicePairs: Infinity, ankiScopes: new Set(ANKI_SCOPES), lists: true, historyDays: Infinity };
  }
  return { supporter: false, dailyJudgeLimit: plan.freeDailyJudgeLimit, practicePairs: plan.freePracticePairs, ankiScopes: new Set(['failed']), lists: false, historyDays: plan.freeHistoryDays };
}

/** 最小対の index 番目（buildMinimalPairs の順）を聞き分けドリルに使えるか。 */
export const pairOpen = (gates, index) => index < gates.practicePairs;

// ---------------------------------------------------------------- 1日の判定数
/** 端末の時計での日付 'YYYY-MM-DD'（ローカル時刻）。 */
export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 1日に判定した語（異なる語の数で数える。同じ語のやり直しは数えない）。
 * state: { day, words: [wordId…] }。日付が変わったら 0 から。
 */
export function usageCheck(state, wordId, day, limit) {
  const words = state && state.day === day && Array.isArray(state.words) ? state.words : [];
  const already = words.includes(wordId);
  return { allowed: already || words.length < limit, used: words.length, limit, already };
}
export function usageRecord(state, wordId, day) {
  const words = state && state.day === day && Array.isArray(state.words) ? state.words : [];
  return words.includes(wordId) ? { day, words } : { day, words: [...words, wordId] };
}

/** 数えてよい判定か：録音ファイルで、判定できた（エラーでない）とき。合成音声・聞き分けは数えない。 */
export const countsAsJudgement = (e) => !!(e && e.source && e.source.kind === 'file' && e.word && e.result && !e.result.error);

export function limitText(limit) {
  return `今日の無料の判定（${limit}語）を使い切りました。無料版とサポーターで判定の中身は同じで、違うのは1日に判定できる語の数だけです。今日すでに判定した語は、もう一度判定できます。合成音声のサンプルと聞き分けドリルは数えません。この端末の日付が変わると、また${limit}語判定できます。`;
}

/**
 * 判定の前後に呼ぶ門番。
 * check(word) → null（判定してよい）または案内の文。record(e) は判定のたびに呼ぶ。
 * isExempt(): true のあいだは数えない（評価協力モード：精度の検証を止めないため）。
 */
export function createJudgeGate({ entitlement, storage = safeStorage(), now = () => new Date(), isExempt = () => false, plan = PLAN }) {
  let memory = null; // 保存できない環境での代わり
  const read = () => storage.getJSON(STORAGE_KEYS.usage) ?? memory;
  const write = (s) => { memory = s; storage.setJSON(STORAGE_KEYS.usage, s); };
  return {
    limit: () => gatesFor(entitlement.isSupporter(), plan).dailyJudgeLimit,
    used() { const s = read(); return s && s.day === localDay(now()) ? s.words.length : 0; },
    check(word) {
      const limit = this.limit();
      if (!Number.isFinite(limit) || isExempt()) return null;
      const c = usageCheck(read(), word.id, localDay(now()), limit);
      return c.allowed ? null : limitText(limit);
    },
    record(e) {
      if (!countsAsJudgement(e) || isExempt()) return false;
      write(usageRecord(read(), e.word.id, localDay(now())));
      return true;
    },
  };
}

// ---------------------------------------------------------------- 画面
/**
 * 「創設サポーター」節をつなぐ。ctx: { entitlement, gate, plan? }
 * 返り値 { refresh() }：判定のあとに呼ぶと「今日の判定」の表示を更新する。
 */
export function mountSupporter({ entitlement, gate, plan = PLAN }) {
  const $ = (id) => document.getElementById(id);
  if (!$('supporter')) return { refresh() {} };

  // 表（定数から作る）
  const table = $('sup-plan');
  const head = document.createElement('tr');
  for (const h of ['', '無料', plan.name]) head.append(Object.assign(document.createElement('th'), { scope: 'col', textContent: h }));
  const tbody = document.createElement('tbody');
  for (const [f, free, sup] of planRows(plan)) {
    const tr = document.createElement('tr');
    tr.append(Object.assign(document.createElement('th'), { scope: 'row', textContent: f }));
    tr.append(Object.assign(document.createElement('td'), { textContent: free }));
    tr.append(Object.assign(document.createElement('td'), { textContent: sup }));
    tbody.append(tr);
  }
  const thead = document.createElement('thead');
  thead.append(head);
  table.replaceChildren(thead, tbody);

  $('sup-beta').textContent = plan.betaNote;
  $('sup-price').textContent = `${plan.price}（${plan.priceNote}）`;
  $('sup-refund').textContent = `購入から${plan.refundDays}日以内なら、理由を問わず返金します。`;
  const buy = $('sup-buy');
  if (plan.kofiUrl && entitlement.configured) {
    const a = document.createElement('a');
    a.href = plan.kofiUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Ko-fi で購入する（外部サイト）';
    buy.replaceChildren(a, document.createTextNode('　購入後、サポーターキーを手作業でお送りします（届くまで少し時間がかかることがあります）。'));
  } else {
    buy.textContent = '購入ページは準備中です。';
  }
  buy.dataset.ready = String(!!(plan.kofiUrl && entitlement.configured));

  const input = $('sup-key');
  // リンクで渡されたキー（#key=…）は、読んだらすぐに URL から消す（履歴・共有・スクリーンショットに残さない）
  const incoming = takeKeyFromLocation();
  const msg = (t, kind = '') => { $('sup-msg').textContent = t; $('sup-msg').dataset.kind = kind; };

  function render() {
    const st = entitlement.state;
    const s = $('sup-status');
    s.dataset.state = st.status;
    if (st.status === 'supporter') {
      s.textContent = `${plan.name}：解除済み（サポーター ${st.info.short}・${st.info.iat} 発行）`;
    } else if (st.status === 'unconfigured') {
      s.textContent = '無料版で使っています（サポーターキーの受付は準備中です）';
    } else {
      s.textContent = '無料版で使っています';
    }
    const ready = entitlement.configured;
    input.disabled = !ready || st.status === 'supporter';
    $('sup-activate').disabled = !ready || st.status === 'supporter';
    input.placeholder = ready ? 'PITCH1-XXXXXXXX-XXXXXXXX-…' : '準備中';
    $('sup-unconfigured').hidden = ready;
    $('sup-active').hidden = st.status !== 'supporter';
    $('sup-saved-note').hidden = st.status !== 'supporter' || st.saved;
    if ($('sup-keep-note')) $('sup-keep-note').hidden = st.status !== 'supporter';
    if (st.stored && st.stored !== 'ok' && st.stored !== 'unconfigured' && st.status !== 'supporter' && !$('sup-msg').textContent) {
      msg(`保存されているキーは使えません。${REASON_TEXT[st.stored] ?? ''}`, 'ng');
    }
    // QA 用の状態。キーの文字列は入れない（短い表示だけ）
    window.__supporter = { status: st.status, short: st.info?.short ?? null, stored: st.stored, persisted: !!st.persisted, used: gate.used(), limit: gate.limit() };
    refreshUsage();
  }

  function refreshUsage() {
    const limit = gate.limit();
    const el = $('usage-note');
    if (!el) return;
    if (!Number.isFinite(limit)) {
      el.textContent = entitlement.isSupporter() ? `${plan.name}：判定の回数に上限はありません。` : '';
    } else {
      el.textContent = `今日の判定：${gate.used()} / ${limit} 語（無料版。この端末の日付で数えます。同じ語のやり直し・合成音声のサンプルは数えません）`;
    }
    el.hidden = !el.textContent;
    if (window.__supporter) window.__supporter.used = gate.used();
  }

  async function activate(text) {
    $('sup-activate').disabled = true;
    msg('確認しています…');
    const r = await entitlement.activate(text);
    if (r.ok) {
      input.value = '';
      msg(r.saved ? 'ありがとうございます。この端末でサポーター機能を解除しました。' : 'ありがとうございます。解除しましたが、この端末に保存できないため、ページを閉じると元に戻ります。', 'ok');
    } else {
      msg(REASON_TEXT[r.reason] ?? REASON_TEXT.signature, 'ng'); // 理由だけ。キーの文字列は出さない
      $('sup-activate').disabled = false;
    }
    render();
    return r;
  }
  $('sup-activate').addEventListener('click', () => activate(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('sup-activate').click(); } });
  $('sup-remove').addEventListener('click', () => {
    entitlement.remove();
    msg('この端末からキーを削除しました。もう一度使うときは、キーを貼り付けてください。');
    render();
  });

  entitlement.subscribe(render);
  render();
  return {
    refresh: refreshUsage,
    render,
    /** 保存済みのキーを読み直したあとに呼ぶ：リンクで渡されたキーがあれば確かめる。 */
    async useIncoming() {
      if (!incoming || entitlement.isSupporter()) return null;
      $('supporter').scrollIntoView?.({ block: 'start' });
      return activate(incoming);
    },
  };
}

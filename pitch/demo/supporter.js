// 創設サポーター — サポーターキーの検証（オフライン）、無料／サポーターの差、1日の判定数。
//
// キー：ECDSA P-256（SHA-256）の署名つき。ページに埋め込んだ公開鍵（demo/supporter-pubkey.js）
// だけで、ブラウザの WebCrypto で検証します。どこにも送信しません。
//   中身（9 バイト）：版(1) 通し番号(4) 発行日(2・2024-01-01 からの日数) 機能フラグ(2)
//   ＋ 署名 64 バイト（r‖s）→ Crockford base32 → "PITCH-XXXXX-XXXXX-…"
//   氏名・メールなどの個人情報は入れません。
// 発行は scripts/supporter-key.mjs（秘密鍵はリポジトリの外）。運用は docs/supporter-ops.md。
//
// 純粋な部分（キーの符号化・検証、ゲート、1日の数え方）は test/supporter.test.js でテストします。
// mountSupporter() は「創設サポーター」節（demo/template.html の #sup-*）をつなぎます。
import { SUPPORTER_PUBLIC_KEY, REVOKED_SERIALS } from './supporter-pubkey.js';

// ---------------------------------------------------------------- お金・無料枠の定数（ここだけ）
/**
 * お金に関わる表示と、無料枠の数字はすべてここに置きます（docs/decisions.md「創設サポーター」）。
 * 本部の決定 d31：最初の有料は「創設サポーター」買い切り。判定とは関係ない機能を売る。
 */
export const PLAN = {
  name: '創設サポーター',
  price: '$19', // TODO(オーナー): 価格の表示（d31 は $19 の案）。通貨・税込みの書き方も確認
  priceNote: '買い切り・1回払い。月額ではありません',
  refundDays: 30, // TODO(オーナー): 返金の方針（30日以内なら理由を問わず返金、の案）
  kofiUrl: '', // TODO(オーナー): Ko-fi ショップの URL。空のあいだは「準備中」と表示し、リンクを作らない
  betaNote: '判定はベータで調整中です。精度を約束するものではありません。',
  // eslint-disable-next-line no-undef -- テスト用ビルドだけ build-demo の define で true になる
  freeLimitsActive: (typeof __PITCH_FREE_LIMITS__ !== 'undefined' && __PITCH_FREE_LIMITS__) || false, // 販売開始（本番の鍵と Ko-fi の URL がそろう）まで無料枠は適用しない（Kana 判断 2026-10-09）。true で適用
  freeDailyJudgeLimit: 20, // 仮置き：無料で1日に判定できる語の数
  freePracticePairs: 5, // 仮置き：無料で聞き分けドリルに使える最小対（先頭から）
  freeHistoryDays: 7, // 仮置き：無料で見られる練習の記録（直近の日数）
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
export const KEY_PREFIX = 'PITCH';
export const KEY_VERSION = 1;
const PAYLOAD_BYTES = 9;
const SIG_BYTES = 64;
const KEY_BYTES = PAYLOAD_BYTES + SIG_BYTES; // 73 バイト → base32 で 117 文字
const KEY_CHARS = Math.ceil((KEY_BYTES * 8) / 5);
const GROUP = 5;
const EPOCH = Date.UTC(2024, 0, 1);
const DAY_MS = 86400000;
/** 署名する内容の前置き（ほかの用途の署名と取り違えないため）。 */
const DOMAIN = 'P3PITCH-SUPPORTER-v1\0';
export const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
export const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' };

// Crockford base32：大文字小文字を区別せず、O→0、I・L→1 と読む（人が書き写しても通るように）。
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DECODE = new Map([...ALPHA].map((c, i) => [c, i]));
DECODE.set('O', 0); DECODE.set('I', 1); DECODE.set('L', 1);

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

/** 復号。使えない文字、または余りのビットが 0 でないときは null（1つのバイト列に1つの書き方だけ）。 */
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

/**
 * 貼り付けられた文字列を、キー本体の文字だけにする：全角→半角、大文字に、空白・改行・
 * ハイフン類（‐－ー など）を除き、先頭の PITCH を外す。
 */
export function normalizeKeyText(input) {
  let s = String(input ?? '').normalize('NFKC').toUpperCase();
  s = s.replace(/[\s\-‐‑‒–—―−ー_.]/g, '');
  if (s.startsWith(KEY_PREFIX)) s = s.slice(KEY_PREFIX.length);
  return s;
}

/** 本体の文字列 → 表示用 "PITCH-XXXXX-…"。 */
export function formatKey(body) {
  const groups = [];
  for (let i = 0; i < body.length; i += GROUP) groups.push(body.slice(i, i + GROUP));
  return [KEY_PREFIX, ...groups].join('-');
}

/** 'YYYY-MM-DD'（UTC）↔ 2024-01-01 からの日数。 */
export const dateToDays = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - EPOCH) / DAY_MS);
export const daysToDate = (n) => new Date(EPOCH + n * DAY_MS).toISOString().slice(0, 10);

export function encodePayload({ version = KEY_VERSION, serial, issued, flags = 0 }) {
  if (!Number.isInteger(serial) || serial < 1 || serial > 0xffffffff) throw new Error(`serial must be 1…4294967295: ${serial}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issued ?? '')) throw new Error(`issued must be YYYY-MM-DD: ${issued}`);
  const days = dateToDays(issued);
  if (!(days >= 0 && days <= 0xffff) || daysToDate(days) !== issued) throw new Error(`issued out of range: ${issued}`);
  if (!Number.isInteger(flags) || flags < 0 || flags > 0xffff) throw new Error(`flags must be 0…65535: ${flags}`);
  const b = new Uint8Array(PAYLOAD_BYTES);
  const v = new DataView(b.buffer);
  v.setUint8(0, version);
  v.setUint32(1, serial);
  v.setUint16(5, days);
  v.setUint16(7, flags);
  return b;
}

export function decodePayload(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { version: v.getUint8(0), serial: v.getUint32(1), issued: daysToDate(v.getUint16(5)), flags: v.getUint16(7) };
}

const utf8 = (s) => new TextEncoder().encode(s);
/** 署名する内容 = 前置き ‖ 中身。 */
export function signedMessage(payload) {
  const d = utf8(DOMAIN);
  const m = new Uint8Array(d.length + payload.length);
  m.set(d);
  m.set(payload, d.length);
  return m;
}

/** 文字列 → { body, payload, signature, info } または { error: 'format' | 'version' }。 */
export function parseKey(input) {
  const body = normalizeKeyText(input);
  if (!body) return { error: 'empty' };
  const bytes = base32Decode(body);
  if (!bytes || body.length !== KEY_CHARS || bytes.length !== KEY_BYTES) return { error: 'format' };
  if (bytes[0] !== KEY_VERSION) return { error: 'version' };
  const payload = bytes.slice(0, PAYLOAD_BYTES);
  return { body: base32Encode(bytes), payload, signature: bytes.slice(PAYLOAD_BYTES), info: decodePayload(payload) };
}

/** 署名してキー文字列を作る（scripts/supporter-key.mjs とテスト用）。privateKey: CryptoKey。 */
export async function signKey(privateKey, fields, subtle = globalThis.crypto?.subtle) {
  const payload = encodePayload(fields);
  const sig = new Uint8Array(await subtle.sign(ECDSA_SIGN, privateKey, signedMessage(payload)));
  if (sig.length !== SIG_BYTES) throw new Error(`unexpected signature length ${sig.length}`);
  const all = new Uint8Array(KEY_BYTES);
  all.set(payload);
  all.set(sig, PAYLOAD_BYTES);
  return formatKey(base32Encode(all));
}

/** 公開鍵（JWK）として使える形か。null・空・別の曲線は「未設定」扱い。 */
export const isConfiguredKey = (jwk) => !!(jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string' && !jwk.d);

const imported = new Map();
async function importPublic(jwk, subtle) {
  const id = `${jwk.x}.${jwk.y}`;
  if (!imported.has(id)) imported.set(id, subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, ECDSA, false, ['verify']));
  try { return await imported.get(id); } catch (e) { imported.delete(id); throw e; }
}

/**
 * キーを検証する。オフライン、例外を投げない。
 * → { ok: true, key（表示形）, version, serial, issued, flags }
 *   または { ok: false, reason: 'unconfigured' | 'unsupported' | 'empty' | 'format' | 'version' | 'signature' | 'revoked' }
 */
export async function verifyKey(input, { publicKey = SUPPORTER_PUBLIC_KEY, revoked = REVOKED_SERIALS, subtle = globalThis.crypto?.subtle } = {}) {
  if (!isConfiguredKey(publicKey)) return { ok: false, reason: 'unconfigured' };
  if (!subtle) return { ok: false, reason: 'unsupported' };
  const p = parseKey(input);
  if (p.error) return { ok: false, reason: p.error };
  let good = false;
  try {
    const key = await importPublic(publicKey, subtle);
    good = await subtle.verify(ECDSA_SIGN, key, p.signature, signedMessage(p.payload));
  } catch {
    good = false;
  }
  if (!good) return { ok: false, reason: 'signature' };
  if ((revoked ?? []).map(Number).includes(p.info.serial)) return { ok: false, reason: 'revoked', ...p.info };
  return { ok: true, key: formatKey(p.body), ...p.info };
}

export const REASON_TEXT = {
  unconfigured: '準備中です。サポーターキーの受付はまだ始まっていません。',
  unsupported: 'このブラウザではキーを確認できません（暗号の機能が使えません）。別のブラウザでお試しください。',
  empty: 'キーを貼り付けてください。',
  format: 'キーの形式が正しくありません。届いたキーを「PITCH-」から最後まで全部貼り付けてください。',
  version: 'このページでは使えない種類のキーです。ページを最新にしてからもう一度お試しください。',
  signature: 'キーを確認できませんでした。1文字でも違うと使えません。届いたキーをそのまま貼り付けてください。',
  revoked: 'このキーは無効になっています（返金済みなど）。心当たりがない場合は、購入先からご連絡ください。',
};

// ---------------------------------------------------------------- 端末内の保存
export const STORAGE_KEYS = {
  key: 'pitch-supporter-key',
  usage: 'pitch-usage-v1',
  lists: 'pitch-lists-v1',
  history: 'pitch-history-v1',
};

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

// ---------------------------------------------------------------- 解除の状態
/**
 * 解除の状態（ページ内）。status: 'unconfigured'（公開鍵が未設定）| 'free' | 'supporter'。
 * 検証済みのキーは storage に保存し、次に開いたときに検証し直します。
 */
export function createEntitlement({ publicKey = SUPPORTER_PUBLIC_KEY, revoked = REVOKED_SERIALS, storage = safeStorage(), subtle = globalThis.crypto?.subtle } = {}) {
  const configured = isConfiguredKey(publicKey);
  const base = () => ({ status: configured ? 'free' : 'unconfigured', info: null, stored: null, saved: false });
  let state = base();
  const listeners = new Set();
  const notify = () => { for (const fn of listeners) fn(state); };
  const opts = { publicKey, revoked, subtle };

  return {
    configured,
    get state() { return state; },
    isSupporter: () => state.status === 'supporter',
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** 保存されたキーを読み直す（ページを開いたとき）。 */
    async load() {
      const saved = storage.get(STORAGE_KEYS.key);
      if (!saved || !configured) { state = { ...base(), stored: saved ? 'unconfigured' : null }; notify(); return state; }
      const r = await verifyKey(saved, opts);
      state = r.ok ? { status: 'supporter', info: r, stored: 'ok', saved: true } : { ...base(), stored: r.reason };
      notify();
      return state;
    },
    /** 入力されたキーで解除する。→ verifyKey の結果に saved（端末に保存できたか）を足したもの。 */
    async activate(input) {
      const r = await verifyKey(input, opts);
      if (!r.ok) return r;
      const saved = storage.set(STORAGE_KEYS.key, r.key);
      state = { status: 'supporter', info: r, stored: 'ok', saved };
      notify();
      return { ...r, saved };
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
  const msg = (t, kind = '') => { $('sup-msg').textContent = t; $('sup-msg').dataset.kind = kind; };

  function render() {
    const st = entitlement.state;
    const s = $('sup-status');
    s.dataset.state = st.status;
    if (st.status === 'supporter') {
      s.textContent = `${plan.name}：解除済み（通し番号 ${st.info.serial}・発行日 ${st.info.issued}）`;
    } else if (st.status === 'unconfigured') {
      s.textContent = '無料版で使っています（サポーターキーの受付は準備中です）';
    } else {
      s.textContent = '無料版で使っています';
    }
    const ready = entitlement.configured;
    input.disabled = !ready || st.status === 'supporter';
    $('sup-activate').disabled = !ready || st.status === 'supporter';
    input.placeholder = ready ? 'PITCH-XXXXX-XXXXX-…' : '準備中';
    $('sup-unconfigured').hidden = ready;
    $('sup-active').hidden = st.status !== 'supporter';
    $('sup-saved-note').hidden = st.status !== 'supporter' || st.saved;
    if (st.stored && st.stored !== 'ok' && st.stored !== 'unconfigured' && st.status !== 'supporter' && !$('sup-msg').textContent) {
      msg(`保存されているキーは使えません。${REASON_TEXT[st.stored] ?? ''}`, 'ng');
    }
    window.__supporter = { status: st.status, serial: st.info?.serial ?? null, stored: st.stored, used: gate.used(), limit: gate.limit() };
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

  $('sup-activate').addEventListener('click', async () => {
    $('sup-activate').disabled = true;
    msg('確認しています…');
    const r = await entitlement.activate(input.value);
    if (r.ok) {
      input.value = '';
      msg(r.saved ? 'ありがとうございます。この端末でサポーター機能を解除しました。' : 'ありがとうございます。解除しましたが、この端末に保存できないため、ページを閉じると元に戻ります。', 'ok');
    } else {
      msg(REASON_TEXT[r.reason] ?? REASON_TEXT.signature, 'ng');
      $('sup-activate').disabled = false;
    }
    render();
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('sup-activate').click(); } });
  $('sup-remove').addEventListener('click', () => {
    entitlement.remove();
    msg('この端末からキーを削除しました。もう一度使うときは、キーを貼り付けてください。');
    render();
  });

  entitlement.subscribe(render);
  render();
  return { refresh: refreshUsage, render };
}

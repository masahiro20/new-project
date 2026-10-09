import { containsPhrase, katakanaKey, looksJapanese, ref, visibleText } from "./text.js";
import type { Glossary, GlossaryCharacter, GlossaryTerm, Lang, Row, Table } from "./types.js";

export interface DraftEntry {
  source: string;
  target?: string;
  /** Dice score of the chosen (or best) rendering, 0..1. */
  confidence: number;
  rows: number;
  /** Candidate target renderings → number of rows that use them. */
  renderings: Record<string, number>;
  /** First few file:line refs. */
  refs: string[];
}

export interface GlossaryDraft {
  /** Ready to save: terms with confident targets + characters guessed from speaker labels. */
  glossary: Glossary;
  /** All candidates incl. low-confidence, sorted by rows desc. */
  entries: DraftEntry[];
  notes: string[];
}

export interface DraftOptions {
  /** Minimum distinct rows a candidate must appear in. Default 2. */
  minRows?: number;
  /** Maximum number of term entries. Default 100. */
  maxTerms?: number;
  /** Extra source words never to propose (added to the built-in common-word list and the glossary's ignoreWords). */
  stopwords?: string[];
}

/** Target n-gram / source candidate. `key` is normalized (katakanaKey for JA, lowercase + plural fold for EN). */
interface Gram {
  key: string;
  surface: string;
  cap: boolean;
  /** Seen at least once not at the start of a sentence. */
  mid: boolean;
  /** EN: capitalized mid-sentence inside ordinary prose (not a Title Case label), the mark of a UI term or name. */
  prose?: boolean;
  /** JA: every occurrence in the row ends mid-word (最近開|いた, 透明度の並|べ替え). */
  cut?: boolean;
}

interface Rec {
  row: Row;
  srcJa: boolean;
  ja: string;
  enG: Map<string, Gram>;
  jaG: Map<string, Gram>;
}

interface Scored {
  key: string;
  co: number;
  dice: number;
  size: number;
}

interface Alignment {
  core?: Scored;
  best?: Scored;
  ambiguous: boolean;
  ranked: Scored[];
  surfaces: Map<string, Map<string, number>>;
}

const NOT_FOUND = "(not found)";
const MIN_DICE = 0.5;
const SYSTEM_LABEL = /^(システム|system|narrator|narration|ナレーション|ナレーター|地の文|ui|sys)$/i;

const EN_STOP = new Set(
  ("a an the and or but nor of to in on at by for with from into onto over under about as is are was were be been being am " +
    "do does did done have has had will would shall should can could may might must not no yes so too very just only also then " +
    "than that this these those there here it its i me my mine we us our you your he him his she her they them their what who " +
    "whom which when where why how all any some one each every if else up down out off again now oh hey ah well let get got go " +
    "going come see say said before after even still yet more most much many own such like okay ok please thank thanks hi hello " +
    "x s t " +
    // Frequent UI verbs, adjectives and interjections: their rendering depends on the context, so a glossary entry misfires.
    "remember hold start random expand linear display modify oops find hide show toggle shift flip copy browse additional " +
    "dead great regular ruined unable fulfill required consecutive amplifies append inspect").split(" "),
);
const EN_CONNECT = new Set(["of", "the", "de", "du", "la", "le", "von", "van"]);

const K = "[一-鿿々〆]";
const PARTICLE = "(?=[をはがのにへとでもや、。！？!?…」』]|$)";
/** What may follow a word: particles, copula, する-forms, adjectival な, punctuation, another script. */
const BOUNDARY = "[をはがのにへとでもやかまよなだしさすせ、。，．！？!?…・「」『』（）()\\s　:：/A-Za-z0-9ァ-ヴー]|$";
const BOUNDARY_RE = new RegExp(`^(?:${BOUNDARY})`);
const JA_KATA = /[ァ-ヴー・＝]{3,}/g;
const JA_KANJI = new RegExp(`${K}{2,}[きぎちびみり]?`, "g");
// X の Y; Y may be a single kanji when X is at least two characters (星詠みの塔, 灰の書庫).
// Both ends must sit on a word boundary: レイヤー名の変更 does not yield 名の変更, 繋ぎ目の更新 not 目の更新,
// 透明度の並べ替え not 透明度の並.
const JA_NO = new RegExp(`(?<![一-鿿々〆ァ-ヴー])(?<![一-鿿々〆][ぁ-ゖ])(?:${K}+の${K}{2,}(?=${BOUNDARY})|${K}{2,}[きぎちびみり]?の${K}(?!${K})(?=${BOUNDARY}))`, "g");
// One kanji standing alone before a particle (剣を), or one kanji + okurigana (祈り, 誓い, 導き).
const JA_SINGLE = new RegExp(`(?<![一-鿿々〆ぁ-ゖ])${K}[いきぎしちにびみり]?${PARTICLE}`, "g");

/**
 * Everyday words that recur in any script but rarely belong in a glossary. Not exhaustive: the ranking
 * below also pushes candidates without a consistent rendering to the bottom.
 */
const JA_COMMON = new Set(
  ("自分 本当 大丈夫 一緒 今日 明日 昨日 今度 今回 最初 最後 全部 全然 少し 時間 場所 世界 仲間 必要 問題 理由 意味 " +
    "気持 気分 気持ち 本気 本物 当然 勝手 無理 無事 心配 安心 危険 大事 大切 簡単 確か 結局 絶対 普通 方法 準備 " +
    "用意 説明 話 言葉 名前 相手 皆 皆さん 皆様 人間 誰か 何か 何処 何故 一体 一人 二人 自身 他人 先生 先輩 後輩 " +
    "友達 家族 両親 父 母 兄 姉 弟 妹 子供 大人 男 女 体 顔 目 手 足 声 心 頭 力 命 " +
    "部屋 外 中 上 下 前 後 横 隣 近く 遠く 向こう 今 昔 後で 先 次 他 別 同じ 色々 様々 沢山 一番 以上 以下 " +
    "以外 以前 以後 場合 程度 予定 約束 関係 状況 状態 様子 調子 結果 原因 目的 仕事 作戦 計画 情報 連絡 確認 報告 " +
    "了解 失礼 感謝 本日 今夜 今朝 毎日 一日 一度 何度 二度 多分 恐らく 是非 勿論 実際 本来 特別 自由 平和 未来 過去 " +
    "現在 時代 世の中 人生 生活 毎回 一瞬 瞬間 戦い 勝負 攻撃 防御 回復 移動 出発 到着 帰還 開始 終了 成功 失敗 " +
    "私 僕 俺 君 彼 彼女 貴方 あなた 我々 私達 僕達 俺達 自分達 何 誰 事 物 者 方 所 時 人 気 達 様 方々 皆様方").split(" "),
);

/** Fold English plurals on the last word: stones→stone, abilities→ability, boxes→box. */
function foldWord(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(x|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /[^s]s$/.test(w) && !/(us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function enKey(phrase: string): string {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const last = words.pop();
  return last === undefined ? "" : [...words, foldWord(last)].join(" ");
}

const normKey = (s: string) => (looksJapanese(s) ? katakanaKey(s) : enKey(s));

function contains(long: string, short: string, lang: Lang): boolean {
  return lang === "ja" ? long.includes(short) : ` ${long} `.includes(` ${short} `);
}

/** Proper contiguous sub-phrases of a key: word spans for EN, substrings (≥ 2 chars) for JA. */
function subPhrases(key: string, lang: Lang): string[] {
  const out: string[] = [];
  if (lang === "ja") {
    for (let i = 0; i < key.length; i++) for (let j = i + 2; j <= key.length; j++) if (j - i < key.length) out.push(key.slice(i, j));
    if (key.length > 1) for (const ch of key) out.push(ch);
  } else {
    const w = key.split(" ");
    for (let i = 0; i < w.length; i++) {
      for (let j = i + 1; j <= w.length; j++) {
        if (j - i === w.length) continue;
        // Only the last word of a key is plural-folded, so an inner span needs folding to match a candidate key.
        out.push(j === w.length ? w.slice(i, j).join(" ") : enKey(w.slice(i, j).join(" ")));
      }
    }
  }
  return out;
}

const sizeOf = (key: string, lang: Lang) => (lang === "ja" ? key.length : key.split(" ").length);

function addGram(m: Map<string, Gram>, key: string, surface: string, cap: boolean, mid: boolean, extra: { prose?: boolean; cut?: boolean } = {}): void {
  const g = m.get(key);
  if (!g) m.set(key, { key, surface, cap, mid, prose: !!extra.prose, cut: !!extra.cut });
  else {
    g.cap ||= cap;
    g.mid ||= mid;
    g.prose ||= !!extra.prose;
    g.cut &&= !!extra.cut;
  }
}

/** English n-grams: capitalized phrases (1–3 words, inner "of"/"the" allowed) and lowercase content phrases (1–2 words). */
function enGrams(text: string, lowerWords: Set<string>): Map<string, Gram> {
  const out = new Map<string, Gram>();
  for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
    let first = true;
    // Ordinary prose (has a lowercase content word): a capitalized word inside it is a deliberate capital, not Title Case.
    const prose = (sentence.match(/\b[a-z]{4,}\b/g) ?? []).some((w) => !EN_STOP.has(w));
    for (const chunk of sentence.split(/[^A-Za-z0-9'’\s-]+/)) {
      const words = (chunk.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) ?? []).map((w) => w.replace(/['’]s$/i, ""));
      if (!words.length) continue;
      const lower = words.map((w) => w.toLowerCase());
      const isCap = words.map((w) => /^[A-Z]/.test(w));
      const isLow = words.map((w) => /^[a-z]/.test(w));
      const content = lower.map((w) => w.length > 1 && !EN_STOP.has(w) && !EN_STOP.has(foldWord(w)) && !/['’]/.test(w) && !/^\d+$/.test(w));
      const folded = lower.map(foldWord);
      words.forEach((_, i) => {
        if (isLow[i]) lowerWords.add(folded[i]!);
      });
      for (let i = 0; i < words.length; i++) {
        if (!content[i]) continue;
        let capRun = isCap[i]!;
        let lowRun = isLow[i]! && lower[i]!.length > 2;
        for (let n = 1; n <= 3 && i + n <= words.length; n++) {
          const j = i + n - 1;
          if (n > 1) {
            // An inner connector ("of", "the") may stay lowercase inside a capitalized phrase.
            capRun &&= isCap[j - 1]! || j - 1 === i || EN_CONNECT.has(lower[j - 1]!);
            lowRun &&= isLow[j]! && n <= 2;
          }
          if (!capRun && !lowRun) break;
          if (!content[j]) continue;
          const cap = capRun && isCap[j]!;
          if (!cap && !(lowRun && lower[j]!.length > 2)) continue;
          const key = n === 1 ? folded[i]! : `${lower.slice(i, j).join(" ")} ${folded[j]!}`;
          addGram(out, key, words.slice(i, j + 1).join(" "), cap, !(first && i === 0), { prose: cap && prose && i > 0 });
        }
      }
      first = false;
    }
  }
  return out;
}

/**
 * Japanese candidates: katakana runs (≥3), kanji compounds (≥2, optional 連用形 okurigana like 星詠み),
 * X の Y compounds, and single-kanji words (剣を, 祈り) which are held to a stricter bar when aligned.
 */
function jaGrams(text: string): Map<string, Gram> {
  const out = new Map<string, Gram>();
  for (const m of text.matchAll(JA_SINGLE)) addGram(out, m[0], m[0], true, true);
  for (const m of text.matchAll(JA_KATA)) {
    const s = m[0].replace(/^[・＝]+|[・＝]+$/g, "");
    if (s.length >= 3) addGram(out, katakanaKey(s), s, true, true);
  }
  for (const re of [JA_KANJI, JA_NO]) {
    for (const m of text.matchAll(re)) {
      // A kanji run followed by okurigana that is not a particle or する-form is cut mid-word (最近開|いた):
      // mark it, and also offer the run without its last kanji (最近).
      const cut = !BOUNDARY_RE.test(text.slice(m.index + m[0].length, m.index + m[0].length + 1));
      addGram(out, m[0], m[0], true, true, { cut });
      if (cut && re === JA_KANJI && /^[一-鿿々〆]{3,}$/.test(m[0])) addGram(out, m[0].slice(0, -1), m[0].slice(0, -1), true, true);
      // 星詠み also yields 星詠 so that a bare 星詠 elsewhere is linked; pruning drops it when redundant.
      if (re === JA_KANJI && /[ぁ-ゖ]$/.test(m[0])) addGram(out, m[0].slice(0, -1), m[0].slice(0, -1), true, true);
    }
  }
  return out;
}

function tally(m: Map<string, Map<string, number>>, key: string, surface: string): void {
  let s = m.get(key);
  if (!s) m.set(key, (s = new Map()));
  s.set(surface, (s.get(surface) ?? 0) + 1);
}

/** Most frequent surface; shorter wins ties (singular over plural). */
function display(surfaces: Map<string, number> | undefined, fallback: string): string {
  if (!surfaces) return fallback;
  let best = fallback;
  let n = -1;
  for (const [s, c] of surfaces) {
    if (c > n || (c === n && s.length < best.length)) {
      best = s;
      n = c;
    }
  }
  return best;
}

function docFreq(idx: number[], gramsOf: (i: number) => Iterable<Gram>): Map<string, number> {
  const df = new Map<string, number>();
  for (const i of idx) for (const g of gramsOf(i)) df.set(g.key, (df.get(g.key) ?? 0) + 1);
  return df;
}

/**
 * Score every co-occurring n-gram with Dice = 2·|both| / (|candidate rows| + |n-gram rows|).
 * The best n-gram is extended to a longer one containing it when that covers ≥ half its rows
 * ("Stone" → "Mana Stone"). Ambiguous when an unrelated n-gram scores as high.
 */
function align(
  rows: number[], gramsOf: (i: number) => Iterable<Gram>, df: Map<string, number>, lang: Lang, textOf?: (i: number) => string,
): Alignment {
  const co = new Map<string, number>();
  const surfaces = new Map<string, Map<string, number>>();
  for (const i of rows) {
    for (const g of gramsOf(i)) {
      co.set(g.key, (co.get(g.key) ?? 0) + 1);
      tally(surfaces, g.key, g.surface);
    }
  }
  const n = rows.length;
  const ranked: Scored[] = [...co].map(([key, c]) => ({ key, co: c, dice: (2 * c) / (n + (df.get(key) ?? c)), size: sizeOf(key, lang) }));
  ranked.sort((a, b) => b.dice - a.dice || b.size - a.size || b.co - a.co || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const core = ranked[0];
  if (!core) return { ambiguous: false, ranked, surfaces };
  let best = core;
  // Extend to a longer compound that contains it ("Stone" → "Mana Stone"). A JA compound must cover nearly all
  // of the core's rows: エラー must not become エラーコード because "Error code" is common.
  for (;;) {
    const ext = ranked
      .filter((r) => r.size > best.size && r.co >= (lang === "ja" ? 0.8 : 0.5) * core.co && contains(r.key, best.key, lang))
      .sort((a, b) => b.co - a.co || b.size - a.size)[0];
    if (!ext) break;
    best = ext;
  }
  // Trim an over-long JA compound (アニメーションキーフレーム for "Keyframe") to the part of it that the term's
  // rows actually share: a shorter n-gram inside it that appears in more of the rows, and in at least 80% of them.
  // A compound that already covers 80% stays, so real drift (闇の女王 ×4 vs 邪悪な女王 ×1) is not trimmed away.
  if (lang === "ja" && textOf) {
    const texts = rows.map((i) => katakanaKey(textOf(i)));
    const cover = (k: string) => texts.filter((t) => t.includes(k)).length;
    const own = cover(best.key);
    let trimmed: { r: Scored; c: number } | undefined;
    for (const r of ranked) {
      if (r.key === best.key || r.size < 2 || !best.key.includes(r.key)) continue;
      const c = cover(r.key);
      if (c <= own || c < 0.8 * n || own >= 0.8 * n) continue;
      if (!trimmed || c > trimmed.c || (c === trimmed.c && r.size > trimmed.r.size)) trimmed = { r, c };
    }
    if (trimmed) best = trimmed.r;
  }
  const related = (k: string) => [best.key, core.key].some((b) => contains(k, b, lang) || contains(b, k, lang));
  const rival = ranked.find((r) => !related(r.key));
  return { core, best, ambiguous: !!rival && rival.dice >= best.dice - 1e-9, ranked, surfaces };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

const slug = (s: string) =>
  s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const titleCase = (s: string) =>
  /[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * Draft a glossary from a script, deterministically: recurring source terms aligned to their most
 * consistent target rendering, plus characters guessed from speaker labels. Everything is a suggestion.
 */
export function draftGlossary(tables: Table[], existing?: Glossary, opts: DraftOptions = {}): GlossaryDraft {
  const minRows = Math.max(1, opts.minRows ?? 2);
  const maxTerms = opts.maxTerms ?? 100;
  const notes: string[] = [];
  const lowerWords = new Set<string>();
  const stop = new Set([...JA_COMMON, ...(opts.stopwords ?? []), ...(existing?.ignoreWords ?? [])].map(normKey));

  // Pass 1: n-grams per row (both sides), speaker labels.
  const recs: Rec[] = [];
  const labels = new Map<string, number>();
  for (const t of tables) {
    const bilingual = t.sourceLang !== t.targetLang;
    for (const row of t.rows) {
      const sp = row.speaker?.trim();
      if (sp && !SYSTEM_LABEL.test(sp)) labels.set(sp, (labels.get(sp) ?? 0) + 1);
      if (!bilingual || row.fuzzy || !row.source.trim() || !row.target.trim()) continue;
      const srcJa = t.sourceLang === "ja";
      const ja = visibleText(srcJa ? row.source : row.target);
      const en = visibleText(srcJa ? row.target : row.source);
      recs.push({ row, srcJa, ja, enG: enGrams(en, lowerWords), jaG: jaGrams(ja) });
    }
  }

  // Known names (existing glossary), as normalized keys.
  const known = new Set<string>();
  for (const term of existing?.terms ?? []) known.add(normKey(term.source));
  for (const c of existing?.characters ?? []) {
    for (const s of [c.ja, c.en, ...(c.aliases?.ja ?? []), ...(c.aliases?.en ?? [])]) known.add(normKey(s));
  }

  // Characters from speaker labels.
  const all = recs.map((_, i) => i);
  const nameGrams = (i: number) => [...recs[i]!.enG.values()].filter((g) => g.cap && g.mid && (g.key.includes(" ") || !lowerWords.has(g.key)));
  const jaAll = (i: number) => recs[i]!.jaG.values();
  let dfName: Map<string, number> | undefined;
  let dfJa: Map<string, number> | undefined;
  const chars = new Map<string, GlossaryCharacter>();
  const charKeys = new Set<string>();
  for (const [label, lines] of [...labels].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    if (lines < 2) continue;
    if (known.has(normKey(label))) continue;
    let ja: string | undefined;
    let en: string | undefined;
    if (looksJapanese(label)) {
      ja = label;
      dfName ??= docFreq(all, nameGrams);
      const rows = all.filter((i) => recs[i]!.ja.includes(label));
      const a = align(rows, nameGrams, dfName, "en");
      if (a.best && a.best.dice >= MIN_DICE && !a.ambiguous) en = display(a.surfaces.get(a.best.key), a.best.key);
    } else {
      en = titleCase(label);
      dfJa ??= docFreq(all, jaAll);
      const k = enKey(label);
      const rows = all.filter((i) => recs[i]!.enG.get(k)?.cap);
      const a = align(rows, jaAll, dfJa, "ja");
      if (a.best && a.best.dice >= MIN_DICE && !a.ambiguous) ja = display(a.surfaces.get(a.best.key), a.best.key);
    }
    if (!ja || !en) {
      notes.push(`Speaker "${label}" (${lines} lines): could not find its ${ja ? "English" : "Japanese"} name in the text; add the character by hand.`);
      continue;
    }
    if (known.has(normKey(ja)) || known.has(normKey(en))) continue;
    const id = slug(en) || slug(label) || `character-${chars.size + 1}`;
    charKeys.add(normKey(ja));
    charKeys.add(normKey(en));
    if (!chars.has(id)) chars.set(id, { id, ja, en });
  }

  // JA n-grams that mostly end mid-word (最近開 from 最近開いた) are never offered as targets.
  const fragment = new Set<string>();
  {
    const cut = new Map<string, number>();
    const tot = new Map<string, number>();
    for (const r of recs) {
      for (const g of r.jaG.values()) {
        tot.set(g.key, (tot.get(g.key) ?? 0) + 1);
        if (g.cut) cut.set(g.key, (cut.get(g.key) ?? 0) + 1);
      }
    }
    for (const [k, c] of cut) if (c * 2 > tot.get(k)!) fragment.add(k);
  }

  // Term candidates per direction.
  const entries: (DraftEntry & { key: string })[] = [];
  const knownList = [...known, ...charKeys];
  for (const srcJa of [true, false]) {
    const idx = all.filter((i) => recs[i]!.srcJa === srcJa);
    if (!idx.length) continue;
    const srcLang: Lang = srcJa ? "ja" : "en";
    const tgtLang: Lang = srcJa ? "en" : "ja";
    const srcOf = (i: number) => (srcJa ? recs[i]!.jaG : recs[i]!.enG);
    const tgtOf = (i: number) => (srcJa ? recs[i]!.enG.values() : [...recs[i]!.jaG.values()].filter((g) => !fragment.has(g.key)));

    const rowsByKey = new Map<string, number[]>();
    const surfaces = new Map<string, Map<string, number>>();
    for (const i of idx) {
      for (const g of srcOf(i).values()) {
        // English source: capitalized phrases only; a single word must never appear lowercase.
        if (!srcJa && (!g.cap || (!g.key.includes(" ") && lowerWords.has(g.key)))) continue;
        let rows = rowsByKey.get(g.key);
        if (!rows) rowsByKey.set(g.key, (rows = []));
        rows.push(i);
        tally(surfaces, g.key, g.surface);
      }
    }

    // Drop a candidate contained in a longer one that covers (nearly) all of its rows: 書庫 ⊂ 灰の書庫, Mana ⊂ Mana Stone,
    // "Modifiers" ⊂ "Block Modifiers" when 80%+ of the Modifiers rows say Block Modifiers.
    const cands = new Set([...rowsByKey].filter(([, rows]) => rows.length >= minRows).map(([k]) => k));
    const covered = new Set<string>();
    for (const long of cands) {
      const longRows = new Set(rowsByKey.get(long));
      for (const sub of subPhrases(long, srcLang)) {
        if (!cands.has(sub) || covered.has(sub)) continue;
        const rows = rowsByKey.get(sub)!;
        if (rows.filter((i) => longRows.has(i)).length >= 0.8 * rows.length) covered.add(sub);
      }
    }
    const kept = [...cands].filter((k) => !covered.has(k));

    const fresh = kept.filter((key) => !stop.has(key) && !knownList.some((k) => looksJapanese(k) === srcJa && contains(k, key, srcLang)));
    fresh.sort((a, b) => rowsByKey.get(b)!.length - rowsByKey.get(a)!.length || (a < b ? -1 : 1));

    // Align more candidates than we keep, so recurring everyday words can't crowd out real terms.
    let df: Map<string, number> | undefined;
    const jaText = (i: number) => katakanaKey(recs[i]!.ja);
    // Competitive linking (an IDF-like penalty): a target n-gram that co-occurs with many source terms
    // (ライン, 配布, 予測可能) belongs to the one it aligns with best. Another, unrelated candidate that explains
    // it clearly better "owns" it, and the weaker pairing is dropped (Xcode → ライン, Modify → チャンネル).
    const freshSet = new Set(fresh);
    let inv: Map<string, number[]> | undefined;
    const ownerMemo = new Map<string, Map<string, number>>();
    const owned = (t: string, src: string): boolean => {
      if (!inv) {
        inv = new Map();
        for (const i of idx) for (const g of tgtOf(i)) (inv.get(g.key) ?? inv.set(g.key, []).get(g.key)!).push(i);
      }
      let co = ownerMemo.get(t);
      if (!co) {
        co = new Map();
        for (const i of inv.get(t) ?? []) for (const k of srcOf(i).keys()) if (freshSet.has(k)) co.set(k, (co.get(k) ?? 0) + 1);
        ownerMemo.set(t, co);
      }
      const dft = inv.get(t)?.length ?? 0;
      const dice = (k: string) => (2 * (co.get(k) ?? 0)) / (rowsByKey.get(k)!.length + dft);
      const mine = dice(src);
      for (const k of co.keys()) {
        if (k === src || contains(k, src, srcLang) || contains(src, k, srcLang)) continue;
        if (dice(k) >= mine + 0.15) return true;
      }
      return false;
    };
    for (const key of fresh.slice(0, maxTerms * 3)) {
      df ??= docFreq(idx, tgtOf);
      const rows = rowsByKey.get(key)!;
      const n = rows.length;
      const source = display(surfaces.get(key), key);
      const grams = (i: number) => srcOf(i).get(key);

      // Kept as-is: a Latin term (brand, class name, key name) that most translations leave in English.
      if (!srcJa) {
        const kept = (i: number) => {
          const surface = grams(i)?.surface ?? source;
          // "AIs" is kept as "AI": an acronym plural loses its s in Japanese.
          return containsPhrase(recs[i]!.ja, surface, "en") || (/[A-Z]{2}s$/.test(surface) && containsPhrase(recs[i]!.ja, surface.slice(0, -1), "en", true));
        };
        const verbatim = rows.filter(kept).length;
        if (verbatim * 2 >= n && verbatim >= Math.min(2, minRows)) {
          entries.push({
            key, source, target: source, confidence: round2(verbatim / n), rows: n,
            renderings: { [source]: verbatim, ...(verbatim < n ? { [NOT_FOUND]: n - verbatim } : {}) },
            refs: rows.slice(0, 5).map((i) => ref(recs[i]!.row)),
          });
          continue;
        }
      }

      const a = align(rows, tgtOf, df, tgtLang, srcJa ? undefined : (i) => recs[i]!.ja);
      const best = a.best;
      const has = (i: number, k: string) => (tgtLang === "ja" ? jaText(i).includes(k) : (srcJa ? recs[i]!.enG : recs[i]!.jaG).has(k));
      const support = best ? rows.filter((i) => has(i, best.key)).length : 0;
      const cov = support / n;
      // A single kanji (剣, 祈り) is often part of ordinary words, so it needs a stronger, repeated link, on either side.
      const single = (k: string) => /^[一-鿿々〆][ぁ-ゖ]?$/.test(k);
      const short = (srcJa && single(key)) || (!!best && tgtLang === "ja" && single(best.key));
      // A single English word with a context-dependent sense (Modify, Expand, Start) needs a consistent rendering,
      // unless it is capitalized inside ordinary prose, the way UI labels and names are.
      const prose = rows.some((i) => grams(i)?.prose);
      const lone = !srcJa && !key.includes(" ") && !prose && (best?.dice ?? 0) < 0.8;
      // A capitalized adverb (Strangely, Occasionally) is a sentence opener, not a term.
      const adverb = !srcJa && !key.includes(" ") && !prose && /ly$/.test(key);
      const accepted =
        !!best && !a.ambiguous && !adverb && !owned(best.key, key) &&
        (short
          ? best.dice >= 0.8 && best.co >= Math.max(3, minRows)
          : best.dice > MIN_DICE && support >= Math.min(2, minRows) && cov >= (lone ? 0.7 : best.dice < 0.6 ? 0.6 : 0.5) && (best.dice >= 0.8 || support >= Math.min(3, minRows + 1)));
      const strong = a.ranked.filter((r) => r.dice >= MIN_DICE);
      const renderings: Record<string, number> = {};
      for (const i of rows) {
        const tg = srcJa ? recs[i]!.enG : recs[i]!.jaG;
        let k: string | undefined;
        if (accepted && has(i, best.key)) k = best.key;
        else if (tgtLang === "en" && a.core) {
          for (const g of tg.keys()) {
            if (contains(g, a.core.key, "en") && (!k || g.split(" ").length > k.split(" ").length)) k = g;
          }
        } else {
          k = strong.find((r) => tg.has(r.key))?.key;
        }
        const label = k ? display(a.surfaces.get(k), k) : NOT_FOUND;
        renderings[label] = (renderings[label] ?? 0) + 1;
      }
      const target = accepted ? display(a.surfaces.get(best.key), best.key) : undefined;
      entries.push({
        key, source, target, confidence: round2(best?.dice ?? 0), rows: n, renderings,
        refs: rows.slice(0, 5).map((i) => ref(recs[i]!.row)),
      });
    }
  }
  // Terms with a consistent rendering first; recurring words without one (often everyday words) last.
  entries.sort((a, b) => Number(!!b.target) - Number(!!a.target) || b.rows - a.rows || b.confidence - a.confidence || (a.source < b.source ? -1 : 1));
  const top = entries.slice(0, maxTerms);

  const terms: GlossaryTerm[] = [];
  for (const e of top) {
    const others = Object.entries(e.renderings)
      .filter(([r]) => r !== e.target)
      .sort((a, b) => b[1] - a[1]);
    const seen = others.map(([r, c]) => `"${r}" ×${c}`).join(", ");
    if (e.target) {
      terms.push({ source: e.source, target: e.target, note: `draft: ${e.rows} rows, confidence ${e.confidence}`, draft: true });
      const drift = others.filter(([r]) => r !== NOT_FOUND);
      if (drift.length) {
        notes.push(`${e.source} → "${e.target}" ×${e.renderings[e.target] ?? 0}, also ${seen}. Decide whether the others are allowed or forbidden.`);
      }
    } else if (others.some(([r]) => r !== NOT_FOUND)) {
      notes.push(`${e.source}: no clear rendering (${seen}). Pick one before adding it to the glossary.`);
    }
  }
  const unsure = top.filter((e) => !e.target).length;
  if (unsure) notes.push(`${unsure} recurring term${unsure > 1 ? "s have" : " has"} no confident rendering; see entries.`);
  if (terms.some((t) => looksJapanese(t.source)) && terms.some((t) => !looksJapanese(t.source))) {
    notes.push("The input mixes JA→EN and EN→JA tables, so the draft has terms in both directions; consider splitting it.");
  }

  return {
    glossary: { terms, characters: [...chars.values()] },
    entries: top.map(({ key: _key, ...e }) => e),
    notes,
  };
}

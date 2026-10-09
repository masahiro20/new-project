import type { Lang, Row, Side } from "./types.js";

const JA_CHAR = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g;

export function looksJapanese(s: string): boolean {
  const m = s.match(JA_CHAR);
  return !!m && m.length >= Math.max(1, s.replace(/\s/g, "").length * 0.2);
}

/** Guess which language a column holds from a sample of its values. */
export function detectLang(values: string[]): Lang {
  const sample = values.filter((v) => v.trim()).slice(0, 50);
  const ja = sample.filter(looksJapanese).length;
  return ja > sample.length / 2 ? "ja" : "en";
}

export function textOf(row: Row, side: Side): string {
  return side === "source" ? row.source : row.target;
}

export function ref(row: Row): string {
  return `${row.file}:${row.line}`;
}

/** Typographic apostrophes and look-alikes (’ ‘ ʼ ′) → ASCII '. Shared by every check that compares English text or names. */
export function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019\u02bc\u2032]/g, "'");
}

/**
 * Placeholder syntaxes: {0} {name}, printf (%s %5d %.2f %1$s %c %ld), ${var}, Wesnoth $var / $var|, [PLAYER],
 * Ren'Py [player_name] / [player.name] and Ren'Py interpolation with a conversion flag or format spec
 * ([name!t], [name!u], [score:.2f]; the flags are part of the token, so they must match). A lowercase bracket token
 * without flags only counts when it looks like a variable (has `_`, `.` or a digit), so display labels such as
 * [none] / [empty] are not placeholders; see BRACKET_WORD for bare [word]s.
 * The printf branch has no space flag: "40% defense" is text, not `% d`.
 * Match it on `placeholderText(s)`, not the raw string, so Ren'Py escapes and text tags are out of the way.
 */
export const PLACEHOLDER =
  /\{[A-Za-z0-9_.$:]*\}|%(?:\d+\$)?[-+0#]*\d*(?:\.\d+)?(?:hh?|ll?|z|j|t)?[sdifxXuc@]|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\|?|\[[A-Z][A-Z0-9_]+\]|\[(?=[a-z0-9_.]*[_.0-9])[a-z_][a-z0-9_.]*\]|\[[A-Za-z_][A-Za-z0-9_.]*(?:![rsatuilcq]+(?::[-<>^=+#0-9,_.]*[A-Za-z%]?)?|:[-<>^=+#0-9,_.]*[A-Za-z%]?)\]/g;

/** A bare lowercase bracket word ([name], [none]): a Ren'Py variable or a display label. rules.ts decides which. */
export const BRACKET_WORD = /\[[a-z][a-z]*\]/g;

/**
 * Ren'Py text tag names (https://www.renpy.org/doc/html/text.html#text-tags). In braces, `{/name}` and
 * `{name=value}` with one of these names are always tags (placeholders never contain `/` or `=`); a bare `{name}`
 * is a tag only in Ren'Py text (see `isRenpyText`), elsewhere `{b}` / `{i}` stay placeholders like `{0}` / `{name}`.
 */
export const RENPY_TAG_NAMES = new Set([
  "b", "i", "u", "s", "plain", "a", "alpha", "alt", "art", "color", "cps", "font", "image", "k", "outlinecolor", "rb", "rt",
  "size", "space", "vspace", "w", "p", "nw", "fast", "done", "clear", "shader",
]);
/** Ren'Py pacing / display-control tags: not compared between source and translation. */
export const RENPY_PACING_TAGS = new Set(["w", "p", "nw", "fast", "done", "clear"]);
/** A Ren'Py text tag candidate: [1] "/" for a closer, [2] name, [3] "=value". Check the name against RENPY_TAG_NAMES. */
export const RENPY_TAG = /\{(\/?)([a-z]+)(=[^{}]*)?\}/g;
const RENPY_NAMES_SRC = [...RENPY_TAG_NAMES].join("|");
/** Markup only Ren'Py writes: a `{/name}` closer or a `{name=value}` tag with a Ren'Py tag name. */
const RENPY_UNAMBIGUOUS = new RegExp(`\\{(?:/(?:${RENPY_NAMES_SRC})|(?:${RENPY_NAMES_SRC})=[^{}]*)\\}`);

/** Does `s` read as Ren'Py text? True for a Ren'Py table, or when the text has a `{/b}` closer or a `{color=…}` tag. */
export function isRenpyText(s: string, format?: string): boolean {
  return format === "renpy" || RENPY_UNAMBIGUOUS.test(s);
}

// Private-use stand-ins for escaped brackets, restored to one bracket where text is shown or measured.
const LBRACE = "\uE000";
const LBRACKET = "\uE001";

/**
 * Hide Ren'Py escapes: `[[` is a literal `[` and `{{` a literal `{`, except `{{name}}` (an i18next / Mustache
 * placeholder, kept as is). Also drops `{#disambiguator}` comments, which are neither shown nor placeholders.
 */
export function hideRenpyEscapes(s: string): string {
  return s
    .replace(/\[\[/g, LBRACKET)
    .replace(/\{\{(?![A-Za-z0-9_.$:]*\}\})/g, LBRACE)
    .replace(/\{#[^{}]*\}/g, "");
}

/**
 * `s` prepared for placeholder matching: escapes and `{#…}` hidden, Ren'Py text tags removed (closers and
 * `{name=value}` always, bare `{b}` / `{w}` only when `renpy`). Match PLACEHOLDER / BRACKET_WORD on the result.
 */
export function placeholderText(s: string, renpy = false): string {
  return hideRenpyEscapes(s).replace(RENPY_TAG, (m, close: string, name: string, value?: string) =>
    RENPY_TAG_NAMES.has(name) && (renpy || close || value) ? "" : m);
}

const visibleCache = new Map<string, string>();

/** Remove markup (HTML / Ren'Py tags, ruby, placeholders, `{#…}`; `{{` / `[[` become one bracket) so text checks and length counts see only visible text. Memoized. */
export function visibleText(s: string): string {
  const hit = visibleCache.get(s);
  if (hit !== undefined) return hit;
  const v = stripMarkup(s);
  if (visibleCache.size > 200_000) visibleCache.clear();
  visibleCache.set(s, v);
  return v;
}

function stripMarkup(s: string): string {
  return hideRenpyEscapes(normalizeApostrophes(s))
    .replace(/<rt>.*?<\/rt>/g, "")
    .replace(/\{rt\}.*?\{\/rt\}/g, "")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(RENPY_TAG, (m, _c: string, name: string) => (RENPY_TAG_NAMES.has(name) ? "" : m))
    .replace(/\{([^{}|]+)\|[^{}]+\}/g, "$1")
    .replace(/[|｜]([^《|｜]+)《[^》]+》/g, "$1")
    .replace(PLACEHOLDER, "")
    .replace(/\uE000/g, "{")
    .replace(/\uE001/g, "[");
}

/**
 * Key used to group katakana spellings that differ only in notation:
 * middle dots, long-vowel marks, ヴ-row vs バ-row, small vs. large vowels after a consonant,
 * イ vs ー after an e-row kana (プレイヤー / プレーヤー, フェイズ / フェーズ) and a word-final ウ vs ー after an
 * o-row kana (ウィンドウ / ウィンドー). The ウ fold is final-only so ボウル (bowl) and ボール (ball) stay apart.
 */
export function katakanaKey(s: string): string {
  return s
    .replace(/[・＝=ー\-‐]/g, "")
    .replace(/ヴァ/g, "バ")
    .replace(/ヴィ/g, "ビ")
    .replace(/ヴェ/g, "ベ")
    .replace(/ヴォ/g, "ボ")
    .replace(/ヴ/g, "ブ")
    // Folds run before small kana are enlarged, so ティ / ドゥ (アンドゥ ≠ アンド) are never folded.
    .replace(/([エケセテネヘメレゲゼデベペェ])イ/g, "$1")
    .replace(/([オコソトノホモヨロゴゾドボポョォ])ウ$/, "$1")
    .replace(/[ァィゥェォ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1));
}

/**
 * Interjections and sound effects (アアァ, ハハハ, グオオオォ, ドーーン, ギャッ): their spelling varies on purpose,
 * so notation drift skips them. A run counts when it has the same kana three times in a row (small kana folded),
 * a doubled long-vowel mark, or ends in ッ.
 */
export function isInterjection(s: string): boolean {
  const big = s.replace(/[ァィゥェォ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1));
  return /([ァ-ヶ])\1\1/.test(big) || /ーー/.test(s) || /ッ$/.test(s);
}

export const KATAKANA_RUN = /[ァ-ヴー・＝]{3,}/g;

export function damerauLevenshtein(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d.push([i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const phraseCache = new Map<string, RegExp>();

/** Drop memoized script text and glossary regexes (the server calls this after every request). */
export function clearTextCaches(): void {
  visibleCache.clear();
  phraseCache.clear();
}

/** Fold a plural last word to its singular so a term stored as "Egg Hunts" also matches "Egg hunt". */
export function singularOf(phrase: string): string {
  return phrase.replace(/([A-Za-z]+)$/, (w) =>
    /^[A-Z]{2,}s$/.test(w) ? w.slice(0, -1) // AIs, NPCs
      : w.length > 4 && /ies$/i.test(w) ? `${w.slice(0, -3)}y`
      : w.length > 4 && /(x|ch|sh|ss)es$/i.test(w) ? w.slice(0, -2)
        : w.length > 3 && /[^s]s$/i.test(w) && !/(us|is)$/i.test(w) ? w.slice(0, -1) : w);
}

/**
 * Inflected forms of the last word of a glossary rendering, for matching it in an English translation:
 * plural either way (notes ⇔ Note), -s/-es, -ed/-d, -ing (with e-drop: Renote → Renoting; with a doubled final
 * consonant: ban → banned), y → ies/ied/ying, and -ion/-ions only when the word ends in -ct/-te
 * (react → reaction, delete → deletion). A word ending in -ction/-ation is reduced to its verb first, so a term stored
 * as "reaction" also matches "reacted" and "federation" matches "federating". Deliberately no -er/-ers
 * (react → reacter is rare; "Stone" → "Stoner" is not the same word). Returns a regex source fragment.
 */
function inflectedWord(word: string): string {
  const w = singularOf(word);
  if (!/^[A-Za-z]{3,}$/.test(w) || /^[A-Z]+$/.test(w)) return `${escapeRegExp(w)}(?:e?s)?`;
  let stem = w;
  let tail = "";
  if (/[ca]tion$/i.test(w) && w.length >= 8) {
    // reaction → react, federation → federat(e); a short stem (station → stat) is left alone.
    stem = w.slice(0, -3);
    tail = /ct$/i.test(stem) ? "(?:s|ed|ing|ions?)?" : "(?:e|es|ed|ing|ions?)?";
    return `${escapeRegExp(stem)}${tail}`;
  }
  if (/[^aeiou]y$/i.test(w)) return `${escapeRegExp(w.slice(0, -1))}(?:y|ies|ied|ying)`;
  if (/e$/i.test(w)) {
    stem = w.slice(0, -1);
    const ion = /te$/i.test(w) ? "|ions?" : "";
    return `${escapeRegExp(stem)}(?:e|es|ed|ing${ion})`;
  }
  const ion = /ct$/i.test(w) ? "|ions?" : "";
  // Short CVC words double their final consonant (ban → banned, stop → stopping).
  const dbl = /^[^aeiou]*[aeiou][bdgklmnprt]$/i.test(w) ? `${escapeRegExp(w.slice(-1))}?` : "";
  return `${escapeRegExp(w)}(?:e?s|${dbl}ed|${dbl}ing${ion})?`;
}

/**
 * English phrase matcher: whole words, any whitespace (incl. line breaks / NBSP) between words,
 * tolerant of plurals (-s/-es, -y→-ies, -f/-fe→-ves) and possessive 's. Terms match case-insensitively;
 * character names are case-sensitive so "Will" does not match "will". Compiled regexes are cached.
 * With `inflect` (the translation side of a term check), the last word also matches its inflected forms
 * (see inflectedWord).
 */
export function enPhraseRegex(phrase: string, caseSensitive = false, inflect = false): RegExp {
  const key = `${caseSensitive ? 1 : 0}${inflect ? 1 : 0}\u0000${phrase}`;
  let re = phraseCache.get(key);
  if (!re) {
    // Apostrophes match in any typographic form (Li'sar = Li’sar).
    const raw = normalizeApostrophes(phrase).trim().split(/\s+/);
    const words = raw.map((w) => escapeRegExp(w).replace(/'/g, "['\u2018\u2019\u02bc]"));
    const last = words.pop()!;
    const lastRaw = raw[raw.length - 1]!;
    const tail = inflect && /^[A-Za-z]+$/.test(lastRaw)
      ? inflectedWord(lastRaw)
      : /y$/i.test(last) && !/[aeiou]y$/i.test(last)
        ? `${last.slice(0, -1)}(?:y|ies)`
        : /fe?$/i.test(last)
          ? `${last.replace(/fe?$/i, "")}(?:fe?s?|ves)`
          : `${last}(?:e?s)?`;
    re = new RegExp(`(?<![A-Za-z])${[...words, tail].join("[\\s\\u00a0]+")}(?:['\u2018\u2019\u02bc]s)?(?![A-Za-z])`, caseSensitive ? "" : "i");
    phraseCache.set(key, re);
  }
  return re;
}

/**
 * Does `text` contain `phrase`? English: whole words via enPhraseRegex; with `loose`, the last word may also be
 * inflected (Renote ⇔ Renoted, notes ⇔ Note). Japanese: a substring, or with `loose`, the same words with
 * grammar around them (see jaLooseRegex). Apostrophes are compared in ASCII form.
 */
export function containsPhrase(text: string, phrase: string, lang: Lang, caseSensitive = false, loose = false): boolean {
  if (!phrase) return false;
  if (lang !== "ja") return enPhraseRegex(phrase, caseSensitive, loose).test(text);
  const t = normalizeApostrophes(text);
  const p = normalizeApostrophes(phrase);
  return t.includes(p) || (loose && jaLooseRegex(p).test(t));
}

const JA_INFLECTION = /(?:中|する|します|しています|している|しました|した|して|される|されます|された)$/;
const jaClass = (c: string) => (/[一-鿿々〆]/.test(c) ? "K" : /[ァ-ヴー]/.test(c) ? "A" : /[ぁ-ゖ]/.test(c) ? "H" : "O");

/**
 * Loose Japanese matcher for glossary renderings, deliberately conservative:
 * - a trailing 中 / する-form is optional (準備中 matches 準備しています and の準備);
 * - one particle may sit between two words of a compound (選択解除 ⇔ 選択を解除, ジョイスティックボタン ⇔
 *   ジョイスティックのボタン); a word is a kanji run of ≥ 2, a katakana run of ≥ 2, or a script change;
 * - okurigana may be present or absent (取消 ⇔ 取り消し), and a particle written in the term may be dropped
 *   (名前を変更 ⇔ 名前変更).
 */
export function jaLooseRegex(phrase: string): RegExp {
  const key = `ja\u0000${phrase}`;
  let re = phraseCache.get(key);
  if (re) return re;
  let p = phrase;
  const stem = p.replace(JA_INFLECTION, "");
  if (stem !== p && stem.length >= 2 && /[一-鿿々〆ァ-ヴー]$/.test(stem)) p = stem;
  const ch = [...p];
  const cls = ch.map(jaClass);
  // Length of the same-class run ending at i (left) and starting at i (right).
  const left = cls.map(() => 0);
  const right = cls.map(() => 0);
  cls.forEach((c, i) => (left[i] = i > 0 && cls[i - 1] === c ? left[i - 1]! + 1 : 1));
  for (let i = cls.length - 1; i >= 0; i--) right[i] = i < cls.length - 1 && cls[i + 1] === cls[i] ? right[i + 1]! + 1 : 1;
  const OKURI = "[りきしちみびいえけげせてねべめれっ]";
  let out = "";
  for (let i = 0; i < ch.length; i++) {
    const c = cls[i]!;
    const prev = cls[i - 1];
    const next = cls[i + 1];
    let piece = escapeRegExp(ch[i]!);
    // A single hiragana between kanji (okurigana り in 取り消し, particle を in 名前を変更) may be absent,
    // as may trailing okurigana after a kanji (取り消し → 取り消).
    if (c === "H" && prev === "K" && (next === "K" || (next === undefined && ch.length >= 3))) piece += "?";
    out += piece;
    if (next === undefined) break;
    if (c === "K" && next === "K") {
      if (left[i]! >= 2 && right[i + 1]! >= 2) out += "[のをがにでとへ]?";
      else out += `${OKURI}?`;
    } else if ((c === "K" && next === "A") || (c === "A" && next === "K")) {
      out += "[のをがにで]?";
    } else if (c === "A" && next === "A" && left[i]! >= 2 && right[i + 1]! >= 2) {
      out += "の?";
    }
  }
  re = new RegExp(out);
  phraseCache.set(key, re);
  return re;
}

export function countBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Character width for length limits: East Asian wide/fullwidth characters count as 2 when requested. */
export function displayLength(s: string, wideAsTwo: boolean): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x20000;
    n += wide && wideAsTwo ? 2 : 1;
  }
  return n;
}

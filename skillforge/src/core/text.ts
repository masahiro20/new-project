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

/** Placeholder syntaxes: {0} {name}, printf (%s %5d %.2f %1$s), ${var}, [PLAYER], Ren'Py [player_name]. */
export const PLACEHOLDER = /\{[A-Za-z0-9_.$:]*\}|%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?[sdifxXu@]|\$\{[^}]+\}|\[[A-Z][A-Z0-9_]+\]|\[[a-z_][a-z0-9_.]*\]/g;

const visibleCache = new Map<string, string>();

/** Remove markup (tags, ruby, placeholders) so text checks and length counts see only visible text. Memoized. */
export function visibleText(s: string): string {
  const hit = visibleCache.get(s);
  if (hit !== undefined) return hit;
  const v = stripMarkup(s);
  if (visibleCache.size > 200_000) visibleCache.clear();
  visibleCache.set(s, v);
  return v;
}

function stripMarkup(s: string): string {
  return s
    .replace(/<rt>.*?<\/rt>/g, "")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/\{([^{}|]+)\|[^{}]+\}/g, "$1")
    .replace(/[|｜]([^《|｜]+)《[^》]+》/g, "$1")
    .replace(PLACEHOLDER, "");
}

/**
 * Key used to group katakana spellings that differ only in notation:
 * middle dots, long-vowel marks, ヴ-row vs バ-row, small vs. large vowels after a consonant.
 */
export function katakanaKey(s: string): string {
  return s
    .replace(/[・＝=ー\-‐]/g, "")
    .replace(/ヴァ/g, "バ")
    .replace(/ヴィ/g, "ビ")
    .replace(/ヴェ/g, "ベ")
    .replace(/ヴォ/g, "ボ")
    .replace(/ヴ/g, "ブ")
    .replace(/[ァィゥェォ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 1));
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

/**
 * English phrase matcher: whole words, any whitespace (incl. line breaks / NBSP) between words,
 * tolerant of plurals (-s/-es, -y→-ies, -f/-fe→-ves) and possessive 's. Terms match case-insensitively;
 * character names are case-sensitive so "Will" does not match "will". Compiled regexes are cached.
 */
export function enPhraseRegex(phrase: string, caseSensitive = false): RegExp {
  const key = `${caseSensitive ? 1 : 0}\u0000${phrase}`;
  let re = phraseCache.get(key);
  if (!re) {
    const words = phrase.trim().split(/\s+/).map(escapeRegExp);
    const last = words.pop()!;
    const tail = /y$/i.test(last) && !/[aeiou]y$/i.test(last)
      ? `${last.slice(0, -1)}(?:y|ies)`
      : /fe?$/i.test(last)
        ? `${last.replace(/fe?$/i, "")}(?:fe?s?|ves)`
        : `${last}(?:e?s)?`;
    re = new RegExp(`(?<![A-Za-z])${[...words, tail].join("[\\s\\u00a0]+")}(?:['’]s)?(?![A-Za-z])`, caseSensitive ? "" : "i");
    phraseCache.set(key, re);
  }
  return re;
}

export function containsPhrase(text: string, phrase: string, lang: Lang, caseSensitive = false): boolean {
  if (!phrase) return false;
  return lang === "ja" ? text.includes(phrase) : enPhraseRegex(phrase, caseSensitive).test(text);
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

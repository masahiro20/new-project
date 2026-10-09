import { BRACKET_WORD, displayLength, nothingToTranslate, isRenpyText, KAG_STYLE_TAG, PLACEHOLDER, placeholderText, RENPY_PACING_TAGS, RENPY_TAG, RENPY_TAG_NAMES, hideRenpyEscapes, visibleText } from "../text.js";
import { messages, type RubyProblem } from "../i18n.js";
import type { Finding, Locale, Row, Side, Table } from "../types.js";

// Bonus rule checks. Xbench/Verifika already cover this ground, so they are kept simple.

/** A tag: name, then attributes (name=value) or a TMP-style `=value`, optionally self-closing. `<none available>` is text. */
const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>"']+))*|=[^<>]*)\s*(\/?)>/g;
/** Markup names recognised without attributes or a closing tag (HTML, Unity TextMeshPro, XLIFF inline). */
const KNOWN_TAGS = new Set([
  "a", "b", "i", "u", "s", "em", "strong", "br", "p", "div", "span", "font", "color", "size", "sup", "sub", "small", "big", "mark",
  "code", "pre", "li", "ul", "ol", "hr", "img", "h1", "h2", "h3", "h4", "h5", "h6", "q", "tt", "strike", "del", "ins", "blockquote",
  "ruby", "rt", "rp", "rb", "sprite", "link", "style", "material", "quad", "align", "alpha", "cspace", "indent", "line-height",
  "line-indent", "lowercase", "uppercase", "smallcaps", "margin", "mspace", "nobr", "noparse", "pos", "rotate", "space", "voffset",
  "width", "gradient", "page", "x", "g", "ph", "bpt", "ept", "it", "bx", "ex", "sc", "italic", "bold",
]);
/**
 * TextMeshPro tags that only exist with a value (`<space=1em>`, `<voffset=2px>`, `<size=120%>`). Written bare and never
 * closed (`<space>`, Element's key label), the word is display text like `<unknown>`, not markup.
 */
const VALUE_TAGS = new Set(["space", "voffset", "pos", "indent", "cspace", "mspace", "alpha", "margin", "line-height", "line-indent", "rotate", "gradient", "width", "size", "color", "sprite", "material"]);
/** Emphasis that Japanese typography usually drops; losing it is a warning, not a broken string. */
const EMPHASIS_TAGS = new Set(["i", "b", "em", "strong", "u", "italic", "bold", "plain"]);
const RUBY_TAGS = new Set(["ruby", "rt", "rp", "rb"]);
/** Tags that never take a closing tag (HTML, Unity TextMeshPro). */
const VOID_TAGS = new Set(["br", "sprite", "img", "hr", "space", "page", "pos", "voffset", "x", "ph", "bpt", "ept", "it"]);
/** Ren'Py tags that never take a closing tag (pacing tags are skipped before this is consulted). */
const RENPY_VOID_TAGS = new Set(["image", "space", "vspace"]);
const RUBY_BRACE = /\{([^{}|]+)\|([^{}]+)\}/g;
/** Ren'Py ruby: {rb}base{/rb}{rt}reading{/rt}; the {rb} part is optional (then the base is the text before). */
const RUBY_RENPY = /(?:\{rb\}(.*?)\{\/rb\})?\s*\{rt\}(.*?)\{\/rt\}/g;
const RUBY_AOZORA = /[|｜]([^《|｜]+)《([^》]+)》/g;
const KANA_ONLY = /^[ぁ-ゖァ-ヺー・\s]+$/;

const multiset = (xs: string[]) => {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return m;
};

function diff(a: string[], b: string[]): { missing: string[]; extra: string[] } {
  const ma = multiset(a);
  const mb = multiset(b);
  const missing = [...ma].flatMap(([k, n]) => Array<string>(Math.max(0, n - (mb.get(k) ?? 0))).fill(k));
  const extra = [...mb].flatMap(([k, n]) => Array<string>(Math.max(0, n - (ma.get(k) ?? 0))).fill(k));
  return { missing, extra };
}

const base = (row: Row, side: Side) => ({ file: row.file, line: row.line, id: row.id, side });

/**
 * Tags in `s`. A bare `<word>` that is not a known tag and is never closed in `pair` (source + target) is display
 * text such as `<unknown>` / `<不明>`, not markup.
 */
function tags(s: string, pair: string, renpy: boolean, kag = false): { list: string[]; unbalanced: string[] } {
  const list: string[] = [];
  // KAG / TyranoScript styling tags in .ks text ([font …], [resetfont], [graph …]): compared by name only. [font] is
  // reset by [resetfont] or by any [cm]/[er], so they are not checked for balance.
  if (kag) for (const m of hideRenpyEscapes(s).matchAll(KAG_STYLE_TAG)) list.push(`[${m[1]}]`);
  const stack: string[] = [];
  const unbalanced: string[] = [];
  for (const m of s.matchAll(TAG)) {
    const [, close, name, attrs, self] = m;
    if (RUBY_TAGS.has(name!.toLowerCase())) continue;
    const lower = name!.toLowerCase();
    if (!close && !self && !attrs && (!KNOWN_TAGS.has(lower) || VALUE_TAGS.has(lower)) && !pair.includes(`</${name}>`)) continue;
    list.push(close ? `</${name}>` : self ? `<${name}/>` : `<${name}>`);
    if (self || VOID_TAGS.has(name!.toLowerCase())) continue;
    if (!close) stack.push(name!);
    else if (stack[stack.length - 1] === name) stack.pop();
    else unbalanced.push(`</${name}>`);
  }
  // Ren'Py text tags ({b}…{/b}, {color=#f00}…{/color}), compared by name like HTML. Pacing tags ({w}, {p}, {nw},
  // {fast}) are the translator's to place, and Ren'Py ruby ({rb}/{rt}) is handled by the ruby checks.
  const rstack: string[] = [];
  for (const [, close, name, value] of hideRenpyEscapes(s).matchAll(RENPY_TAG)) {
    if (!RENPY_TAG_NAMES.has(name!) || !(renpy || close || value)) continue;
    if (RENPY_PACING_TAGS.has(name!) || name === "rb" || name === "rt") continue;
    list.push(close ? `{/${name}}` : `{${name}}`);
    if (RENPY_VOID_TAGS.has(name!)) continue;
    if (!close) rstack.push(name!);
    else if (rstack[rstack.length - 1] === name) rstack.pop();
    else unbalanced.push(`{/${name}}`);
  }
  unbalanced.push(...rstack.map((n) => `{${n}}`));
  return { list, unbalanced: [...unbalanced, ...stack.map((n) => `<${n}>`)] };
}

/** Bracketed text with non-ASCII inside: a translated label such as [なし] or a menu path [エクスポート], or one in full-width brackets (［番号］). */
const TRANSLATED_BRACKET = /\[[^[\]\n]*[^\x00-\x7f][^[\]\n]*\]|［[^［］\n]+］/g;

/** A printf conversion: [1] argument number of `%2$s` (absent for `%s`), [2] flags, width, precision and type. */
const PRINTF = /^%(?:(\d+)\$)?([-+0#]*\d*(?:\.\d+)?(?:hh?|ll?|z|j|t)?[sdifxXuc@])$/;

/**
 * printf arguments by position: `%s %d` and `%2$d %1$s` both give {1: s, 2: d} (gettext c-format lets a translation
 * reorder arguments with `%n$`, and use one more than once). Undefined when one position gets two conversions.
 */
function printfArgs(tokens: string[]): Map<number, string> | undefined {
  const args = new Map<number, string>();
  let next = 1;
  for (const tok of tokens) {
    const m = PRINTF.exec(tok);
    if (!m) continue;
    const pos = m[1] ? Number(m[1]) : next++;
    if (args.has(pos) && args.get(pos) !== m[2]) return undefined;
    args.set(pos, m[2]!);
  }
  return args;
}

const sameArgs = (a: Map<number, string>, b: Map<number, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/** A placeholder that names its value (`{name}`, `%{count}`, `$var`, `[NAME]`, `%1$s`): repeating it or using it once less changes no argument. */
const isNamed = (p: string) => !/^%[-+0#]*\d*(?:\.\d+)?(?:hh?|ll?|z|j|t)?[sdifxXuc@]$/.test(p);

/**
 * Placeholder differences. printf conversions are compared by argument position (see printfArgs), so a reordered
 * `%2$s %1$s` matches `%s %s`. A named placeholder that both sides use, only a different number of times, is not a
 * mismatch: it is returned in `fewer` / `more` (info). A bare lowercase [word] in the source may be a display label: it
 * is not reported missing when the target has a translated bracket label in its place ([none] → [なし]), and a [word]
 * the target adds is not reported when the source has the word unbracketed (a translator-written menu path). In
 * Ren'Py text (`renpy`), bare text tags such as {b} / {w} are tags, not placeholders (see placeholderText).
 */
function placeholderDiff(rawSource: string, rawTarget: string, renpy: boolean): { missing: string[]; extra: string[]; fewer: string[]; more: string[] } {
  const source = placeholderText(rawSource, renpy);
  const target = placeholderText(rawTarget, renpy);
  let sTok = [...(source.match(PLACEHOLDER) ?? []), ...(source.match(BRACKET_WORD) ?? [])];
  let tTok = [...(target.match(PLACEHOLDER) ?? []), ...(target.match(BRACKET_WORD) ?? [])];
  const numbered = (xs: string[]) => xs.some((x) => PRINTF.exec(x)?.[1]);
  if (numbered(sTok) || numbered(tTok)) {
    const sa = printfArgs(sTok);
    const ta = printfArgs(tTok);
    if (sa && ta && sameArgs(sa, ta)) {
      sTok = sTok.filter((x) => !PRINTF.test(x));
      tTok = tTok.filter((x) => !PRINTF.test(x));
    }
  }
  const d = diff(sTok, tTok);
  const fewer = d.missing.filter((p) => isNamed(p) && tTok.includes(p));
  const more = d.extra.filter((p) => isNamed(p) && sTok.includes(p));
  let labels = (target.match(TRANSLATED_BRACKET) ?? []).length - (source.match(TRANSLATED_BRACKET) ?? []).length;
  const isWord = (p: string) => /^\[[a-z]+\]$/.test(p);
  return {
    missing: d.missing.filter((p) => !fewer.includes(p)).filter((p) => !(isWord(p) && labels-- > 0)),
    extra: d.extra.filter((p) => !more.includes(p)).filter((p) => !(isWord(p) && new RegExp(`(?<![A-Za-z])${p.slice(1, -1)}(?![A-Za-z])`, "i").test(source.replace(PLACEHOLDER, " ")))),
    fewer,
    more,
  };
}

/** ASCII words that a Japanese translation keeps in Latin script elsewhere (product names, file formats). */
function keptLatinWords(t: Table): Set<string> {
  const kept = new Set<string>();
  for (const row of t.rows) {
    if (!/[぀-ヿ㐀-鿿]/.test(row.target) || row.target.trim() === row.source.trim()) continue;
    for (const m of visibleText(row.target).matchAll(/[A-Za-z][A-Za-z0-9]+/g)) kept.add(m[0]);
  }
  return kept;
}

/**
 * Source text copied into a Japanese target that reads as English prose, not a name, label or code: it needs an
 * all-lowercase word of 3+ letters or two shorter ones ("Save as", "Read only"), so names ("Kalenz", "Jolt Physics") and single capitalised
 * labels are never reported. Skips code-like tokens (no spaces, with symbols / digits / camelCase), URLs and strings
 * whose every word the translation keeps in Latin script elsewhere.
 */
function looksUntranslatedCopy(source: string, kept: Set<string>): boolean {
  const v = visibleText(source).trim();
  const words = v.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? [];
  const lower = words.filter((w) => /^[a-z]{2,}$/.test(w));
  if (!lower.some((w) => w.length >= 3) && lower.length < 2) return false;
  if (/https?:\/\/|www\.|@\w+\./.test(v)) return false;
  if (!/\s/.test(v) && (/[_./:;\\#$%{}()<>=|@\d]/.test(v) || /[a-z][A-Z]/.test(v))) return false;
  // Command or option syntax inside the text: an identifier joined by : _ = or \ (unixsocket:path, log_level=debug).
  if (/[A-Za-z0-9][:_=\\][A-Za-z0-9]/.test(v)) return false;
  if ((v.match(/[A-Za-z'\s-]/g) ?? []).length < v.length * 0.75) return false;
  return !words.every((w) => kept.has(w) || /^[A-Z0-9]+$/.test(w));
}

const JA_LETTER = /[ぁ-ゖァ-ヺ㐀-鿿ｦ-ﾟ]/g;

/** An English translation that is Japanese text: more kana/kanji than Latin letters (女子……？, バックログ). */
function mostlyJapanese(target: string): boolean {
  const v = visibleText(target);
  const ja = (v.match(JA_LETTER) ?? []).length;
  return ja > 0 && ja > (v.match(/[A-Za-z]/g) ?? []).length;
}

/** Character-bigram Dice similarity (0..1) of two strings, whitespace and punctuation ignored. */
function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let common = 0;
  let total = 0;
  for (const [k, n] of ga) { common += Math.min(n, gb.get(k) ?? 0); total += n; }
  for (const n of gb.values()) total += n;
  return total ? (2 * common) / total : a === b ? 1 : 0;
}

/**
 * The row's translation repeats the previous row's although the sources differ substantially (bigram similarity
 * < 0.5): a paste into the wrong row. Short strings are skipped (≤ 3 English words, < 8 Japanese letters), so stock
 * lines such as "Yes." / "OK" / "……" / "Bong..." never count; so are rows whose sources are the same or empty.
 */
function isNeighbourCopy(prev: Row, row: Row, targetLang: Table["targetLang"]): boolean {
  const a = visibleText(row.target).trim();
  if (!a || a !== visibleText(prev.target).trim()) return false;
  const long = targetLang === "ja"
    ? (a.match(JA_LETTER) ?? []).length + (a.match(/[A-Za-z]+/g) ?? []).length >= 8
    : (a.match(/[A-Za-z0-9]+(?:['’-][A-Za-z]+)*/g) ?? []).length > 3;
  if (!long) return false;
  const sa = visibleText(row.source).trim();
  const sb = visibleText(prev.source).trim();
  return !!sa && !!sb && sa !== sb && similarity(sa, sb) < 0.5;
}

/** Ruby problems the tag counts below cannot see, for every syntax ({base|reading}, ｜base《reading》, <ruby>, Ren'Py {rb}{rt}). */
export function rubyProblems(ja: string): [RubyProblem, string][] {
  const out: [RubyProblem, string][] = [];
  const s = hideRenpyEscapes(ja);
  // {base|reading}: a brace with a separator inside that is never closed, a full-width bar, or an empty side.
  for (const m of s.matchAll(/\{([^{}|｜\n]*)([|｜])([^{}\n]*?)(\}|(?=\{)|$)/g)) {
    const [whole, baseText, bar, reading, close] = m;
    if (!close) out.push(["unclosed", whole!.slice(0, 20)]);
    else if (bar === "｜") out.push(["fullwidth-bar", whole!]);
    else if (!reading!.trim()) out.push(["empty-reading", whole!]);
    else if (!baseText!.trim()) out.push(["empty-base", whole!]);
  }
  // ｜base《reading》 (Aozora / Narou): 《 never closed, empty 《》, a separator with no base, or a ｜ before a word with no
  // 《reading》 after it. A 《 without ｜ is legal (漢字《かんじ》); an ASCII | is too common in other text to judge.
  const opens = (s.match(/《/g) ?? []).length;
  const aozoraUnclosed = opens !== (s.match(/》/g) ?? []).length;
  if (aozoraUnclosed) out.push(["unclosed", /《[^》]{0,10}/.exec(s)?.[0] ?? "》"]);
  for (const m of s.matchAll(/《\s*》/g)) out.push(["empty-reading", m[0]]);
  for (const m of s.matchAll(/[|｜]《[^》]*》/g)) out.push(["empty-base", m[0]]);
  // A ｜ only reads as a ruby separator on a line that uses 《》 (elsewhere it can be a UI divider); Narou also allows
  // ｜base（reading）, and a ｜ inside braces is the {base|reading} check's business.
  if (/[《》]/.test(s) && !aozoraUnclosed) {
    for (const m of s.matchAll(/｜[一-鿿々〆ぁ-ゖァ-ヺー]+/g)) {
      const next = s.charAt(m.index! + m[0].length);
      if (!"《（(}".includes(next) || next === "") out.push(["stray-separator", m[0]]);
    }
  }
  // <ruby>…<rt></rt> and Ren'Py {rt}{/rt} with nothing in the reading.
  for (const m of s.matchAll(/<rt(?:\s[^>]*)?>\s*<\/rt>|\{rt\}\s*\{\/rt\}/g)) out.push(["empty-reading", m[0]]);
  return out;
}

export function checkRules(tables: Table[], opts: { wideAsTwo?: boolean; locale?: Locale } = {}): Finding[] {
  const msg = messages(opts.locale);
  const out: Finding[] = [];
  for (const t of tables) {
    const jaSide: Side | undefined = t.sourceLang === "ja" ? "source" : t.targetLang === "ja" ? "target" : undefined;
    // Untranslated rows: only for bilingual tables that are at least partly translated (a fresh export is not news).
    const bilingual = !t.singleLang && t.rows.some((r) => r.target.trim());
    const kept = bilingual && t.targetLang === "ja" && t.sourceLang === "en" ? keptLatinWords(t) : undefined;
    for (const [ri, row] of t.rows.entries()) {
      // A key present in only one file of a locale pair: nothing to compare. Absent from the translation → untranslated
      // (unless it is a plural form Japanese does not need); absent from the source → an extra key (info).
      if (row.missing) {
        if (row.pluralVariant) continue;
        if (row.missing === "target" && bilingual && row.source.trim() && !nothingToTranslate(row.source)) {
          out.push({ category: "untranslated", severity: "warning", rule: "untranslated.empty", ...base(row, "target"), message: msg.untranslatedMissingKey() });
        } else if (row.missing === "source" && row.target.trim()) {
          out.push({ category: "untranslated", severity: "info", rule: "untranslated.extra-key", ...base(row, "target"), message: msg.untranslatedExtraKey() });
        }
        continue;
      }
      if (!row.target.trim()) {
        if (bilingual && row.source.trim() && !nothingToTranslate(row.source)) {
          out.push({ category: "untranslated", severity: "warning", rule: "untranslated.empty", ...base(row, "target"), message: msg.untranslatedEmpty() });
        }
        continue;
      }
      if (bilingual && row.fuzzy) {
        out.push({ category: "untranslated", severity: "warning", rule: "untranslated.fuzzy", ...base(row, "target"), message: msg.untranslatedFuzzy() });
      }
      if (kept && row.target.trim() === row.source.trim() && looksUntranslatedCopy(row.source, kept)) {
        out.push({ category: "untranslated", severity: "info", rule: "untranslated.copy", ...base(row, "target"), message: msg.untranslatedCopy() });
      }
      if (bilingual && t.sourceLang === "ja" && t.targetLang === "en" && mostlyJapanese(row.target)) {
        const same = row.target.trim() === row.source.trim();
        out.push({ category: "untranslated", severity: "warning", rule: "untranslated.copy", ...base(row, "target"), message: same ? msg.untranslatedCopy() : msg.untranslatedJapanese() });
      }
      if (bilingual && ri > 0) {
        const prev = t.rows[ri - 1]!;
        if (isNeighbourCopy(prev, row, t.targetLang)) {
          out.push({
            category: "untranslated", severity: "warning", rule: "untranslated.duplicate", ...base(row, "target"),
            message: msg.untranslatedDuplicate(prev.line, prev.id),
          });
        }
      }

      const pair = `${row.source}\n${row.target}`;
      const renpy = isRenpyText(pair, t.format);
      const kag = t.format === "ks";
      const noKag = (x: string) => (kag ? hideRenpyEscapes(x).replace(KAG_STYLE_TAG, "") : x);
      const ph = placeholderDiff(noKag(row.source), noKag(row.target), renpy);
      if (ph.missing.length || ph.extra.length) {
        out.push({
          category: "placeholder", severity: "error", rule: "placeholder.mismatch", ...base(row, "target"),
          message: msg.mismatch(ph.missing, ph.extra),
        });
      } else if (ph.fewer.length || ph.more.length) {
        out.push({ category: "placeholder", severity: "info", rule: "placeholder.count", ...base(row, "target"), message: msg.placeholderCount(ph.fewer, ph.more) });
      }

      const st = tags(row.source, pair, renpy, kag);
      const tt = tags(row.target, pair, renpy, kag);
      const td = diff(st.list, tt.list);
      const emphasisOnly = t.targetLang === "ja" && !td.extra.length && td.missing.every((x) => EMPHASIS_TAGS.has(x.replace(/[</>{}]/g, "").toLowerCase()));
      if (td.missing.length && emphasisOnly) {
        out.push({ category: "tag", severity: "info", rule: "tag.emphasis-dropped", ...base(row, "target"), message: msg.tagEmphasisDropped(td.missing) });
      } else if (td.missing.length || td.extra.length) {
        out.push({
          category: "tag", severity: "error", rule: "tag.mismatch", ...base(row, "target"),
          message: msg.mismatch(td.missing, td.extra),
        });
      }
      // Only report imbalance the translation introduced (the source may intentionally span strings).
      const newlyUnbalanced = diff(st.unbalanced, tt.unbalanced).extra;
      if (newlyUnbalanced.length) {
        out.push({ category: "tag", severity: "error", rule: "tag.unbalanced", ...base(row, "target"), message: msg.tagUnbalanced(newlyUnbalanced) });
      }

      if (jaSide) {
        const ja = jaSide === "source" ? row.source : row.target;
        for (const m of [...ja.matchAll(RUBY_BRACE), ...ja.matchAll(RUBY_AOZORA), ...ja.matchAll(/<ruby(?:\s[^>]*)?>(.*?)(?:<rp>[^<]*<\/rp>)?<rt>(.*?)<\/rt>(?:<rp>[^<]*<\/rp>)?\s*<\/ruby>/g), ...ja.matchAll(RUBY_RENPY)]) {
          const reading = m[2]!.replace(/<[^>]+>|\{[^{}]*\}/g, "");
          if (!KANA_ONLY.test(reading)) {
            out.push({ category: "ruby", severity: "warning", rule: "ruby.reading", ...base(row, jaSide), message: msg.rubyReading(reading, m[1] ?? "") });
          }
        }
        for (const [kind, snippet] of rubyProblems(ja)) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.malformed", ...base(row, jaSide), message: msg.rubyBroken(kind, snippet), found: snippet });
        }
        const opens = (ja.match(/<ruby(?:\s[^>]*)?>/g) ?? []).length;
        const count = (re: RegExp) => (ja.match(re) ?? []).length;
        const renpyRubyBad = count(/\{rt\}/g) !== count(/\{\/rt\}/g) || count(/\{rb\}/g) !== count(/\{\/rb\}/g) || count(/\{rb\}/g) > count(/\{rt\}/g);
        const rts = (ja.match(/<rt(?:\s[^>]*)?>/g) ?? []).length;
        if (opens !== (ja.match(/<\/ruby>/g) ?? []).length || opens !== rts || rts !== count(/<\/rt>/g) || renpyRubyBad) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.malformed", ...base(row, jaSide), message: msg.rubyMalformed() });
        }
        const enSide: Side = jaSide === "source" ? "target" : "source";
        const en = enSide === "source" ? row.source : row.target;
        if (/<ruby>|<rt>|\{r[bt]\}|[｜][^《]+《|\{[^{}|]+\|[^{}]+\}/.test(en)) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.leak", ...base(row, enSide), message: msg.rubyLeak() });
        }
      }

      if (row.maxLength) {
        const n = displayLength(visibleText(row.target), !!opts.wideAsTwo);
        if (n > row.maxLength) {
          out.push({
            category: "length", severity: "error", rule: "length.limit", ...base(row, "target"),
            message: msg.lengthLimit(n, row.maxLength, !!opts.wideAsTwo),
            found: String(n), expected: `≤ ${row.maxLength}`,
          });
        }
      }
    }
  }
  return out;
}

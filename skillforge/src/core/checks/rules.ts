import { BRACKET_WORD, displayLength, PLACEHOLDER, visibleText } from "../text.js";
import { messages } from "../i18n.js";
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
/** Emphasis that Japanese typography usually drops; losing it is a warning, not a broken string. */
const EMPHASIS_TAGS = new Set(["i", "b", "em", "strong", "u", "italic", "bold"]);
const RUBY_TAGS = new Set(["ruby", "rt", "rp", "rb"]);
/** Tags that never take a closing tag (HTML, Unity TextMeshPro). */
const VOID_TAGS = new Set(["br", "sprite", "img", "hr", "space", "page", "pos", "voffset", "x", "ph", "bpt", "ept", "it"]);
const RUBY_BRACE = /\{([^{}|]+)\|([^{}]+)\}/g;
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
function tags(s: string, pair: string): { list: string[]; unbalanced: string[] } {
  const list: string[] = [];
  const stack: string[] = [];
  const unbalanced: string[] = [];
  for (const m of s.matchAll(TAG)) {
    const [, close, name, attrs, self] = m;
    if (RUBY_TAGS.has(name!.toLowerCase())) continue;
    if (!close && !self && !attrs && !KNOWN_TAGS.has(name!.toLowerCase()) && !pair.includes(`</${name}>`)) continue;
    list.push(close ? `</${name}>` : self ? `<${name}/>` : `<${name}>`);
    if (self || VOID_TAGS.has(name!.toLowerCase())) continue;
    if (!close) stack.push(name!);
    else if (stack[stack.length - 1] === name) stack.pop();
    else unbalanced.push(`</${name}>`);
  }
  return { list, unbalanced: [...unbalanced, ...stack.map((n) => `<${n}>`)] };
}

/** Bracketed text with non-ASCII inside: a translated label such as [なし] or a menu path [エクスポート]. */
const TRANSLATED_BRACKET = /\[[^[\]\n]*[^\x00-\x7f][^[\]\n]*\]/g;

/**
 * Placeholder differences. A bare lowercase [word] in the source may be a display label: it is not reported missing
 * when the target has a translated bracket label in its place ([none] → [なし]), and a [word] the target adds is not
 * reported when the source has the word unbracketed (a translator-written menu path).
 */
function placeholderDiff(source: string, target: string): { missing: string[]; extra: string[] } {
  const { missing, extra } = diff(
    [...(source.match(PLACEHOLDER) ?? []), ...(source.match(BRACKET_WORD) ?? [])],
    [...(target.match(PLACEHOLDER) ?? []), ...(target.match(BRACKET_WORD) ?? [])],
  );
  let labels = (target.match(TRANSLATED_BRACKET) ?? []).length - (source.match(TRANSLATED_BRACKET) ?? []).length;
  const isWord = (p: string) => /^\[[a-z]+\]$/.test(p);
  return {
    missing: missing.filter((p) => !(isWord(p) && labels-- > 0)),
    extra: extra.filter((p) => !(isWord(p) && new RegExp(`(?<![A-Za-z])${p.slice(1, -1)}(?![A-Za-z])`, "i").test(source))),
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
  if ((v.match(/[A-Za-z'\s-]/g) ?? []).length < v.length * 0.75) return false;
  return !words.every((w) => kept.has(w) || /^[A-Z0-9]+$/.test(w));
}

export function checkRules(tables: Table[], opts: { wideAsTwo?: boolean; locale?: Locale } = {}): Finding[] {
  const msg = messages(opts.locale);
  const out: Finding[] = [];
  for (const t of tables) {
    const jaSide: Side | undefined = t.sourceLang === "ja" ? "source" : t.targetLang === "ja" ? "target" : undefined;
    // Untranslated rows: only for bilingual tables that are at least partly translated (a fresh export is not news).
    const bilingual = !t.singleLang && t.rows.some((r) => r.target.trim());
    const kept = bilingual && t.targetLang === "ja" && t.sourceLang === "en" ? keptLatinWords(t) : undefined;
    for (const row of t.rows) {
      if (!row.target.trim()) {
        if (bilingual && row.source.trim()) {
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

      const ph = placeholderDiff(row.source, row.target);
      if (ph.missing.length || ph.extra.length) {
        out.push({
          category: "placeholder", severity: "error", rule: "placeholder.mismatch", ...base(row, "target"),
          message: msg.mismatch(ph.missing, ph.extra),
        });
      }

      const pair = `${row.source}\n${row.target}`;
      const st = tags(row.source, pair);
      const tt = tags(row.target, pair);
      const td = diff(st.list, tt.list);
      const emphasisOnly = t.targetLang === "ja" && !td.extra.length && td.missing.every((x) => EMPHASIS_TAGS.has(x.replace(/[</>]/g, "").toLowerCase()));
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
        for (const m of [...ja.matchAll(RUBY_BRACE), ...ja.matchAll(RUBY_AOZORA), ...ja.matchAll(/<ruby(?:\s[^>]*)?>(.*?)(?:<rp>[^<]*<\/rp>)?<rt>(.*?)<\/rt>(?:<rp>[^<]*<\/rp>)?\s*<\/ruby>/g)]) {
          const reading = m[2]!.replace(/<[^>]+>/g, "");
          if (!KANA_ONLY.test(reading)) {
            out.push({ category: "ruby", severity: "warning", rule: "ruby.reading", ...base(row, jaSide), message: msg.rubyReading(reading, m[1]!) });
          }
        }
        const opens = (ja.match(/<ruby(?:\s[^>]*)?>/g) ?? []).length;
        if (opens !== (ja.match(/<\/ruby>/g) ?? []).length || opens !== (ja.match(/<rt(?:\s[^>]*)?>/g) ?? []).length) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.malformed", ...base(row, jaSide), message: msg.rubyMalformed() });
        }
        const enSide: Side = jaSide === "source" ? "target" : "source";
        const en = enSide === "source" ? row.source : row.target;
        if (/<ruby>|<rt>|[｜][^《]+《|\{[^{}|]+\|[^{}]+\}/.test(en)) {
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

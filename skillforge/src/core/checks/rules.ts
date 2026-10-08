import { displayLength, visibleText } from "../text.js";
import type { Finding, Row, Side, Table } from "../types.js";

// Bonus rule checks. Xbench/Verifika already cover this ground, so they are kept simple.

const PLACEHOLDER = /\{[A-Za-z0-9_.$:]*\}|%(?:\d+\$)?[sdif@]|\$\{[^}]+\}|\[[A-Z][A-Z0-9_]{1,}\]/g;
const TAG = /<(\/?)([A-Za-z][\w:-]*)[^<>]*?(\/?)>/g;
const RUBY_TAGS = new Set(["ruby", "rt", "rp", "rb"]);
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

function tags(s: string): { list: string[]; unbalanced: string[] } {
  const list: string[] = [];
  const stack: string[] = [];
  const unbalanced: string[] = [];
  for (const m of s.matchAll(TAG)) {
    const [, close, name, self] = m;
    if (RUBY_TAGS.has(name!.toLowerCase())) continue;
    list.push(close ? `</${name}>` : self ? `<${name}/>` : `<${name}>`);
    if (self) continue;
    if (!close) stack.push(name!);
    else if (stack[stack.length - 1] === name) stack.pop();
    else unbalanced.push(`</${name}>`);
  }
  return { list, unbalanced: [...unbalanced, ...stack.map((n) => `<${n}>`)] };
}

export function checkRules(tables: Table[], opts: { wideAsTwo?: boolean } = {}): Finding[] {
  const out: Finding[] = [];
  for (const t of tables) {
    const jaSide: Side | undefined = t.sourceLang === "ja" ? "source" : t.targetLang === "ja" ? "target" : undefined;
    for (const row of t.rows) {
      if (!row.target.trim()) continue;

      const ph = diff(row.source.match(PLACEHOLDER) ?? [], row.target.match(PLACEHOLDER) ?? []);
      if (ph.missing.length || ph.extra.length) {
        out.push({
          category: "placeholder", severity: "error", rule: "placeholder.mismatch", ...base(row, "target"),
          message: [ph.missing.length && `missing ${ph.missing.join(" ")}`, ph.extra.length && `unexpected ${ph.extra.join(" ")}`].filter(Boolean).join("; "),
        });
      }

      const st = tags(row.source);
      const tt = tags(row.target);
      const td = diff(st.list, tt.list);
      if (td.missing.length || td.extra.length) {
        out.push({
          category: "tag", severity: "error", rule: "tag.mismatch", ...base(row, "target"),
          message: [td.missing.length && `missing ${td.missing.join(" ")}`, td.extra.length && `unexpected ${td.extra.join(" ")}`].filter(Boolean).join("; "),
        });
      }
      if (tt.unbalanced.length) {
        out.push({ category: "tag", severity: "error", rule: "tag.unbalanced", ...base(row, "target"), message: `Unbalanced tags: ${tt.unbalanced.join(" ")}` });
      }

      if (jaSide) {
        const ja = jaSide === "source" ? row.source : row.target;
        for (const m of [...ja.matchAll(RUBY_BRACE), ...ja.matchAll(RUBY_AOZORA), ...ja.matchAll(/<ruby>(.*?)<rt>(.*?)<\/rt>\s*<\/ruby>/g)]) {
          const reading = m[2]!.replace(/<[^>]+>/g, "");
          if (!KANA_ONLY.test(reading)) {
            out.push({ category: "ruby", severity: "warning", rule: "ruby.reading", ...base(row, jaSide), message: `Ruby reading "${reading}" for "${m[1]}" is not kana.` });
          }
        }
        const opens = (ja.match(/<ruby>/g) ?? []).length;
        if (opens !== (ja.match(/<\/ruby>/g) ?? []).length || opens !== (ja.match(/<rt>/g) ?? []).length) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.malformed", ...base(row, jaSide), message: "Malformed <ruby>/<rt> markup." });
        }
        const enSide: Side = jaSide === "source" ? "target" : "source";
        const en = enSide === "source" ? row.source : row.target;
        if (/<ruby>|<rt>|[｜][^《]+《|\{[^{}|]+\|[^{}]+\}/.test(en)) {
          out.push({ category: "ruby", severity: "error", rule: "ruby.leak", ...base(row, enSide), message: "Ruby markup copied into the English text." });
        }
      }

      if (row.maxLength) {
        const n = displayLength(visibleText(row.target), !!opts.wideAsTwo);
        if (n > row.maxLength) {
          out.push({
            category: "length", severity: "error", rule: "length.limit", ...base(row, "target"),
            message: `Length ${n} exceeds the limit of ${row.maxLength}${opts.wideAsTwo ? " (wide chars count 2)" : ""}.`,
            found: String(n), expected: `≤ ${row.maxLength}`,
          });
        }
      }
    }
  }
  return out;
}

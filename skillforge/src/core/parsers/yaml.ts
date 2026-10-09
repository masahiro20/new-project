// YAML locale files (Rails i18n `ja:` root, Misskey `ja-JP.yml`, Crowdin YAML) → a single-language table keyed by
// dotted path. A small YAML subset parser that keeps the line of every key. Browser-safe, no dependencies.
//
// Supported: block mappings and sequences (nested by indentation, compact `- key: v` items), plain / 'single' /
// "double" scalars (escapes, multi-line folding), `|` / `>` block scalars (chomping `-` `+`, indentation digit),
// comments, `---` / `...` / `%` directives around one document, flow collections `[a, b]` / `{a: b}`, anchors `&a`,
// aliases `*a` and merge keys `<<: *a` (aliased values report the anchor's line), tags (`!!str` etc. are dropped).
// Not supported (clear error with the line): complex keys `? `, several documents in one file, tab indentation.
import { singleTable } from "./columns.js";
import { langFromName, langOfCode } from "./lang.js";
import { detectLang } from "../text.js";
import type { Lang, Row, Table } from "../types.js";

/** Parsed YAML node. `text` is false for plain scalars that YAML resolves to null / bool / number. */
export type YNode =
  | { kind: "map"; line: number; entries: { key: string; line: number; value: YNode }[] }
  | { kind: "seq"; line: number; items: { line: number; value: YNode }[] }
  | { kind: "scalar"; line: number; value: string; text: boolean };

const ESCAPES: Record<string, string> = {
  "0": "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b",
  " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\x85", _: "\xa0", L: " ", P: " ",
};

const indentOf = (s: string) => s.length - s.trimStart().length;
const isBlank = (s: string) => !s.trim();
const isCommentLine = (s: string) => s.trimStart().startsWith("#");
const isSeqItem = (s: string) => s === "-" || s.startsWith("- ") || s.startsWith("-\t");

/** Removes a trailing ` # comment` from a plain scalar. */
function stripComment(s: string): string {
  const m = /(^|\s)#/.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

/** YAML 1.2 core schema: these plain scalars are not text. */
function isNonText(s: string): boolean {
  return /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/.test(s) || s === "";
}

/** Folds the lines of a multi-line quoted scalar: a single line break → space, each blank line → "\n". */
function foldQuoted(raw: string, escapes: boolean): string {
  const parts = raw.split("\n");
  if (parts.length === 1) return raw;
  let out = parts[0]!.replace(/[ \t]+$/, "");
  let breaks = 0;
  for (let k = 1; k < parts.length; k++) {
    const last = k === parts.length - 1;
    const p = last ? parts[k]!.replace(/^[ \t]+/, "") : parts[k]!.trim();
    if (!p && !last) {
      breaks++;
      continue;
    }
    // Escaped line break (double-quoted only): `\` at the end of a line joins without a space.
    if (escapes && /(^|[^\\])(\\\\)*\\$/.test(out) && !breaks) out = out.slice(0, -1);
    else out += breaks ? "\n".repeat(breaks) : " ";
    out += p;
    breaks = 0;
  }
  return out;
}

export class YamlError extends Error {}

class YamlParser {
  private i = 0;
  private anchors = new Map<string, YNode>();
  readonly notes: string[] = [];
  private noted = new Set<string>();

  constructor(private lines: string[]) {}

  private fail(line: number, msg: string): never {
    throw new YamlError(`YAML parse error at line ${line}: ${msg}`);
  }

  private noteOnce(key: string, msg: string) {
    if (this.noted.has(key)) return;
    this.noted.add(key);
    this.notes.push(msg);
  }

  /** Index of the next line that is neither blank nor a comment, at or after `from`. */
  private nextSig(from = this.i): number {
    let j = from;
    while (j < this.lines.length && (isBlank(this.lines[j]!) || isCommentLine(this.lines[j]!))) j++;
    return j;
  }

  /** Blanks `---` / `...` / `%` directive lines around the single document; rejects a second document. */
  prepare(): void {
    let content = false;
    let ended = false;
    this.lines.forEach((l, k) => {
      if (l.startsWith("\t") && !isBlank(l)) this.fail(k + 1, "tab used for indentation; YAML indents with spaces");
      if (/^---(?:\s|$)/.test(l)) {
        if (content) this.fail(k + 1, "a second YAML document ('---') is not supported; use one document per file");
        const rest = l.slice(3).trim();
        if (rest && !rest.startsWith("#")) this.fail(k + 1, "content on the '---' line is not supported; start it on the next line");
        this.lines[k] = "";
      } else if (/^\.\.\.(?:\s|$)/.test(l)) {
        ended = true;
        this.lines[k] = "";
      } else if (!content && l.startsWith("%")) {
        this.lines[k] = "";
      } else if (!isBlank(l) && !isCommentLine(l)) {
        if (ended) this.fail(k + 1, "content after the document end marker '...'; use one document per file");
        content = true;
      }
    });
  }

  parseDocument(): YNode | undefined {
    const j = this.nextSig(0);
    if (j >= this.lines.length) return undefined;
    const ind = indentOf(this.lines[j]!);
    const node = this.parseBlockAt(j, ind);
    const rest = this.nextSig();
    if (rest < this.lines.length) this.fail(rest + 1, `unexpected indentation or content (expected a key at column ${ind + 1})`);
    return node;
  }

  /** Column of the `:` that ends a mapping key on this line, or -1. */
  private keyColon(content: string): number {
    let p = 0;
    const q = content[0];
    if (q === '"' || q === "'") {
      p = 1;
      while (p < content.length) {
        if (q === '"' && content[p] === "\\") p += 2;
        else if (content[p] === q) {
          if (q === "'" && content[p + 1] === "'") p += 2;
          else break;
        } else p++;
      }
      if (p >= content.length) return -1;
      p++;
      while (content[p] === " ") p++;
      return content[p] === ":" && (p + 1 >= content.length || /\s/.test(content[p + 1]!)) ? p : -1;
    }
    if (q === "[" || q === "{" || q === "#" || q === "|" || q === ">") return -1;
    for (; p < content.length; p++) {
      const c = content[p];
      if (c === "#" && p > 0 && /\s/.test(content[p - 1]!)) return -1;
      if (c === ":" && (p + 1 >= content.length || /\s/.test(content[p + 1]!))) return p;
    }
    return -1;
  }

  private parseBlockAt(j: number, ind: number): YNode {
    const content = this.lines[j]!.slice(ind);
    if (isSeqItem(content)) return this.parseSeq(ind);
    if (content.startsWith("? ") || content === "?") this.fail(j + 1, "complex mapping keys ('? ') are not supported");
    if (this.keyColon(content) >= 0) return this.parseMap(ind);
    // A scalar on its own line under its key ("key:\n  'value'").
    this.i = j + 1;
    return this.parseValue(content, j, ind - 1, false);
  }

  private parseMap(indent: number): YNode {
    const entries: { key: string; line: number; value: YNode }[] = [];
    const pos = new Map<string, number>();
    const merges: YNode[] = [];
    const start = this.nextSig();
    for (;;) {
      const j = this.nextSig();
      if (j >= this.lines.length) break;
      const raw = this.lines[j]!;
      const ind = indentOf(raw);
      if (ind < indent) break;
      if (ind > indent) this.fail(j + 1, `unexpected indentation (expected column ${indent + 1})`);
      const content = raw.slice(indent);
      if (isSeqItem(content)) this.fail(j + 1, "a list item ('- ') where a mapping key was expected");
      if (content.startsWith("? ") || content === "?") this.fail(j + 1, "complex mapping keys ('? ') are not supported");
      const colon = this.keyColon(content);
      if (colon < 0) this.fail(j + 1, `expected 'key: value', got "${content.trim().slice(0, 40)}"`);
      const keyRaw = content.slice(0, colon).trim();
      const key = keyRaw.startsWith('"') ? this.unquote(keyRaw.slice(1, -1), true, j + 1) : keyRaw.startsWith("'") ? keyRaw.slice(1, -1).replace(/''/g, "'") : keyRaw;
      this.i = j + 1;
      const value = this.parseValue(content.slice(colon + 1), j, indent, true);
      if (key === "<<" && !keyRaw.startsWith('"') && !keyRaw.startsWith("'")) {
        if (value.kind === "map") merges.push(value);
        else if (value.kind === "seq" && value.items.every((x) => x.value.kind === "map")) merges.push(...value.items.map((x) => x.value));
        else this.fail(j + 1, "merge key '<<' needs a mapping or a list of mappings (e.g. <<: *defaults)");
        continue;
      }
      const prev = pos.get(key);
      if (prev !== undefined) {
        this.notes.push(`duplicate key "${key}" at lines ${entries[prev]!.line} and ${j + 1}; the later one wins`);
        entries[prev] = { key, line: j + 1, value };
      } else {
        pos.set(key, entries.length);
        entries.push({ key, line: j + 1, value });
      }
    }
    for (const m of merges) {
      if (m.kind !== "map") continue;
      for (const e of m.entries) {
        if (pos.has(e.key)) continue;
        pos.set(e.key, entries.length);
        entries.push(e);
      }
    }
    return { kind: "map", line: start + 1, entries };
  }

  private parseSeq(indent: number): YNode {
    const items: { line: number; value: YNode }[] = [];
    const start = this.nextSig();
    for (;;) {
      const j = this.nextSig();
      if (j >= this.lines.length) break;
      const raw = this.lines[j]!;
      const ind = indentOf(raw);
      if (ind < indent) break;
      if (ind > indent) this.fail(j + 1, `unexpected indentation (expected column ${indent + 1})`);
      const content = raw.slice(indent);
      if (!isSeqItem(content)) break;
      const after = content.slice(1);
      const inner = after.trimStart();
      let value: YNode;
      if (!inner || inner.startsWith("#")) {
        this.i = j + 1;
        value = this.parseValue("", j, indent, false);
      } else {
        const col = indent + 1 + (after.length - inner.length);
        if (isSeqItem(inner) || this.keyColon(inner) >= 0) {
          // Compact nested block: "- key: v" / "- - x". Re-read the line with the dash blanked out.
          this.lines[j] = " ".repeat(col) + inner;
          value = this.parseBlockAt(j, col);
        } else {
          this.i = j + 1;
          value = this.parseValue(inner, j, indent, false);
        }
      }
      items.push({ line: j + 1, value });
    }
    return { kind: "seq", line: start + 1, items };
  }

  /**
   * Value after `key:` or `- ` on line `j` (0-based). `parentIndent` is the indentation of the key / dash:
   * continuation and nested lines must be indented further. `compactSeq`: a `- ` list at the key's own indentation
   * is the key's value (YAML allows that under a mapping key).
   */
  private parseValue(rest: string, j: number, parentIndent: number, compactSeq: boolean): YNode {
    const line = j + 1;
    let s = rest.trim();
    let anchor: string | undefined;
    let tag: string | undefined;
    for (;;) {
      const a = /^&([^\s,[\]{}]+)\s*/.exec(s);
      if (a) {
        anchor = a[1];
        s = s.slice(a[0].length);
        continue;
      }
      const t = /^!(?:[^\s,[\]{}]*)\s*/.exec(s);
      if (t) {
        tag = t[0].trim();
        s = s.slice(t[0].length);
        continue;
      }
      break;
    }
    let node: YNode;
    if (!s || s.startsWith("#")) {
      const k = this.nextSig();
      const ind = k < this.lines.length ? indentOf(this.lines[k]!) : -1;
      if (k < this.lines.length && ind > parentIndent) node = this.parseBlockAt(k, ind);
      else if (k < this.lines.length && compactSeq && ind === parentIndent && isSeqItem(this.lines[k]!.slice(ind))) node = this.parseSeq(ind);
      else node = { kind: "scalar", line, value: "", text: false };
    } else if (s.startsWith("*")) {
      const m = /^\*([^\s,[\]{}]+)\s*(#.*)?$/.exec(s);
      if (!m) this.fail(line, "unexpected text after an alias");
      const target = this.anchors.get(m[1]!);
      if (!target) this.fail(line, `unknown alias *${m[1]} (anchors must be defined before use)`);
      node = target;
    } else if (s[0] === "|" || s[0] === ">") {
      node = this.blockScalar(s, j, parentIndent);
    } else if (s[0] === '"' || s[0] === "'") {
      node = this.quoted(s, j);
    } else if (s[0] === "[" || s[0] === "{") {
      node = this.flow(s, j);
    } else {
      if (s[0] === "@" || s[0] === "`") this.fail(line, `a plain value cannot start with '${s[0]}'; quote it`);
      node = this.plain(s, j, parentIndent);
    }
    // `!!str 123` is text; other tags are ignored.
    if (tag === "!!str" && node.kind === "scalar") node = { ...node, text: true };
    if (anchor) this.anchors.set(anchor, node);
    return node;
  }

  private plain(first: string, j: number, parentIndent: number): YNode {
    let value = stripComment(first);
    let k = this.i;
    let breaks = 0;
    while (k < this.lines.length) {
      const l = this.lines[k]!;
      if (isBlank(l)) {
        breaks++;
        k++;
        continue;
      }
      if (indentOf(l) <= parentIndent || isCommentLine(l)) break;
      const t = l.trim();
      if (this.keyColon(t) >= 0) this.fail(k + 1, "a 'key:' inside a multi-line value; check the indentation (or quote the value)");
      value += breaks ? "\n".repeat(breaks) : " ";
      value += stripComment(t);
      breaks = 0;
      k++;
      this.i = k;
    }
    return { kind: "scalar", line: j + 1, value, text: !isNonText(value) };
  }

  /** Double-quoted escapes. */
  private unquote(s: string, escapes: boolean, line: number): string {
    if (!escapes) return s.replace(/''/g, "'");
    return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[\s\S])/g, (_, e: string) => {
      if (e.length > 1) return String.fromCodePoint(Number.parseInt(e.slice(1), 16));
      const r = ESCAPES[e];
      if (r === undefined) this.fail(line, `invalid escape '\\${e}' in a double-quoted string`);
      return r;
    });
  }

  /** Quoted scalar starting at `s` (rest of line j), possibly continuing onto the next lines. */
  private quoted(s: string, j: number): YNode {
    const q = s[0]!;
    let text = s.slice(1);
    let k = j;
    let raw = "";
    for (;;) {
      let p = 0;
      let end = -1;
      while (p < text.length) {
        if (q === '"' && text[p] === "\\") p += 2;
        else if (text[p] === q) {
          if (q === "'" && text[p + 1] === "'") p += 2;
          else {
            end = p;
            break;
          }
        } else p++;
      }
      if (end >= 0) {
        raw += text.slice(0, end);
        const after = text.slice(end + 1).trim();
        if (after && !after.startsWith("#")) this.fail(k + 1, `unexpected text after a quoted value: "${after.slice(0, 30)}"`);
        break;
      }
      raw += text + "\n";
      k++;
      if (k >= this.lines.length) this.fail(j + 1, `unterminated ${q === '"' ? "double" : "single"}-quoted string`);
      text = this.lines[k]!;
    }
    this.i = Math.max(this.i, k + 1);
    const folded = foldQuoted(raw, q === '"');
    return { kind: "scalar", line: j + 1, value: this.unquote(folded, q === '"', j + 1), text: true };
  }

  private blockScalar(header: string, j: number, parentIndent: number): YNode {
    const m = /^([|>])([1-9]?)([-+]?)([1-9]?)\s*(#.*)?$/.exec(header);
    if (!m) this.fail(j + 1, `bad block scalar header "${header}"`);
    const folded = m[1] === ">";
    const digit = m[2] || m[4];
    const chomp = m[3];
    let contentIndent = digit ? Math.max(parentIndent, 0) + Number(digit) : -1;
    const body: string[] = [];
    let k = this.i;
    let lastContent = this.i;
    for (; k < this.lines.length; k++) {
      const l = this.lines[k]!;
      if (isBlank(l)) {
        body.push(l.length > contentIndent && contentIndent >= 0 ? l.slice(contentIndent) : "");
        continue;
      }
      const ind = indentOf(l);
      if (contentIndent < 0) {
        if (ind <= parentIndent) break;
        contentIndent = ind;
      }
      if (ind < contentIndent) break;
      body.push(l.slice(contentIndent));
      lastContent = k + 1;
    }
    this.i = Math.max(this.i, lastContent);
    let trailing = 0;
    while (body.length && !body[body.length - 1]!.trim()) {
      body.pop();
      trailing++;
    }
    // Blank lines after the content that belong to the next key are counted as trailing; only "keep" uses them.
    let text: string;
    if (!folded) text = body.join("\n");
    else {
      text = "";
      let breaks = 0;
      let prev: string | undefined;
      for (const l of body) {
        if (!l) {
          breaks++;
          continue;
        }
        const more = /^\s/.test(l);
        if (prev === undefined) text += "\n".repeat(breaks);
        else if (more || /^\s/.test(prev)) text += "\n".repeat(breaks + 1);
        else text += breaks ? "\n".repeat(breaks) : " ";
        text += l;
        prev = l;
        breaks = 0;
      }
    }
    if (chomp === "-") {
      /* strip */
    } else if (chomp === "+") text += body.length ? "\n" + "\n".repeat(trailing) : "\n".repeat(trailing);
    else if (body.length) text += "\n";
    return { kind: "scalar", line: j + 1, value: text, text: true };
  }

  /** Flow collection starting at `s` (rest of line j), possibly spanning lines. */
  private flow(s: string, j: number): YNode {
    // Gather until the brackets balance.
    let src = s;
    let k = j;
    const balanced = (t: string): number => {
      let depth = 0;
      let q: string | undefined;
      for (let p = 0; p < t.length; p++) {
        const c = t[p]!;
        if (q) {
          if (q === '"' && c === "\\") p++;
          else if (c === q) {
            if (q === "'" && t[p + 1] === "'") p++;
            else q = undefined;
          }
        } else if (c === '"' || c === "'") q = c;
        else if (c === "#" && (p === 0 || /\s/.test(t[p - 1]!))) {
          const nl = t.indexOf("\n", p);
          if (nl < 0) return depth === 0 ? p : -1;
          p = nl;
        } else if (c === "[" || c === "{") depth++;
        else if (c === "]" || c === "}") {
          depth--;
          if (depth === 0) return p + 1;
        }
      }
      return -1;
    };
    let end = balanced(src);
    while (end < 0) {
      k++;
      if (k >= this.lines.length) this.fail(j + 1, "unterminated flow collection ('[' or '{' without its closing bracket)");
      src += "\n" + this.lines[k]!;
      end = balanced(src);
    }
    const after = src.slice(end).trim();
    if (after && !after.startsWith("#")) this.fail(k + 1, `unexpected text after a flow collection: "${after.slice(0, 30)}"`);
    this.i = Math.max(this.i, k + 1);
    src = src.slice(0, end);

    let p = 0;
    const lineAt = () => j + 1 + (src.slice(0, p).match(/\n/g)?.length ?? 0);
    const ws = () => {
      for (;;) {
        while (p < src.length && /\s/.test(src[p]!)) p++;
        if (src[p] === "#") {
          while (p < src.length && src[p] !== "\n") p++;
        } else return;
      }
    };
    const scalar = (): YNode => {
      ws();
      const line = lineAt();
      const c = src[p];
      if (c === '"' || c === "'") {
        let e = p + 1;
        while (e < src.length) {
          if (c === '"' && src[e] === "\\") e += 2;
          else if (src[e] === c) {
            if (c === "'" && src[e + 1] === "'") e += 2;
            else break;
          } else e++;
        }
        const raw = src.slice(p + 1, e);
        p = e + 1;
        return { kind: "scalar", line, value: this.unquote(foldQuoted(raw, c === '"'), c === '"', line), text: true };
      }
      let e = p;
      while (e < src.length && !/[,[\]{}]/.test(src[e]!) && !(src[e] === ":" && /[\s,[\]{}]/.test(src[e + 1] ?? " ")) && !(src[e] === "#" && /\s/.test(src[e - 1] ?? ""))) e++;
      const v = src.slice(p, e).replace(/\s*\n\s*/g, " ").trim();
      p = e;
      return { kind: "scalar", line, value: v, text: !isNonText(v) };
    };
    const value = (): YNode => {
      ws();
      const line = lineAt();
      if (src[p] === "[") {
        p++;
        const items: { line: number; value: YNode }[] = [];
        for (;;) {
          ws();
          if (src[p] === "]") {
            p++;
            break;
          }
          const il = lineAt();
          let v = value();
          ws();
          if (src[p] === ":") {
            p++;
            const k2 = v.kind === "scalar" ? v.value : "";
            v = { kind: "map", line: il, entries: [{ key: k2, line: il, value: value() }] };
            ws();
          }
          items.push({ line: il, value: v });
          if (src[p] === ",") p++;
          else if (src[p] !== "]") this.fail(lineAt(), "expected ',' or ']' in a flow list");
        }
        return { kind: "seq", line, items };
      }
      if (src[p] === "{") {
        p++;
        const entries: { key: string; line: number; value: YNode }[] = [];
        for (;;) {
          ws();
          if (src[p] === "}") {
            p++;
            break;
          }
          const kl = lineAt();
          const k2 = scalar();
          ws();
          let v: YNode = { kind: "scalar", line: kl, value: "", text: false };
          if (src[p] === ":") {
            p++;
            ws();
            if (src[p] !== "," && src[p] !== "}") v = value();
          }
          entries.push({ key: k2.kind === "scalar" ? k2.value : "", line: kl, value: v });
          ws();
          if (src[p] === ",") p++;
          else if (src[p] !== "}") this.fail(lineAt(), "expected ',' or '}' in a flow mapping");
        }
        return { kind: "map", line, entries };
      }
      if (src[p] === "*") {
        const m = /^\*([^\s,[\]{}]+)/.exec(src.slice(p));
        const target = m && this.anchors.get(m[1]!);
        if (!target) this.fail(line, `unknown alias ${m ? "*" + m[1] : "*"}`);
        p += m![0].length;
        return target;
      }
      return scalar();
    };
    return value();
  }
}

/** Parses YAML text into a node tree (one document). Throws `YamlError` with a line number on unsupported input. */
export function parseYamlDocument(text: string): { root: YNode | undefined; notes: string[] } {
  const p = new YamlParser(text.replace(/^﻿/, "").split(/\r?\n/));
  p.prepare();
  const root = p.parseDocument();
  return { root, notes: p.notes };
}

type Leaf = { key: string; line: number; value: string };

function flatten(n: YNode, prefix: string, line: number, out: Leaf[], seen: Set<YNode>): void {
  if (n.kind === "scalar") {
    if (n.text) out.push({ key: prefix, line, value: n.value });
    return;
  }
  if (seen.has(n)) return; // an alias that refers to its own ancestor
  seen.add(n);
  if (n.kind === "map") for (const e of n.entries) flatten(e.value, prefix ? `${prefix}.${e.key}` : e.key, e.line, out, seen);
  else n.items.forEach((x, i) => flatten(x.value, prefix ? `${prefix}.${i}` : String(i), x.line, out, seen));
  seen.delete(n);
}

/**
 * A per-locale YAML file → single-language table (paired with its counterpart by `loadInputs`). Keys are joined with
 * dots (`menu.start`, list items `items.0`); a single top-level language key (`ja:`, `en-US:`) is dropped and gives
 * the language, as does Misskey's `_lang_: "日本語"` (not a row). Otherwise the file name, then the text decides.
 * Line = the line of the key (of the `- ` for list items). Null / boolean / number values are skipped.
 */
export function parseYaml(text: string, file: string): { table: Table; notes: string[] } {
  let doc: ReturnType<typeof parseYamlDocument>;
  try {
    doc = parseYamlDocument(text);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
  const notes = doc.notes.map((n) => `${file}: ${n}`);
  let root = doc.root;
  if (!root || root.kind !== "map") throw new Error(`${file}: expected a YAML mapping of translation keys (a locale file such as ja.yml)${root?.kind === "seq" ? ", got a list" : ""}`);
  let lang: Lang | undefined;
  const langKeys = root.entries.filter((e) => langOfCode(e.key) && e.value.kind === "map");
  if (langKeys.length > 1) throw new Error(`${file}: has several locale roots (${langKeys.map((e) => e.key).join(", ")}); split it into one file per locale`);
  if (root.entries.length === 1 && langKeys.length === 1) {
    lang = langOfCode(langKeys[0]!.key);
    root = langKeys[0]!.value;
  }
  const leaves: Leaf[] = [];
  if (root.kind === "map") {
    for (const e of root.entries) {
      if (e.key === "_lang_" && e.value.kind === "scalar") {
        lang ??= langOfCode(e.value.value);
        continue;
      }
      flatten(e.value, e.key, e.line, leaves, new Set());
    }
  }
  if (!leaves.length) throw new Error(`${file}: no string values found`);
  const rows: Row[] = leaves.map((l) => ({ file, line: l.line, id: l.key, source: l.value, target: "" }));
  lang ??= langFromName(file) ?? detectLang(rows.map((r) => r.source));
  return { table: singleTable(file, "yaml", rows, lang), notes };
}

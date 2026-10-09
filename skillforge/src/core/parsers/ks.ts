// TyranoScript / KiriKiri KAG scenario files (.ks) → single-language tables of text units. Browser-safe, no dependencies.
//
//   *first|はじまり              ← label (`|` title is the save name)
//   #あかね:happy                ← Tyrano speaker line (`#` alone clears it)
//   [ruby text=かん]漢字の[emb exp="f.name"]さん。[l][r]
//   ここが同じページの続き。[p]  ← a unit ends at [p]
//   @bg storage=room.jpg        ← command line (a tag without brackets)
//   ; comment
//
// One row per text unit: the text from the first text line up to [p] (or [cm]/[er]/[ct], a speaker line, a label,
// end of file). id = `<label>#<n>` (n counts the units within the label, from 1), line = first text line, speaker =
// the `#name` (or [chara_ptext name=…]; a [chara_new name=… jname=…] in the same file maps it to the display name).
// A localised game duplicates the scenario per language (scenario/ja/first.ks + scenario/en/first.ks, first.ks +
// first_en.ks); `loadInputs` pairs the two single-language tables by id. See docs/formats-ks.md for every decision.
//
// Text as stored in the row (so the existing rules understand it):
//   [ruby text=かん]漢   → {漢|かん}         (ruby applies to the one character that follows; ruby rules check it)
//   [emb exp=f.name]     → [emb exp="f.name"] (canonical quoting; a placeholder, see PLACEHOLDER in text.ts)
//   [r]                  → line break
//   [font …] [resetfont] [style …] [resetstyle] [graph …] [mark …] [endmark] [indent] [endindent] → kept as written
//   [ch text=X] / [hch text=X] → X
//   [l] and every other tag (wait, delay, playse, jump …) → dropped (pacing and stage directions are not text)
//   `[[` (a literal `[`) is kept as written, like Ren'Py's escape; a source line break between two text lines joins
//   with nothing next to Japanese text and with one space between Latin text (KAG3/Tyrano ignore source line ends).
import { langFromName } from "./lang.js";
import { detectLang } from "../text.js";
import type { Row, Table } from "../types.js";

/** Inline tags that style the text: kept in the row text and compared between source and translation by name. */
export const KS_STYLE_TAGS = new Set(["font", "resetfont", "style", "resetstyle", "graph", "mark", "endmark", "indent", "endindent"]);
const CLEAR_TAGS = new Set(["cm", "er", "ct"]);
/** Tags whose `text` attribute is shown on screen as its own string (choice buttons, layer text). */
const TEXT_ATTR_TAGS = new Set(["glink", "ptext", "mtext"]);

export interface KsUnit {
  label: string;
  /** 1-based position among the label's units. */
  index: number;
  line: number;
  endLine: number;
  speaker?: string;
  text: string;
  /** Label title (`*label|title`) and, for a choice or layer text, the tag it came from. */
  context?: string;
}

export interface KsTag {
  name: string;
  attrs: Record<string, string>;
  raw: string;
}

/** `ruby text="かん"` → { name: "ruby", attrs: { text: "かん" } }. Bare flags (`cond`, `*`) get the value "". */
export function parseKsTag(inner: string): KsTag {
  const s = inner.trim();
  const m = /^([^\s=\]]+)/.exec(s);
  const name = (m?.[1] ?? "").toLowerCase();
  const attrs: Record<string, string> = {};
  const rest = s.slice(m?.[0].length ?? 0);
  for (const a of rest.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']*))|(\S+)/g)) {
    if (a[5] !== undefined) attrs[a[5]] = "";
    else attrs[a[1]!] = a[2] ?? a[3] ?? a[4] ?? "";
  }
  return { name, attrs, raw: s };
}

/** End of the tag that opens at `p` (index after its `]`), skipping quoted values; -1 when it never closes on the line. */
function tagEnd(s: string, p: number): number {
  let q: string | undefined;
  for (let i = p + 1; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q) q = undefined;
    } else if (c === '"' || c === "'") {
      // A quote only opens a value right after `=` (an apostrophe in a bare word is just a character).
      if (/=\s*$/.test(s.slice(p, i))) q = c;
    } else if (c === "]") return i + 1;
  }
  return -1;
}

const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/;
const firstChar = (s: string) => String.fromCodePoint(s.codePointAt(0)!);

/** Parses a .ks scenario into text units, with notes on skipped blocks. */
export function parseKsUnits(text: string, file: string): { units: KsUnit[]; notes: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const units: KsUnit[] = [];
  const notes: string[] = [];
  const counter = new Map<string, number>();
  const chara: Record<string, string> = {};
  let label = "(top)";
  let title: string | undefined;
  let speaker: string | undefined;
  type Mode = "text" | "script" | "macro" | "comment";
  let mode: Mode = "text" as Mode;
  let scripts = 0;
  let macros = 0;
  let unclosed = 0;
  let cur: { line: number; endLine: number; text: string; speaker?: string; joinNext: boolean } | undefined;
  let ruby: string | undefined;

  const contextOf = (extra?: string) => [title !== undefined ? `*${label}|${title}` : undefined, extra].filter(Boolean).join(" | ") || undefined;
  const push = (lineNo: number, endLine: number, txt: string, who: string | undefined, extra?: string) => {
    const n = (counter.get(label) ?? 0) + 1;
    counter.set(label, n);
    units.push({ label, index: n, line: lineNo, endLine, speaker: who, text: txt, context: contextOf(extra) });
  };
  const flushRuby = (lineNo: number) => {
    if (ruby === undefined) return;
    const r = ruby;
    ruby = undefined;
    raw(`{|${r}}`, lineNo); // a ruby with nothing after it: an empty base (reported as ruby.malformed)
  };
  const flush = () => {
    if (cur) flushRuby(cur.endLine);
    if (!cur) return;
    const t = cur.text.replace(/^[ \n]+|[ \n]+$/g, "");
    const shown = t.replace(/\[(?:[a-z]+)(?:\s[^\]]*)?\]/g, (m) => (/^\[emb\s/.test(m) ? m : "")).trim();
    if (shown) push(cur.line, cur.endLine, t, cur.speaker);
    cur = undefined;
  };
  const open = (lineNo: number) => {
    if (!cur) cur = { line: lineNo, endLine: lineNo, text: "", speaker, joinNext: false };
    cur.endLine = lineNo;
    return cur;
  };
  /** Appends markup (no separator logic, no ruby). */
  function raw(s: string, lineNo: number) {
    open(lineNo).text += s;
  }
  /** Appends visible text: joins with the previous source line, and wraps the first character in a pending ruby. */
  const textOut = (s: string, lineNo: number, markup = false) => {
    if (!s) return;
    if (!cur && !s.trim() && (markup || ruby === undefined)) return;
    const u = open(lineNo);
    if (u.joinNext) {
      u.joinNext = false;
      const last = u.text.slice(-1);
      if (u.text && last !== "\n" && last !== " " && !s.startsWith(" ") && !CJK.test(last) && !CJK.test(firstChar(s))) u.text += " ";
    }
    if (ruby !== undefined && !markup) {
      const c = firstChar(s);
      u.text += `{${c}|${ruby}}`;
      ruby = undefined;
      s = s.slice(c.length);
    }
    u.text += s;
  };

  const handleTag = (tag: KsTag, lineNo: number, inline: boolean): "stop" | void => {
    const { name, attrs } = tag;
    if (name !== "ruby") flushRuby(lineNo);
    if (name === "p" || CLEAR_TAGS.has(name)) return flush();
    if (name === "r") {
      if (cur) raw("\n", lineNo);
      return;
    }
    if (name === "ruby") {
      flushRuby(lineNo);
      ruby = attrs.text ?? "";
      return;
    }
    if (name === "emb") {
      const exp = attrs.exp ?? "";
      return textOut(exp.includes('"') ? `[emb exp='${exp}']` : `[emb exp="${exp}"]`, lineNo, true);
    }
    if (name === "ch" || name === "hch") return textOut(attrs.text ?? "", lineNo);
    if (KS_STYLE_TAGS.has(name)) {
      if (inline) raw(`[${tag.raw}]`, lineNo);
      return;
    }
    if (name === "iscript") {
      flush();
      mode = "script";
      scripts++;
      return "stop";
    }
    if (name === "macro") {
      mode = "macro";
      macros++;
      return;
    }
    if (name === "chara_new" && attrs.name && attrs.jname) {
      chara[attrs.name] = attrs.jname;
      return;
    }
    if (name === "chara_ptext") {
      flush();
      speaker = attrs.name ? chara[attrs.name] ?? attrs.name : undefined;
      return;
    }
    if (TEXT_ATTR_TAGS.has(name) && attrs.text?.trim()) {
      flush();
      push(lineNo, lineNo, attrs.text, undefined, `[${name}]`);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const rawLine = lines[i]!;
    const t = rawLine.replace(/^[\t ]+/, "");
    if (mode === "comment") {
      if (t.includes("*/")) mode = "text";
      continue;
    }
    if (mode === "script") {
      if (/^(?:\[endscript[\s\]]|@endscript\b)/.test(t)) mode = "text";
      continue;
    }
    let body = t;
    if (mode === "macro") {
      const end = /\[endmacro\s*\]|^@endmacro\b.*$/.exec(t);
      if (!end) continue;
      mode = "text";
      body = t.slice(end.index + end[0].length);
      if (!body.trim()) continue;
    }
    if (!body.trim()) continue;
    if (body.startsWith(";")) continue;
    if (body.startsWith("/*")) {
      if (!body.includes("*/", 2)) mode = "comment";
      continue;
    }
    if (body.startsWith("*")) {
      flush();
      const m = /^\*([^|\s]*)(?:\|(.*))?/.exec(body)!;
      label = m[1] || "(top)";
      title = m[2]?.trim() || undefined;
      speaker = undefined;
      continue;
    }
    if (body.startsWith("#")) {
      flush();
      const name = body.slice(1).split(":")[0]!.trim();
      speaker = name ? chara[name] ?? name : undefined;
      continue;
    }
    if (body.startsWith("@")) {
      handleTag(parseKsTag(body.slice(1)), lineNo, false);
      continue;
    }
    // A text line, possibly with inline tags. Tyrano: a leading `_` keeps the spaces after it.
    if (body.startsWith("_")) body = body.slice(1);
    if (cur) cur.joinNext = true;
    let p = 0;
    let buf = "";
    while (p < body.length) {
      if ((mode as Mode) === "macro") {
        const end = /\[endmacro\s*\]/.exec(body.slice(p));
        if (!end) break;
        p += end.index + end[0].length;
        mode = "text";
        continue;
      }
      const c = body[p]!;
      if (c === "[" && body[p + 1] === "[") {
        buf += "[[";
        p += 2;
        continue;
      }
      if (c !== "[") {
        buf += c;
        p++;
        continue;
      }
      const e = tagEnd(body, p);
      if (e < 0) {
        unclosed++;
        buf += body.slice(p);
        break;
      }
      textOut(buf, lineNo);
      buf = "";
      const tag = parseKsTag(body.slice(p + 1, e - 1));
      p = e;
      if (handleTag(tag, lineNo, true) === "stop") {
        p = body.length;
        break;
      }
    }
    textOut(buf, lineNo);
    flushRuby(lineNo);
  }
  flush();
  if (scripts) notes.push(`${file}: ${scripts} [iscript] block(s) skipped`);
  if (macros) notes.push(`${file}: ${macros} [macro] definition(s) skipped`);
  if (unclosed) notes.push(`${file}: ${unclosed} line(s) with a "[" that is never closed; read as text`);
  if (mode === "script" || mode === "macro") notes.push(`${file}: [${mode === "script" ? "iscript" : "macro"}] not closed before the end of the file`);
  return { units, notes };
}

/**
 * Parses a .ks scenario as a single-language table (text in `Row.source`). Language: a ja/en token in the path
 * (scenario/en/first.ks, first_en.ks), else the text.
 */
export function parseKs(text: string, file: string): { table: Table; notes: string[] } {
  const { units, notes } = parseKsUnits(text, file);
  const rows: Row[] = units.map((u) => ({
    file,
    line: u.line,
    id: `${u.label}#${u.index}`,
    source: u.text,
    target: "",
    speaker: u.speaker,
    context: u.context,
  }));
  if (!rows.length) notes.push(`${file}: no text found (KAG/TyranoScript scenario with no text lines)`);
  const lang = langFromName(file) ?? detectLang(rows.map((r) => r.source));
  return { table: { file, format: "ks", sourceLang: lang, targetLang: lang === "ja" ? "en" : "ja", rows, singleLang: lang }, notes };
}

const labelOf = (id: string) => id.slice(0, id.lastIndexOf("#"));

/**
 * Structure differences between two scenario files paired by `<label>#<n>`: labels whose unit counts differ (units
 * are still paired by position, so the ones after a split or merge may be misaligned) and labels on one side only.
 */
export function ksStructureNotes(src: Table, tgt: Table): string[] {
  const count = (t: Table) => {
    const m = new Map<string, number>();
    for (const r of t.rows) m.set(labelOf(r.id), (m.get(labelOf(r.id)) ?? 0) + 1);
    return m;
  };
  const a = count(src);
  const b = count(tgt);
  const differ = [...a].filter(([l, n]) => b.has(l) && b.get(l) !== n).map(([l, n]) => `*${l} (${n} / ${b.get(l)})`);
  const onlySrc = [...a.keys()].filter((l) => !b.has(l)).map((l) => `*${l}`);
  const onlyTgt = [...b.keys()].filter((l) => !a.has(l)).map((l) => `*${l}`);
  const notes: string[] = [];
  const list = (xs: string[]) => xs.slice(0, 5).join(", ") + (xs.length > 5 ? `, … (+${xs.length - 5})` : "");
  if (differ.length) {
    notes.push(
      `${src.file} ↔ ${tgt.file}: ${differ.length} label(s) have a different number of text units (${src.singleLang} / ${tgt.singleLang}): ${list(differ)}; ` +
        `units are paired by position within the label, so those after a split or merged page may be misaligned`,
    );
  }
  if (onlySrc.length) notes.push(`${src.file} ↔ ${tgt.file}: label(s) only in ${src.file}: ${list(onlySrc)}`);
  if (onlyTgt.length) notes.push(`${src.file} ↔ ${tgt.file}: label(s) only in ${tgt.file}: ${list(onlyTgt)}`);
  return notes;
}

/**
 * Pairing key of a scenario path with its language token removed entirely: first.ks, first_en.ks, ja/first.ks and
 * en/first.ks all give "first.ks", so an untagged original pairs with its `_en` copy. Used only after the usual
 * masked-name pairing (`pairKey`) found nothing.
 */
export function ksBareKey(maskedKey: string): string {
  return maskedKey
    .split("/")
    .filter((s) => s !== "*")
    .map((s) => s.replace(/[._\- ]\*(?=\.|$|[._\- ])/g, "").replace(/^\*[._\- ]/, ""))
    .join("/");
}

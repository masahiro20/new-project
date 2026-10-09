// Ren'Py translation files (game/tl/<language>/*.rpy) → bilingual table. Browser-safe, no dependencies.
//
//   # game/script.rpy:123
//   translate english start_a1b2c3d4:
//
//       # e "日本語のせりふ"          ← original (source), from the comment
//       e "English line"             ← translation (target); its line is the row's line
//
//   translate english strings:
//
//       # game/screens.rpy:45
//       old "開始"
//       new "Start"
//
// Dialogue rows: id = the block's label (`start_a1b2c3d4`, `#2`… for further statements in one block), speaker =
// the character variable (mapped to its display name when a script with `define e = Character("…")` is loaded
// alongside), context = the `# game/x.rpy:N` location (+ `voice: file`, `extend`). String rows: id =
// `strings:<hash of old>`, line = the `new` line. Strings keep `[var]` interpolation and `{b}` text tags as written.
import { otherLang } from "./lang.js";
import { detectLang } from "../text.js";
import type { Lang, Row, Table } from "../types.js";

const HEADER = /^translate\s+(\S+)\s+(.+?)\s*:\s*(?:#.*)?$/;
const LOCATION = /^#\s*(\S+\.rpym?:\d+)\s*$/;
/** Statements that are not dialogue (`voice` is read separately). */
const NOT_SAY = new Set([
  "nvl", "window", "pause", "play", "queue", "stop", "show", "hide", "scene", "with", "call", "jump", "return", "pass",
  "menu", "label", "define", "default", "image", "init", "python", "if", "elif", "else", "while", "for", "camera", "at",
  "transform", "screen", "style", "translate",
]);

export interface RenpyOptions {
  langs?: { source?: Lang; target?: Lang };
  /** Character variable → display name (from `define e = Character("…")`). */
  characters?: Record<string, string>;
}

/** True when the text has at least one `translate <language> <id>:` block. */
export function hasRenpyTranslations(text: string): boolean {
  return /^translate\s+\S+\s+\S.*:\s*(?:#.*)?$/m.test(text);
}

/** `define e = Character("アイリーン", …)` / `Character(_("…"))` → { e: "アイリーン" }. Dynamic names are skipped. */
export function renpyCharacters(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^\s*define\s+([A-Za-z_][\w.]*)\s*=\s*(?:Character|NVLCharacter|ADVCharacter)\s*\(\s*(?:_\(\s*)?(?:[rRuU]?)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gm;
  for (const m of text.matchAll(re)) {
    const name = unescape(m[2]!.slice(1, -1));
    if (name.trim()) out[m[1]!] = name;
  }
  return out;
}

/** Ren'Py string escapes: \" \' \\ \n (others kept as written). Runs of whitespace around a source line break collapse to one space. */
function unescape(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").replace(/\\(["'\\n])/g, (_, c: string) => (c === "n" ? "\n" : c));
}

/** Reads a string literal ("…", '…', """…""", '''…''') at `p`. Returns the unescaped value and the index after it. */
function readString(s: string, p: number): { value: string; end: number } | undefined {
  const q = s[p];
  if (q !== '"' && q !== "'" && q !== "`") return undefined;
  const triple = s.startsWith(q.repeat(3), p);
  const delim = triple ? q.repeat(3) : q;
  let e = p + delim.length;
  while (e < s.length) {
    if (s[e] === "\\") e += 2;
    else if (s.startsWith(delim, e)) return { value: unescape(s.slice(p + delim.length, e)), end: e + delim.length };
    else e++;
  }
  return undefined;
}

/**
 * A statement continues on the next line while a double-quoted string is open. An unclosed ' or ` is taken as an
 * apostrophe in a comment ("# don't…"), not a string that spans lines.
 */
function unterminated(s: string): boolean {
  let p = 0;
  while (p < s.length) {
    const c = s[p];
    if (c === "#") return false;
    if (c === '"' || c === "'" || c === "`") {
      const r = readString(s, p);
      if (!r) return c === '"';
      p = r.end;
    } else p++;
  }
  return false;
}

type Stmt = { kind: "say"; who?: string; whoIsName?: boolean; what: string } | { kind: "voice"; file: string } | { kind: "other" };

/** Classifies one Ren'Py statement: dialogue (`e "…"`, `e happy "…"`, `"…"`, `"Name" "…"`, `extend "…"`), `voice "…"`, or other. */
export function parseStatement(stmt: string): Stmt {
  const s = stmt.trim();
  if (!s || s.startsWith("$")) return { kind: "other" };
  const first = readString(s, 0);
  if (first) {
    const rest = s.slice(first.end).trimStart();
    const second = readString(rest, 0);
    return second ? { kind: "say", who: first.value, whoIsName: true, what: second.value } : { kind: "say", what: first.value };
  }
  const w = /^([A-Za-z_][\w.]*)/.exec(s);
  if (!w) return { kind: "other" };
  const word = w[1]!;
  if (word === "voice") {
    const v = readString(s.slice(word.length).trimStart(), 0);
    return v ? { kind: "voice", file: v.value } : { kind: "other" };
  }
  if (NOT_SAY.has(word)) return { kind: "other" };
  // who [attributes…] [@ attributes…] "what" [with …] [(args)] [id …]
  const q = /["'`]/.exec(s);
  if (!q) return { kind: "other" };
  const prefix = s.slice(0, q.index);
  if (!/^[A-Za-z_][\w.]*(?:\s+(?:@\s*)?-?[\w.]+|\s+@)*\s+$/.test(prefix)) return { kind: "other" };
  const what = readString(s, q.index);
  return what ? { kind: "say", who: word, what: what.value } : { kind: "other" };
}

/** 8 hex digits of FNV-1a over the UTF-16 code units: a stable id for a `strings` entry (its `old` text). */
function hash8(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

type Line = { n: number; text: string };

/** Groups body lines into statements (a string literal may continue onto the next lines). Comments stay one per line. */
function statements(body: Line[]): { line: number; comment: boolean; text: string }[] {
  const out: { line: number; comment: boolean; text: string }[] = [];
  for (let k = 0; k < body.length; k++) {
    const t = body[k]!.text.trim();
    if (!t) continue;
    const comment = t.startsWith("#");
    let text = comment ? t.slice(1).trim() : t;
    const line = body[k]!.n;
    while (unterminated(text) && k + 1 < body.length) {
      const next = body[k + 1]!.text.trim();
      if (comment !== next.startsWith("#")) break;
      k++;
      text += "\n" + (comment ? next.slice(1).trim() : next);
    }
    out.push({ line, comment, text });
  }
  return out;
}

/**
 * Parses a Ren'Py translation file. Direction: the source language is detected from the original (commented) lines,
 * so a Japanese game translated into English reads ja→en; `langs` overrides it.
 */
export function parseRenpy(text: string, file: string, opts: RenpyOptions = {}): { table: Table; notes: string[] } {
  if (!hasRenpyTranslations(text)) {
    throw new Error(
      `${file}: no "translate <language> <id>:" blocks found. Kotomark reads Ren'Py translation files (game/tl/<language>/*.rpy); ` +
        `a game script with define x = Character("…") can be loaded alongside them to name the speakers.`,
    );
  }
  const chars = opts.characters ?? {};
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  const rows: Row[] = [];
  const notes: string[] = [];
  const tlLangs = new Set<string>();
  const seenStrings = new Map<string, number>();
  let skipped = 0;
  let mismatched = 0;
  let pendingLoc: string[] = [];
  let lastSpeaker: string | undefined;

  const speakerOf = (st: { who?: string; whoIsName?: boolean }): string | undefined => {
    if (!st.who) return undefined;
    if (st.whoIsName) return st.who;
    if (st.who === "extend") return lastSpeaker;
    return chars[st.who] ?? st.who;
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (!t || /^\s/.test(raw)) {
      i++;
      continue;
    }
    if (t.startsWith("#")) {
      const loc = LOCATION.exec(t);
      if (loc) pendingLoc.push(loc[1]!);
      i++;
      continue;
    }
    const header = HEADER.exec(t);
    const body: Line[] = [];
    i++;
    while (i < lines.length && (!lines[i]!.trim() || /^\s/.test(lines[i]!))) {
      body.push({ n: i + 1, text: lines[i]! });
      i++;
    }
    const loc = pendingLoc;
    pendingLoc = [];
    if (!header) continue; // init python:, define … and other top-level statements
    const [, lang, id] = header as unknown as [string, string, string];
    tlLangs.add(lang);
    if (id === "python" || id.startsWith("style ")) {
      skipped++;
      continue;
    }

    if (id === "strings") {
      let locs: string[] = [];
      let old: { value: string; line: number; locs: string[] } | undefined;
      for (const st of statements(body)) {
        if (st.comment) {
          const l = LOCATION.exec("# " + st.text);
          if (l) locs.push(l[1]!);
          continue;
        }
        const kw = /^(old|new)\s+/.exec(st.text);
        const str = kw ? readString(st.text, kw[0].length) : undefined;
        if (!kw || !str) {
          notes.push(`${file}:${st.line}: unrecognised statement in a strings block, skipped`);
          continue;
        }
        if (kw[1] === "old") {
          if (old) rows.push({ file, line: old.line, id: `strings:${hash8(old.value)}`, source: old.value, target: "", context: old.locs.join(", ") || undefined });
          old = { value: str.value, line: st.line, locs };
          locs = [];
        } else {
          if (!old) throw new Error(`${file}:${st.line}: "new" without a preceding "old"`);
          let rid = `strings:${hash8(old.value)}`;
          const dup = seenStrings.get(rid) ?? 0;
          seenStrings.set(rid, dup + 1);
          if (dup) rid += `#${dup + 1}`;
          rows.push({ file, line: st.line, id: rid, source: old.value, target: str.value, context: old.locs.join(", ") || undefined });
          old = undefined;
        }
      }
      if (old) rows.push({ file, line: old.line, id: `strings:${hash8(old.value)}`, source: old.value, target: "", context: old.locs.join(", ") || undefined });
      continue;
    }

    // Dialogue block.
    type Say = { line: number; who?: string; whoIsName?: boolean; what: string };
    const originals: Say[] = [];
    const translations: Say[] = [];
    let voice: string | undefined;
    for (const st of statements(body)) {
      if (st.comment) {
        const l = LOCATION.exec("# " + st.text);
        if (l) {
          loc.push(l[1]!);
          continue;
        }
      }
      const s = parseStatement(st.text);
      if (s.kind === "voice") voice ??= s.file;
      else if (s.kind === "say") (st.comment ? originals : translations).push({ line: st.line, who: s.who, whoIsName: s.whoIsName, what: s.what });
    }
    if (!originals.length && !translations.length) continue;
    if (originals.length !== translations.length) mismatched++;
    const n = Math.max(originals.length, 1);
    for (let k = 0; k < n; k++) {
      const o = originals[k];
      // Extra translated statements (one line split in two) are joined into the last row.
      const tr = k === n - 1 ? translations.slice(k) : translations[k] ? [translations[k]!] : [];
      const extend = (o ?? tr[0])?.who === "extend";
      const speaker = speakerOf(o ?? tr[0] ?? {});
      const ctx = [loc.join(", ") || undefined, voice ? `voice: ${voice}` : undefined, extend ? "extend" : undefined].filter(Boolean).join(" | ");
      rows.push({
        file,
        line: tr[0]?.line ?? o!.line,
        id: k === 0 ? id : `${id}#${k + 1}`,
        source: o?.what ?? "",
        target: tr.map((x) => x.what).join("\n"),
        speaker,
        context: ctx || undefined,
      });
      if (!extend) lastSpeaker = speaker;
    }
  }

  if (skipped) notes.push(`${file}: ${skipped} translate python/style block(s) skipped (not dialogue)`);
  if (mismatched) notes.push(`${file}: ${mismatched} dialogue block(s) have a different number of original and translated lines; extra translated lines are joined into the block's last row`);
  const sourceLang = opts.langs?.source ?? detectLang(rows.map((r) => r.source));
  const targetLang = opts.langs?.target ?? otherLang(sourceLang);
  const named = [...tlLangs].map((l) => ({ l, lang: /^(english|en)$/i.test(l) ? "en" : /^(japanese|ja|jp)$/i.test(l) ? "ja" : undefined }));
  for (const x of named) if (x.lang && x.lang !== targetLang) notes.push(`${file}: translate ${x.l} blocks, but the original lines read as ${sourceLang}; checked as ${sourceLang}→${targetLang}`);
  return { table: { file, format: "renpy", sourceLang, targetLang, rows }, notes };
}

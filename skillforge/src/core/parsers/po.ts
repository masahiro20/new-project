// gettext .po / .pot (also the .po files exported by Unreal Engine's localization dashboard).
import { detectLang } from "../text.js";
import type { Lang, Row, Table } from "../types.js";
import { langOfCode, otherLang } from "./lang.js";
import { InputError } from "../errors.js";

interface Entry {
  line: number;
  ctxt?: string;
  id?: string;
  plural?: string;
  str: string[];
  extracted: string[];
  refs: string[];
  translator: string[];
  flags: string[];
  obsolete: boolean;
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", '"': '"', "\\": "\\", "'": "'", "?": "?" };

function unquote(lit: string, file: string, line: number): string {
  const m = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(lit.trim());
  if (!m) throw new InputError(`${file}:${line}: malformed PO string ${JSON.stringify(lit.trim().slice(0, 40))}`);
  return m[1]!.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_, e: string) => {
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ESCAPES[e] ?? e;
  });
}

/** Values of Wesnoth's `speaker=` that name a role, not a character. */
const GENERIC_SPEAKERS = new Set(["unit", "second_unit", "narrator"]);

/**
 * Speaker from an extracted comment: "Speaker: X", "話者: X", Unreal InfoMetaData `"Speaker" : "X"`,
 * Wesnoth `[message]: speaker=X` (generic roles and `$variables` are ignored).
 */
function speakerFrom(comments: string[]): string | undefined {
  for (const c of comments) {
    const m = /(?:^|\s|")(?:speaker|character|話者)"?\s*[:：]\s*"?([^"\n]+?)"?\s*$/i.exec(c);
    if (m) return m[1]!.trim();
    const w = /(?:^|[\s:])speaker=([^\n]+?)\s*$/.exec(c);
    if (w && !w[1]!.startsWith("$") && !GENERIC_SPEAKERS.has(w[1]!)) return w[1]!;
  }
  return undefined;
}

/**
 * msgctxt → id (fallback msgid), msgid → source, msgstr / msgstr[0] → target. Extracted (`#.`), translator (`# `)
 * comments, references (`#:`), the fuzzy flag and other plural forms go into `context`; `#, fuzzy` also sets
 * `row.fuzzy`. The header entry and obsolete (`#~`) entries are skipped. When the target language has a single
 * plural form (`nplurals=1`, e.g. Japanese) or only `msgstr[0]` exists, that row's source is `msgid_plural`
 * ("{num} colors"), the form whose placeholders the translation carries. `line` is the line of msgctxt (or msgid when there is no context).
 */
export function parsePo(text: string, file: string, opts: { langs?: { source?: Lang; target?: Lang } } = {}): Table {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[0]?.charCodeAt(0) === 0xfeff) lines[0] = lines[0].slice(1);
  const entries: Entry[] = [];
  const fresh = (): Entry => ({ line: 0, str: [], extracted: [], refs: [], translator: [], flags: [], obsolete: false });
  let cur = fresh();
  let field: { kind: "ctxt" | "id" | "plural" | "str"; index: number } | undefined;
  let header: string | undefined;
  const flush = () => {
    if (cur.id !== undefined && !cur.obsolete) {
      if (cur.id === "" && cur.ctxt === undefined) header ??= cur.str[0] ?? "";
      else entries.push(cur);
    }
    cur = fresh();
    field = undefined;
  };

  lines.forEach((raw, i) => {
    const ln = i + 1;
    const l = raw.trim();
    if (!l) {
      flush();
      return;
    }
    if (l.startsWith("#")) {
      // A comment after a complete entry starts the next one.
      if (cur.id !== undefined && cur.str.length) flush();
      if (l.startsWith("#~")) cur.obsolete = true;
      else if (l.startsWith("#.")) cur.extracted.push(l.slice(2).trim());
      else if (l.startsWith("#:")) cur.refs.push(...l.slice(2).trim().split(/\s+/).filter(Boolean));
      else if (l.startsWith("#,")) cur.flags.push(...l.slice(2).split(",").map((f) => f.trim()).filter(Boolean));
      else if (l.startsWith("#|")) {
        /* previous msgid: ignored */
      } else cur.translator.push(l.slice(1).trim());
      return;
    }
    if (l.startsWith('"')) {
      if (!field) throw new InputError(`${file}:${ln}: string continuation without a keyword`);
      const s = unquote(l, file, ln);
      if (field.kind === "ctxt") cur.ctxt += s;
      else if (field.kind === "id") cur.id += s;
      else if (field.kind === "plural") cur.plural += s;
      else cur.str[field.index] = (cur.str[field.index] ?? "") + s;
      return;
    }
    const m = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+(".*)$/.exec(l);
    if (!m) throw new InputError(`${file}:${ln}: unexpected line in PO file: ${JSON.stringify(l.slice(0, 40))}`);
    const kw = m[1]!;
    const val = unquote(m[3]!, file, ln);
    if ((kw === "msgctxt" || kw === "msgid") && cur.id !== undefined && cur.str.length) flush();
    if (kw === "msgctxt") {
      cur.ctxt = val;
      cur.line ||= ln;
      field = { kind: "ctxt", index: 0 };
    } else if (kw === "msgid") {
      cur.id = val;
      cur.line ||= ln;
      field = { kind: "id", index: 0 };
    } else if (kw === "msgid_plural") {
      cur.plural = val;
      field = { kind: "plural", index: 0 };
    } else {
      if (cur.id === undefined) throw new InputError(`${file}:${ln}: msgstr without msgid`);
      const index = m[2] ? Number(m[2]) : 0;
      cur.str[index] = val;
      field = { kind: "str", index };
    }
  });
  flush();

  if (!entries.length) throw new InputError(`${file}: no PO entries found (only a header, or not a gettext file)`);

  const nplurals = Number(/^Plural-Forms:[^\n]*?nplurals\s*=\s*(\d+)/m.exec(header ?? "")?.[1] ?? NaN);
  const rows: Row[] = [];
  for (const e of entries) {
    const id = e.ctxt !== undefined && e.ctxt !== "" ? e.ctxt : e.id!;
    const ctx: string[] = [...e.extracted, ...e.translator];
    if (e.refs.length) ctx.push(`ref: ${e.refs.join(" ")}`);
    const fuzzy = e.flags.includes("fuzzy");
    if (fuzzy) ctx.push("fuzzy");
    // One plural form: msgstr[0] translates every count, so compare it with the plural source.
    const singleForm = e.plural !== undefined && (nplurals === 1 || e.str.length <= 1);
    if (e.plural !== undefined) ctx.push(singleForm ? `singular: ${e.id}` : `plural: ${e.plural}`);
    const base: Row = {
      file,
      line: e.line,
      id,
      source: singleForm ? e.plural! : e.id!,
      target: e.str[0] ?? "",
      speaker: speakerFrom(e.extracted),
      context: ctx.join(" | ") || undefined,
    };
    if (fuzzy) base.fuzzy = true;
    rows.push(base);
    // Further plural forms are checked as their own rows (msgid_plural ↔ msgstr[n]).
    if (e.plural !== undefined) {
      for (let n = 1; n < e.str.length; n++) {
        if (e.str[n] === undefined) continue;
        rows.push({ ...base, id: `${id}[${n}]`, source: e.plural, target: e.str[n]!, context: [...ctx.filter((c) => !c.startsWith("plural:")), `plural form ${n}`].join(" | ") });
      }
    }
  }

  const headerLang = langOfCode(/^Language:\s*([^\n\\]+)/m.exec(header ?? "")?.[1]);
  const detected = detectLang(rows.map((r) => r.source));
  const sourceLang = opts.langs?.source ?? (opts.langs?.target ? otherLang(opts.langs.target) : detected);
  const targetLang = opts.langs?.target ?? (headerLang && headerLang !== sourceLang ? headerLang : otherLang(sourceLang));
  return { file, format: "po", sourceLang, targetLang, rows };
}

// Multi-file loading: detect + decode + parse each input, then pair single-language tables (ja.json + en.json,
// ui_ja.csv + ui_en.csv, Unreal string tables) by key into bilingual tables. Browser-safe.
import { parseTableWithNotes, type Format, type ParseOptions } from "./parsers/index.js";
import { langFromName, otherLang, pairKey } from "./parsers/lang.js";
import type { ColumnMap } from "./parsers/columns.js";
import type { Lang, Row, Table } from "./types.js";

export interface InputFile {
  /** File name or path, used for format detection, pairing and `file:line` references. */
  name: string;
  /** Text, or raw bytes (UTF-8 / UTF-16 with BOM; .xlsx must be bytes). */
  data: string | Uint8Array;
  /** Per-file format override (wins over `LoadOptions.format`). */
  format?: Format;
}

export interface LoadOptions {
  /** Force one format for every file (default: detect per file from extension + content). */
  format?: Format;
  columns?: ColumnMap;
  /**
   * Bilingual files: language overrides as in `parseTable`. Pairing: `source` picks which language's file becomes
   * the source side (default "ja").
   */
  langs?: { source?: Lang; target?: Lang };
  /** XLSX: sheet name or 1-based sheet number (default: first sheet with any text). */
  sheet?: string | number;
  /** When given, a file that fails to parse is reported here and skipped instead of throwing. */
  onError?: (file: string, error: Error) => void;
}

export interface LoadResult {
  tables: Table[];
  /** Human-readable notes: pairing decisions, missing keys, sheet choice, encoding fallbacks. */
  notes: string[];
}

const MAX_LISTED = 5;
const list = (ids: string[]) => ids.slice(0, MAX_LISTED).join(", ") + (ids.length > MAX_LISTED ? `, … (+${ids.length - MAX_LISTED})` : "");

function withFile(e: unknown, name: string): Error {
  const msg = e instanceof Error ? e.message : String(e);
  return new Error(msg.startsWith(name) ? msg : `${name}: ${msg}`);
}

/** "locales/ja/ui.json" + "locales/en/ui.json" → "locales/ja/ui.json+en/ui.json"; "ja.json" + "en.json" → "ja.json+en.json". */
export function pairLabel(a: string, b: string): string {
  const pa = a.split("/");
  const pb = b.split("/");
  let i = 0;
  while (i < pa.length - 1 && i < pb.length - 1 && pa[i] === pb[i]) i++;
  return `${a}+${pb.slice(i).join("/")}`;
}

/** Joins a source-language table and a target-language table by row id. Rows missing on one side keep that side empty. */
export function pairTables(src: Table, tgt: Table): { table: Table; missingInTarget: string[]; onlyInTarget: string[] } {
  const file = pairLabel(src.file, tgt.file);
  const byId = new Map<string, Row[]>();
  for (const r of tgt.rows) {
    const q = byId.get(r.id);
    if (q) q.push(r);
    else byId.set(r.id, [r]);
  }
  const rows: Row[] = [];
  const missingInTarget: string[] = [];
  for (const s of src.rows) {
    const t = byId.get(s.id)?.shift();
    if (!t) missingInTarget.push(s.id);
    const ctx = [s.context, t?.context && t.context !== s.context ? t.context : undefined, t ? undefined : `missing in ${tgt.file}`].filter(Boolean);
    rows.push({
      file,
      line: s.line,
      id: s.id,
      source: s.source,
      target: t?.source ?? "",
      speaker: s.speaker ?? t?.speaker,
      addressee: s.addressee ?? t?.addressee,
      context: ctx.join(" | ") || undefined,
      maxLength: s.maxLength ?? t?.maxLength,
    });
  }
  const onlyInTarget: string[] = [];
  for (const t of tgt.rows) {
    const q = byId.get(t.id);
    if (!q || !q.includes(t)) continue;
    onlyInTarget.push(t.id);
    // Line refers to the target file here; the context says so.
    rows.push({ ...t, file, source: "", target: t.source, context: [t.context, `only in ${tgt.file}:${t.line}`].filter(Boolean).join(" | ") });
  }
  const table: Table = { file, format: src.format, sourceLang: src.singleLang!, targetLang: tgt.singleLang!, rows };
  return { table, missingInTarget, onlyInTarget };
}

/**
 * Loads script files of any supported format and returns tables ready for `runChecks`.
 * Single-language tables (per-locale JSON, Unreal string table CSV, a CSV/XLSX with one text column) are paired
 * ja ↔ en by key: by matching names (`ui_ja.csv` ↔ `ui_en.csv`, `locales/ja/x.json` ↔ `locales/en/x.json`), or,
 * when exactly one of each is left, with each other. Unpaired ones are still checked alone (source-side rules).
 * Throws on bad input (message starts with the file name) unless `onError` is given.
 */
export function loadInputs(files: InputFile[], opts: LoadOptions = {}): LoadResult {
  const notes: string[] = [];
  const parsed: { input: InputFile; table: Table }[] = [];
  const parseOpts: ParseOptions = { columns: opts.columns, langs: opts.langs, sheet: opts.sheet };
  for (const input of files) {
    try {
      const r = parseTableWithNotes(input.data, input.name, { ...parseOpts, format: input.format ?? opts.format });
      notes.push(...r.notes);
      parsed.push({ input, table: r.table });
      const t = r.table;
      if (!t.singleLang && t.rows.length) {
        const empty = t.rows.filter((row) => !row.target.trim()).length;
        if (empty === t.rows.length) notes.push(`${t.file}: no translations yet (all ${empty} targets empty); only source-side checks apply`);
        else if (empty) notes.push(`${t.file}: ${empty} of ${t.rows.length} rows have an empty target (untranslated)`);
      }
    } catch (e) {
      const err = withFile(e, input.name);
      if (!opts.onError) throw err;
      opts.onError(input.name, err);
    }
  }

  const srcLang: Lang = opts.langs?.source ?? "ja";
  const tgtLang = otherLang(srcLang);
  const singles = parsed.filter((p) => p.table.singleLang);
  const nameLangMismatch = singles.filter((p) => {
    const named = langFromName(p.input.name);
    return named && named !== p.table.singleLang;
  });
  for (const p of nameLangMismatch) notes.push(`${p.table.file}: name suggests ${langFromName(p.input.name)} but its column/locale header says ${p.table.singleLang}; treated as ${p.table.singleLang}`);

  const srcs = singles.filter((p) => p.table.singleLang === srcLang);
  const tgts = singles.filter((p) => p.table.singleLang === tgtLang);
  const pairs: [typeof srcs[number], typeof tgts[number], string][] = [];
  const used = new Set<object>();
  // 1) Same name once the language tokens are masked.
  for (const s of srcs) {
    const k = pairKey(s.input.name);
    const sameKeySrc = srcs.filter((x) => pairKey(x.input.name) === k);
    const cands = tgts.filter((t) => !used.has(t) && pairKey(t.input.name) === k);
    if (sameKeySrc.length === 1 && cands.length === 1) {
      pairs.push([s, cands[0]!, "matching names"]);
      used.add(s).add(cands[0]!);
    }
  }
  // 2) Exactly one of each left: pair them.
  const restS = srcs.filter((s) => !used.has(s));
  const restT = tgts.filter((t) => !used.has(t));
  if (restS.length === 1 && restT.length === 1) {
    pairs.push([restS[0]!, restT[0]!, "the only two single-language files"]);
    used.add(restS[0]!).add(restT[0]!);
  }

  const replaced = new Map<Table, Table | null>();
  for (const [s, t, why] of pairs) {
    const { table, missingInTarget, onlyInTarget } = pairTables(s.table, t.table);
    replaced.set(s.table, table);
    replaced.set(t.table, null);
    let note = `Paired ${s.table.file} (${srcLang}, ${s.table.rows.length} keys) with ${t.table.file} (${tgtLang}, ${t.table.rows.length} keys) by key (${why}) → ${table.file}`;
    if (missingInTarget.length) note += `; ${missingInTarget.length} missing in ${t.table.file}: ${list(missingInTarget)}`;
    if (onlyInTarget.length) note += `; ${onlyInTarget.length} only in ${t.table.file}: ${list(onlyInTarget)}`;
    notes.push(note);
  }
  for (const p of singles) {
    if (used.has(p)) continue;
    const lang = p.table.singleLang!;
    const why = srcs.length + tgts.length > 1 && (lang === srcLang ? restT.length : restS.length) ? "could not tell which file it pairs with (name the files like ui_ja.csv / ui_en.csv)" : `no ${otherLang(lang)} counterpart`;
    notes.push(`${p.table.file}: single-language (${lang}), ${why}; checked alone (${lang === srcLang ? "source-side rules only" : "as source text"})`);
  }

  const tables: Table[] = [];
  for (const p of parsed) {
    const r = replaced.get(p.table);
    if (r === null) continue;
    tables.push(r ?? p.table);
  }
  return { tables, notes };
}

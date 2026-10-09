// Multi-file loading: detect + decode + parse each input, then pair single-language tables (ja.json + en.json,
// ui_ja.csv + ui_en.csv, Unreal string tables) by key into bilingual tables. Browser-safe.
import { detectFormat, parseTableWithNotes, type Format, type ParseOptions } from "./parsers/index.js";
import { decodeText, stripBom } from "./parsers/decode.js";
import { hasRenpyTranslations, renpyCharacters } from "./parsers/renpy.js";
import { langFromName, otherLang, pairKey } from "./parsers/lang.js";
import { ksBareKey, ksStructureNotes } from "./parsers/ks.js";
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
   * the source side (default: decided per pair by `pairDirection`).
   */
  langs?: { source?: Lang; target?: Lang };
  /** Pairing only: which language's file of a ja/en pair is the source (wins over `langs.source`; bilingual files unaffected). */
  pairSource?: Lang;
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

/** CLDR plural suffix of a key (`items.one`, `items_other`, i18next `item_plural`): [base, form], or undefined. */
const PLURAL_KEY = /^(.*?)([._])(zero|one|two|few|many|other|plural)$/;
function pluralSiblings(id: string): string[] | undefined {
  const m = PLURAL_KEY.exec(id);
  if (!m || !m[1]) return undefined;
  const [, stem, sep, form] = m;
  // i18next v3: "item" is the singular, "item_plural" the plural; CLDR style: the `other` form is always present.
  if (form === "plural") return [stem!];
  return form === "other" ? [] : [`${stem}${sep}other`];
}

/**
 * Joins a source-language table and a target-language table by row id. Rows missing on one side keep that side empty
 * and are marked (`Row.missing`). A plural variant key (`.one`, `_few` …) absent from the Japanese file is marked
 * `pluralVariant` when its `other` sibling exists (Japanese has one plural form, so only `other` is needed).
 */
export function pairTables(src: Table, tgt: Table): { table: Table; missingInTarget: string[]; onlyInTarget: string[]; pluralSkipped: string[] } {
  const file = pairLabel(src.file, tgt.file);
  const byId = new Map<string, Row[]>();
  for (const r of tgt.rows) {
    const q = byId.get(r.id);
    if (q) q.push(r);
    else byId.set(r.id, [r]);
  }
  const srcIds = new Set(src.rows.map((r) => r.id));
  const tgtIds = new Set(tgt.rows.map((r) => r.id));
  const pluralSkipped: string[] = [];
  /**
   * `id` is absent from the Japanese file only because Japanese needs no such plural form: its `other` sibling is in
   * the Japanese file, or in the other file (then that sibling is the one reported, so a missing plural counts once).
   */
  const legitPlural = (id: string, jaIds: Set<string>, otherIds: Set<string>) => {
    const sib = pluralSiblings(id);
    const ok = !!sib && sib.length > 0 && sib.every((x) => jaIds.has(x) || otherIds.has(x));
    if (ok) pluralSkipped.push(id);
    return ok;
  };
  const rows: Row[] = [];
  const missingInTarget: string[] = [];
  // Scenario files (.ks): the translation is a file of its own that the user edits, so a paired row points at the
  // translated text (file + line, like Ren'Py's tl files) and names the original's line in the context.
  const ks = src.format === "ks" && tgt.format === "ks";
  for (const s of src.rows) {
    const t = byId.get(s.id)?.shift();
    if (!t) missingInTarget.push(s.id);
    const ctx = [
      s.context, t?.context && t.context !== s.context ? t.context : undefined, t ? undefined : `missing in ${tgt.file}`,
      ks && t ? `${src.singleLang}: ${s.file}:${s.line}` : undefined,
    ].filter(Boolean);
    const row: Row = {
      file: ks ? (t ?? s).file : file,
      line: ks && t ? t.line : s.line,
      id: s.id,
      source: s.source,
      target: t?.source ?? "",
      speaker: s.speaker ?? t?.speaker,
      addressee: s.addressee ?? t?.addressee,
      context: ctx.join(" | ") || undefined,
      maxLength: s.maxLength ?? t?.maxLength,
    };
    if (!t) {
      row.missing = "target";
      if (tgt.singleLang === "ja" && legitPlural(s.id, tgtIds, srcIds)) row.pluralVariant = true;
    }
    rows.push(row);
  }
  const onlyInTarget: string[] = [];
  for (const t of tgt.rows) {
    const q = byId.get(t.id);
    if (!q || !q.includes(t)) continue;
    onlyInTarget.push(t.id);
    // Line refers to the target file here; the context says so.
    const row: Row = { ...t, file: ks ? t.file : file, source: "", target: t.source, missing: "source", context: [t.context, `only in ${tgt.file}:${t.line}`].filter(Boolean).join(" | ") };
    if (src.singleLang === "ja" && legitPlural(t.id, srcIds, tgtIds)) row.pluralVariant = true;
    rows.push(row);
  }
  const table: Table = { file, format: src.format, sourceLang: src.singleLang!, targetLang: tgt.singleLang!, rows };
  return { table, missingInTarget, onlyInTarget, pluralSkipped };
}

/** A path segment or name token that marks the reference file of a locale set (base.json, default/en.yml, source_en.csv). */
const BASE_NAME = /(?:^|[/\\._\- ])(?:base|default|source|master|template|original|reference)(?=$|[/\\._\- ])/i;

/**
 * Which file of a ja/en pair is the source, with the reason (written into the pairing note):
 * 1. `forced` (the `langs.source` / `pairSource` option);
 * 2. the key sets: localisation tools copy every key into the source file first, so the file that has keys the other
 *    lacks (at least twice as many as the other way round) is the source — en.yml with keys absent from ja.yml (an
 *    OSS app translated into Japanese) or a ja script whose en file lags behind (a Japanese game);
 * 3. a name marking one file as the reference (base / default / source / template …);
 * 4. otherwise Japanese (Kotomark's default: a Japanese original), with a hint to force it.
 */
export function pairDirection(ja: Table, en: Table, forced?: Lang): { source: Lang; why: string } {
  if (forced) return { source: forced, why: `source language ${forced} as requested` };
  const jaIds = new Set(ja.rows.map((r) => r.id));
  const enIds = new Set(en.rows.map((r) => r.id));
  const onlyJa = [...jaIds].filter((id) => !enIds.has(id)).length;
  const onlyEn = [...enIds].filter((id) => !jaIds.has(id)).length;
  const counts = `${onlyEn} key(s) only in en, ${onlyJa} only in ja`;
  if (onlyEn > 0 && onlyEn >= 2 * onlyJa) return { source: "en", why: `en is the source: it has keys the ja file lacks (${counts}), so ja is the translation` };
  if (onlyJa > 0 && onlyJa >= 2 * onlyEn) return { source: "ja", why: `ja is the source: it has keys the en file lacks (${counts}), so en is the translation` };
  const jaBase = BASE_NAME.test(ja.file);
  const enBase = BASE_NAME.test(en.file);
  if (enBase !== jaBase) {
    const l: Lang = enBase ? "en" : "ja";
    return { source: l, why: `${l} is the source: its file name marks it as the base/default file` };
  }
  return { source: "ja", why: `key sets do not tell (${counts}); ja taken as the source (default; use --source-lang en if English is the original)` };
}

/**
 * Loads script files of any supported format and returns tables ready for `runChecks`.
 * Single-language tables (per-locale JSON, Unreal string table CSV, a CSV/XLSX with one text column) are paired
 * ja ↔ en by key: by matching names (`ui_ja.csv` ↔ `ui_en.csv`, `locales/ja/x.json` ↔ `locales/en/x.json`), or,
 * when exactly one of each is left, with each other. Each pair's direction comes from `pairDirection`. Unpaired ones are still checked alone (source-side rules).
 * Throws on bad input (message starts with the file name) unless `onError` is given.
 */
export function loadInputs(files: InputFile[], opts: LoadOptions = {}): LoadResult {
  const notes: string[] = [];
  const parsed: { input: InputFile; table: Table }[] = [];
  // Ren'Py: game scripts (no `translate` blocks) are not tables; their `define e = Character("…")` lines name the
  // speakers of the translation files (game/tl/<lang>/*.rpy) loaded alongside.
  const characters: Record<string, string> = {};
  const renpyScripts = new Set<InputFile>();
  const plainScripts: string[] = [];
  for (const input of files) {
    if ((input.format ?? opts.format ?? detectFormat(input.name, input.data)) !== "renpy") continue;
    let text: string;
    try {
      text = typeof input.data === "string" ? stripBom(input.data) : decodeText(input.data, input.name).text;
    } catch {
      continue; // reported by the main loop
    }
    if (hasRenpyTranslations(text)) continue;
    renpyScripts.add(input);
    const found = renpyCharacters(text);
    const n = Object.keys(found).length;
    for (const [k, v] of Object.entries(found)) characters[k] ??= v;
    if (n) notes.push(`${input.name}: Ren'Py game script (no translate blocks); read ${n} character name(s) for speakers: ${list(Object.entries(found).map(([k, v]) => `${k}=${v}`))}`);
    else plainScripts.push(input.name);
  }
  if (plainScripts.length) notes.push(`Skipped ${plainScripts.length} Ren'Py file(s) without translate blocks or character defines: ${list(plainScripts)}`);
  const parseOpts: ParseOptions = { columns: opts.columns, langs: opts.langs, sheet: opts.sheet, renpyCharacters: characters };
  for (const input of files) {
    if (renpyScripts.has(input)) continue;
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

  const forced: Lang | undefined = opts.pairSource ?? opts.langs?.source;
  const singles = parsed.filter((p) => p.table.singleLang);
  const nameLangMismatch = singles.filter((p) => {
    const named = langFromName(p.input.name);
    return named && named !== p.table.singleLang;
  });
  for (const p of nameLangMismatch) notes.push(`${p.table.file}: name suggests ${langFromName(p.input.name)} but its column/locale header says ${p.table.singleLang}; treated as ${p.table.singleLang}`);

  const jas = singles.filter((p) => p.table.singleLang === "ja");
  const ens = singles.filter((p) => p.table.singleLang === "en");
  const pairs: [typeof jas[number], typeof ens[number], string][] = [];
  const used = new Set<object>();
  // 1) Same name once the language tokens are masked.
  for (const j of jas) {
    const k = pairKey(j.input.name);
    const sameKeyJa = jas.filter((x) => pairKey(x.input.name) === k);
    const cands = ens.filter((e) => !used.has(e) && pairKey(e.input.name) === k);
    if (sameKeyJa.length === 1 && cands.length === 1) {
      pairs.push([j, cands[0]!, "matching names"]);
      used.add(j).add(cands[0]!);
    }
  }
  // 1b) Scenario files (.ks): an original without a language token pairs with its tagged copy (first.ks ↔ first_en.ks,
  // scenario/first.ks ↔ scenario/en/first.ks) when the names agree once the token is removed.
  for (const j of jas) {
    if (used.has(j) || j.table.format !== "ks") continue;
    const k = ksBareKey(pairKey(j.input.name));
    const sameJa = jas.filter((x) => !used.has(x) && x.table.format === "ks" && ksBareKey(pairKey(x.input.name)) === k);
    const cands = ens.filter((e) => !used.has(e) && e.table.format === "ks" && ksBareKey(pairKey(e.input.name)) === k);
    if (sameJa.length === 1 && cands.length === 1) {
      pairs.push([j, cands[0]!, "matching names"]);
      used.add(j).add(cands[0]!);
    }
  }
  // 2) Exactly one of each left: pair them.
  const restJa = jas.filter((s) => !used.has(s));
  const restEn = ens.filter((t) => !used.has(t));
  if (restJa.length === 1 && restEn.length === 1) {
    pairs.push([restJa[0]!, restEn[0]!, "the only two single-language files"]);
    used.add(restJa[0]!).add(restEn[0]!);
  }

  const replaced = new Map<Table, Table | null>();
  for (const [j, e, why] of pairs) {
    const dir = pairDirection(j.table, e.table, forced);
    const [s, t] = dir.source === "ja" ? [j, e] : [e, j];
    const { table, missingInTarget, onlyInTarget, pluralSkipped } = pairTables(s.table, t.table);
    replaced.set(s.table, table);
    replaced.set(t.table, null);
    let note = `Paired ${s.table.file} (${s.table.singleLang}, ${s.table.rows.length} keys) with ${t.table.file} (${t.table.singleLang}, ${t.table.rows.length} keys) by key (${why}) → ${table.file}`;
    if (missingInTarget.length) note += `; ${missingInTarget.length} missing in ${t.table.file}: ${list(missingInTarget)}`;
    if (onlyInTarget.length) note += `; ${onlyInTarget.length} only in ${t.table.file}: ${list(onlyInTarget)}`;
    note += `; direction ${s.table.singleLang}→${t.table.singleLang} (${dir.why})`;
    if (pluralSkipped.length) note += `; ${pluralSkipped.length} plural variant key(s) absent from the Japanese file not reported (Japanese has one plural form): ${list(pluralSkipped)}`;
    notes.push(note);
    if (table.format === "ks") notes.push(...ksStructureNotes(s.table, t.table));
  }
  for (const p of singles) {
    if (used.has(p)) continue;
    const lang = p.table.singleLang!;
    const why = jas.length + ens.length > 1 && (lang === "ja" ? restEn.length : restJa.length) ? "could not tell which file it pairs with (name the files like ui_ja.csv / ui_en.csv)" : `no ${otherLang(lang)} counterpart`;
    const asSource = forced ? lang === forced : lang === "ja";
    notes.push(`${p.table.file}: single-language (${lang}), ${why}; checked alone (${asSource ? "source-side rules only" : "as source text"})`);
  }

  const tables: Table[] = [];
  for (const p of parsed) {
    const r = replaced.get(p.table);
    if (r === null) continue;
    tables.push(r ?? p.table);
  }
  return { tables, notes };
}

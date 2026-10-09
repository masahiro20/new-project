// Header-row tables shared by CSV/TSV and XLSX: bilingual sheets, Unity Localization string table exports,
// Unreal string table CSVs and other single-language sheets.
import { detectLang } from "../text.js";
import type { Lang, Row, Table, TableFormat } from "../types.js";
import { finishTable, headerList, recordToRow, resolveColumns, resolveSingleColumn, singleTable, type ColumnMap } from "./columns.js";
import { langFromName, langOfHeader } from "./lang.js";
import { InputError, inputErrorWithFile } from "../errors.js";

export interface GridRecord {
  /** User-facing line: physical line for CSV, spreadsheet row number for XLSX. */
  line: number;
  cells: string[];
}

export interface GridOptions {
  columns?: ColumnMap;
  langs?: { source?: Lang; target?: Lang };
  /** Forced flavor, e.g. "unity-csv" or "unreal-csv". */
  format?: string;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

/** Unreal string table CSV escapes (\n, \t, \", \\) in Key/SourceString. */
const unrealUnescape = (s: string) =>
  s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));

export function tableFromGrid(records: GridRecord[], file: string, baseFormat: "csv" | "tsv" | "xlsx", opts: GridOptions = {}): Table {
  const header = records[0];
  if (!header) throw new InputError(`${file}: empty ${baseFormat === "xlsx" ? "sheet" : "file"} (no header row)`);
  const headers = header.cells.map((h) => h.trim());
  const body = records.slice(1);
  const normed = headers.map(norm);
  const unreal = opts.format === "unreal-csv" || (normed.includes("key") && normed.includes("sourcestring"));
  const unity = !unreal && (opts.format === "unity-csv" || normed.includes("shared_comments") || headers.some((h) => /\([a-z]{2,3}(?:[-_][A-Za-z0-9]+)*\)\s*$/i.test(h) && langOfHeader(h)));
  const format: TableFormat = baseFormat === "xlsx" ? "xlsx" : unreal ? "unreal-csv" : unity ? "unity-csv" : baseFormat;
  const override: ColumnMap = { ...opts.columns };
  // Unity exports carry both "Key" (the name) and "Id" (a number): the key is the useful id.
  if (unity && !override.id) {
    const key = headers.find((h) => norm(h) === "key");
    if (key) override.id = key;
  }
  const toRecord = (r: GridRecord) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, j) => (rec[h] = r.cells[j] ?? ""));
    return rec;
  };

  let cols: ReturnType<typeof resolveColumns> | undefined;
  let error: unknown;
  if (!unreal) {
    try {
      cols = resolveColumns(headers, override);
    } catch (e) {
      error = e;
    }
  }
  if (cols) {
    const rows = body.map((r, idx) => recordToRow(toRecord(r), cols!, file, r.line, `row${idx + 1}`));
    return finishTable(file, format, rows, cols, opts.langs);
  }

  const single = resolveSingleColumn(headers, override);
  if (!single) throw error instanceof Error ? inputErrorWithFile(error, file) : new InputError(`${file}: could not find a text column in [${headerList(headers)}]`);
  const rows: Row[] = body.map((r, idx) => {
    const row = recordToRow(toRecord(r), { ...single, target: undefined }, file, r.line, `row${idx + 1}`);
    if (unreal) {
      row.id = unrealUnescape(row.id);
      row.source = unrealUnescape(row.source);
    }
    return row;
  });
  // Unreal string tables have no speaker column; a "Speaker: X" comment is a common convention.
  for (const row of rows) {
    if (row.speaker || !row.context) continue;
    const m = /^\s*(?:speaker|character|話者)\s*[:：]\s*(.+?)\s*$/im.exec(row.context);
    if (m) row.speaker = m[1];
  }
  const lang = langOfHeader(single.source) ?? langFromName(file) ?? detectLang(rows.map((r) => r.source));
  return singleTable(file, format, rows, lang);
}

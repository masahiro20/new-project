import { strFromU8 } from "fflate";
import { parseCsv } from "./csv.js";
import { decodeText, stripBom } from "./decode.js";
import { parseJson } from "./json.js";
import { parsePo } from "./po.js";
import { isZip, parseXlsx } from "./xlsx.js";
import { parseXliff } from "./xliff.js";
import type { ColumnMap } from "./columns.js";
import type { Lang, Table, TableFormat } from "../types.js";

/**
 * Input format. "csv" and "json" also recognise their flavours by content (Unity/Unreal string table CSVs,
 * per-locale i18n JSON); the specific names force one.
 */
export type Format = TableFormat;
export type { ColumnMap };

export interface ParseOptions {
  format?: Format;
  columns?: ColumnMap;
  langs?: { source?: Lang; target?: Lang };
  /** XLSX only: sheet name or 1-based sheet number. Default: first sheet with any text. */
  sheet?: string | number;
}

const PO_START = /^(?:msgctxt|msgid)\s+"/;

function looksLikePo(text: string): boolean {
  for (const raw of text.split(/\r?\n/, 200)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    return PO_START.test(l);
  }
  return false;
}

export function detectFormat(file: string, text: string | Uint8Array): Format {
  const f = file.toLowerCase().split("#")[0]!;
  if (f.endsWith(".xlsx") || f.endsWith(".xlsm")) return "xlsx";
  if (f.endsWith(".po") || f.endsWith(".pot")) return "po";
  if (f.endsWith(".xlf") || f.endsWith(".xliff")) return "xliff";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".tsv")) return "tsv";
  if (f.endsWith(".csv")) return "csv";
  if (typeof text !== "string") {
    if (isZip(text)) return "xlsx";
    // Sniff the first bytes as Latin-1: the markers we look for are ASCII. UTF-16 is decoded properly.
    const utf16 = (text[0] === 0xff && text[1] === 0xfe) || (text[0] === 0xfe && text[1] === 0xff);
    return detectFormat("", utf16 ? decodeText(text.subarray(0, 4096), file).text : strFromU8(text.subarray(0, 4096), true).replace(/^\xef\xbb\xbf/, ""));
  }
  if (text.startsWith("PK\u0003\u0004")) return "xlsx";
  const head = stripBom(text).trimStart();
  if (head.startsWith("<")) return "xliff";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  if (looksLikePo(head)) return "po";
  return "csv";
}

/** Parses one file. Bytes are decoded (UTF-8/UTF-16 BOM); XLSX needs bytes. Single-language tables come back unpaired (see `loadInputs`). */
export function parseTable(data: string | Uint8Array, file: string, opts: ParseOptions = {}): Table {
  return parseTableWithNotes(data, file, opts).table;
}

export function parseTableWithNotes(data: string | Uint8Array, file: string, opts: ParseOptions = {}): { table: Table; notes: string[] } {
  let format = opts.format ?? detectFormat(file, data);
  if (typeof data !== "string" && isZip(data) && format !== "xlsx") format = "xlsx";
  if (format === "xlsx") {
    if (typeof data === "string") throw new Error(`${file}: .xlsx must be passed as bytes (Uint8Array), not text`);
    return parseXlsx(data, file, opts);
  }
  const notes: string[] = [];
  let text: string;
  if (typeof data === "string") text = stripBom(data);
  else {
    const d = decodeText(data, file);
    text = d.text;
    if (d.note) notes.push(d.note);
  }
  return { table: parseText(text, file, format, opts), notes };
}

function parseText(text: string, file: string, format: Format, opts: ParseOptions): Table {
  switch (format) {
    case "xliff":
      return parseXliff(text, file, opts);
    case "json":
    case "i18n-json":
      return parseJson(text, file, { ...opts, format });
    case "po":
      return parsePo(text, file, opts);
    case "tsv":
      return parseCsv(text, file, { ...opts, delimiter: "\t" });
    case "unity-csv":
    case "unreal-csv":
      return parseCsv(text, file, { ...opts, format, delimiter: file.toLowerCase().endsWith(".tsv") ? "\t" : "," });
    default:
      return parseCsv(text, file, { ...opts, format });
  }
}

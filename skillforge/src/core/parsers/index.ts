import { parseCsv } from "./csv.js";
import { parseJson } from "./json.js";
import { parseXliff } from "./xliff.js";
import type { ColumnMap } from "./columns.js";
import type { Lang, Table } from "../types.js";

export type Format = "csv" | "tsv" | "json" | "xliff";
export type { ColumnMap };

export function detectFormat(file: string, text: string): Format {
  const f = file.toLowerCase();
  if (f.endsWith(".xlf") || f.endsWith(".xliff")) return "xliff";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".tsv")) return "tsv";
  if (f.endsWith(".csv")) return "csv";
  const head = text.trimStart();
  if (head.startsWith("<")) return "xliff";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "csv";
}

export function parseTable(
  text: string,
  file: string,
  opts: { format?: Format; columns?: ColumnMap; langs?: { source?: Lang; target?: Lang } } = {},
): Table {
  const format = opts.format ?? detectFormat(file, text);
  switch (format) {
    case "xliff":
      return parseXliff(text, file, opts);
    case "json":
      return parseJson(text, file, opts);
    case "tsv":
      return parseCsv(text, file, { ...opts, delimiter: "\t" });
    default:
      return parseCsv(text, file, opts);
  }
}

import type { ColumnMap } from "./columns.js";
import { tableFromGrid } from "./grid.js";
import type { Lang, Table } from "../types.js";

/** RFC 4180 CSV (also TSV) parser that remembers the physical line each record starts on. */
export function parseCsvRecords(text: string, delimiter = ","): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  let line = 1;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < text.length) {
    const startLine = line;
    const cells: string[] = [];
    let cell = "";
    let inQuotes = false;
    let ended = false;
    while (i < text.length && !ended) {
      const ch = text[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
        } else {
          if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
          cell += ch;
        }
        i++;
      } else if (ch === '"' && cell === "") {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        cells.push(cell);
        cell = "";
        i++;
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        i++;
        line++;
        ended = true;
      } else {
        cell += ch;
        i++;
      }
    }
    if (inQuotes) throw new Error(`Unterminated quoted field starting on line ${startLine}`);
    cells.push(cell);
    if (cells.length > 1 || cells[0] !== "") out.push({ line: startLine, cells });
  }
  return out;
}

export function parseCsv(text: string, file: string, opts: { columns?: ColumnMap; langs?: { source?: Lang; target?: Lang }; delimiter?: string; format?: string } = {}): Table {
  const delimiter = opts.delimiter ?? (file.toLowerCase().endsWith(".tsv") ? "\t" : ",");
  const records = parseCsvRecords(text, delimiter);
  if (!records.length) throw new Error(`${file}: empty CSV`);
  return tableFromGrid(records, file, delimiter === "\t" ? "tsv" : "csv", opts);
}

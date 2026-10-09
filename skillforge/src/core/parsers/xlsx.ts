// Minimal .xlsx (Office Open XML spreadsheet) reader: unzip with fflate, then read just enough XML for cell text.
// Browser-safe. No formulas are evaluated (the cached value is used), dates stay as serial numbers.
import { strFromU8, unzipSync } from "fflate";
import type { Lang, Table } from "../types.js";
import type { ColumnMap } from "./columns.js";
import { tableFromGrid, type GridRecord } from "./grid.js";
import { InputError } from "../errors.js";

export interface XlsxOptions {
  columns?: ColumnMap;
  langs?: { source?: Lang; target?: Lang };
  /** Sheet name, or 1-based sheet number. Default: the first sheet with any text. */
  sheet?: string | number;
  format?: string;
}

export const isZip = (b: Uint8Array) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;

/** XML text → string: entities, numeric references, and the OOXML `_xHHHH_` escape. */
export function decodeXmlText(s: string): string {
  return s
    .replace(/&(lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#\d+);/g, (_, e: string) =>
      e === "lt" ? "<" : e === "gt" ? ">" : e === "quot" ? '"' : e === "apos" ? "'" : e === "amp" ? "&" : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
    )
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlText(m[1] ?? m[2] ?? "") : undefined;
};

/** Text of a rich or plain string item (`<si>` / `<is>`): all `<t>` runs, skipping phonetic `<rPh>` (furigana) runs. */
function stringItem(xml: string): string {
  const body = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  let out = "";
  for (const m of body.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?t>)/g)) out += decodeXmlText(m[1] ?? "");
  return out;
}

/** "A" → 0, "Z" → 25, "AA" → 26. */
function colIndex(ref: string): number | undefined {
  const m = /^([A-Za-z]+)/.exec(ref);
  if (!m) return undefined;
  let n = 0;
  for (const ch of m[1]!.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readSheet(xml: string, shared: string[]): GridRecord[] {
  const out: GridRecord[] = [];
  let rowNum = 0;
  for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const r = Number.parseInt(attr(rm[1]!, "r") ?? "", 10);
    rowNum = Number.isFinite(r) && r > 0 ? r : rowNum + 1;
    const cells: string[] = [];
    let col = -1;
    for (const cm of (rm[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const open = cm[1]!;
      const ref = attr(open, "r");
      const ci = ref ? colIndex(ref) : undefined;
      col = ci ?? col + 1;
      const inner = cm[2] ?? "";
      const t = attr(open, "t");
      const v = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      let text = "";
      if (t === "inlineStr") {
        const is = /<(?:\w+:)?is\b[^>]*>([\s\S]*?)<\/(?:\w+:)?is>/.exec(inner)?.[1];
        text = is !== undefined ? stringItem(is) : "";
      } else if (t === "s") {
        text = v !== undefined ? (shared[Number.parseInt(v, 10)] ?? "") : "";
      } else if (t === "b") {
        text = v === undefined ? "" : v.trim() === "1" ? "TRUE" : "FALSE";
      } else {
        text = v !== undefined ? decodeXmlText(v) : "";
      }
      while (cells.length < col) cells.push("");
      cells[col] = text;
    }
    if (cells.some((c) => c.trim())) out.push({ line: rowNum, cells: Array.from(cells, (c) => c ?? "") });
  }
  return out;
}

const resolvePart = (target: string): string => {
  const parts = (target.startsWith("/") ? target.slice(1) : `xl/${target}`).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
};

/** The workbook's sheets in order with their XML part paths. */
function listSheets(files: Record<string, Uint8Array>, file: string): { name: string; path: string }[] {
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new InputError(`${file}: not an .xlsx workbook (xl/workbook.xml missing)`);
  const wbXml = strFromU8(wb);
  const relsBytes = files["xl/_rels/workbook.xml.rels"];
  const rels = new Map<string, string>();
  if (relsBytes) {
    for (const m of strFromU8(relsBytes).matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      const id = attr(m[0], "Id");
      const target = attr(m[0], "Target");
      if (id && target) rels.set(id, resolvePart(target));
    }
  }
  const sheets: { name: string; path: string }[] = [];
  let n = 0;
  for (const m of wbXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    n++;
    const name = attr(m[0], "name") ?? `Sheet${n}`;
    const rid = /\s[\w]+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[0]);
    const path = (rid && rels.get(rid[1] ?? rid[2] ?? "")) ?? `xl/worksheets/sheet${n}.xml`;
    sheets.push({ name, path });
  }
  if (!sheets.length) throw new InputError(`${file}: workbook has no sheets`);
  return sheets;
}

/** Parses one sheet of an .xlsx workbook. `line` is the spreadsheet row number; the table file is `book.xlsx#Sheet`. */
export function parseXlsx(data: Uint8Array, file: string, opts: XlsxOptions = {}): { table: Table; notes: string[] } {
  if (isOle(data)) throw new InputError(`${file}: legacy .xls (or encrypted workbook) is not supported; save it as .xlsx`);
  if (!isZip(data)) throw new InputError(`${file}: not an .xlsx file (expected a ZIP container)`);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name.startsWith("xl/") && f.name.endsWith(".xml") || f.name.endsWith(".rels") });
  } catch (e) {
    throw new InputError(`${file}: could not unzip .xlsx (${(e as Error).message})`);
  }
  const sheets = listSheets(files, file);
  const ssBytes = files["xl/sharedStrings.xml"];
  const shared = ssBytes ? [...strFromU8(ssBytes).matchAll(/<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g)].map((m) => stringItem(m[1] ?? "")) : [];
  const read = (s: { name: string; path: string }) => {
    const bytes = files[s.path];
    if (!bytes) throw new InputError(`${file}: sheet "${s.name}" is missing its data (${s.path})`);
    return readSheet(strFromU8(bytes), shared);
  };
  const notes: string[] = [];
  let chosen: { name: string; path: string } | undefined;
  let records: GridRecord[] | undefined;
  if (opts.sheet !== undefined && opts.sheet !== "") {
    const want = opts.sheet;
    chosen =
      typeof want === "string"
        ? (sheets.find((s) => s.name === want) ?? sheets.find((s) => s.name.toLowerCase() === want.trim().toLowerCase()) ?? (/^\d+$/.test(want.trim()) ? sheets[Number(want) - 1] : undefined))
        : sheets[want - 1];
    if (!chosen) throw new InputError(`${file}: no sheet ${JSON.stringify(want)} (sheets: ${sheets.map((s) => s.name).join(", ")})`);
    records = read(chosen);
    if (!records.length) throw new InputError(`${file}: sheet "${chosen.name}" is empty`);
  } else {
    for (const s of sheets) {
      const r = read(s);
      if (r.length) {
        chosen = s;
        records = r;
        break;
      }
    }
    if (!chosen || !records) throw new InputError(`${file}: all sheets are empty`);
    if (sheets.length > 1) notes.push(`${file}: read sheet "${chosen.name}" (workbook also has: ${sheets.filter((s) => s !== chosen).map((s) => s.name).join(", ")}; choose with the sheet option)`);
  }
  return { table: tableFromGrid(records, `${file}#${chosen.name}`, "xlsx", opts), notes };
}

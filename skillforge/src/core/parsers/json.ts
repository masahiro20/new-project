import { finishTable, recordToRow, resolveColumns, type ColumnMap } from "./columns.js";
import type { Lang, Row, Table } from "../types.js";

/** Plain object plus the line its opening brace was on. */
type LinedObject = { line: number; value: Record<string, unknown> };
const LINE = Symbol("line");

/** Small JSON parser that tags every object with the line of its opening brace. */
function parseWithLines(text: string): unknown {
  let i = 0;
  let line = 1;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i]!)) {
      if (text[i] === "\n") line++;
      i++;
    }
  };
  const fail = (msg: string): never => {
    throw new Error(`JSON parse error at line ${line}: ${msg}`);
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      i++;
    }
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): unknown => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      const obj: Record<string | symbol, unknown> = { [LINE]: line };
      i++;
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("expected key");
        const k = str();
        ws();
        if (text[i] !== ":") fail("expected ':'");
        i++;
        obj[k] = value();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return obj;
        }
        fail("expected ',' or '}'");
      }
    }
    if (ch === "[") {
      const arr: unknown[] = [];
      i++;
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return arr;
        }
        fail("expected ',' or ']'");
      }
    }
    if (ch === '"') return str();
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i, i + 64));
    if (!m) return fail(`unexpected '${ch ?? "EOF"}'`);
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const v = value();
  ws();
  if (i < text.length) fail("trailing content");
  return v;
}

const isObj = (v: unknown): v is Record<string | symbol, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const lined = (v: Record<string | symbol, unknown>): LinedObject => ({ line: (v[LINE] as number) ?? 1, value: v as Record<string, unknown> });

/**
 * Accepts:
 *  - an array of records: [{"id": "...", "ja": "...", "en": "..."}]
 *  - an object wrapping such an array: {"strings": [...]}
 *  - a keyed map: {"ch1_001": {"ja": "...", "en": "..."}}
 */
export function parseJson(text: string, file: string, opts: { columns?: ColumnMap; langs?: { source?: Lang; target?: Lang } } = {}): Table {
  const root = parseWithLines(text);
  let records: { rec: LinedObject; key?: string }[];
  if (Array.isArray(root)) {
    records = root.filter(isObj).map((o) => ({ rec: lined(o) }));
  } else if (isObj(root)) {
    const arr = Object.values(root).find((v) => Array.isArray(v) && v.some(isObj)) as unknown[] | undefined;
    records = arr
      ? arr.filter(isObj).map((o) => ({ rec: lined(o) }))
      : Object.entries(root)
          .filter(([, v]) => isObj(v))
          .map(([k, v]) => ({ rec: lined(v as Record<string | symbol, unknown>), key: k }));
  } else {
    throw new Error(`${file}: expected a JSON array or object of strings`);
  }
  if (!records.length) throw new Error(`${file}: no string records found`);
  const headers = [...new Set(records.flatMap((r) => Object.keys(r.rec.value)))];
  const cols = resolveColumns(headers, opts.columns);
  const rows: Row[] = records.map((r, idx) => recordToRow(r.rec.value, cols, file, r.rec.line, r.key ?? `row${idx + 1}`));
  return finishTable(file, "json", rows, cols, opts.langs);
}

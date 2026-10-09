import { finishTable, recordToRow, resolveColumns, singleTable, type ColumnMap } from "./columns.js";
import { langFromName, langOfCode } from "./lang.js";
import { detectLang, looksJapanese } from "../text.js";
import type { Lang, Row, Table } from "../types.js";
import { InputError, inputErrorWithFile } from "../errors.js";

/** Plain object plus the line its opening brace was on. */
type LinedObject = { line: number; value: Record<string, unknown> };
const LINE = Symbol("line");
/** Per object: line of each key. Per array: line where each element starts. */
const KEY_LINES = Symbol("keyLines");

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
    throw new InputError(`JSON parse error at line ${line}: ${msg}`);
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") i++;
      else if (text[i] === "\n") fail("unescaped newline in string");
      i++;
    }
    if (i >= text.length) fail("unterminated string");
    i++;
    try {
      return JSON.parse(text.slice(start, i)) as string;
    } catch {
      return fail("invalid string escape");
    }
  };
  const value = (): unknown => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      const keyLines: Record<string, number> = {};
      const obj: Record<string | symbol, unknown> = { [LINE]: line, [KEY_LINES]: keyLines };
      i++;
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail("expected key");
        const keyLine = line;
        const k = str();
        if (!(k in keyLines)) keyLines[k] = keyLine;
        ws();
        if (text[i] !== ":") fail("expected ':'");
        i++;
        // defineProperty: a "__proto__" key stays an ordinary property.
        Object.defineProperty(obj, k, { value: value(), enumerable: true, writable: true, configurable: true });
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
      const elemLines: number[] = [];
      const arr: unknown[] & { [KEY_LINES]?: number[] } = Object.assign([], { [KEY_LINES]: elemLines });
      i++;
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        ws();
        elemLines.push(line);
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
export function parseJson(text: string, file: string, opts: { columns?: ColumnMap; langs?: { source?: Lang; target?: Lang }; format?: string } = {}): Table {
  let root: unknown;
  try {
    root = parseWithLines(text);
  } catch (e) {
    throw inputErrorWithFile(e, file);
  }
  if (opts.format === "i18n-json" || isLocaleFile(root, opts.columns)) return localeTable(root, file);
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
    throw new InputError(`${file}: expected a JSON array or object of strings`);
  }
  if (!records.length) throw new InputError(`${file}: no string records found`);
  const headers = [...new Set(records.flatMap((r) => Object.keys(r.rec.value)))];
  const cols = resolveColumns(headers, opts.columns);
  const rows: Row[] = records.map((r, idx) => recordToRow(r.rec.value, cols, file, r.rec.line, r.key ?? `row${idx + 1}`));
  return finishTable(file, "json", rows, cols, opts.langs);
}

type Leaf = { key: string; line: number; value: string };

function flatten(v: unknown, prefix: string, line: number, out: Leaf[]): void {
  if (typeof v === "string") {
    out.push({ key: prefix, line, value: v });
  } else if (Array.isArray(v)) {
    const lines = (v as unknown as { [KEY_LINES]?: number[] })[KEY_LINES] ?? [];
    v.forEach((x, i) => flatten(x, prefix ? `${prefix}.${i}` : String(i), lines[i] ?? line, out));
  } else if (isObj(v)) {
    const lines = (v[KEY_LINES] as Record<string, number> | undefined) ?? {};
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, lines[k] ?? line, out);
  }
  // numbers, booleans and null are not translatable text
}

/** `{"ja": {...}}` (Rails/vue-i18n style) → the inner object plus its language. */
function unwrapLocale(root: unknown): { obj: unknown; lang?: Lang } {
  if (isObj(root)) {
    const keys = Object.keys(root);
    if (keys.length === 1 && isObj(root[keys[0]!]) && langOfCode(keys[0])) return { obj: root[keys[0]!], lang: langOfCode(keys[0]) };
  }
  return { obj: root };
}

/**
 * A per-locale i18n file (`{"menu": {"start": "開始"}}`): an object whose string leaves are in one language.
 * Record shapes (`[{...}]`, `{"strings": [...]}`) and bilingual keyed maps (`{"k": {"ja": "…", "en": "…"}}`) are not.
 */
function isLocaleFile(root: unknown, columns?: ColumnMap): boolean {
  if (!isObj(root)) return false;
  const top = Object.values(root);
  if (top.some((v) => Array.isArray(v) && v.some(isObj))) return false;
  const leaves: Leaf[] = [];
  flatten(unwrapLocale(root).obj, "", 1, leaves);
  if (!leaves.length) return false;
  const flatRecords = top.length > 0 && top.every((v) => isObj(v) && Object.values(v).every((x) => !isObj(x) && !Array.isArray(x)));
  if (!flatRecords) return true;
  const headers = [...new Set(top.flatMap((v) => Object.keys(v as object)))];
  let cols: ReturnType<typeof resolveColumns>;
  try {
    cols = resolveColumns(headers, columns);
  } catch {
    return true;
  }
  if (columns && Object.keys(columns).length) return false;
  // Both ja and en text present, or an empty source/target cell (an untranslated bilingual map): bilingual.
  const texts = leaves.map((l) => l.value).filter((v) => v.trim());
  const ja = texts.filter(looksJapanese).length;
  if (ja > 0 && ja < texts.length) return false;
  const records = top as Record<string, unknown>[];
  if (records.some((r) => r[cols.source] === "" || r[cols.target] === "" || r[cols.target] == null)) return false;
  return true;
}

function localeTable(root: unknown, file: string): Table {
  const { obj, lang: wrapped } = unwrapLocale(root);
  if (!isObj(obj)) throw new InputError(`${file}: expected a JSON object of translation keys`);
  const leaves: Leaf[] = [];
  flatten(obj, "", (obj[LINE] as number) ?? 1, leaves);
  if (!leaves.length) throw new InputError(`${file}: no string values found`);
  const rows: Row[] = leaves.map((l) => ({ file, line: l.line, id: l.key, source: l.value, target: "" }));
  const lang = wrapped ?? langFromName(file) ?? detectLang(rows.map((r) => r.source));
  return singleTable(file, "i18n-json", rows, lang);
}

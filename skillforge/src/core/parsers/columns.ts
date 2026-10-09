import { detectLang } from "../text.js";
import type { Lang, Row, Table, TableFormat } from "../types.js";
import { langOfHeader, otherLang } from "./lang.js";

export interface ColumnMap {
  id?: string;
  source?: string;
  target?: string;
  speaker?: string;
  addressee?: string;
  context?: string;
  maxLength?: string;
}

const ALIASES: Record<keyof ColumnMap, string[]> = {
  id: ["id", "key", "string_id", "stringid", "label", "キー"],
  source: ["source", "src", "original", "ja", "jp", "japanese", "ja-jp", "原文", "日本語"],
  target: ["target", "tgt", "translation", "en", "english", "en-us", "訳文", "翻訳", "英語"],
  speaker: ["speaker", "character", "char", "name", "名前", "話者", "キャラ", "キャラクター"],
  addressee: ["addressee", "listener", "to", "相手"],
  context: ["context", "note", "notes", "comment", "comments", "shared_comments", "description", "備考"],
  maxLength: ["max_length", "maxlength", "max_len", "maxlen", "limit", "char_limit", "文字数", "文字数制限"],
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

/** Extra header names for the text column of a single-language table (Unreal string tables use "SourceString"). */
const TEXT_ALIASES = ["text", "string", "value", "sourcestring", "source_string", "localized", "localized_text", "message", "テキスト", "本文"];

function findColumns(headers: string[], override: ColumnMap): ColumnMap {
  const found: ColumnMap = {};
  for (const key of Object.keys(ALIASES) as (keyof ColumnMap)[]) {
    const hit = override[key] ?? headers.find((h) => ALIASES[key].includes(norm(h)));
    if (hit) found[key] = hit;
  }
  // Locale-named headers such as Unity's "Japanese(ja)" / "English (en)".
  if (!found.source && !override.source) found.source = headers.find((h) => h !== found.target && langOfHeader(h) === "ja");
  if (!found.target && !override.target) found.target = headers.find((h) => h !== found.source && langOfHeader(h) === "en");
  if (!found.source) delete found.source;
  if (!found.target) delete found.target;
  return found;
}

/** Header names for an error message, cut short: a binary or non-tabular file can yield thousands of characters. */
export function headerList(headers: string[], max = 200): string {
  const list = headers.join(", ");
  return list.length > max ? `${list.slice(0, max)}… (${headers.length} columns)` : list;
}

export function resolveColumns(headers: string[], override: ColumnMap = {}): Required<Pick<ColumnMap, "source" | "target">> & ColumnMap {
  const found = findColumns(headers, override);
  // Language-named columns ("en","ja") say nothing about direction: the left one is the source.
  if (found.source && found.target && !override.source && !override.target && langOfHeader(found.source) && langOfHeader(found.target) && headers.indexOf(found.target) < headers.indexOf(found.source)) {
    [found.source, found.target] = [found.target, found.source];
  }
  if (!found.source || !found.target) {
    throw new Error(
      `Could not find source/target columns in [${headerList(headers)}]. ` +
        `Name them e.g. "ja"/"en" or "source"/"target", or pass a column map.`,
    );
  }
  return found as Required<Pick<ColumnMap, "source" | "target">> & ColumnMap;
}

/**
 * Columns of a single-language table: an id plus exactly one text column (e.g. "Key,SourceString,Comment",
 * "key,ja", "id,text"). Returns undefined when no text column can be identified.
 */
export function resolveSingleColumn(headers: string[], override: ColumnMap = {}): (ColumnMap & { source: string }) | undefined {
  const found = findColumns(headers, override);
  const taken = new Set([found.id, found.speaker, found.addressee, found.context, found.maxLength].filter(Boolean));
  const text =
    override.source ??
    override.target ??
    headers.find((h) => !taken.has(h) && (langOfHeader(h) || ALIASES.source.includes(norm(h)) || ALIASES.target.includes(norm(h)) || TEXT_ALIASES.includes(norm(h))));
  if (!text) return undefined;
  return { id: found.id, speaker: found.speaker, addressee: found.addressee, context: found.context, maxLength: found.maxLength, source: text };
}

export function recordToRow(rec: Record<string, unknown>, cols: ColumnMap, file: string, line: number, fallbackId: string): Row {
  const get = (k?: string) => (k && rec[k] != null ? String(rec[k]) : undefined);
  const max = get(cols.maxLength);
  const n = max ? Number.parseInt(max, 10) : NaN;
  return {
    file,
    line,
    id: get(cols.id) ?? fallbackId,
    source: get(cols.source) ?? "",
    target: get(cols.target) ?? "",
    speaker: get(cols.speaker) || undefined,
    addressee: get(cols.addressee) || undefined,
    context: get(cols.context) || undefined,
    maxLength: Number.isFinite(n) && n > 0 ? n : undefined,
  };
}

export function finishTable(file: string, format: TableFormat, rows: Row[], cols?: ColumnMap, langs?: { source?: Lang; target?: Lang }): Table {
  const hint = (c?: string): Lang | undefined => langOfHeader(c);
  const sourceLang = langs?.source ?? hint(cols?.source) ?? detectLang(rows.map((r) => r.source));
  const targetLang = langs?.target ?? hint(cols?.target) ?? (sourceLang === "ja" ? "en" : "ja");
  return { file, format, sourceLang, targetLang, rows };
}

/** A single-language table: text in `source`, empty `target`. */
export function singleTable(file: string, format: TableFormat, rows: Row[], lang: Lang): Table {
  return { file, format, sourceLang: lang, targetLang: otherLang(lang), rows, singleLang: lang };
}

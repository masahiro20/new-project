import { detectLang } from "../text.js";
import type { Lang, Row, Table } from "../types.js";

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
  context: ["context", "note", "notes", "comment", "comments", "備考"],
  maxLength: ["max_length", "maxlength", "max_len", "maxlen", "limit", "char_limit", "文字数", "文字数制限"],
};

const LANG_HINT: Record<string, Lang> = {
  ja: "ja", jp: "ja", japanese: "ja", "ja-jp": "ja", 日本語: "ja",
  en: "en", english: "en", "en-us": "en", 英語: "en",
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_");

export function resolveColumns(headers: string[], override: ColumnMap = {}): Required<Pick<ColumnMap, "source" | "target">> & ColumnMap {
  const found: ColumnMap = {};
  for (const key of Object.keys(ALIASES) as (keyof ColumnMap)[]) {
    const hit = override[key] ?? headers.find((h) => ALIASES[key].includes(norm(h)));
    if (hit) found[key] = hit;
  }
  // Language-named columns ("en","ja") say nothing about direction: the left one is the source.
  if (found.source && found.target && !override.source && !override.target && LANG_HINT[norm(found.source)] && LANG_HINT[norm(found.target)] && headers.indexOf(found.target) < headers.indexOf(found.source)) {
    [found.source, found.target] = [found.target, found.source];
  }
  if (!found.source || !found.target) {
    throw new Error(
      `Could not find source/target columns in [${headers.join(", ")}]. ` +
        `Name them e.g. "ja"/"en" or "source"/"target", or pass a column map.`,
    );
  }
  return found as Required<Pick<ColumnMap, "source" | "target">> & ColumnMap;
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

export function finishTable(file: string, format: Table["format"], rows: Row[], cols?: ColumnMap, langs?: { source?: Lang; target?: Lang }): Table {
  const hint = (c?: string): Lang | undefined => (c ? LANG_HINT[norm(c)] : undefined);
  const sourceLang = langs?.source ?? hint(cols?.source) ?? detectLang(rows.map((r) => r.source));
  const targetLang = langs?.target ?? hint(cols?.target) ?? (sourceLang === "ja" ? "en" : "ja");
  return { file, format, sourceLang, targetLang, rows };
}

// Glossary import from industry termbase formats: bilingual CSV/TSV exports (Crowdin, Phrase/Memsource,
// plain "ja,en" lists, Kotomark's own type/source/target CSV) and TBX (ISO 30042: TBX v2 <martif>, TBX v3 <tbx>).
// Browser-safe (no node: imports).
import { parseCsvRecords } from "./parsers/csv.js";
import { langOfCode, langOfHeader } from "./parsers/lang.js";
import { attrOf, childElements, descendants, parseXml, textContent, type XmlElement } from "./parsers/xml.js";
import type { Glossary, GlossaryCharacter, GlossaryTerm, Lang } from "./types.js";

type Status = "preferred" | "admitted" | "forbidden";
interface Variant {
  text: string;
  status?: Status;
}
/** Side of a concept: a language, or an explicit source/target column. */
type Key = Lang | "src" | "tgt";
interface Concept {
  line: number;
  sides: Partial<Record<Key, Variant[]>>;
  notes: Partial<Record<Key | "any", string>>;
  /** Status from a column that names no language; applies to the target-side terms. */
  rowStatus?: Status;
  /** Kotomark CSV `allowed` / `forbidden` lists: extra target-side renderings. */
  allowed?: string[];
  forbidden?: string[];
}

export interface ImportResult {
  glossary: Glossary;
  notes: string[];
  /** Direction the terms were built in. */
  direction: { source: Lang | "source"; target: Lang | "target" };
  /** True when the file names languages per column/langSet, so it can be rebuilt for the other direction. */
  orientable: boolean;
}

export interface ImportOptions {
  /** Language of the script's source text. Defaults to the file's own hint (first language column, TBX root xml:lang), else ja. */
  sourceLang?: Lang;
}

const MAX_NOTES = 12;

class Notes {
  list: string[] = [];
  extra = 0;
  constructor(private file: string) {}
  add(msg: string) {
    if (this.list.length < MAX_NOTES) this.list.push(`${this.file}: ${msg}`);
    else this.extra++;
  }
  done(): string[] {
    return this.extra ? [...this.list, `${this.file}: … and ${this.extra} more note(s)`] : this.list;
  }
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Termbase status words → Kotomark's three levels. Covers TBX administrativeStatus / normativeAuthorization
 * (preferredTerm-admn-sts, admittedTerm, deprecatedTerm, supersededTerm, …), TBX v3 short values (preferred) and the
 * status columns of Crowdin / Phrase exports (preferred, admitted, not recommended, obsolete, forbidden, approved).
 */
export function statusOf(value: string): Status | "unknown" | undefined {
  const v = value.trim().toLowerCase();
  if (!v || v === "-") return undefined;
  if (/deprecat|forbid|supersed|obsolete|not[\s_-]*recommended|reject|banned|do[\s_-]*not[\s_-]*use|禁止|非推奨|使用不可|^ng$/.test(v)) return "forbidden";
  if (/admit|allow|accept|permit|synonym|variant|secondary|許容|容認/.test(v)) return "admitted";
  if (/prefer|approv|standard|recommend|official|normative|legal|regulat|main|推奨|優先|正式|^ok$/.test(v)) return "preferred";
  return "unknown";
}

const TRUTHY = /^(true|yes|y|1|x|✓|✔|〇|○|●|はい|forbidden|deprecated|ng|禁止)$/i;
const FALSY = /^(false|no|n|0|-|いいえ|ok)$/i;

// ---------------------------------------------------------------- building terms

function buildTerms(concepts: Concept[], srcKey: Key, tgtKey: Key, notes: Notes): GlossaryTerm[] {
  type Acc = { variants: Variant[]; note?: string; line: number };
  const bySource = new Map<string, Acc>();
  let noSource = 0;
  for (const c of concepts) {
    const srcs = uniq((c.sides[srcKey] ?? []).filter((v) => v.status !== "forbidden").map((v) => v.text));
    const tgts: Variant[] = [
      ...(c.sides[tgtKey] ?? []).map((v) => ({ text: v.text, status: v.status ?? c.rowStatus })),
      ...(c.allowed ?? []).map((text) => ({ text, status: "admitted" as const })),
      ...(c.forbidden ?? []).map((text) => ({ text, status: "forbidden" as const })),
    ];
    if (!srcs.length) {
      if (tgts.length) noSource++;
      continue;
    }
    if (!tgts.length) continue;
    const note = c.notes.any ?? c.notes[srcKey] ?? c.notes[tgtKey];
    for (const s of srcs) {
      const acc = bySource.get(s) ?? { variants: [], line: c.line };
      acc.variants.push(...tgts);
      acc.note ??= note;
      bySource.set(s, acc);
    }
  }
  if (noSource) notes.add(`${noSource} entr${noSource === 1 ? "y has" : "ies have"} no usable ${keyName(srcKey)} term; skipped`);
  const terms: GlossaryTerm[] = [];
  for (const [source, acc] of bySource) {
    const preferred = uniq(acc.variants.filter((v) => v.status === undefined || v.status === "preferred").map((v) => v.text));
    const admitted = uniq(acc.variants.filter((v) => v.status === "admitted").map((v) => v.text));
    const approved = uniq([...preferred, ...admitted]);
    const target = preferred[0] ?? admitted[0];
    const forbiddenAll = uniq(acc.variants.filter((v) => v.status === "forbidden").map((v) => v.text));
    if (!target) {
      notes.add(`"${source}" (line ${acc.line}) has only deprecated/forbidden translations (${forbiddenAll.join(", ")}); skipped`);
      continue;
    }
    if (preferred.length > 1) notes.add(`"${source}" has several preferred translations (${preferred.join(", ")}); using "${target}", the others are allowed`);
    const clash = forbiddenAll.filter((f) => approved.includes(f));
    if (clash.length) notes.add(`"${source}": ${clash.map((x) => `"${x}"`).join(", ")} is both approved and forbidden; kept as approved`);
    const allowed = approved.filter((a) => a !== target);
    const forbidden = forbiddenAll.filter((f) => !approved.includes(f));
    const term: GlossaryTerm = { source, target };
    if (allowed.length) term.allowed = allowed;
    if (forbidden.length) term.forbidden = forbidden;
    if (acc.note) term.note = acc.note;
    terms.push(term);
  }
  return terms;
}

const keyName = (k: Key) => (k === "src" ? "source" : k === "tgt" ? "target" : k === "ja" ? "Japanese" : "English");

// ---------------------------------------------------------------- CSV / TSV

type Field = "term" | "note" | "status" | "flag" | "ignore";
type Col =
  | { kind: "type" | "src" | "tgt" | "allowed" | "forbidden" | "status" | "note" | "ignore" }
  | { kind: "lang"; lang: Lang | undefined; code: string; field: Field };

const IGNORED_FIELD = /part[\s_-]*of[\s_-]*speech|\bpos\b|gender|^type$|url|lemma|figure|subject|abbreviation|plural|image|created|updated|modified|author|^id$|domain|grammatical|品詞|^language$/i;

function fieldOf(raw: string): Field {
  const f = raw.trim().toLowerCase().replace(/^concept[\s_-]+/, "");
  if (!f || /^(term|terms|text|word|source|target|translation|用語|訳語|原文|訳文)$/.test(f)) return "term";
  if (/^(description|definition|note|notes|comment|comments|context|usage|remark|remarks|explanation|info|備考|説明|定義|注記|メモ|用法)$/.test(f)) return "note";
  if (/^((term|usage|administrative|admin|approval)[\s_-]*)?(status|state)$|^(状態|ステータス)$/.test(f)) return "status";
  if (/^(forbidden|deprecated|ng|禁止|do[\s_-]*not[\s_-]*use|not[\s_-]*allowed)$/.test(f)) return "flag";
  if (IGNORED_FIELD.test(f)) return "ignore";
  return "ignore";
}

const LANG_WORD = "ja|jp|jpn|en|eng|japanese|english|日本語|英語";

function classify(header: string, hasLangColumns: (h: string) => boolean): Col {
  const h = header.replace(/^﻿/, "").trim();
  const lower = h.toLowerCase();
  // "Term [ja]", "Description [en-US]", "Japanese(ja)", "English (United States)(en-US)".
  const br = /^(.*?)\s*[[(（]\s*([^\])）]+?)\s*[\])）]\s*$/.exec(h);
  if (br && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]+)*$/.test(br[2]!)) {
    const lang = langOfCode(br[2]);
    const base = br[1]!.trim();
    let field = fieldOf(base);
    if (field === "ignore" && !IGNORED_FIELD.test(base) && (langOfHeader(base) || /^[A-Za-z\s()]+$/.test(base))) field = "term";
    if (!base) field = "term";
    return { kind: "lang", lang, code: br[2]!, field };
  }
  // "ja_note", "en - status", "note_en", "English note".
  const pre = new RegExp(`^(${LANG_WORD})(?:[-_][A-Za-z]{2})?[\\s_:\\-・]+(.+)$`, "i").exec(h);
  const suf = new RegExp(`^(.+?)[\\s_:\\-・]+(${LANG_WORD})$`, "i").exec(h);
  const split = pre ? { lang: pre[1]!, rest: pre[2]! } : suf ? { lang: suf[2]!, rest: suf[1]! } : undefined;
  if (split) {
    const lang = langOfCode(split.lang);
    const field = fieldOf(split.rest);
    if (lang && field !== "ignore") return { kind: "lang", lang, code: split.lang, field };
  }
  const whole = langOfHeader(h);
  if (whole) return { kind: "lang", lang: whole, code: h, field: "term" };
  // Other locale codes ("de", "fr-FR", "zh_Hans"): read so they can be named in a note, then ignored.
  if (/^[a-z]{2}([-_][A-Za-z0-9]{2,4})?$/i.test(h) && !/^(id|no|ng|ok)$/i.test(h)) return { kind: "lang", lang: undefined, code: h, field: "term" };
  if (/^(type|kind|種別|区分)$/.test(lower)) return { kind: "type" };
  if (/^(source|source[\s_-]*term|原文|原語|元)$/.test(lower) || (lower === "term" && !hasLangColumns(h))) return { kind: "src" };
  if (/^(target|target[\s_-]*term|translation|訳語|訳文|訳)$/.test(lower)) return { kind: "tgt" };
  if (/^(allowed|aliases|alias|synonyms|variants|許容|別表記)$/.test(lower)) return { kind: "allowed" };
  if (/^(forbidden|ng|禁止|deprecated|do[\s_-]*not[\s_-]*use)$/.test(lower)) return { kind: "forbidden" };
  const field = fieldOf(lower);
  if (field === "status") return { kind: "status" };
  if (field === "note") return { kind: "note" };
  return { kind: "ignore" };
}

const splitList = (s?: string) =>
  (s ?? "")
    .split(/[;；|]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function sniffDelimiter(text: string, file: string): "," | "\t" {
  if (/\.tsv$|\.tab$/i.test(file)) return "\t";
  if (/\.csv$/i.test(file)) {
    const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
    return !first.includes(",") && first.includes("\t") ? "\t" : ",";
  }
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : ",";
}

export function importCsv(text: string, file: string, opts: ImportOptions = {}): ImportResult {
  const notes = new Notes(file);
  const delimiter = sniffDelimiter(text, file);
  const recs = parseCsvRecords(text, delimiter);
  const headerRec = recs.shift();
  const header = headerRec?.cells ?? [];
  const anyLang = header.some((h) => {
    const c = classify(h, () => false);
    return c.kind === "lang" && c.field === "term" && !!c.lang;
  });
  const cols = header.map((h) => classify(h, () => anyLang));
  const idx = (kind: Col["kind"]) => cols.findIndex((c) => c.kind === kind);
  let iSrc = idx("src");
  let iTgt = idx("tgt");
  const iType = idx("type");
  const iAllowed = idx("allowed");
  const iForbidden = idx("forbidden");
  const iStatus = idx("status");
  const noteCols = cols.map((c, i) => (c.kind === "note" ? i : -1)).filter((i) => i >= 0);
  const cell = (r: { cells: string[] }, i: number) => (i >= 0 ? (r.cells[i] ?? "").trim() : "");

  // Language term columns (in order) and the per-language fields that belong to each.
  type TermCol = { i: number; lang: Lang; status: number; flag: number };
  const termCols: TermCol[] = [];
  const langNotes: { i: number; lang: Lang }[] = [];
  const otherLangs = new Set<string>();
  cols.forEach((c, i) => {
    if (c.kind !== "lang") return;
    if (!c.lang) {
      if (c.field === "term") otherLangs.add(c.code);
      return;
    }
    if (c.field === "term") termCols.push({ i, lang: c.lang, status: -1, flag: -1 });
    else if (c.field === "note") langNotes.push({ i, lang: c.lang });
    else if (c.field === "status" || c.field === "flag") {
      const owner = [...termCols].reverse().find((t) => t.lang === c.lang) ?? undefined;
      const pending = owner ?? { i: -1, lang: c.lang, status: -1, flag: -1 };
      if (c.field === "status") pending.status = i;
      else pending.flag = i;
      if (!owner) termCols.push(pending); // a status column before its term column: fixed up below
    }
  });
  // Merge placeholder entries (fields seen before their term column) into the first term column of that language.
  for (const p of termCols.filter((t) => t.i < 0)) {
    const owner = termCols.find((t) => t.i >= 0 && t.lang === p.lang);
    if (owner) {
      if (owner.status < 0) owner.status = p.status;
      if (owner.flag < 0) owner.flag = p.flag;
    }
  }
  const langTerms = termCols.filter((t) => t.i >= 0);

  // Mixed headers ("原文,en"): an explicit side plus one language column.
  if (iSrc >= 0 && iTgt < 0 && langTerms.length) iTgt = langTerms.find((t) => t.lang === "en")?.i ?? langTerms[0]!.i;
  if (iTgt >= 0 && iSrc < 0 && langTerms.length) iSrc = langTerms.find((t) => t.lang === "ja")?.i ?? langTerms[0]!.i;
  const explicit = iSrc >= 0 && iTgt >= 0;
  const langs = new Set(langTerms.map((t) => t.lang));
  if (!explicit && !(langs.has("ja") && langs.has("en"))) {
    throw new Error(
      `Glossary CSV needs source/ja and target/en columns (found: ${header.map((h) => h.trim()).filter(Boolean).join(", ") || "no header"})`,
    );
  }
  if (otherLangs.size) notes.add(`ignored columns for other languages (${[...otherLangs].join(", ")})`);

  // `forbidden` holds either a list of wrong renderings (Kotomark CSV) or a yes/no flag (termbase exports).
  const forbiddenValues = iForbidden >= 0 ? recs.map((r) => cell(r, iForbidden)).filter(Boolean) : [];
  const forbiddenIsFlag = forbiddenValues.length > 0 && forbiddenValues.every((v) => TRUTHY.test(v) || FALSY.test(v));
  const unknownStatus = new Set<string>();
  const statusFrom = (r: { cells: string[] }, statusCol: number, flagCol: number): Status | undefined => {
    if (flagCol >= 0 && TRUTHY.test(cell(r, flagCol))) return "forbidden";
    if (statusCol < 0) return undefined;
    const s = statusOf(cell(r, statusCol));
    if (s === "unknown") {
      unknownStatus.add(cell(r, statusCol));
      return undefined;
    }
    return s;
  };

  // Orientation: explicit source/target columns, or (legacy lists / type column) ja→en, or chosen per script.
  const locked = explicit || iType >= 0 || iAllowed >= 0 || (iForbidden >= 0 && !forbiddenIsFlag);
  const firstLang = langTerms.find((t) => t.lang === "ja" || t.lang === "en")?.lang ?? "ja";
  const srcLang: Lang = locked ? "ja" : (opts.sourceLang ?? firstLang);
  const srcKey: Key = explicit ? "src" : srcLang;
  const tgtKey: Key = explicit ? "tgt" : srcLang === "ja" ? "en" : "ja";

  const concepts: Concept[] = [];
  const characters: GlossaryCharacter[] = [];
  const jaCol = explicit ? iSrc : (langTerms.find((t) => t.lang === "ja")?.i ?? -1);
  const enCol = explicit ? iTgt : (langTerms.find((t) => t.lang === "en")?.i ?? -1);
  for (const r of recs) {
    if (iType >= 0 && /^(character|char|name|キャラ)/i.test(cell(r, iType))) {
      const ja = cell(r, jaCol);
      const en = cell(r, enCol);
      if (!ja || !en) continue;
      characters.push({ id: en.toLowerCase(), ja, en, aliases: { en: splitList(cell(r, iAllowed)) }, forbidden: { en: splitList(cell(r, iForbidden)) } });
      continue;
    }
    const c: Concept = { line: r.line, sides: {}, notes: {} };
    if (explicit) {
      if (cell(r, iSrc)) c.sides.src = [{ text: cell(r, iSrc) }];
      if (cell(r, iTgt)) c.sides.tgt = [{ text: cell(r, iTgt) }];
    } else {
      for (const t of langTerms) {
        const text = cell(r, t.i);
        if (!text) continue;
        (c.sides[t.lang] ??= []).push({ text, status: statusFrom(r, t.status, t.flag) });
      }
    }
    c.rowStatus = statusFrom(r, iStatus, forbiddenIsFlag ? iForbidden : -1);
    if (iAllowed >= 0) c.allowed = splitList(cell(r, iAllowed));
    if (iForbidden >= 0 && !forbiddenIsFlag) c.forbidden = splitList(cell(r, iForbidden));
    const general = noteCols.map((i) => cell(r, i)).find(Boolean);
    if (general) c.notes.any = general;
    for (const n of langNotes) if (cell(r, n.i)) c.notes[n.lang] ??= cell(r, n.i);
    if (Object.keys(c.sides).length) concepts.push(c);
  }
  if (unknownStatus.size) notes.add(`unrecognised status value(s) treated as preferred: ${[...unknownStatus].slice(0, 5).join(", ")}`);
  const terms = buildTerms(concepts, srcKey, tgtKey, notes);
  return {
    glossary: { terms, characters },
    notes: notes.done(),
    direction: explicit ? { source: "source", target: "target" } : { source: srcLang, target: srcLang === "ja" ? "en" : "ja" },
    orientable: !locked,
  };
}

// ---------------------------------------------------------------- TBX

const STATUS_TYPES = /^(administrativeStatus|normativeAuthorization|usageStatus|termStatus)$/i;

/** Status of one term group: <termNote type="administrativeStatus">…</termNote> or a TBX v3 DCT <administrativeStatus>. */
function tbxStatus(group: XmlElement, unknown: Set<string>): Status | undefined {
  const el =
    descendants(group, "termNote").find((n) => STATUS_TYPES.test(attrOf(n, "type") ?? "")) ??
    descendants(group, "administrativeStatus", "normativeAuthorization", "usageStatus")[0];
  if (!el) return undefined;
  const v = clean(textContent(el));
  const s = statusOf(v);
  if (s === "unknown") {
    unknown.add(v);
    return undefined;
  }
  return s;
}

/** First definition or note directly in `el` (or in its descripGrp/noteGrp children). */
function tbxNote(el: XmlElement): string | undefined {
  const pool = childElements(el).flatMap((c) => (/Grp$/.test(c.name) && !/^(termGrp|termCompGrp)$/.test(c.name) ? childElements(c) : [c]));
  const pick = (pred: (e: XmlElement) => boolean) => {
    const e = pool.find(pred);
    return e ? clean(textContent(e)) || undefined : undefined;
  };
  return (
    pick((e) => e.name === "descrip" && /definition/i.test(attrOf(e, "type") ?? "")) ??
    pick((e) => e.name === "definition") ??
    pick((e) => e.name === "note") ??
    pick((e) => e.name === "descrip" && /context|explanation/i.test(attrOf(e, "type") ?? ""))
  );
}

export function isTbx(text: string): boolean {
  return /<(?:[\w.-]+:)?(martif|tbx)[\s>]/i.test(text.slice(0, 4096));
}

export function importTbx(text: string, file: string, opts: ImportOptions = {}): ImportResult {
  const notes = new Notes(file);
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
  if (!/^(martif|tbx)$/i.test(root.name)) throw new Error(`${file}: not a TBX file (root element <${root.qname}>, expected <martif> or <tbx>)`);
  const rootLang = langOfCode(attrOf(root, "lang"));
  const srcLang: Lang = opts.sourceLang ?? rootLang ?? "ja";
  const tgtLang: Lang = srcLang === "ja" ? "en" : "ja";
  const otherLangs = new Set<string>();
  const unknown = new Set<string>();
  const concepts: Concept[] = [];
  const entries = descendants(root, "termEntry", "conceptEntry");
  for (const entry of entries) {
    const c: Concept = { line: entry.line, sides: {}, notes: {} };
    const entryNote = tbxNote(entry);
    if (entryNote) c.notes.any = entryNote;
    for (const ls of descendants(entry, "langSet", "langSec")) {
      const code = attrOf(ls, "lang") ?? "";
      const lang = langOfCode(code);
      if (!lang) {
        otherLangs.add(code || "(no xml:lang)");
        continue;
      }
      const lsNote = tbxNote(ls);
      if (lsNote) c.notes[lang] ??= lsNote;
      let groups = descendants(ls, "tig", "ntig", "termSec");
      if (!groups.length) groups = [ls];
      for (const g of groups) {
        const termEl = descendants(g, "term")[0];
        const t = termEl ? clean(textContent(termEl)) : "";
        if (!t) continue;
        (c.sides[lang] ??= []).push({ text: t, status: tbxStatus(g, unknown) });
        const gNote = g === ls ? undefined : tbxNote(g);
        if (gNote) c.notes[lang] ??= gNote;
      }
    }
    if (c.sides.ja || c.sides.en) concepts.push(c);
  }
  if (!entries.length) notes.add("no termEntry/conceptEntry elements found");
  if (otherLangs.size) notes.add(`ignored languages: ${[...otherLangs].join(", ")}`);
  if (unknown.size) notes.add(`unrecognised administrativeStatus value(s) treated as preferred: ${[...unknown].slice(0, 5).join(", ")}`);
  const terms = buildTerms(concepts, srcLang, tgtLang, notes);
  return { glossary: { terms, characters: [] }, notes: notes.done(), direction: { source: srcLang, target: tgtLang }, orientable: true };
}

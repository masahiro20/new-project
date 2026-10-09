import { z } from "zod";
import { importCsv, importTbx, isTbx, sniffDelimiter } from "./glossary-import.js";
import { decodeText, stripBom } from "./parsers/decode.js";
import type { Glossary, Lang } from "./types.js";

const list = z.array(z.string()).optional();

const GlossarySchema = z.object({
  honorificPolicy: z.enum(["keep", "drop", "localize"]).optional(),
  ignoreWords: list,
  terms: z
    .array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        allowed: list,
        forbidden: list,
        note: z.string().optional(),
        draft: z.boolean().optional(),
      }),
    )
    .default([]),
  characters: z
    .array(
      z.object({
        id: z.string().min(1),
        ja: z.string().min(1),
        en: z.string().min(1),
        reading: z.string().optional(),
        aliases: z.object({ ja: list, en: list }).optional(),
        forbidden: z.object({ ja: list, en: list }).optional(),
        voice: z
          .object({
            ja: z
              .object({ firstPerson: list, politeness: z.enum(["polite", "plain"]).optional() })
              .optional(),
            en: z
              .object({
                contractions: z.enum(["never", "any"]).optional(),
                avoid: list,
                description: z.string().optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});

export const EMPTY_GLOSSARY: Glossary = { terms: [], characters: [] };

export interface GlossaryParseResult {
  glossary: Glossary;
  /** Things worth telling the user: skipped entries, ignored languages, merged translations, the direction used. */
  notes: string[];
  format: "json" | "csv" | "tsv" | "tbx";
  /** Direction the terms were read in (CSV with explicit source/target columns: "source"/"target"). */
  direction?: { source: Lang | "source"; target: Lang | "target" };
  /**
   * True when the file names its languages (TBX, "ja,en" or Crowdin/Phrase CSV) and can be rebuilt for the other
   * direction with `sourceLang`. JSON glossaries and type/source/target CSVs are fixed.
   */
  orientable: boolean;
}

export interface GlossaryParseOptions {
  /**
   * Language of the script's source text, for files that name their languages (TBX, bilingual CSV/TSV). Default:
   * the file's own hint (TBX root xml:lang, first language column), else ja.
   */
  sourceLang?: Lang;
}

function fromJson(text: string): Glossary {
  const raw: unknown = JSON.parse(stripBom(text));
  const parsed = GlossarySchema.safeParse(Array.isArray(raw) ? { terms: raw } : raw);
  if (!parsed.success) {
    throw new Error(`Invalid glossary: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

/**
 * Parses a glossary and reports what the import had to decide or skip. Dispatches on extension and content:
 * `.json` (or text starting with { or [) → Kotomark JSON; `.tbx`/`.xml` (or a <martif>/<tbx> root) → TBX;
 * anything else → CSV/TSV (Kotomark's type/source/target columns, or a termbase export such as Crowdin or
 * Phrase, or a plain "ja,en" list). Accepts bytes too (UTF-8, or UTF-16 with a BOM as Excel/Trados export it).
 */
export function parseGlossaryWithNotes(input: string | Uint8Array, file = "glossary.json", opts: GlossaryParseOptions = {}): GlossaryParseResult {
  const decoded = typeof input === "string" ? { text: input } : decodeText(input, file);
  const text = stripBom(decoded.text);
  const pre = decoded.note ? [decoded.note] : [];
  if (!text.trim()) return { glossary: EMPTY_GLOSSARY, notes: pre, format: /\.json$/i.test(file) ? "json" : "csv", orientable: false };
  const lower = file.toLowerCase();
  const head = text.trimStart();
  if (lower.endsWith(".json") || /^[{[]/.test(head)) return { glossary: fromJson(text), notes: pre, format: "json", orientable: false };
  if (/\.(tbx|tbxm|xml)$/.test(lower) || head.startsWith("<")) {
    if (!isTbx(text)) throw new Error(`${file}: XML glossaries must be TBX (a <martif> or <tbx> root element)`);
    const r = importTbx(text, file, opts);
    const sum = `${file}: TBX, ${r.glossary.terms.length} term(s) read as ${r.direction.source}→${r.direction.target}`;
    return { ...r, notes: [...pre, sum, ...r.notes], format: "tbx" };
  }
  const r = importCsv(text, file, opts);
  const format = sniffDelimiter(text, file) === "\t" ? "tsv" : "csv";
  const sum = r.orientable ? [`${file}: ${r.glossary.terms.length} term(s) read as ${r.direction.source}→${r.direction.target}`] : [];
  return { ...r, notes: [...pre, ...sum, ...r.notes], format };
}

/** Parses a glossary (see parseGlossaryWithNotes, which also returns the import notes). */
export function parseGlossary(input: string | Uint8Array, file = "glossary.json", opts: GlossaryParseOptions = {}): Glossary {
  if (typeof input === "string" && !input.trim()) return EMPTY_GLOSSARY;
  return parseGlossaryWithNotes(input, file, opts).glossary;
}

/** Kotomark JSON for a glossary, without empty lists or unset fields (for `glossary convert`). */
export function glossaryToJson(g: Glossary): string {
  const empty = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) && v.length === 0) || (!!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(empty));
  return JSON.stringify(g, (k, v: unknown) => (k !== "" && k !== "terms" && empty(v) ? undefined : v), 2);
}

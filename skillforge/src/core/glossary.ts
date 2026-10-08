import { z } from "zod";
import { parseCsvRecords } from "./parsers/csv.js";
import type { Glossary } from "./types.js";

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
      }),
    )
    .default([]),
  characters: z
    .array(
      z.object({
        id: z.string().min(1),
        ja: z.string().min(1),
        en: z.string().min(1),
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

const split = (s?: string) =>
  (s ?? "")
    .split(/[;；|]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Glossary CSV columns: type (term|character), source/ja, target/en, allowed, forbidden, note.
 * Multiple values in a cell are separated by ";".
 */
function fromCsv(text: string): Glossary {
  const recs = parseCsvRecords(text);
  const header = recs.shift()?.cells.map((h) => h.trim().toLowerCase()) ?? [];
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iType = col("type", "kind", "種別");
  const iSrc = col("source", "ja", "japanese", "原文");
  const iTgt = col("target", "en", "english", "訳語");
  const iAllowed = col("allowed", "aliases", "許容");
  const iForbidden = col("forbidden", "ng", "禁止");
  const iNote = col("note", "notes", "備考");
  if (iSrc < 0 || iTgt < 0) throw new Error("Glossary CSV needs source/ja and target/en columns");
  const g: Glossary = { terms: [], characters: [] };
  for (const r of recs) {
    const c = (i: number) => (i >= 0 ? (r.cells[i] ?? "").trim() : "");
    if (!c(iSrc) || !c(iTgt)) continue;
    if (/^(character|char|name|キャラ)/i.test(c(iType))) {
      g.characters.push({
        id: c(iTgt).toLowerCase(),
        ja: c(iSrc),
        en: c(iTgt),
        aliases: { en: split(c(iAllowed)) },
        forbidden: { en: split(c(iForbidden)) },
      });
    } else {
      g.terms.push({ source: c(iSrc), target: c(iTgt), allowed: split(c(iAllowed)), forbidden: split(c(iForbidden)), note: c(iNote) || undefined });
    }
  }
  return g;
}

export function parseGlossary(text: string, file = "glossary.json"): Glossary {
  if (!text.trim()) return EMPTY_GLOSSARY;
  const isJson = file.toLowerCase().endsWith(".json") || /^\s*[{[]/.test(text);
  if (!isJson) return fromCsv(text);
  const raw: unknown = JSON.parse(text.replace(/^﻿/, ""));
  const parsed = GlossarySchema.safeParse(Array.isArray(raw) ? { terms: raw } : raw);
  if (!parsed.success) {
    throw new Error(`Invalid glossary: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

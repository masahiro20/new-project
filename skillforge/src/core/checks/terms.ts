import { containsPhrase, countBy, KATAKANA_RUN, katakanaKey, looksJapanese, ref, textOf, visibleText } from "../text.js";
import { messages } from "../i18n.js";
import type { Finding, Glossary, Locale, ReviewPacket, Side, Table, UsageSummary } from "../types.js";

/**
 * Glossary term drift: every line whose source contains a glossary term must render it with the
 * approved target (or an allowed variant). Forbidden variants are flagged wherever they appear.
 */
export function checkTerms(tables: Table[], g: Glossary, locale: Locale = "en"): { findings: Finding[]; usage: UsageSummary[] } {
  const msg = messages(locale);
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  for (const term of g.terms) {
    const group = `${term.source} → ${term.target}`;
    const counts: Record<string, number> = {};
    const approved = [term.target, ...(term.allowed ?? [])];
    for (const t of tables) {
      // A JA→EN glossary says nothing about an EN→JA table (and vice versa); see glossaryDirection().
      if (looksJapanese(term.source) !== (t.sourceLang === "ja")) continue;
      for (const row of t.rows) {
        if (!row.target.trim()) continue;
        const src = visibleText(row.source);
        const tgt = visibleText(row.target);
        const forbiddenHit = (term.forbidden ?? []).find((f) => containsPhrase(tgt, f, t.targetLang));
        if (containsPhrase(src, term.source, t.sourceLang)) {
          const hit = approved.find((a) => containsPhrase(tgt, a, t.targetLang));
          if (hit) {
            counts[hit] = (counts[hit] ?? 0) + 1;
          } else if (forbiddenHit) {
            counts[forbiddenHit] = (counts[forbiddenHit] ?? 0) + 1;
            findings.push({
              category: "term", severity: "error", rule: "term.forbidden", group,
              file: row.file, line: row.line, id: row.id, side: "target",
              message: msg.termForbidden(term.source, forbiddenHit, term.target),
              found: forbiddenHit, expected: term.target,
            });
          } else {
            counts["(not found)"] = (counts["(not found)"] ?? 0) + 1;
            findings.push({
              category: "term", severity: "warning", rule: "term.missing", group,
              file: row.file, line: row.line, id: row.id, side: "target",
              message: msg.termMissing(term.source, term.target),
              expected: term.target,
            });
          }
        } else if (forbiddenHit && !approved.some((a) => containsPhrase(tgt, a, t.targetLang))) {
          findings.push({
            category: "term", severity: "warning", rule: "term.forbidden-stray", group,
            file: row.file, line: row.line, id: row.id, side: "target",
            message: msg.termForbiddenStray(forbiddenHit, term.target, term.source),
            found: forbiddenHit, expected: term.target,
          });
        }
      }
    }
    if (Object.keys(counts).length) usage.push({ category: "term", group, counts });
  }
  return { findings, usage };
}

/** Warn once per table whose direction does not match the glossary terms, so silence is never mistaken for a pass. */
export function glossaryDirection(tables: Table[], g: Glossary, locale: Locale = "en"): Finding[] {
  if (!g.terms.length) return [];
  const glossaryJa = g.terms.filter((t) => looksJapanese(t.source)).length >= g.terms.length / 2;
  return tables
    .filter((t) => glossaryJa !== (t.sourceLang === "ja"))
    .map((t) => ({
      category: "term" as const, severity: "warning" as const, rule: "term.direction",
      file: t.file, line: 1, id: "-", side: "source" as const, group: "glossary direction",
      message: messages(locale).termDirection(t.sourceLang, t.targetLang, glossaryJa ? "ja→en" : "en→ja"),
    }));
}

/**
 * Japanese katakana notation drift (表記揺れ): spellings that differ only by ・, ー, ヴ/バ or small kana,
 * e.g. マナ・ストーン / マナストーン, サーバー / サーバ. Runs on whichever side is Japanese.
 */
export function checkNotation(tables: Table[], locale: Locale = "en"): { findings: Finding[]; usage: UsageSummary[] } {
  type Hit = { surface: string; file: string; line: number; id: string; side: Side };
  const hits: Hit[] = [];
  for (const t of tables) {
    const side: Side | undefined = t.sourceLang === "ja" ? "source" : t.targetLang === "ja" ? "target" : undefined;
    if (!side) continue;
    for (const row of t.rows) {
      const seen = new Set<string>();
      for (const m of visibleText(textOf(row, side)).matchAll(KATAKANA_RUN)) {
        const surface = m[0].replace(/^[・＝]+|[・＝]+$/g, "");
        if (surface.length < 3 || seen.has(surface)) continue;
        seen.add(surface);
        hits.push({ surface, file: row.file, line: row.line, id: row.id, side });
      }
    }
  }
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  for (const [, group] of countBy(hits, (h) => katakanaKey(h.surface))) {
    const forms = countBy(group, (h) => h.surface);
    if (forms.size < 2) continue;
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    const majority = ranked[0]![0];
    const label = ranked.map(([s]) => s).join(" / ");
    usage.push({ category: "notation", group: label, counts: Object.fromEntries(ranked.map(([s, h]) => [s, h.length])) });
    for (const [surface, list] of ranked.slice(1)) {
      for (const h of list) {
        findings.push({
          category: "notation", severity: "warning", rule: "notation.katakana", group: label,
          file: h.file, line: h.line, id: h.id, side: h.side,
          message: messages(locale).notationKatakana(surface, majority, forms.get(majority)!.length),
          found: surface, expected: majority,
        });
      }
    }
  }
  return { findings, usage };
}

/**
 * Recurring katakana/kanji compounds that are not in the glossary. The engine cannot know the right
 * rendering, so these go to the user's assistant as review packets.
 */
export function unglossariedTermPackets(tables: Table[], g: Glossary, minRows = 3): ReviewPacket[] {
  const known = new Set([...g.terms.map((t) => t.source), ...g.characters.flatMap((c) => [c.ja, ...(c.aliases?.ja ?? [])])]);
  const byTerm = new Map<string, { t: Table; rowIdx: number }[]>();
  for (const t of tables) {
    if (t.sourceLang !== "ja") continue;
    t.rows.forEach((row, rowIdx) => {
      const words = new Set(visibleText(row.source).match(/[ァ-ヴー]{3,}|[一-鿿]{3,}/g) ?? []);
      for (const w of words) {
        if ([...known].some((k) => k.includes(w) || w.includes(k))) continue;
        const arr = byTerm.get(w) ?? [];
        arr.push({ t, rowIdx });
        byTerm.set(w, arr);
      }
    });
  }
  return [...byTerm.entries()]
    .filter(([, rows]) => rows.length >= minRows)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([term, rows]) => ({
      kind: "unglossaried-term" as const,
      subject: term,
      instructions:
        `"${term}" appears in ${rows.length} lines but is not in the glossary. Check whether it is translated the same way ` +
        `every time. Reply with the rendering used per line, the recommended canonical rendering, and the refs that deviate.`,
      lines: rows.slice(0, 25).map(({ t, rowIdx }) => {
        const r = t.rows[rowIdx]!;
        return { ref: ref(r), id: r.id, speaker: r.speaker, source: r.source, target: r.target };
      }),
    }));
}

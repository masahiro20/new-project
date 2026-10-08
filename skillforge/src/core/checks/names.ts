import { containsPhrase, countBy, damerauLevenshtein, katakanaKey, visibleText } from "../text.js";
import type { Finding, Glossary, GlossaryCharacter, Table, UsageSummary } from "../types.js";

const enNames = (c: GlossaryCharacter) => [c.en, ...(c.aliases?.en ?? [])];
const jaNames = (c: GlossaryCharacter) => [c.ja, ...(c.aliases?.ja ?? [])];

/** Words a near-miss scan should never flag: approved names, glossary targets, explicit ignore list. */
function knownWords(g: Glossary): Set<string> {
  const s = new Set<string>();
  const add = (phrase: string) => phrase.split(/[\s\-–—]+/).forEach((w) => w && s.add(w.toLowerCase()));
  g.characters.forEach((c) => enNames(c).forEach(add));
  g.terms.forEach((t) => [t.target, ...(t.allowed ?? [])].forEach(add));
  (g.ignoreWords ?? []).forEach(add);
  return s;
}

const HONORIFIC_SUFFIX = /-(sama|san|kun|chan|senpai|sempai|sensei|dono|tan|chama|han|nee|nii)$/i;

export function checkNames(tables: Table[], g: Glossary): { findings: Finding[]; usage: UsageSummary[] } {
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  const known = knownWords(g);

  for (const c of g.characters) {
    const group = `${c.ja} → ${c.en}`;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const jaSide = t.sourceLang === "ja" ? "source" : "target";
      const enSide = jaSide === "source" ? "target" : "source";
      if (t.sourceLang === t.targetLang) continue;
      for (const row of t.rows) {
        if (!row.target.trim()) continue;
        const ja = visibleText(row[jaSide]);
        const en = visibleText(row[enSide]);
        const forbidden = (c.forbidden?.en ?? []).find((f) => containsPhrase(en, f, "en"));
        const forbiddenJa = (c.forbidden?.ja ?? []).find((f) => ja.includes(f));
        if (forbidden) {
          counts[forbidden] = (counts[forbidden] ?? 0) + 1;
          findings.push({
            category: "name", severity: "error", rule: "name.forbidden", group,
            file: row.file, line: row.line, id: row.id, side: enSide,
            message: `Character name written as "${forbidden}"; the approved spelling is "${c.en}".`,
            found: forbidden, expected: c.en,
          });
        }
        if (forbiddenJa) {
          findings.push({
            category: "name", severity: "error", rule: "name.forbidden", group,
            file: row.file, line: row.line, id: row.id, side: jaSide,
            message: `Character name written as "${forbiddenJa}"; the approved spelling is "${c.ja}".`,
            found: forbiddenJa, expected: c.ja,
          });
        }
        if (jaNames(c).some((n) => ja.includes(n))) {
          const hit = enNames(c).find((n) => containsPhrase(en, n, "en"));
          if (hit) counts[hit] = (counts[hit] ?? 0) + 1;
          else if (!forbidden) {
            counts["(not rendered)"] = (counts["(not rendered)"] ?? 0) + 1;
            findings.push({
              category: "name", severity: "info", rule: "name.missing", group,
              file: row.file, line: row.line, id: row.id, side: enSide,
              message: `"${c.ja}" appears in the Japanese but "${enNames(c).join('" / "')}" does not appear in the English (fine if replaced by a pronoun).`,
              expected: c.en,
            });
          }
        }
      }
    }
    if (Object.keys(counts).length) usage.push({ category: "name", group, counts });
  }

  // Near-miss spellings of English names (Lizette for Lisette) that are not in any list.
  const forbiddenAll = new Set(g.characters.flatMap((c) => (c.forbidden?.en ?? []).map((f) => f.toLowerCase())));
  for (const t of tables) {
    const enSide = t.targetLang === "en" ? "target" : t.sourceLang === "en" ? "source" : undefined;
    if (!enSide) continue;
    for (const row of t.rows) {
      const seen = new Set<string>();
      for (const m of visibleText(row[enSide]).matchAll(/\b[A-Z][a-z]+(?:-[a-z]+)?\b/g)) {
        const token = m[0].replace(HONORIFIC_SUFFIX, "");
        const lower = token.toLowerCase();
        if (seen.has(lower) || known.has(lower) || forbiddenAll.has(lower)) continue;
        seen.add(lower);
        for (const c of g.characters) {
          const close = enNames(c).find((n) => {
            if (n.length < 4 || /\s/.test(n)) return false;
            const d = damerauLevenshtein(lower, n.toLowerCase());
            return d === 1 || (d === 2 && n.length >= 7 && lower[0] === n[0]!.toLowerCase());
          });
          if (close) {
            findings.push({
              category: "name", severity: "warning", rule: "name.near-miss", group: `${c.ja} → ${c.en}`,
              file: row.file, line: row.line, id: row.id, side: enSide,
              message: `"${token}" looks like a misspelling of "${close}". Add it to ignoreWords if it is a real word.`,
              found: token, expected: close,
            });
            break;
          }
        }
      }
    }
  }

  // Speaker-label drift: the same character labelled differently across files/rows.
  const speakerRows = tables.flatMap((t) => t.rows.filter((r) => r.speaker));
  const normSpeaker = (s: string) => katakanaKey(s.toLowerCase().replace(/[\s._\-・()（）]/g, ""));
  for (const [, rows] of countBy(speakerRows, (r) => findCharacter(g, r.speaker)?.id ?? normSpeaker(r.speaker!))) {
    const forms = countBy(rows, (r) => r.speaker!);
    if (forms.size < 2) continue;
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    const majority = ranked[0]![0];
    for (const [label, list] of ranked.slice(1)) {
      for (const r of list) {
        findings.push({
          category: "name", severity: "warning", rule: "name.speaker-label", group: `speaker ${majority}`,
          file: r.file, line: r.line, id: r.id, side: "source",
          message: `Speaker label "${label}" differs from "${majority}" used in ${forms.get(majority)!.length} other rows.`,
          found: label, expected: majority,
        });
      }
    }
  }
  if (g.characters.length) {
    const labels = new Set(g.characters.flatMap((c) => [c.id, ...jaNames(c), ...enNames(c)].map(normSpeaker)));
    for (const [label, rows] of countBy(speakerRows, (r) => r.speaker!)) {
      const key = normSpeaker(label);
      if (labels.has(key)) continue;
      const near = [...labels].find((l) => l.length >= 3 && damerauLevenshtein(key, l) === 1);
      if (!near) continue;
      for (const r of rows) {
        findings.push({
          category: "name", severity: "warning", rule: "name.speaker-unknown", group: `speaker ${label}`,
          file: r.file, line: r.line, id: r.id, side: "source",
          message: `Speaker "${label}" is not in the character sheet and is one edit away from a known character.`,
          found: label,
        });
      }
    }
  }
  return { findings, usage };
}

/** Resolve a speaker label to a glossary character (by id, ja/en name or alias). */
export function findCharacter(g: Glossary, label?: string): GlossaryCharacter | undefined {
  if (!label) return undefined;
  const k = label.trim().toLowerCase();
  return g.characters.find((c) => [c.id, ...jaNames(c), ...enNames(c)].some((n) => n.toLowerCase() === k));
}

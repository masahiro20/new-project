import { containsPhrase, countBy, damerauLevenshtein, katakanaKey, normalizeApostrophes, visibleText } from "../text.js";
import { messages } from "../i18n.js";
import type { Finding, Glossary, GlossaryCharacter, Locale, Table, UsageSummary } from "../types.js";

// Names are compared with apostrophes folded (Li’sar = Li'sar), the same way visibleText folds the script text.
const enNames = (c: GlossaryCharacter) => [c.en, ...(c.aliases?.en ?? [])].map(normalizeApostrophes);
const jaNames = (c: GlossaryCharacter) => [c.ja, ...(c.aliases?.ja ?? [])].map(normalizeApostrophes);
/** Names a speaker label may use: id, Japanese and English names and aliases, and the kana reading. */
const labelNames = (c: GlossaryCharacter) => [c.id, ...jaNames(c), ...enNames(c), ...(c.reading ? [c.reading] : [])];

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

export function checkNames(tables: Table[], g: Glossary, locale: Locale = "en"): { findings: Finding[]; usage: UsageSummary[] } {
  const msg = messages(locale);
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
        const forbidden = (c.forbidden?.en ?? []).find((f) => containsPhrase(en, f, "en", true));
        const forbiddenJa = (c.forbidden?.ja ?? []).find((f) => ja.includes(f));
        if (forbidden) {
          counts[forbidden] = (counts[forbidden] ?? 0) + 1;
          findings.push({
            category: "name", severity: "error", rule: "name.forbidden", group,
            file: row.file, line: row.line, id: row.id, side: enSide,
            message: msg.nameForbidden(forbidden, c.en),
            found: forbidden, expected: c.en,
          });
        }
        if (forbiddenJa) {
          findings.push({
            category: "name", severity: "error", rule: "name.forbidden", group,
            file: row.file, line: row.line, id: row.id, side: jaSide,
            message: msg.nameForbidden(forbiddenJa, c.ja),
            found: forbiddenJa, expected: c.ja,
          });
        }
        if (jaNames(c).some((n) => ja.includes(n))) {
          const hit = enNames(c).find((n) => containsPhrase(en, n, "en", true));
          if (hit) counts[hit] = (counts[hit] ?? 0) + 1;
          else if (!forbidden) {
            counts["(not rendered)"] = (counts["(not rendered)"] ?? 0) + 1;
            findings.push({
              category: "name", severity: "info", rule: "name.missing", group,
              file: row.file, line: row.line, id: row.id, side: enSide,
              message: msg.nameMissing(c.ja, enNames(c)),
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
  // Words seen in lowercase anywhere in the English text are ordinary words ("Rain", "Main"), not names.
  const lowercaseWords = new Set<string>();
  for (const t of tables) {
    const enSide = t.targetLang === "en" ? "target" : t.sourceLang === "en" ? "source" : undefined;
    if (enSide) for (const row of t.rows) for (const m of visibleText(row[enSide]).matchAll(/\b[a-z]+\b/g)) lowercaseWords.add(m[0]);
  }
  // A Japanese translation that keeps names in Latin script (Konrad 王子) can misspell them too; scan its Latin tokens
  // for the characters it is seen to keep verbatim, skipping tokens copied from the row's own English.
  const keptInJa = (t: Table, jaSide: "source" | "target") =>
    g.characters.filter((c) => t.rows.some((r) => enNames(c).some((n) => containsPhrase(visibleText(r[jaSide]), n, "en", true))));
  for (const t of tables) {
    const enSide = t.targetLang === "en" ? "target" : t.sourceLang === "en" ? "source" : undefined;
    const jaSide = t.targetLang === "ja" ? "target" : t.sourceLang === "ja" ? "source" : undefined;
    const scans: { side: "source" | "target"; chars: GlossaryCharacter[] }[] = [];
    if (enSide) scans.push({ side: enSide, chars: g.characters });
    if (jaSide && enSide && g.characters.length) scans.push({ side: jaSide, chars: keptInJa(t, jaSide) });
    for (const { side, chars } of scans) for (const row of t.rows) {
      const seen = new Set<string>();
      const en = side === jaSide && enSide ? visibleText(row[enSide]) : undefined;
      for (const m of visibleText(row[side]).matchAll(/(?<![A-Za-z])[A-Z][a-z]+(?:-[a-z]+)?(?![A-Za-z])/g)) {
        const token = m[0].replace(HONORIFIC_SUFFIX, "");
        const lower = token.toLowerCase();
        if (seen.has(lower) || known.has(lower) || forbiddenAll.has(lower) || lowercaseWords.has(lower)) continue;
        if (en && containsPhrase(en, token, "en", true)) continue;
        seen.add(lower);
        for (const c of chars) {
          const close = enNames(c).find((n) => {
            if (n.length < 4 || /\s/.test(n)) return false;
            const d = damerauLevenshtein(lower, n.toLowerCase());
            return lower[0] === n[0]!.toLowerCase() && (d === 1 || (d === 2 && n.length >= 7));
          });
          if (close) {
            findings.push({
              category: "name", severity: "warning", rule: "name.near-miss", group: `${c.ja} → ${c.en}`,
              file: row.file, line: row.line, id: row.id, side,
              message: msg.nameNearMiss(token, close),
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
  const normSpeaker = (s: string) => katakanaKey(hiraganaToKatakana(s.toLowerCase()).replace(/[\s._\-・()（）]/g, ""));
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
          message: msg.nameSpeakerLabel(label, majority, forms.get(majority)!.length),
          found: label, expected: majority,
        });
      }
    }
  }
  if (g.characters.length) {
    const labels = new Set(g.characters.flatMap((c) => labelNames(c).map(normSpeaker)));
    for (const [label, rows] of countBy(speakerRows, (r) => r.speaker!)) {
      // A label that resolves to a character (ガルド（騎士長）, りん) is reported as name.speaker-label, not unknown.
      if (findCharacter(g, label)) continue;
      const key = normSpeaker(stripSpeakerTitle(label));
      if (labels.has(key)) continue;
      const near = [...labels].find((l) => l.length >= 3 && damerauLevenshtein(key, l) === 1);
      if (!near) continue;
      for (const r of rows) {
        findings.push({
          category: "name", severity: "warning", rule: "name.speaker-unknown", group: `speaker ${label}`,
          file: r.file, line: r.line, id: r.id, side: "source",
          message: msg.nameSpeakerUnknown(label),
          found: label,
        });
      }
    }
  }
  return { findings, usage };
}

/** Hiragana → katakana (りん → リン), so a speaker label typed in hiragana resolves to its katakana name. */
export function hiraganaToKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** Drop a trailing bracketed title or note from a speaker label: ガルド（騎士長）, ガルド(騎士長), ガルド【騎士長】, Gald (armored). */
export function stripSpeakerTitle(label: string): string {
  const stripped = label.trim().replace(/\s*(?:（[^（）]*）|\([^()]*\)|【[^【】]*】)$/, "").trim();
  return stripped || label.trim();
}

/**
 * Resolve a speaker label to a glossary character (by id, ja/en name or alias), case-insensitively. A trailing
 * bracketed title is ignored and hiragana matches katakana, so ガルド（騎士長） and りん resolve to ガルド and リン. A kana
 * label for a kanji name (しおり for 詩織) resolves through the character's `reading` (or a kana alias).
 */
export function findCharacter(g: Glossary, label?: string): GlossaryCharacter | undefined {
  if (!label) return undefined;
  const exact = label.trim().toLowerCase();
  const loose = hiraganaToKatakana(stripSpeakerTitle(label).toLowerCase());
  const names = (c: GlossaryCharacter) => labelNames(c).map((n) => n.toLowerCase());
  return g.characters.find((c) => names(c).some((n) => n === exact)) ??
    g.characters.find((c) => names(c).some((n) => hiraganaToKatakana(n) === loose));
}

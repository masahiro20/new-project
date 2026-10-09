import { containsPhrase, countBy, damerauLevenshtein, katakanaKey, normalizeApostrophes, visibleText } from "../text.js";
import { checkBudget } from "../limits.js";
import { messages } from "../i18n.js";
import { AnchorMatcher, foldCase, phraseAnchor } from "../matcher.js";
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

  // B-02: rows that can concern a character (a Japanese name, or a forbidden variant on either side), found with one
  // Aho-Corasick pass per row instead of characters × rows. The loop below only skips rows where it would do nothing.
  const fold = (s: string) => foldCase(normalizeApostrophes(s));
  const owners: number[] = [];
  const anchorsJa: string[] = [];
  const ownersEn: number[] = [];
  const anchorsEn: string[] = [];
  g.characters.forEach((c, ci) => {
    for (const n of [...jaNames(c), ...(c.forbidden?.ja ?? [])]) (owners.push(ci), anchorsJa.push(phraseAnchor(n, "ja")));
    for (const f of c.forbidden?.en ?? []) if (f) (ownersEn.push(ci), anchorsEn.push(phraseAnchor(f, "en")));
  });
  const jaIndex = new AnchorMatcher(anchorsJa);
  const enIndex = new AnchorMatcher(anchorsEn);
  const candidates = tables.map((t) => {
    const byChar = new Map<number, number[]>();
    if (t.sourceLang === t.targetLang || !g.characters.length) return byChar;
    const jaSide = t.sourceLang === "ja" ? "source" : "target";
    const enSide = jaSide === "source" ? "target" : "source";
    t.rows.forEach((row, ri) => {
      checkBudget();
      if (!row.target.trim()) return;
      const cs = new Set<number>();
      for (const k of jaIndex.find(fold(visibleText(row[jaSide])))) cs.add(owners[k]!);
      if (anchorsEn.length) for (const k of enIndex.find(fold(visibleText(row[enSide])))) cs.add(ownersEn[k]!);
      for (const ci of cs) {
        const list = byChar.get(ci);
        if (list) list.push(ri);
        else byChar.set(ci, [ri]);
      }
    });
    return byChar;
  });

  g.characters.forEach((c, ci) => {
    const group = `${c.ja} → ${c.en}`;
    const counts: Record<string, number> = {};
    tables.forEach((t, tIdx) => {
      const jaSide = t.sourceLang === "ja" ? "source" : "target";
      const enSide = jaSide === "source" ? "target" : "source";
      if (t.sourceLang === t.targetLang) return;
      for (const ri of candidates[tIdx]!.get(ci) ?? []) {
        checkBudget();
        const row = t.rows[ri]!;
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
    });
    if (Object.keys(counts).length) usage.push({ category: "name", group, counts });
  });

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
  const enNameOwners: number[] = [];
  const enNameIndex = new AnchorMatcher(g.characters.flatMap((c, ci) => enNames(c).map((n) => (enNameOwners.push(ci), phraseAnchor(n, "en")))));
  const keptInJa = (t: Table, jaSide: "source" | "target") => {
    const kept = new Set<number>();
    for (const r of t.rows) {
      const text = visibleText(r[jaSide]);
      for (const k of enNameIndex.find(fold(text))) {
        const ci = enNameOwners[k]!;
        if (!kept.has(ci) && enNames(g.characters[ci]!).some((n) => containsPhrase(text, n, "en", true))) kept.add(ci);
      }
    }
    return g.characters.filter((_, ci) => kept.has(ci));
  };
  // Near-miss candidates by first letter: a name within edit distance 2 starts with the same letter (required below)
  // and differs in length by at most 2, so each token is compared with a few names instead of every character (B-02).
  const byInitial = (chars: GlossaryCharacter[]) => {
    const m = new Map<string, { ci: number; len: number }[]>();
    chars.forEach((c, ci) => {
      for (const n of enNames(c)) {
        if (n.length < 4 || /\s/.test(n)) continue;
        const k = n[0]!.toLowerCase();
        const list = m.get(k) ?? [];
        list.push({ ci, len: n.toLowerCase().length });
        m.set(k, list);
      }
    });
    return m;
  };
  for (const t of tables) {
    const enSide = t.targetLang === "en" ? "target" : t.sourceLang === "en" ? "source" : undefined;
    const jaSide = t.targetLang === "ja" ? "target" : t.sourceLang === "ja" ? "source" : undefined;
    const scans: { side: "source" | "target"; chars: GlossaryCharacter[] }[] = [];
    if (enSide) scans.push({ side: enSide, chars: g.characters });
    if (jaSide && enSide && g.characters.length) scans.push({ side: jaSide, chars: keptInJa(t, jaSide) });
    for (const { side, chars } of scans) {
      const initials = byInitial(chars);
      for (const row of t.rows) {
        checkBudget();
        const seen = new Set<string>();
        const en = side === jaSide && enSide ? visibleText(row[enSide]) : undefined;
        for (const m of visibleText(row[side]).matchAll(/(?<![A-Za-z])[A-Z][a-z]+(?:-[a-z]+)?(?![A-Za-z])/g)) {
          const token = m[0].replace(HONORIFIC_SUFFIX, "");
          const lower = token.toLowerCase();
          if (seen.has(lower) || known.has(lower) || forbiddenAll.has(lower) || lowercaseWords.has(lower)) continue;
          if (en && containsPhrase(en, token, "en", true)) continue;
          seen.add(lower);
          const near = [...new Set((initials.get(lower[0]!) ?? []).filter((x) => Math.abs(x.len - lower.length) <= 2).map((x) => x.ci))].sort((a, b) => a - b);
          for (const c of near.map((ci) => chars[ci]!)) {
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
    // `[...labels].find((l) => l.length >= 3 && damerauLevenshtein(key, l) === 1)` through a one-deletion index:
    // two strings at edit distance 1 (substitution, insertion, deletion or transposition) share a one-deletion
    // variant, so each label is compared with a few candidates instead of every name (B-02).
    const order = [...labels].filter((l) => l.length >= 3);
    const variants = new Map<string, number[]>();
    const dels = (w: string) => [w, ...Array.from({ length: w.length }, (_, i) => w.slice(0, i) + w.slice(i + 1))];
    order.forEach((l, li) => {
      for (const v of new Set(dels(l))) (variants.get(v) ?? variants.set(v, []).get(v)!).push(li);
    });
    const nearLabel = (key: string) => {
      const cands = new Set<number>();
      for (const v of dels(key)) for (const li of variants.get(v) ?? []) cands.add(li);
      return [...cands].sort((a, b) => a - b).map((li) => order[li]!).find((l) => damerauLevenshtein(key, l) === 1);
    };
    for (const [label, rows] of countBy(speakerRows, (r) => r.speaker!)) {
      // A label that resolves to a character (ガルド（騎士長）, りん) is reported as name.speaker-label, not unknown.
      if (findCharacter(g, label)) continue;
      const key = normSpeaker(stripSpeakerTitle(label));
      if (labels.has(key)) continue;
      const near = nearLabel(key);
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
  // Paired scenario files (.ks): the translation writes its own speaker labels. The original's label identifies the
  // character; the translation's must be that character's name in the translation language (or the shared id).
  for (const t of tables) {
    if (t.sourceLang === t.targetLang) continue;
    const loose = (s: string) => hiraganaToKatakana(stripSpeakerTitle(normalizeApostrophes(s)).toLowerCase());
    for (const row of t.rows) {
      if (!row.targetSpeaker) continue;
      const c = findCharacter(g, row.speaker);
      if (!c) continue;
      const label = row.targetSpeaker;
      const group = `${c.ja} → ${c.en}`;
      const forbidden = (t.targetLang === "en" ? c.forbidden?.en : c.forbidden?.ja)?.find((f) => loose(f) === loose(label));
      if (forbidden) {
        const approved = t.targetLang === "en" ? c.en : c.ja;
        findings.push({
          category: "name", severity: "error", rule: "name.forbidden", group,
          file: row.file, line: row.line, id: row.id, side: "target",
          message: msg.nameForbidden(label, approved),
          found: label, expected: approved,
        });
        continue;
      }
      const approved = t.targetLang === "en" ? enNames(c) : [...jaNames(c), ...(c.reading ? [c.reading] : [])];
      if ([c.id, ...approved].some((n) => loose(n) === loose(label))) continue;
      findings.push({
        category: "name", severity: "warning", rule: "name.speaker-label", group: `speaker ${approved[0]}`,
        file: row.file, line: row.line, id: row.id, side: "target",
        message: msg.nameSpeakerTarget(label, row.speaker!, approved),
        found: label, expected: approved[0],
      });
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
  const index = characterIndex(g.characters);
  return index.exact.get(exact) ?? index.loose.get(loose);
}

/**
 * First character (in glossary order) per lower-cased label name and per its katakana-folded form. Called once per row
 * by several checks, so a linear scan of the characters there made them characters × rows (B-02). Cached per
 * characters array (rebuilt if its length changes).
 */
const characterIndexCache = new WeakMap<GlossaryCharacter[], { size: number; exact: Map<string, GlossaryCharacter>; loose: Map<string, GlossaryCharacter> }>();
function characterIndex(chars: GlossaryCharacter[]) {
  const cached = characterIndexCache.get(chars);
  if (cached && cached.size === chars.length) return cached;
  const exact = new Map<string, GlossaryCharacter>();
  const loose = new Map<string, GlossaryCharacter>();
  for (const c of chars) {
    for (const n of labelNames(c).map((x) => x.toLowerCase())) {
      if (!exact.has(n)) exact.set(n, c);
      const k = hiraganaToKatakana(n);
      if (!loose.has(k)) loose.set(k, c);
    }
  }
  const index = { size: chars.length, exact, loose };
  characterIndexCache.set(chars, index);
  return index;
}

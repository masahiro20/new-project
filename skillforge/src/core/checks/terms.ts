import { containsPhrase, countBy, enPhraseRegex, isInterjection, KATAKANA_RUN, katakanaKey, looksJapanese, ref, singularOf, textOf, visibleText } from "../text.js";
import { messages } from "../i18n.js";
import type { Finding, Glossary, Locale, ReviewPacket, Side, Table, UsageSummary } from "../types.js";

const isAllCaps = (s: string) => /[A-Z].*[A-Z]/.test(s) && !/[a-z]/.test(s);

/**
 * Does an English source contain the term? Case-insensitive, singular or plural, but an ALL-CAPS word (an
 * identifier such as the animation name RESET) is not an occurrence of a mixed-case term (Reset).
 */
function enSourceHas(text: string, phrase: string): boolean {
  for (const form of new Set([phrase, singularOf(phrase)])) {
    const caps = isAllCaps(form);
    const re = enPhraseRegex(form);
    const all = new RegExp(re.source, `${re.flags}g`);
    for (const m of text.matchAll(all)) if (caps || !isAllCaps(m[0])) return true;
  }
  return false;
}

/**
 * Glossary term drift: every line whose source contains a glossary term must render it with the
 * approved target (or an allowed variant). Forbidden variants are flagged wherever they appear.
 *
 * term.missing is not reported when a Japanese target keeps the English term as-is (App Store, GridMap), when a
 * longer glossary term containing this one also matches the line (Loading Block Modifiers vs Modifiers), or when
 * the approved rendering appears with ordinary grammar around it (選択を解除 for 選択解除). Unreviewed draft terms
 * (`draft: true`) report it as info.
 */
export function checkTerms(tables: Table[], g: Glossary, locale: Locale = "en"): { findings: Finding[]; usage: UsageSummary[] } {
  const msg = messages(locale);
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  const srcHas = (text: string, phrase: string, lang: Table["sourceLang"]) =>
    lang === "ja" ? containsPhrase(text, phrase, "ja") : enSourceHas(text, phrase);
  // Which terms each row's source contains, for longest-match-wins.
  const matched = new Map<Table, boolean[][]>();
  for (const t of tables) {
    matched.set(t, t.rows.map((row) => {
      const src = visibleText(row.source);
      return g.terms.map((term) => looksJapanese(term.source) === (t.sourceLang === "ja") && srcHas(src, term.source, t.sourceLang));
    }));
  }
  g.terms.forEach((term, ti) => {
    const group = `${term.source} → ${term.target}`;
    const counts: Record<string, number> = {};
    const approved = [term.target, ...(term.allowed ?? [])];
    // Longer terms that contain this one ("Block Modifiers" for "Modifiers").
    const longer = g.terms
      .map((o, oi) => ({ o, oi }))
      .filter(({ o, oi }) => oi !== ti && o.source.length > term.source.length && looksJapanese(o.source) === looksJapanese(term.source) &&
        containsPhrase(o.source, term.source, looksJapanese(term.source) ? "ja" : "en"))
      .map(({ oi }) => oi);
    for (const t of tables) {
      // A JA→EN glossary says nothing about an EN→JA table (and vice versa); see glossaryDirection().
      if (looksJapanese(term.source) !== (t.sourceLang === "ja")) continue;
      const rowHits = matched.get(t)!;
      t.rows.forEach((row, ri) => {
        if (!row.target.trim()) return;
        const tgt = visibleText(row.target);
        const forbiddenHit = (term.forbidden ?? []).find((f) => containsPhrase(tgt, f, t.targetLang));
        if (rowHits[ri]![ti]) {
          // English: an inflected form (Renoted for Renote) counts unless a forbidden variant is on the line, so
          // a forbidden variant that is itself an inflection of the approved rendering is still reported.
          const strict = t.targetLang === "ja";
          const hit = approved.find((a) => containsPhrase(tgt, a, t.targetLang, false, strict)) ??
            (forbiddenHit ? undefined : approved.find((a) => containsPhrase(tgt, a, t.targetLang, false, true)));
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
          } else if (t.targetLang === "ja" && !looksJapanese(term.source) && [term.source, singularOf(term.source)].some((f) => containsPhrase(tgt, f, "en"))) {
            // Kept in English in the translation (a product, class or key name), in any case (VSync / VSYNC).
            counts[term.source] = (counts[term.source] ?? 0) + 1;
          } else if (longer.some((oi) => rowHits[ri]![oi])) {
            // The longer term owns this span and reports on it.
          } else {
            counts["(not found)"] = (counts["(not found)"] ?? 0) + 1;
            findings.push({
              category: "term", severity: term.draft ? "info" : "warning", rule: "term.missing", group,
              file: row.file, line: row.line, id: row.id, side: "target",
              message: msg.termMissing(term.source, term.target),
              expected: term.target,
            });
          }
        } else if (forbiddenHit && !approved.some((a) => containsPhrase(tgt, a, t.targetLang, false, true))) {
          findings.push({
            category: "term", severity: "warning", rule: "term.forbidden-stray", group,
            file: row.file, line: row.line, id: row.id, side: "target",
            message: msg.termForbiddenStray(forbiddenHit, term.target, term.source),
            found: forbiddenHit, expected: term.target,
          });
        }
      });
    }
    if (Object.keys(counts).length) usage.push({ category: "term", group, counts });
  });
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
 * Japanese katakana notation drift (表記揺れ): spellings that differ only by ・, ー, ヴ/バ, small kana or イ/ウ vs ー,
 * e.g. マナ・ストーン / マナストーン, サーバー / サーバ. Runs on whichever side is Japanese. Interjections (アアァ) are
 * skipped. A compound (データフォルダー) is steered towards the house style of the words it
 * contains (フォルダ ×25), so it never gets advice that contradicts the standalone word's group.
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
        if (surface.length < 3 || seen.has(surface) || isInterjection(surface)) continue;
        seen.add(surface);
        hits.push({ surface, file: row.file, line: row.line, id: row.id, side });
      }
    }
  }
  const findings: Finding[] = [];
  const usage: UsageSummary[] = [];
  const groups = countBy(hits, (h) => katakanaKey(h.surface));
  // Words whose spelling is settled: a single form, or a form used more often than any other.
  const settled: { key: string; form: string; total: number }[] = [];
  for (const [key, group] of groups) {
    const ranked = [...countBy(group, (h) => h.surface).entries()].sort((a, b) => b[1].length - a[1].length);
    if (ranked.length === 1 || ranked[0]![1].length > ranked[1]![1].length) settled.push({ key, form: ranked[0]![0], total: group.length });
  }
  for (const [key, group] of groups) {
    const forms = countBy(group, (h) => h.surface);
    if (forms.size < 2) continue;
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    // Settled words contained in this compound, used at least as often as the compound itself.
    const bases = settled.filter((b) => b.key !== key && b.key.length >= 2 && key.includes(b.key) && b.total >= group.length);
    const score = (form: string) => bases.filter((b) => containsWord(form, b.form)).length;
    const best = bases.length ? Math.max(...ranked.map(([f]) => score(f))) : 0;
    const majority = best > 0 ? ranked.find(([f]) => score(f) === best)![0] : ranked[0]![0];
    const label = ranked.map(([s]) => s).join(" / ");
    usage.push({ category: "notation", group: label, counts: Object.fromEntries(ranked.map(([s, h]) => [s, h.length])) });
    for (const [surface, list] of ranked) {
      if (surface === majority) continue;
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

/** `word` occurs in `compound` as a whole spelling: not followed by ー or a small kana (フォルダ is not in フォルダー). */
function containsWord(compound: string, word: string): boolean {
  for (let i = compound.indexOf(word); i >= 0; i = compound.indexOf(word, i + 1)) {
    if (!/^[ーァィゥェォャュョ・]/.test(compound.slice(i + word.length))) return true;
  }
  return false;
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

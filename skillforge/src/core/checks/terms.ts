import { containsPhrase, countBy, enPhraseRegex, isInterjection, KATAKANA_RUN, katakanaKey, looksJapanese, normalizeApostrophes, ref, singularOf, textOf, visibleText } from "../text.js";
import { checkBudget } from "../limits.js";
import { messages } from "../i18n.js";
import { AnchorMatcher, foldCase, phraseAnchor } from "../matcher.js";
import { hiraganaToKatakana } from "./names.js";
import type { Finding, Glossary, Lang, Locale, ReviewPacket, Side, Table, UsageSummary } from "../types.js";

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
  const termLang: Lang[] = g.terms.map((t) => (looksJapanese(t.source) ? "ja" : "en"));
  // B-02: one Aho-Corasick pass per row finds the few terms worth the exact (regex) test, instead of terms × rows.
  const sourceIndex = { ja: termIndex(g, termLang, "ja"), en: termIndex(g, termLang, "en") };
  const fold = (s: string) => foldCase(normalizeApostrophes(s));
  // Longer terms that contain each term ("Block Modifiers" for "Modifiers"), found the same way.
  const longer: number[][] = g.terms.map(() => []);
  g.terms.forEach((o, oi) => {
    const lang = termLang[oi]!;
    for (const ti of sourceIndex[lang].find(fold(o.source))) {
      const term = g.terms[ti]!;
      if (oi !== ti && o.source.length > term.source.length && containsPhrase(o.source, term.source, lang)) longer[ti]!.push(oi);
    }
  });
  // Per table: which terms each row's source contains (longest-match-wins), the rows per term, and the rows whose
  // target may contain one of the term's forbidden variants.
  const perTable = tables.map((t) => {
    const rowTerms = new Map<number, Set<number>>();
    const hitRows = new Map<number, number[]>();
    const forbRows = new Map<number, number[]>();
    const idx = sourceIndex[t.sourceLang];
    const forb = forbiddenIndex(g, termLang, t.sourceLang, t.targetLang);
    t.rows.forEach((row, ri) => {
      checkBudget();
      const src = visibleText(row.source);
      for (const ti of idx.find(fold(src))) {
        if (!srcHas(src, g.terms[ti]!.source, t.sourceLang)) continue;
        let set = rowTerms.get(ri);
        if (!set) rowTerms.set(ri, (set = new Set()));
        set.add(ti);
        push(hitRows, ti, ri);
      }
      if (forb.size && row.target.trim()) for (const ti of forb.find(fold(visibleText(row.target)))) push(forbRows, ti, ri);
    });
    for (const list of hitRows.values()) list.sort((a, b) => a - b);
    for (const list of forbRows.values()) list.sort((a, b) => a - b);
    return { rowTerms, hitRows, forbRows };
  });
  g.terms.forEach((term, ti) => {
    const group = `${term.source} → ${term.target}`;
    const counts: Record<string, number> = {};
    const approved = [term.target, ...(term.allowed ?? [])];
    tables.forEach((t, tIdx) => {
      // A JA→EN glossary says nothing about an EN→JA table (and vice versa); see glossaryDirection().
      if (termLang[ti] !== t.sourceLang) return;
      const { rowTerms, hitRows, forbRows } = perTable[tIdx]!;
      for (const ri of mergeSorted(hitRows.get(ti) ?? [], forbRows.get(ti) ?? [])) {
        checkBudget();
        const row = t.rows[ri]!;
        if (!row.target.trim()) continue;
        const tgt = visibleText(row.target);
        const forbiddenHit = (term.forbidden ?? []).find((f) => containsPhrase(tgt, f, t.targetLang));
        const hits = rowTerms.get(ri);
        if (hits?.has(ti)) {
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
          } else if (longer[ti]!.some((oi) => hits.has(oi))) {
            // The longer term owns this span and reports on it.
          } else {
            counts["(not found)"] = (counts["(not found)"] ?? 0) + 1;
            const compound = t.sourceLang === "ja" ? compoundOnly(visibleText(row.source), term.source) : undefined;
            findings.push({
              category: "term", severity: term.draft || compound ? "info" : "warning", rule: "term.missing", group,
              file: row.file, line: row.line, id: row.id, side: "target",
              message: compound ? msg.termMissingCompound(term.source, term.target, compound) : msg.termMissing(term.source, term.target),
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
      }
    });
    if (Object.keys(counts).length) usage.push({ category: "term", group, counts });
  });
  return { findings, usage };
}

const KANJI = /[\u4e00-\u9fff々〆]/;

/**
 * When every occurrence of a kanji-final Japanese term is followed by another kanji (部室 in 部室棟, 選択 in 選択肢,
 * 更新 in 更新間隔), the term may be part of a different, longer word. Returns that compound (the term plus the kanji
 * run after it) so term.missing can drop to info; undefined when the term also occurs on its own. Longer glossary
 * terms are handled before this (they own the span), so the compound here is one the glossary does not list.
 */
function compoundOnly(src: string, term: string): string | undefined {
  if (!KANJI.test(term.slice(-1))) return undefined;
  let compound: string | undefined;
  for (let i = src.indexOf(term); i >= 0; i = src.indexOf(term, i + 1)) {
    const tail = /^[\u4e00-\u9fff々〆]+/.exec(src.slice(i + term.length));
    if (!tail) return undefined;
    compound ??= term + tail[0];
  }
  return compound;
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

/** Katakana spellings the glossary approves, by katakanaKey: the Japanese side of each term (and its allowed variants when Japanese) and character names. */
function glossaryKatakana(g: Glossary): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (text: string) => {
    for (const m of text.matchAll(KATAKANA_RUN)) {
      const surface = m[0].replace(/^[・＝]+|[・＝]+$/g, "");
      if (surface.length < 3 || isInterjection(surface)) continue;
      const key = katakanaKey(surface);
      const list = out.get(key) ?? [];
      if (!list.includes(surface)) list.push(surface);
      out.set(key, list);
    }
  };
  for (const term of g.terms) {
    if (looksJapanese(term.source)) add(term.source);
    else [term.target, ...(term.allowed ?? [])].filter(looksJapanese).forEach(add);
  }
  for (const c of g.characters) [c.ja, ...(c.aliases?.ja ?? [])].forEach(add);
  return out;
}

// Hiragana that may sit between two katakana words as a particle (ゲームとアニメ, アイテムをゲット).
const KANA_MIX_PARTICLES = new Set([..."のをへとやがにでもかはなよねっ"]);
// Hiragana that never follows a katakana word as grammar, so at the end of a katakana run it is a slip (ルーぺ for ルーペ;
// ぺ / べ look the same as ペ / ベ).
const KANA_MIX_FINAL = new Set([..."ぱぴぷぺぽべ"]);
const KATA = /[ァ-ヴヷ-ヺー]/;

/**
 * Single hiragana characters mixed into a katakana word: sandwiched between katakana (ゲーぶル) unless it is a particle,
 * or at the end of a katakana run when it is a handakuten kana or べ (ルーぺです). Returns [surface, hiragana, fixed].
 */
export function kanaMix(text: string): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (let i = 1; i < text.length; i++) {
    const h = text[i]!;
    if (!/[ぁ-ゖ]/.test(h) || !KATA.test(text[i - 1]!)) continue;
    let a = i;
    while (a > 0 && KATA.test(text[a - 1]!)) a--;
    let b = i + 1;
    while (b < text.length && KATA.test(text[b]!)) b++;
    const before = text.slice(a, i);
    const after = text.slice(i + 1, b);
    if (!/[ァ-ヴヷ-ヺ]/.test(before)) continue;
    const sandwiched = /[ァ-ヴヷ-ヺ]/.test(after);
    if (sandwiched ? KANA_MIX_PARTICLES.has(h) : !(KANA_MIX_FINAL.has(h) && before.length >= 2)) continue;
    const surface = before + h + after;
    out.push([surface, h, before + hiraganaToKatakana(h) + after]);
  }
  return out;
}

/**
 * Japanese katakana notation drift (表記揺れ): spellings that differ only by ・, ー, ヴ/バ, small kana or イ/ウ vs ー,
 * e.g. マナ・ストーン / マナストーン, サーバー / サーバ. Runs on whichever side is Japanese. Interjections (アアァ) are
 * skipped. A compound (データフォルダー) is steered towards the house style of the words it
 * contains (フォルダ ×25), so it never gets advice that contradicts the standalone word's group; on a 1-vs-1 tie the
 * standalone words decide even when they are rarer than the compound (フィルム settles フィルムカメラ / フイルムカメラ).
 * With a glossary, a word the glossary spells in katakana must use that spelling (notation.katakana against the glossary
 * form, even when the script has only the variant). notation.kana-mix reports a hiragana slipped into a katakana word.
 */
export function checkNotation(tables: Table[], locale: Locale = "en", g?: Glossary): { findings: Finding[]; usage: UsageSummary[] } {
  type Hit = { surface: string; file: string; line: number; id: string; side: Side };
  const msg = messages(locale);
  const hits: Hit[] = [];
  const findings: Finding[] = [];
  for (const t of tables) {
    const side: Side | undefined = t.sourceLang === "ja" ? "source" : t.targetLang === "ja" ? "target" : undefined;
    if (!side) continue;
    for (const row of t.rows) {
      checkBudget();
      const seen = new Set<string>();
      const text = visibleText(textOf(row, side));
      for (const m of text.matchAll(KATAKANA_RUN)) {
        const surface = m[0].replace(/^[・＝]+|[・＝]+$/g, "");
        if (surface.length < 3 || seen.has(surface) || isInterjection(surface)) continue;
        seen.add(surface);
        hits.push({ surface, file: row.file, line: row.line, id: row.id, side });
      }
      for (const [surface, h, fixed] of kanaMix(text)) {
        if (seen.has(`mix\u0000${surface}`)) continue;
        seen.add(`mix\u0000${surface}`);
        findings.push({
          category: "notation", severity: "warning", rule: "notation.kana-mix", group: fixed,
          file: row.file, line: row.line, id: row.id, side,
          message: msg.notationKanaMix(surface, h, fixed),
          found: surface, expected: fixed,
        });
      }
    }
  }
  const usage: UsageSummary[] = [];
  const glossaryForms = g ? glossaryKatakana(g) : new Map<string, string[]>();
  const groups = countBy(hits, (h) => katakanaKey(h.surface));
  // Words whose spelling is settled: a single form, or a form used more often than any other.
  const settled: { key: string; form: string; total: number }[] = [];
  for (const [key, group] of groups) {
    const ranked = [...countBy(group, (h) => h.surface).entries()].sort((a, b) => b[1].length - a[1].length);
    if (ranked.length === 1 || ranked[0]![1].length > ranked[1]![1].length) settled.push({ key, form: ranked[0]![0], total: group.length });
  }
  for (const [key, group] of groups) {
    const forms = countBy(group, (h) => h.surface);
    const ranked = [...forms.entries()].sort((a, b) => b[1].length - a[1].length);
    const label = ranked.map(([s]) => s).join(" / ");
    const approved = glossaryForms.get(key);
    if (approved) {
      if (forms.size >= 2) usage.push({ category: "notation", group: label, counts: Object.fromEntries(ranked.map(([s, h]) => [s, h.length])) });
      for (const [surface, list] of ranked) {
        if (approved.includes(surface)) continue;
        for (const h of list) {
          findings.push({
            category: "notation", severity: "warning", rule: "notation.katakana", group: label,
            file: h.file, line: h.line, id: h.id, side: h.side,
            message: msg.notationGlossary(surface, approved[0]!),
            found: surface, expected: approved[0]!,
          });
        }
      }
      continue;
    }
    if (forms.size < 2) continue;
    const tie = ranked[0]![1].length === ranked[1]![1].length;
    // Settled words contained in this compound, used at least as often as the compound itself (any count on a tie).
    const bases = settled.filter((b) => b.key !== key && b.key.length >= 2 && key.includes(b.key) && (tie || b.total >= group.length));
    const score = (form: string) => bases.filter((b) => containsWord(form, b.form)).length;
    const best = bases.length ? Math.max(...ranked.map(([f]) => score(f))) : 0;
    // On a tie the settled words decide; when they cannot (both forms contain them, e.g. デバッグ・モード /
    // デバッグモード ×2 each), the form without middle dots wins, as most Japanese style guides write compounds.
    const cands = ranked.filter(([f]) => bases.length === 0 || score(f) === best);
    const top = cands.filter(([, hs]) => hs.length === cands[0]![1].length);
    const dots = (f: string) => (f.match(/[・＝]/g) ?? []).length;
    const majority = (tie ? [...top].sort((a, b) => dots(a[0]) - dots(b[0]))[0]! : cands[0]!)[0];
    usage.push({ category: "notation", group: label, counts: Object.fromEntries(ranked.map(([s, h]) => [s, h.length])) });
    for (const [surface, list] of ranked) {
      if (surface === majority) continue;
      for (const h of list) {
        findings.push({
          category: "notation", severity: "warning", rule: "notation.katakana", group: label,
          file: h.file, line: h.line, id: h.id, side: h.side,
          message: msg.notationKatakana(surface, majority, forms.get(majority)!.length),
          found: surface, expected: majority,
        });
      }
    }
  }
  return { findings, usage };
}

/**
 * `word` occurs in `compound` as a whole spelling: not followed by ー or a small kana (フォルダ is not in フォルダー).
 * A middle dot after it is a word boundary (チーム is in チーム・アルファ as much as in チームアルファ), so the dot
 * itself never decides a compound's group; the counts do.
 */
function containsWord(compound: string, word: string): boolean {
  for (let i = compound.indexOf(word); i >= 0; i = compound.indexOf(word, i + 1)) {
    if (!/^[ーァィゥェォャュョ]/.test(compound.slice(i + word.length))) return true;
  }
  return false;
}

/**
 * Recurring katakana/kanji compounds that are not in the glossary. The engine cannot know the right
 * rendering, so these go to the user's assistant as review packets.
 */
export function unglossariedTermPackets(tables: Table[], g: Glossary, minRows = 3): ReviewPacket[] {
  const known = new Set([...g.terms.map((t) => t.source), ...g.characters.flatMap((c) => [c.ja, ...(c.aliases?.ja ?? [])])]);
  const isKnown = knownWordTest([...known]);
  const byTerm = new Map<string, { t: Table; rowIdx: number }[]>();
  for (const t of tables) {
    if (t.sourceLang !== "ja") continue;
    t.rows.forEach((row, rowIdx) => {
      checkBudget();
      const words = new Set(visibleText(row.source).match(/[ァ-ヴー]{3,}|[一-鿿]{3,}/g) ?? []);
      for (const w of words) {
        if (isKnown(w)) continue;
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

function push(map: Map<number, number[]>, key: number, value: number) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Union of two ascending lists, ascending, without duplicates. */
function mergeSorted(a: number[], b: number[]): number[] {
  if (!b.length) return a;
  if (!a.length) return b;
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const x = j >= b.length || (i < a.length && a[i]! <= b[j]!) ? a[i++]! : b[j++]!;
    if (out[out.length - 1] !== x) out.push(x);
  }
  return out;
}

/** Prefilter over the source side of the terms in one language; `find` returns glossary term indices. */
function termIndex(g: Glossary, termLang: Lang[], lang: Lang): { find: (folded: string) => number[]; size: number } {
  const ids = g.terms.map((_, i) => i).filter((i) => termLang[i] === lang);
  const m = new AnchorMatcher(ids.map((i) => phraseAnchor(g.terms[i]!.source, lang)));
  return { find: (folded) => m.find(folded).map((k) => ids[k]!), size: ids.length };
}

/** Prefilter over the forbidden variants (in the target language) of the terms whose source is in `sourceLang`. */
function forbiddenIndex(g: Glossary, termLang: Lang[], sourceLang: Lang, targetLang: Lang): { find: (folded: string) => number[]; size: number } {
  const owners: number[] = [];
  const anchors: string[] = [];
  g.terms.forEach((term, ti) => {
    if (termLang[ti] !== sourceLang) return;
    for (const f of term.forbidden ?? []) {
      if (!f) continue; // containsPhrase never matches an empty phrase
      owners.push(ti);
      anchors.push(phraseAnchor(f, targetLang));
    }
  });
  const m = new AnchorMatcher(anchors);
  return { find: (folded) => [...new Set(m.find(folded).map((k) => owners[k]!))], size: owners.length };
}

const SHORT_WORD = 16;

/**
 * `w => known.some((k) => k.includes(w) || w.includes(k))` for words that are one katakana or one kanji run (the
 * candidates of unglossariedTermPackets), without scanning the whole glossary per word (B-02): `w.includes(k)` via an
 * Aho-Corasick pass over w, `k.includes(w)` via a set of the short substrings of the same-script runs in the known
 * terms (a longer w is looked up in the joined terms). Memoized per word.
 */
function knownWordTest(known: string[]): (w: string) => boolean {
  const inWord = new AnchorMatcher(known);
  const parts = new Set<string>();
  for (const k of known) {
    for (const m of k.matchAll(/[ァ-ヴー]{3,}|[一-鿿]{3,}/g)) {
      const run = m[0];
      for (let i = 0; i + 3 <= run.length; i++) for (let n = 3; n <= SHORT_WORD && i + n <= run.length; n++) parts.add(run.slice(i, i + n));
    }
  }
  const joined = known.join("\n");
  const memo = new Map<string, boolean>();
  return (w) => {
    let v = memo.get(w);
    if (v === undefined) {
      v = inWord.find(w).length > 0 || (w.length <= SHORT_WORD ? parts.has(w) : joined.includes(w));
      memo.set(w, v);
    }
    return v;
  };
}

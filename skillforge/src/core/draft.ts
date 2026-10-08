import { katakanaKey, looksJapanese, ref, visibleText } from "./text.js";
import type { Glossary, GlossaryCharacter, GlossaryTerm, Lang, Row, Table } from "./types.js";

export interface DraftEntry {
  source: string;
  target?: string;
  /** Dice score of the chosen (or best) rendering, 0..1. */
  confidence: number;
  rows: number;
  /** Candidate target renderings → number of rows that use them. */
  renderings: Record<string, number>;
  /** First few file:line refs. */
  refs: string[];
}

export interface GlossaryDraft {
  /** Ready to save: terms with confident targets + characters guessed from speaker labels. */
  glossary: Glossary;
  /** All candidates incl. low-confidence, sorted by rows desc. */
  entries: DraftEntry[];
  notes: string[];
}

export interface DraftOptions {
  /** Minimum distinct rows a candidate must appear in. Default 2. */
  minRows?: number;
  /** Maximum number of term entries. Default 100. */
  maxTerms?: number;
}

/** Target n-gram / source candidate. `key` is normalized (katakanaKey for JA, lowercase + plural fold for EN). */
interface Gram {
  key: string;
  surface: string;
  cap: boolean;
  /** Seen at least once not at the start of a sentence. */
  mid: boolean;
}

interface Rec {
  row: Row;
  srcJa: boolean;
  ja: string;
  enG: Map<string, Gram>;
  jaG: Map<string, Gram>;
}

interface Scored {
  key: string;
  co: number;
  dice: number;
  size: number;
}

interface Alignment {
  core?: Scored;
  best?: Scored;
  ambiguous: boolean;
  ranked: Scored[];
  surfaces: Map<string, Map<string, number>>;
}

const NOT_FOUND = "(not found)";
const MIN_DICE = 0.5;
const SYSTEM_LABEL = /^(システム|system|narrator|narration|ナレーション|ナレーター|地の文|ui|sys)$/i;

const EN_STOP = new Set(
  ("a an the and or but nor of to in on at by for with from into onto over under about as is are was were be been being am " +
    "do does did done have has had will would shall should can could may might must not no yes so too very just only also then " +
    "than that this these those there here it its i me my mine we us our you your he him his she her they them their what who " +
    "whom which when where why how all any some one each every if else up down out off again now oh hey ah well let get got go " +
    "going come see say said before after even still yet more most much many own such like okay ok please thank thanks hi hello " +
    "x s t").split(" "),
);
const EN_CONNECT = new Set(["of", "the", "de", "du", "la", "le", "von", "van"]);

const K = "[一-鿿々〆]";
const JA_KATA = /[ァ-ヴー・＝]{3,}/g;
const JA_KANJI = new RegExp(`${K}{2,}[きぎちびみり]?`, "g");
const JA_NO = new RegExp(`${K}+の${K}{2,}`, "g");

/** Fold English plurals on the last word: stones→stone, abilities→ability, boxes→box. */
function foldWord(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(x|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && /[^s]s$/.test(w) && !/(us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function enKey(phrase: string): string {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  const last = words.pop();
  return last === undefined ? "" : [...words, foldWord(last)].join(" ");
}

const normKey = (s: string) => (looksJapanese(s) ? katakanaKey(s) : enKey(s));

function contains(long: string, short: string, lang: Lang): boolean {
  return lang === "ja" ? long.includes(short) : ` ${long} `.includes(` ${short} `);
}

const sizeOf = (key: string, lang: Lang) => (lang === "ja" ? key.length : key.split(" ").length);

function addGram(m: Map<string, Gram>, key: string, surface: string, cap: boolean, mid: boolean): void {
  const g = m.get(key);
  if (!g) m.set(key, { key, surface, cap, mid });
  else {
    g.cap ||= cap;
    g.mid ||= mid;
  }
}

/** English n-grams: capitalized phrases (1–3 words, inner "of"/"the" allowed) and lowercase content phrases (1–2 words). */
function enGrams(text: string, lowerWords: Set<string>): Map<string, Gram> {
  const out = new Map<string, Gram>();
  for (const sentence of text.split(/(?<=[.!?…])\s+|\n+/)) {
    let first = true;
    for (const chunk of sentence.split(/[^A-Za-z0-9'’\s-]+/)) {
      const words = (chunk.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) ?? []).map((w) => w.replace(/['’]s$/i, ""));
      if (!words.length) continue;
      const lower = words.map((w) => w.toLowerCase());
      const isCap = words.map((w) => /^[A-Z]/.test(w));
      const isLow = words.map((w) => /^[a-z]/.test(w));
      const content = lower.map((w) => w.length > 1 && !EN_STOP.has(w) && !/['’]/.test(w) && !/^\d+$/.test(w));
      const folded = lower.map(foldWord);
      words.forEach((_, i) => {
        if (isLow[i]) lowerWords.add(folded[i]!);
      });
      for (let i = 0; i < words.length; i++) {
        if (!content[i]) continue;
        let capRun = isCap[i]!;
        let lowRun = isLow[i]! && lower[i]!.length > 2;
        for (let n = 1; n <= 3 && i + n <= words.length; n++) {
          const j = i + n - 1;
          if (n > 1) {
            // An inner connector ("of", "the") may stay lowercase inside a capitalized phrase.
            capRun &&= isCap[j - 1]! || j - 1 === i || EN_CONNECT.has(lower[j - 1]!);
            lowRun &&= isLow[j]! && n <= 2;
          }
          if (!capRun && !lowRun) break;
          if (!content[j]) continue;
          const cap = capRun && isCap[j]!;
          if (!cap && !(lowRun && lower[j]!.length > 2)) continue;
          const key = n === 1 ? folded[i]! : `${lower.slice(i, j).join(" ")} ${folded[j]!}`;
          addGram(out, key, words.slice(i, j + 1).join(" "), cap, !(first && i === 0));
        }
      }
      first = false;
    }
  }
  return out;
}

/** Japanese candidates: katakana runs (≥3), kanji compounds (≥2, optional 連用形 okurigana like 星詠み), X の YY compounds. */
function jaGrams(text: string): Map<string, Gram> {
  const out = new Map<string, Gram>();
  for (const m of text.matchAll(JA_KATA)) {
    const s = m[0].replace(/^[・＝]+|[・＝]+$/g, "");
    if (s.length >= 3) addGram(out, katakanaKey(s), s, true, true);
  }
  for (const re of [JA_KANJI, JA_NO]) {
    for (const m of text.matchAll(re)) {
      addGram(out, m[0], m[0], true, true);
      // 星詠み also yields 星詠 so that a bare 星詠 elsewhere is linked; pruning drops it when redundant.
      if (re === JA_KANJI && /[ぁ-ゖ]$/.test(m[0])) addGram(out, m[0].slice(0, -1), m[0].slice(0, -1), true, true);
    }
  }
  return out;
}

function tally(m: Map<string, Map<string, number>>, key: string, surface: string): void {
  let s = m.get(key);
  if (!s) m.set(key, (s = new Map()));
  s.set(surface, (s.get(surface) ?? 0) + 1);
}

/** Most frequent surface; shorter wins ties (singular over plural). */
function display(surfaces: Map<string, number> | undefined, fallback: string): string {
  if (!surfaces) return fallback;
  let best = fallback;
  let n = -1;
  for (const [s, c] of surfaces) {
    if (c > n || (c === n && s.length < best.length)) {
      best = s;
      n = c;
    }
  }
  return best;
}

function docFreq(idx: number[], gramsOf: (i: number) => Iterable<Gram>): Map<string, number> {
  const df = new Map<string, number>();
  for (const i of idx) for (const g of gramsOf(i)) df.set(g.key, (df.get(g.key) ?? 0) + 1);
  return df;
}

/**
 * Score every co-occurring n-gram with Dice = 2·|both| / (|candidate rows| + |n-gram rows|).
 * The best n-gram is extended to a longer one containing it when that covers ≥ half its rows
 * ("Stone" → "Mana Stone"). Ambiguous when an unrelated n-gram scores as high.
 */
function align(rows: number[], gramsOf: (i: number) => Iterable<Gram>, df: Map<string, number>, lang: Lang): Alignment {
  const co = new Map<string, number>();
  const surfaces = new Map<string, Map<string, number>>();
  for (const i of rows) {
    for (const g of gramsOf(i)) {
      co.set(g.key, (co.get(g.key) ?? 0) + 1);
      tally(surfaces, g.key, g.surface);
    }
  }
  const n = rows.length;
  const ranked: Scored[] = [...co].map(([key, c]) => ({ key, co: c, dice: (2 * c) / (n + (df.get(key) ?? c)), size: sizeOf(key, lang) }));
  ranked.sort((a, b) => b.dice - a.dice || b.size - a.size || b.co - a.co || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const core = ranked[0];
  if (!core) return { ambiguous: false, ranked, surfaces };
  let best = core;
  for (;;) {
    const ext = ranked
      .filter((r) => r.size > best.size && r.co * 2 >= core.co && contains(r.key, best.key, lang))
      .sort((a, b) => b.co - a.co || b.size - a.size)[0];
    if (!ext) break;
    best = ext;
  }
  const related = (k: string) => [best.key, core.key].some((b) => contains(k, b, lang) || contains(b, k, lang));
  const rival = ranked.find((r) => !related(r.key));
  return { core, best, ambiguous: !!rival && rival.dice >= best.dice - 1e-9, ranked, surfaces };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

const slug = (s: string) =>
  s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const titleCase = (s: string) =>
  /[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * Draft a glossary from a script, deterministically: recurring source terms aligned to their most
 * consistent target rendering, plus characters guessed from speaker labels. Everything is a suggestion.
 */
export function draftGlossary(tables: Table[], existing?: Glossary, opts: DraftOptions = {}): GlossaryDraft {
  const minRows = Math.max(1, opts.minRows ?? 2);
  const maxTerms = opts.maxTerms ?? 100;
  const notes: string[] = [];
  const lowerWords = new Set<string>();

  // Pass 1: n-grams per row (both sides), speaker labels.
  const recs: Rec[] = [];
  const labels = new Map<string, number>();
  for (const t of tables) {
    const bilingual = t.sourceLang !== t.targetLang;
    for (const row of t.rows) {
      const sp = row.speaker?.trim();
      if (sp && !SYSTEM_LABEL.test(sp)) labels.set(sp, (labels.get(sp) ?? 0) + 1);
      if (!bilingual || !row.source.trim() || !row.target.trim()) continue;
      const srcJa = t.sourceLang === "ja";
      const ja = visibleText(srcJa ? row.source : row.target);
      const en = visibleText(srcJa ? row.target : row.source);
      recs.push({ row, srcJa, ja, enG: enGrams(en, lowerWords), jaG: jaGrams(ja) });
    }
  }

  // Known names (existing glossary), as normalized keys.
  const known = new Set<string>();
  for (const term of existing?.terms ?? []) known.add(normKey(term.source));
  for (const c of existing?.characters ?? []) {
    for (const s of [c.ja, c.en, ...(c.aliases?.ja ?? []), ...(c.aliases?.en ?? [])]) known.add(normKey(s));
  }

  // Characters from speaker labels.
  const all = recs.map((_, i) => i);
  const nameGrams = (i: number) => [...recs[i]!.enG.values()].filter((g) => g.cap && g.mid && (g.key.includes(" ") || !lowerWords.has(g.key)));
  const jaAll = (i: number) => recs[i]!.jaG.values();
  let dfName: Map<string, number> | undefined;
  let dfJa: Map<string, number> | undefined;
  const chars = new Map<string, GlossaryCharacter>();
  const charKeys = new Set<string>();
  for (const [label, lines] of [...labels].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    if (lines < 2) continue;
    if (known.has(normKey(label))) continue;
    let ja: string | undefined;
    let en: string | undefined;
    if (looksJapanese(label)) {
      ja = label;
      dfName ??= docFreq(all, nameGrams);
      const rows = all.filter((i) => recs[i]!.ja.includes(label));
      const a = align(rows, nameGrams, dfName, "en");
      if (a.best && a.best.dice >= MIN_DICE && !a.ambiguous) en = display(a.surfaces.get(a.best.key), a.best.key);
    } else {
      en = titleCase(label);
      dfJa ??= docFreq(all, jaAll);
      const k = enKey(label);
      const rows = all.filter((i) => recs[i]!.enG.get(k)?.cap);
      const a = align(rows, jaAll, dfJa, "ja");
      if (a.best && a.best.dice >= MIN_DICE && !a.ambiguous) ja = display(a.surfaces.get(a.best.key), a.best.key);
    }
    if (!ja || !en) {
      notes.push(`Speaker "${label}" (${lines} lines): could not find its ${ja ? "English" : "Japanese"} name in the text; add the character by hand.`);
      continue;
    }
    if (known.has(normKey(ja)) || known.has(normKey(en))) continue;
    const id = slug(en) || slug(label) || `character-${chars.size + 1}`;
    charKeys.add(normKey(ja));
    charKeys.add(normKey(en));
    if (!chars.has(id)) chars.set(id, { id, ja, en });
  }

  // Term candidates per direction.
  const entries: (DraftEntry & { key: string })[] = [];
  const knownList = [...known, ...charKeys];
  for (const srcJa of [true, false]) {
    const idx = all.filter((i) => recs[i]!.srcJa === srcJa);
    if (!idx.length) continue;
    const srcLang: Lang = srcJa ? "ja" : "en";
    const tgtLang: Lang = srcJa ? "en" : "ja";
    const srcOf = (i: number) => (srcJa ? recs[i]!.jaG : recs[i]!.enG);
    const tgtOf = (i: number) => (srcJa ? recs[i]!.enG : recs[i]!.jaG).values();

    const rowsByKey = new Map<string, number[]>();
    const surfaces = new Map<string, Map<string, number>>();
    for (const i of idx) {
      for (const g of srcOf(i).values()) {
        // English source: capitalized phrases only; a single word must never appear lowercase.
        if (!srcJa && (!g.cap || (!g.key.includes(" ") && lowerWords.has(g.key)))) continue;
        let rows = rowsByKey.get(g.key);
        if (!rows) rowsByKey.set(g.key, (rows = []));
        rows.push(i);
        tally(surfaces, g.key, g.surface);
      }
    }

    // Drop a candidate contained in a longer one with the same row set (書庫 ⊂ 灰の書庫, Mana ⊂ Mana Stone).
    const bySig = new Map<string, string[]>();
    for (const [key, rows] of rowsByKey) {
      if (rows.length < minRows) continue;
      const sig = rows.join(",");
      const arr = bySig.get(sig);
      if (arr) arr.push(key);
      else bySig.set(sig, [key]);
    }
    const kept: string[] = [];
    for (const group of bySig.values()) {
      const keep: string[] = [];
      for (const key of group.sort((a, b) => b.length - a.length)) {
        if (!keep.some((l) => contains(l, key, srcLang))) keep.push(key);
      }
      kept.push(...keep);
    }

    const fresh = kept.filter((key) => !knownList.some((k) => looksJapanese(k) === srcJa && contains(k, key, srcLang)));
    fresh.sort((a, b) => rowsByKey.get(b)!.length - rowsByKey.get(a)!.length || (a < b ? -1 : 1));

    let df: Map<string, number> | undefined;
    for (const key of fresh.slice(0, maxTerms)) {
      df ??= docFreq(idx, tgtOf);
      const rows = rowsByKey.get(key)!;
      const a = align(rows, tgtOf, df, tgtLang);
      const best = a.best;
      const accepted = !!best && best.dice >= MIN_DICE && best.co >= Math.min(2, minRows) && !a.ambiguous;
      const strong = a.ranked.filter((r) => r.dice >= MIN_DICE);
      const renderings: Record<string, number> = {};
      for (const i of rows) {
        const grams = srcJa ? recs[i]!.enG : recs[i]!.jaG;
        let k: string | undefined;
        if (accepted && grams.has(best.key)) k = best.key;
        else if (tgtLang === "en" && a.core) {
          for (const g of grams.keys()) {
            if (contains(g, a.core.key, "en") && (!k || g.split(" ").length > k.split(" ").length)) k = g;
          }
        } else {
          k = strong.find((r) => grams.has(r.key))?.key;
        }
        const label = k ? display(a.surfaces.get(k), k) : NOT_FOUND;
        renderings[label] = (renderings[label] ?? 0) + 1;
      }
      const source = display(surfaces.get(key), key);
      const target = accepted ? display(a.surfaces.get(best.key), best.key) : undefined;
      entries.push({
        key, source, target, confidence: round2(best?.dice ?? 0), rows: rows.length, renderings,
        refs: rows.slice(0, 5).map((i) => ref(recs[i]!.row)),
      });
    }
  }
  entries.sort((a, b) => b.rows - a.rows || b.confidence - a.confidence || (a.source < b.source ? -1 : 1));
  const top = entries.slice(0, maxTerms);

  const terms: GlossaryTerm[] = [];
  for (const e of top) {
    const others = Object.entries(e.renderings)
      .filter(([r]) => r !== e.target)
      .sort((a, b) => b[1] - a[1]);
    const seen = others.map(([r, c]) => `"${r}" ×${c}`).join(", ");
    if (e.target) {
      terms.push({ source: e.source, target: e.target, note: `draft: ${e.rows} rows, confidence ${e.confidence}` });
      const drift = others.filter(([r]) => r !== NOT_FOUND);
      if (drift.length) {
        notes.push(`${e.source} → "${e.target}" ×${e.renderings[e.target] ?? 0}, also ${seen}. Decide whether the others are allowed or forbidden.`);
      }
    } else if (others.some(([r]) => r !== NOT_FOUND)) {
      notes.push(`${e.source}: no clear rendering (${seen}). Pick one before adding it to the glossary.`);
    }
  }
  const unsure = top.filter((e) => !e.target).length;
  if (unsure) notes.push(`${unsure} recurring term${unsure > 1 ? "s have" : " has"} no confident rendering; see entries.`);
  if (terms.some((t) => looksJapanese(t.source)) && terms.some((t) => !looksJapanese(t.source))) {
    notes.push("The input mixes JA→EN and EN→JA tables, so the draft has terms in both directions; consider splitting it.");
  }

  return {
    glossary: { terms, characters: [...chars.values()] },
    entries: top.map(({ key: _key, ...e }) => e),
    notes,
  };
}

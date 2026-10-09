import { checkBudgetNow } from "./limits.js";
import { normalizeApostrophes } from "./text.js";
import type { Lang } from "./types.js";

/**
 * Multi-pattern prefilter for glossary lookups (security review B-02).
 *
 * The term checks used to test every glossary term against every row with a regex (terms × rows). Instead, each
 * term gets a literal *anchor* that must occur in any text the real matcher (containsPhrase / enPhraseRegex) accepts,
 * and one Aho-Corasick automaton over all anchors finds, in a single pass over a row, the few terms worth running
 * the exact matcher on. The exact matcher still decides; the prefilter only skips terms that cannot match, so results
 * are unchanged.
 *
 * Case folding follows the regex `i` flag without `u` (ES Canonicalize): each UTF-16 unit is upper-cased when that
 * gives one unit and does not turn a non-ASCII unit into an ASCII one. The fold is applied unit by unit, so
 * `a.includes(b)` implies `fold(a).includes(fold(b))`, and an `i`-regex match of a literal implies the folded literal
 * occurs in the folded text.
 */
export function foldCase(s: string): string {
  let out = "";
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let f: string | undefined;
    if (c >= 97 && c <= 122) f = String.fromCharCode(c - 32);
    else if (c >= 128) {
      const ch = s[i]!;
      const u = ch.toUpperCase();
      if (u !== ch && u.length === 1 && u.charCodeAt(0) >= 128) f = u;
    }
    if (f !== undefined) {
      out += s.slice(start, i) + f;
      start = i + 1;
    }
  }
  return start === 0 ? s : out + s.slice(start);
}

/**
 * The literal anchor of a phrase for containsPhrase(text, phrase, lang) / enPhraseRegex(phrase) (any casing or
 * inflection option) / the singular form: Japanese is a plain substring test, so the whole phrase (apostrophes
 * normalized); English matches word by word with any whitespace in between, apostrophes in any typographic form and
 * an inflected or singular/plural last word, so the anchor is the longest apostrophe-free piece of a word, with the
 * last word cut by the up-to-3 characters inflection may change. Returns "" when there is no safe anchor
 * (the caller then always runs the exact matcher for that phrase).
 */
export function phraseAnchor(phrase: string, lang: Lang): string {
  if (lang === "ja") return foldCase(normalizeApostrophes(phrase));
  const words = normalizeApostrophes(phrase).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const last = words.pop()!;
  const pieces = [...words, last.slice(0, Math.max(0, last.length - 3))].flatMap((w) => w.split("'"));
  const best = pieces.reduce((a, b) => (b.length > a.length ? b : a), "");
  return foldCase(best);
}

interface Node {
  next: Map<number, number>;
  fail: number;
  /** Pattern ids ending exactly here. */
  out: number[];
  /** Nearest node on the fail chain with its own outputs (output link), or -1. */
  link: number;
}

/** How often (in characters) `find` looks at the clock inside one text (a single huge line must not escape the budget). */
const BUDGET_STRIDE = 1 << 14;

/** Aho-Corasick automaton over folded anchors. `find` returns the ids of every anchor occurring in a text. */
export class AnchorMatcher {
  private nodes: Node[] = [{ next: new Map(), fail: 0, out: [], link: -1 }];
  /** Ids whose anchor is empty: always candidates. */
  readonly always: number[] = [];
  /** Per-id stamp of the last `find` call that reported it (dedupe without clearing an array per call). */
  private readonly stamp: Uint32Array;
  /** Per-node stamp: the node's outputs (and its whole output-link chain) were already reported in this call. */
  private nodeStamp = new Uint32Array(0);
  private call = 0;

  constructor(anchors: readonly string[]) {
    this.stamp = new Uint32Array(anchors.length);
    anchors.forEach((a, id) => {
      if (!a) {
        this.always.push(id);
        return;
      }
      let n = 0;
      for (let i = 0; i < a.length; i++) {
        const c = a.charCodeAt(i);
        let nx = this.nodes[n]!.next.get(c);
        if (nx === undefined) {
          nx = this.nodes.length;
          this.nodes.push({ next: new Map(), fail: 0, out: [], link: -1 });
          this.nodes[n]!.next.set(c, nx);
        }
        n = nx;
      }
      this.nodes[n]!.out.push(id);
    });
    // Breadth-first fail links and output links. Outputs are NOT merged along fail links: with nested anchors
    // (あ, ああ, あああ, …) merged lists grow to O(anchors) per node and `find` to O(text × anchors) (Atlas re-review).
    const queue: number[] = [];
    for (const nx of this.nodes[0]!.next.values()) queue.push(nx);
    for (let qi = 0; qi < queue.length; qi++) {
      const n = queue[qi]!;
      const node = this.nodes[n]!;
      for (const [c, nx] of node.next) {
        let f = node.fail;
        while (f !== 0 && !this.nodes[f]!.next.has(c)) f = this.nodes[f]!.fail;
        const target = this.nodes[f]!.next.get(c);
        const fl = target !== undefined && target !== nx ? target : 0;
        this.nodes[nx]!.fail = fl;
        this.nodes[nx]!.link = this.nodes[fl]!.out.length ? fl : this.nodes[fl]!.link;
        queue.push(nx);
      }
    }
    this.nodeStamp = new Uint32Array(this.nodes.length);
  }

  /** Ids of anchors found in `text` (already folded with foldCase), plus the always-candidates. Unsorted, no duplicates. */
  find(foldedText: string): number[] {
    const hit: number[] = [...this.always];
    if (this.nodes.length === 1) return hit;
    const call = (this.call = (this.call + 1) >>> 0 || 1);
    if (call === 1) {
      this.stamp.fill(0);
      this.nodeStamp.fill(0);
    }
    for (const id of this.always) this.stamp[id] = call;
    let n = 0;
    for (let i = 0; i < foldedText.length; i++) {
      if ((i & (BUDGET_STRIDE - 1)) === BUDGET_STRIDE - 1) checkBudgetNow();
      const c = foldedText.charCodeAt(i);
      let nx = this.nodes[n]!.next.get(c);
      while (nx === undefined && n !== 0) {
        n = this.nodes[n]!.fail;
        nx = this.nodes[n]!.next.get(c);
      }
      n = nx ?? 0;
      // Walk the output links until a node already reported in this call: every node is reported at most once per
      // text, so the walk costs O(text + anchors found), whatever the nesting.
      for (let m = this.nodes[n]!.out.length ? n : this.nodes[n]!.link; m > 0 && this.nodeStamp[m] !== call; m = this.nodes[m]!.link) {
        this.nodeStamp[m] = call;
        for (const id of this.nodes[m]!.out) {
          if (this.stamp[id] !== call) {
            this.stamp[id] = call;
            hit.push(id);
          }
        }
      }
    }
    return hit;
  }
}

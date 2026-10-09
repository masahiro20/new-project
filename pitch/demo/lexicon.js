// Decode the lexicon embedded in the demo page (<script id="lexicon-data">).
// scripts/build-demo.mjs ships a compact form to keep the page small:
//   {"v":2, "count", "source", "words": [[idNum, surface, kana, accent, gloss], …]}
// accent is a number (one accepted drop) or an array; morae and type are derived.
// The full lexicon-*.json form ({ words: [{ id, surface, … }] }) is accepted too.
import { splitMorae, toHiragana } from '../src/mora.js';
import { accentType } from '../src/accent.js';

export function decodeLexicon(lex) {
  if (lex.v !== 2) return lex.words;
  return lex.words.map(([num, surface, kana, accent, gloss]) => {
    const morae = splitMorae(kana);
    const acc = Array.isArray(accent) ? accent : [accent];
    return { id: `w${String(num).padStart(4, '0')}`, surface, kana, morae, accent: acc, type: accentType(acc[0], morae.length), gloss };
  });
}

/** Normalise a search query / field: hiragana, lower case, no spaces. */
export const fold = (s) => toHiragana(String(s)).toLowerCase().replace(/[\s　]+/g, '');

// ---------- synthetic samples (shared with scripts/demo-sanity.mjs) ----------
/** The accent the "wrong pattern" sample uses: flat ↔ final drop, else the first k not accepted. */
export function wrongK(w) {
  const n = w.morae.length;
  // A drop placed on a special mora (っ, ん, ー) is not a Tokyo pattern and,
  // for っ, cannot be heard at all — skip those so the "wrong" sample is audibly wrong.
  const ok = (k) => !w.accent.includes(k) && !(k > 0 && SPECIAL.has(w.morae[k - 1]));
  const alt = w.accent[0] === 0 ? n : 0;
  if (ok(alt)) return alt;
  for (let k = 0; k <= n; k++) if (ok(k)) return k;
  return alt;
}
const SPECIAL = new Set(['っ', 'ん', 'ー']);

/** Deterministic synth seed per word and accent. */
export const sampleSeed = (w, k) => 1 + ((w.id.charCodeAt(w.id.length - 1) * 31 + k) % 997);

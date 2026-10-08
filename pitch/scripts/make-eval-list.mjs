// Pick a stratified human-evaluation word list from the demo lexicon:
// N words per accent type, spread over mora counts, minimal pairs first,
// tagged with the phonetic risks we want to measure.
// Usage: node scripts/make-eval-list.mjs [perType=25] > docs/eval-words.tsv
import { readFileSync } from 'node:fs';
import { consonantClass } from '../src/mora.js';

const perType = Number(process.argv[2] ?? 25);
const words = JSON.parse(readFileSync(new URL('../data/lexicon-200.json', import.meta.url))).words;

const byKana = new Map();
for (const w of words) byKana.set(w.kana, [...(byKana.get(w.kana) ?? []), w]);
const VOICELESS = new Set(['stop', 'affricate', 'fricative']);
const HIGH_V = /^[きしちひぴくすつふぷ]/; // i/u morae after voiceless consonants

function tags(w) {
  const t = [];
  const same = byKana.get(w.kana);
  if (same.length > 1 && new Set(same.map((x) => x.accent[0])).size > 1) t.push('minimal-pair');
  if (w.morae.some((m, i) => HIGH_V.test(m) && m.length === 1 && i + 1 < w.morae.length && VOICELESS.has(consonantClass(w.morae[i + 1])))) t.push('devoicing-risk');
  if (w.morae.some((m) => ['ん', 'っ', 'ー'].includes(m))) t.push('special-mora');
  if (consonantClass(w.morae[0]) === 'vowel') t.push('vowel-initial');
  if (w.accent.length > 1) t.push('two-accents');
  return t;
}

const out = [];
for (const type of ['heiban', 'atamadaka', 'nakadaka', 'odaka']) {
  const pool = words.filter((w) => w.type === type).map((w) => ({ w, t: tags(w) }));
  pool.sort((a, b) => b.t.includes('minimal-pair') - a.t.includes('minimal-pair') || b.t.length - a.t.length);
  // Round-robin over mora counts so short and long words are both covered.
  const buckets = new Map();
  for (const p of pool) buckets.set(p.w.morae.length, [...(buckets.get(p.w.morae.length) ?? []), p]);
  const keys = [...buckets.keys()].sort();
  const picked = [];
  while (picked.length < perType && keys.some((k) => buckets.get(k).length)) {
    for (const k of keys) if (picked.length < perType && buckets.get(k).length) picked.push(buckets.get(k).shift());
  }
  out.push(...picked);
}
console.log(['no', 'surface', 'kana', 'morae', 'accent', 'type', 'tags'].join('\t'));
out.forEach(({ w, t }, i) => console.log([i + 1, w.surface, w.kana, w.morae.length, w.accent.join(','), w.type, t.join(',')].join('\t')));

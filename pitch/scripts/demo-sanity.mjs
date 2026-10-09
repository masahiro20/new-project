// Sanity run of the demo page's sample buttons over every word the page ships.
//
//   node scripts/demo-sanity.mjs [--html dist/pitch-demo.html | --lexicon data/lexicon-2000.json] [--quiet]
//
// For each word: synthesizeWord (correct accent and the "wrong" accent, same seeds as
// the page) → normalize → extractF0 with vendored pitchy → judge. Reports the
// correct-pass rate, the wrong-fail rate and every failure on stdout. Exit code 1 if
// anything fails. Thresholds in src/judge.js are used as-is.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PitchDetector } from '../vendor/pitchy.js';
import { extractF0, normalize } from '../src/f0.js';
import { judge } from '../src/judge.js';
import { synthesizeWord } from '../src/synth.js';
import { decodeLexicon, wrongK, sampleSeed } from '../demo/lexicon.js';

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const root = new URL('..', import.meta.url).pathname;
const SR = 16000;

let words, from;
if (arg('--lexicon')) {
  from = resolve(arg('--lexicon'));
  words = decodeLexicon(JSON.parse(readFileSync(from, 'utf8')));
} else {
  from = resolve(arg('--html', `${root}/dist/pitch-demo.html`));
  const html = readFileSync(from, 'utf8');
  const m = /<script type="application\/json" id="lexicon-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) { console.error(`no #lexicon-data in ${from} (run npm run build:demo first)`); process.exit(2); }
  words = decodeLexicon(JSON.parse(m[1]));
}

function run(w, k) {
  const { audio, sampleRate } = synthesizeWord(w.morae, k, { sampleRate: SR, baseHz: 140, seed: sampleSeed(w, k) });
  const tr = extractF0(PitchDetector, normalize(audio), sampleRate);
  return judge(tr, w);
}

const t0 = performance.now();
const fails = [];
let okCorrect = 0, okWrong = 0, nWrong = 0;
const byLen = new Map(); // morae → [words, failures]
for (const w of words) {
  const n = w.morae.length;
  if (!byLen.has(n)) byLen.set(n, [0, 0]);
  const row = byLen.get(n);
  row[0]++;
  let bad = false;
  const rc = run(w, w.accent[0]);
  if (rc.pass === true) okCorrect++;
  else { bad = true; fails.push({ w, kind: 'correct', k: w.accent[0], r: rc }); }
  const kw = wrongK(w);
  if (!w.accent.includes(kw)) {
    nWrong++;
    const rw = run(w, kw);
    if (rw.pass === false && !rw.error) okWrong++;
    else { bad = true; fails.push({ w, kind: 'wrong', k: kw, r: rw }); }
  }
  if (bad) row[1]++;
}
const secs = (performance.now() - t0) / 1000;

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
console.log(`demo-sanity: ${words.length} words from ${from.replace(root, '')} (${secs.toFixed(1)} s)`);
console.log(`  correct sample passes : ${okCorrect}/${words.length} (${pct(okCorrect, words.length)})`);
console.log(`  wrong sample fails    : ${okWrong}/${nWrong} (${pct(okWrong, nWrong)})`);
console.log(`  by length (morae: words, words with a failure): ${[...byLen].sort((a, b) => a[0] - b[0]).map(([n, [c, f]]) => `${n}: ${c}/${f}`).join('  ')}`);
if (fails.length) {
  console.log(`  failures (${fails.length}):`);
  for (const { w, kind, k, r } of fails) {
    console.log(`    ${w.id} ${w.surface}（${w.kana}）accent=[${w.accent}] ${kind} sample k=${k} → ${r.error ? `error=${r.error}` : `pass=${r.pass} detectedK=${r.detectedK} verdict=${r.verdict}${r.flat ? ' flat' : ''} step=${r.stepSt?.toFixed(1)}st`}`);
  }
}
process.exit(fails.length ? 1 : 0);

// Evaluate the judge on real recordings.
// manifest.json: [{ file, surface, kana, accent:[k…], speaker?,
//                   spokenK?  (k actually spoken; default = accent[0]),
//                   particle? (true if the recording is "<word>が"; default false) }]
// Reports, per engine × segmentation: how often the dictionary reading passes,
// how often the detected k matches, split by accent type and by speaker.
// Usage: node scripts/eval-real.mjs manifest.json [--swiftf0] [--csv out.csv]
import { readFileSync, writeFileSync } from 'node:fs';
import { PitchDetector } from 'pitchy';
import { judge } from '../src/judge.js';
import { extractF0, energyAt, normalize } from '../src/f0.js';
import { splitMorae } from '../src/mora.js';
import { accentType } from '../src/accent.js';
import { readWav } from '../src/wav.js';

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith('--') && !a.endsWith('.csv'));
const csvPath = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
const items = JSON.parse(readFileSync(manifestPath, 'utf8'));

const engines = { pitchy: (x, sr) => ({ track: extractF0(PitchDetector, x, sr), opts: {} }) };
if (args.includes('--swiftf0')) {
  const ort = await import('onnxruntime-node');
  const { createSwiftF0, resampleLinear } = await import('../src/swiftf0.js');
  const model = await createSwiftF0(ort, readFileSync(new URL('../vendor/swiftf0/model.onnx', import.meta.url)));
  engines.swiftf0 = async (x, sr) => {
    const y = resampleLinear(x, sr, 16000);
    const r = await model.analyze(y);
    return {
      track: { times: r.times, f0: r.f0.map((v) => (Number.isFinite(v) ? v : 0)), clarity: r.confidence, energyDb: energyAt(y, 16000, r.times) },
      opts: { minClarity: 0.5, medianWidth: 3 },
    };
  };
}

const rows = [];
const agg = {};
const add = (key, group, r, spokenEff) => {
  const g = (agg[key] ??= {});
  const s = (g[group] ??= { n: 0, pass: 0, exact: 0, err: 0 });
  s.n++;
  if (r.error) { s.err++; return; }
  if (r.pass) s.pass++;
  if (r.detectedK === spokenEff) s.exact++;
};

for (const it of items) {
  const morae = splitMorae(it.kana);
  const particle = it.particle ?? false;
  if (!particle && morae.length < 2) continue; // 1-mora isolated words carry no contrast
  let audio;
  try { audio = readWav(readFileSync(it.file)); } catch (e) { console.error(`skip ${it.file}: ${e.message}`); continue; }
  const x = normalize(audio.samples);
  const spoken = it.spokenK ?? it.accent[0];
  const n = morae.length;
  const spokenEff = !particle && spoken === n ? 0 : spoken;
  const type = !particle && (spoken === 0 || spoken === n) ? 'flat/tail-high' : accentType(spoken, n);
  for (const [name, eng] of Object.entries(engines)) {
    const { track, opts } = await eng(x, audio.sampleRate);
    for (const segmentation of ['equal', 'auto']) {
      const key = `${name}/${segmentation}`;
      const r = judge(track, { morae, accent: it.accent }, { ...opts, segmentation, particle });
      add(key, 'ALL', r, spokenEff);
      add(key, `type:${type}`, r, spokenEff);
      add(key, `morae:${Math.min(n, 5)}${n >= 5 ? '+' : ''}`, r, spokenEff);
      rows.push([it.file.split('/').pop(), it.surface, it.kana, it.accent.join(','), it.speaker ?? '', name, segmentation, r.error ?? '', r.detectedK ?? '', r.pass ?? '', (r.confidence ?? 0).toFixed(2)]);
    }
  }
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '–');
const speakers = new Set(items.map((i) => i.speaker).filter(Boolean));
console.log(`Recordings: ${rows.length / Object.keys(engines).length / 2}, speakers: ${speakers.size}\n`);
console.log('| engine / segmentation | group | n | dictionary reading passes | detected k exact | no voice / error |');
console.log('|---|---|---|---|---|---|');
for (const [key, groups] of Object.entries(agg)) {
  for (const [g, s] of Object.entries(groups).sort()) console.log(`| ${key} | ${g} | ${s.n} | ${pct(s.pass, s.n)} | ${pct(s.exact, s.n)} | ${pct(s.err, s.n)} |`);
}
if (csvPath) {
  writeFileSync(csvPath, ['file,surface,kana,accent,speaker,engine,segmentation,error,detectedK,pass,confidence', ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'));
}

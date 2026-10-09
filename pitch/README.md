# P3 Pitch — browser demo (stage 2, internal prototype)

Say a Japanese word followed by **が**. The page tracks your pitch (F0), splits the
utterance into morae, lays it over the dictionary accent pattern and says whether
your pitch drops (下がり目) in the right place.

Standalone: nothing here touches the root app (減算ゼロ). Plain ES modules, no bundler.

## Run

```sh
cd pitch
npm install          # dev deps: pitchy, onnxruntime-web/node (for vendoring + tests)
npm run vendor       # copies pitchy, fft.js and ONNX Runtime Web into vendor/
npm run serve        # http://localhost:5173/  (mic needs localhost or https)
npm test
```

`vendor/pitchy.js`, `vendor/fft.js` and the SwiftF0 model are committed; the 14 MB
ONNX Runtime wasm is not (`npm run vendor` recreates it). Without it the default
pitchy engine still works; only the optional SwiftF0 engine needs it.

## Single-file demo page (`dist/pitch-demo.html`)

The Japanese file-upload demo (no microphone; pick a voice memo of 「〜が」) is one
self-contained HTML file with everything inlined — script, lexicon, licence texts.

```sh
npm run build:demo                                   # 2,000 words (data/lexicon-2000.json)
node scripts/build-demo.mjs --lexicon 200            # the old 266-word page
node scripts/demo-sanity.mjs                         # synthetic correct/wrong sample of every shipped word
node scripts/qa-demo.mjs [--words 266]               # Playwright end-to-end QA
```

The build ships the lexicon in a compact array form (`demo/lexicon.js` decodes it;
morae and type are derived from kana and accent), ~82 KB for 2,000 words, ~135 KB page.
Words held back for native review (`data/needs-review-*.tsv`) are never shipped.
The picker has search (kanji, kana or katakana, English gloss), a type filter and
quick picks for the classic homophone sets (箸・橋・端, 雨・飴, 花・鼻, 神・紙・髪, 柿・牡蠣).
On the synthetic samples 14 of the 2,000 words fail their *correct* sample: accent
3 or 1 where the next mora is a bare vowel or っ (曜日 words, 案内, 材料, 北極 …), a
segmentation limit — see `demo-sanity.mjs` output.

## Offline PWA (`site/app/`)

The same page as an installable, offline-capable web app, for any static host (all URLs
are relative, so it works under any sub-path; the landing page links to it as `./app/`).

```sh
npm run build:pwa        # build-demo content → site/app/{index.html, manifest.webmanifest, sw.js, icons/}
npm run serve:site       # http://localhost:5174/app/  (serves site/; SW needs localhost or https)
node scripts/qa-make-fixtures.mjs /tmp/pitch-fx    # once: synthetic .wav fixtures (outside the repo)
node scripts/qa-pwa.mjs --fixtures /tmp/pitch-fx   # Playwright: install criteria, SW, offline judge
```

- `build-pwa.mjs` runs `build-demo.mjs` unchanged into a temp file and wraps it in a full
  document (`lang="ja"`, `viewport-fit=cover`, light/dark `theme-color`, manifest,
  apple-touch-icon, iOS web-app metas). The Artifact build (`dist/pitch-demo.html`) stays
  SW-free and byte-identical.
- `sw.js` precaches the page, manifest and icons under a cache named by a content hash
  (rebuild → new cache, old ones deleted on activate). Precached files are cache-first;
  navigations in the app folder get the cached page offline. Nothing cross-origin and no
  audio is ever cached (files are decoded in the page). Serve `sw.js` with `no-cache`.
- Icons are drawn in code (`scripts/pwa-icons.mjs`, deterministic) and committed.
- 「ホーム画面に追加」 hint: an install button on Chrome/Android (`beforeinstallprompt`), the
  Share → ホーム画面に追加 instruction on iOS; hidden when already standalone or dismissed.
  Still file-picker only (no microphone).
- Manual offline check: open `/app/`, reload once, then DevTools → Network → Offline (or
  stop the server) and reload — the page, samples and file uploads keep working.

## How the judgement works (`src/judge.js`)

1. F0 per 10 ms frame (pitchy/MPM, or SwiftF0 at 16 ms), unreliable frames dropped,
   octave jumps folded back, median-filtered, converted to semitones.
2. The utterance span is the voiced region, extended by at most one mora where the
   signal energy shows a devoiced mora (し in した).
3. The span is split into n + 1 mora slots (n word morae + が). Since we know the morae,
   we know which boundaries should show a consonant cue — a voicing break (voiceless
   consonant, っ) or an energy fall (nasal, voiced stop, flap). A small dynamic programme
   places the boundaries on those cues while keeping mora lengths near equal (Japanese
   is mora-timed); vowel-initial morae rely on the length prior. `segmentation: 'equal'`
   gives the old equal split. Each slot gets the median pitch of its frames.
4. Every H/L template k = 0…n (0 = flat) is fitted as `a + b·template + c·mora`
   with a bounded downdrift slope c. The best fit with a real H/L contrast
   (b ≥ 1.2 semitones) is the detected downstep; if none has one, the speech was flat.
5. Pass = detected k is one of the dictionary's accepted k's. Otherwise the verdict says
   whether the drop came too early, too late, was missing, or should not be there.

Known limits: boundaries before vowel-initial morae (お|う in おとうと, ー) have no cue;
creaky voice and heavy devoicing reduce the usable frames.

## Evaluation

- `node scripts/eval-segmentation.mjs [--swiftf0]` — synthetic audio with consonants and
  uneven timing, equal vs. cue-based segmentation. Results: `docs/eval-results.md`.
- `node scripts/eval-real.mjs manifest.json [--swiftf0] [--csv out.csv]` — real recordings.
- Human evaluation protocol (on hold until we have speakers): `docs/eval-plan.md`,
  word list `docs/eval-words.tsv`. Waitlist LP copy: `docs/lp.md`.

## Data

| File | What |
|---|---|
| `data/words-seed-200.tsv` | Our own word list (surface, reading, English gloss) for the demo |
| `data/words-candidates-2000.tsv` | Larger candidate list for the 2,000-word build |
| `data/lexicon-200.json` | 266-word lexicon (accent from UniDic) — loaded by the dev page (`index.html`) |
| `data/lexicon-2000.json` | 2,000-word lexicon, built by the same script — embedded in `dist/pitch-demo.html` |

Rebuild with UniDic (BSD option, via unidic-lite):

```sh
python3 -m venv .venv && .venv/bin/pip install fugashi unidic-lite
.venv/bin/python scripts/build_lexicon.py data/words-seed-200.tsv data/lexicon-200.json
.venv/bin/python scripts/build_lexicon.py data/words-candidates-2000.tsv data/lexicon-2000.json --limit 2000
```

Words UniDic doesn't know under the given reading are dropped and listed. Model audio is
a synthetic pitch line (`src/synth.js`) until licence-cleared native recordings exist.
Licences and sources: `licenses.html`.

# Evaluation results (P3 Pitch, 2026-10-08, updated 2026-10-09)

## 1. Synthetic audio (`scripts/eval-segmentation.mjs`)

Every lexicon word is rendered as "<word>が" audio with crude but realistic consonants
(stop closures and bursts, fricative noise, nasals, voiced stops, っ silence, ん),
uneven mora lengths (±25–35 %), a lengthened final が, pitch jitter and downdrift,
for 3 synthetic speakers (105 / 190 / 240 Hz). Each word is said once with the dictionary
accent and once with the opposite (flat ⇄ drop) to measure wrong passes.
Boundary error is measured on interior mora boundaries against the synthesis ground truth.

### 266-word demo lexicon (pitchy and SwiftF0)

| engine / segmentation | correct reading passes | detected k exact | wrong reading wrongly passes | boundary error median | boundaries within 40 ms |
|---|---|---|---|---|---|
| pitchy/equal | 98.2% | 98.2% | 0.3% | 42 ms | 47.7% |
| pitchy/auto | 99.9% | 99.9% | 0.1% | 13 ms | 96.5% |
| swiftf0/equal | 90.9% | 90.7% | 2.7% | 41 ms | 48.6% |
| swiftf0/auto | 98.7% | 98.7% | 0.0% | 14 ms | 96.6% |

### 2,000-word lexicon (pitchy and SwiftF0)

| engine / segmentation | correct reading passes | detected k exact | wrong reading wrongly passes | boundary error median | boundaries within 40 ms |
|---|---|---|---|---|---|
| pitchy/equal | 98.6% | 98.6% | 0.2% | 42 ms | 48.2% |
| pitchy/auto | 99.8% | 99.7% | 0.1% | 13 ms | 95.6% |
| swiftf0/equal | 95.2% | 95.0% | 1.4% | 40 ms | 49.8% |
| swiftf0/auto | 98.8% | 98.8% | 0.1% | 15 ms | 95.2% |

**Reading:** cue-based segmentation cuts the median boundary error from ~42 ms to ~13 ms
and puts ~96 % of boundaries within 40 ms (vs ~48 %). Accent detection improves most for
SwiftF0 (16 ms frames). Wrong readings almost never pass (≤ 0.1 %).
Caveat: synthetic speech is far cleaner than real speech; these are upper bounds.

### 2026-10-09: drop before a vowel-initial mora / next to っ

`demo-sanity` showed 14 of 2,000 words whose *correct* sample failed (水曜日, 案内, 材料 …
detected one mora early; 鬼ごっこ, 紙コップ one late; 北極). Two causes:

1. **Tracker dropouts read as consonants.** pitchy loses lock for 40–60 ms inside a vowel
   whenever F0 moves fast — i.e. at the accent. The segmenter took that voicing break
   for a consonant and moved the nearest consonant-initial boundary onto it (い|よ of
   すいようび onto the よ|う fall), so the drop landed one slot early. Fix: a voicing
   break is a consonant cue only as far as energy dips across it (0 below 1 dB, full from
   3 dB). Measured on the 266 lexicon: breaks at no consonant dip ≈ 0 dB (p95 0.2 dB);
   flaps/glides 1.8–3.7 dB, nasals 7–10, fricatives/voiced stops 10+, stops 20+.
2. **っ has no pitch.** Its slot only held F0 smeared in from the neighbour, which read as
   "still high" (ごっこ) or "already low". っ now gives no value; templates that differ only
   on pitchless morae are one answer (`equivalentK`). No dictionary accent in either
   lexicon puts the drop on っ.

`eval-segmentation.mjs` before → after (pitchy/auto and swiftf0/auto; equal is unchanged):

| lexicon / engine | correct passes | detected k exact | wrong passes | boundary median | within 40 ms |
|---|---|---|---|---|---|
| 266 pitchy | 99.6% → 99.9% | 99.6% → 99.9% | 0.1% → 0.1% | 13 → 13 ms | 96.1% → 96.5% |
| 266 SwiftF0 | 98.5% → 98.7% | 98.5% → 98.7% | 0.0% → 0.0% | 15 → 14 ms | 96.4% → 96.6% |
| 2,000 pitchy | 99.1% → 99.8% | 99.1% → 99.7% | 0.1% → 0.1% | 13 → 13 ms | 95.2% → 95.6% |
| 2,000 SwiftF0 | 98.7% → 98.8% | 98.7% → 98.8% | 0.1% → 0.1% | 15 → 15 ms | 95.2% → 95.2% |

`demo-sanity` (2,000 words, the page's samples): correct 1,986 → **2,000**/2,000; wrong
1,997 → 1,996/1,997. The one wrong sample that now passes is 筆者 ひっしゃ [1, 0] said with
k = 2, i.e. the drop *on っ*: with っ silent its only H is inaudible, the rest is
monotone, and monotone speech reads as flat (accepted). The old judge failed it only
because 0.9 st of smeared F0 sat in the っ slot. (The page's "wrong pattern" button could
avoid drops on っ/ん/ー, which Tokyo Japanese does not have; not changed here.)

Robustness, outside the demo seeds (scratch harness, not in the repo): fresh seeds and
three other speakers (fast 120 ms morae / 2.2 st step / 4 st step with 0.3 st jitter),
and **every** non-accepted k as a wrong reading, not just flat ⇄ drop. Same audio for
both judges, pitchy, auto segmentation:

| set | correct passes | wrong k wrongly passes | of which adjacent k | drop on っ/ん/ー passes | boundary median | within 40 ms |
|---|---|---|---|---|---|---|
| 2,000 (seed 7000) before | 99.12% (6661/6720) | 0.16% (27/16860) | 0.29% (23/7851) | 71/1854 | 17 ms | 92.0% |
| 2,000 (seed 7000) after | 99.90% (6713/6720) | 0.08% (14/16860) | 0.11% (9/7851) | 137/1854 | 13 ms | 92.5% |
| 266 (seed 5000) before | 99.54% (872/876) | 0.10% (2/1944) | 0.20% (2/1023) | 6/120 | 17 ms | 94.6% |
| 266 (seed 5000) after | 99.77% (874/876) | 0.05% (1/1944) | 0.10% (1/1023) | 9/120 | 17 ms | 94.8% |
| 266 (seed 9000) before | 99.43% (871/876) | 0.15% (3/1944) | 0.29% (3/1023) | 6/120 | 17 ms | 94.9% |
| 266 (seed 9000) after | 99.89% (875/876) | 0.05% (1/1944) | 0.10% (1/1023) | 10/120 | 17 ms | 95.1% |

"Drop on っ/ん/ー" readings (no such accent exists in Tokyo Japanese) are counted apart:
on 2,000 words, drops on っ pass 71 → 134 of 171 (inaudible, see above), on ん 0 → 3 of
1,560, on ー 0 of 123. Remaining errors after the change are mostly the fast speaker:
short morae with a stop onset leave a handful of voiced frames, and a weak flap cue
(テレビ, カメラ said with k = 2 pass as k = 1).

Tried and not kept: F0 movement as a weak boundary cue for every boundary (+3 correct,
−1 / +3 wrong passes on the 2,000 set — no clear gain, and on real speech F0 turning
points lag the mora boundary); rewarding each consonant cue at one frame only
(clearly worse: 99.9% → 99.3% correct on the 266 set).

## 2. Public real-speech data (Lingua Libre, Wikimedia Commons)

- **Source:** native-speaker isolated-word recordings, licence-filtered to CC0 / CC BY / CC BY-SA.
  650 candidates from 13 speaker accounts (~12 people), all licence-checked:
  CC0 447, CC BY-SA 4.0 104, CC BY 4.0 99 (`data/eval-lingualibre-candidates.json`, metadata only).
- **Status: blocked.** `upload.wikimedia.org` rate-limited the sandbox's shared IP
  (HTTP 429, retry-after 600 s) after the first file. We did not work around the limit.
  Only 1 file was downloaded (卵 たまご, CC0): both engines and both segmentations judged it
  correctly — this only shows the pipeline runs end-to-end, it is **not** an accuracy figure.
- **Limits of this data even when downloaded:** isolated words have no が, so flat vs.
  tail-high cannot be tested (`particle: false` mode merges them); some speakers may not be
  native and need checking first.
- **To resume:** `WIKIMEDIA_CONTACT=… python3 scripts/fetch_lingualibre.py OUT_DIR`, then
  `scripts/annotate_manifest.py` and `scripts/eval-real.mjs` (see the script header).
  Audio stays outside the repo.

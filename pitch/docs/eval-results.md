# Evaluation results (P3 Pitch, 2026-10-08)

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
| pitchy/auto | 99.6% | 99.6% | 0.1% | 13 ms | 96.1% |
| swiftf0/equal | 90.9% | 90.7% | 2.6% | 41 ms | 48.6% |
| swiftf0/auto | 98.5% | 98.5% | 0.0% | 15 ms | 96.4% |

### 2,000-word lexicon (pitchy)

| engine / segmentation | correct reading passes | detected k exact | wrong reading wrongly passes | boundary error median | boundaries within 40 ms |
|---|---|---|---|---|---|
| pitchy/equal | 98.6% | 98.5% | 0.2% | 42 ms | 48.2% |
| pitchy/auto | 99.1% | 99.1% | 0.1% | 13 ms | 95.2% |

**Reading:** cue-based segmentation cuts the median boundary error from ~42 ms to ~13 ms
and puts ~96 % of boundaries within 40 ms (vs ~48 %). Accent detection improves most for
SwiftF0 (16 ms frames, 90.9 % → 98.5 %). Wrong readings almost never pass (≤ 0.1 %).
Caveat: synthetic speech is far cleaner than real speech; these are upper bounds.

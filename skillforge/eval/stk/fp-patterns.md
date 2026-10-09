# FP patterns: SuperTuxKart ja.po

Precision: A (no glossary) 3/4 = 0.75. B (draft glossary) 11/17 = 0.647, with 1 unsure. All `notation.katakana` findings were TP. Every FP came from `term.missing` (5) or `placeholder.mismatch` (1).
The same patterns show up in Pixelorama, where they are worse: see `../pixelorama/fp-patterns.md`.

## 1. The draft glossary pairs a term with an unrelated target (2 FP here, 7 in Pixelorama)
- `ja.po:110`: draft entry "AIs → 連勝". The target correctly says 3人のAI.
- `ja.po:3950`: draft entry "Oops → 鳥". The target correctly says おーっと.

**Fix:** `src/core/draft.ts`, `draftGlossary()`, the `accepted` condition (around line 389). These entries pass with `dice == MIN_DICE (0.5)` and `co == 2`. Fix options:
- Require `best.dice > MIN_DICE` (strictly greater).
- Require coverage `best.co / rows.length >= 0.5`.
- Require `best.co >= 3` when `rows.length >= 4`.
- If none of these hold, leave `target` undefined so the term only goes to the notes.

## 2. The draft takes a longer compound than the term itself (1 FP here, 6 in Pixelorama)
- `ja.po:1040`: "Performance" is rendered パフォーマンス. The draft target is パフォーマンステスト, taken from "Performance Test Results".

**Fix:** `src/core/draft.ts`, `align()`, the extension loop condition `r.co * 2 >= core.co`. This lets a compound that appears in only half the rows replace the core. Fix options:
- Extend only when `r.co >= 0.8 * core.co`, or when the source phrase is also a longer n-gram.
- Otherwise keep `core` as `target` and put the longer form into `allowed`.

## 3. `term.missing` on common English words and context-dependent senses (2 FP and 1 unsure here, 4 FP in Pixelorama)
- `ja.po:4974`: "Remember that everyone…" is an ordinary verb. The draft entry is Remember → 記憶.
- `ja.po:4481`: "Random" is the reverse-track option None/All/Random. 乱数に任せる is a legitimate translation.
- `ja.po:6220`: "Random item location" → 適当にする. Labeled unsure.

**Fix:**
- `src/core/draft.ts`: for single-word English candidates, require `cap && mid`, which marks a UI term capitalized mid-sentence, or coverage ≥ 0.7. Also extend `EN_STOP` with frequent UI verbs and adjectives: remember, hold, start, random, expand, display, modify, error, user, linear, sort.
- `src/core/checks/terms.ts`: when the glossary term note starts with `draft:` and the source is a single word, emit `term.missing` at `info`, not `warning`.

## 4. A lowercase `[word]` in brackets is treated as a placeholder (1 FP)
- `ja.po:3164`: `[none]` → `[なし]`. This is literal UI text and the translation is correct.

**Fix:** `src/core/text.ts`, `PLACEHOLDER`. Drop the `\[[a-z_][a-z0-9_.]*\]` alternative, or require that the token contains `_`, `.` or a digit. Optionally, in `src/core/checks/rules.ts`, treat a bracket token as a placeholder only when the same token appears verbatim in the target of at least one other row.

## Misses (60-entry sample: 10; 6 excluding empty msgstr)
- **Term drift between nouns that are not in the draft glossary:**
  - Goals → 目標 at :4240
  - rating → ランキング at :5642
  - multiplayer → 二人プレイ at :6392
  - cake → カップケーキ at :2655

  The draft does not propose these terms. The help texts render them differently from the menu labels.
- **`katakanaKey` (`src/core/text.ts`) does not fold a ウ long vowel into ー:** ウィンドー vs ウィンドウ at :5652. A fold like `([オコソトノホモヨロゴゾドボポョォ])ウ → $1ー` would catch it.
- **Kanji/kana variants are not checked:** ハエ叩き vs ハエたたき at :2643. This needs a new notation rule.
- **Empty msgstr gets only an aggregate stderr note:** :4151, :6126, :6618, :6884. Consider an opt-in per-line `untranslated` info finding.
- **Outside the sample, a plural draft source misses singular uses:** the draft stores the source as "Egg Hunts", and `enPhraseRegex` (`src/core/text.ts`) only adds suffixes. So "Egg hunt" at :1583 and "egg hunt mode" at :1588, both rendered 卵狩り, are not flagged. Fix: the draft should emit the singular lemma, or `enPhraseRegex` should strip a trailing plural `s` before building the regex.

# Luanti (luanti.po): false-positive patterns

Precision with unsure findings left out: **A 0.867** (13 TP / 2 FP, all 15 findings) and **B 0.419** (13 TP / 18 FP / 1 unsure, all 32).
- notation.katakana: 13 of 13 TP.
- tag.mismatch: 0 of 2 TP.
- term.missing from the auto-draft: 0 of 16 TP, plus 1 unsure.

## 1. Draft glossary pairs a term with the wrong target (B: 9 FP)
Examples:
- `luanti.po:5200`, `:6317`: "Quicktune" drafted as エントリ; the translation keeps "Quicktune".
- `luanti.po:2948`: "ABM" drafted as 時間予算; the translation keeps "ABM".
- `luanti.po:6213`: "TrueType" drafted as フォールバックフォント. Also Browse→オンラインコンテンツ.

Fixes:
- `src/core/draft.ts` `align()`: prefer target = source when the Latin term appears verbatim in most targets.
- `src/core/draft.ts`: penalize JA targets with high document frequency across unrelated source keys.
- `src/core/draft.ts`: require at least 3 consistent rows for confidence under 0.8. Quicktune had 0.62 and ABM had 0.57.
- `src/core/checks/terms.ts`: never report term.missing when the source term appears verbatim in the target.

## 2. Draft target over-extended, or overlapping terms double-fire (B: 5 FP + 1 unsure)
Examples:
- `luanti.po:5481`: "Loading Block Modifiers"; the terms "Block Modifiers" and "Modifiers" were both drafted as アクティブブロックモディファイヤー, so the line reports 2 findings.
- `luanti.po:6245`: "Poisson filtering"; the glossary wants ポアソンディスク.
- `luanti.po:3927`: "Transparency Sorting" drafted as the truncated 透明度の並. The underlying ソート vs 並べ替え drift is real, so this one is labeled unsure.

Fixes:
- `src/core/draft.ts`: drop a candidate whose source is a sub-phrase of another drafted candidate with the same target ("Modifiers" ⊂ "Block Modifiers").
- `src/core/draft.ts`: trim targets to the shortest JA n-gram with equal coverage, and reject targets that end mid-word (並).
- `src/core/checks/terms.ts`: when a longer glossary term matches the same source span, suppress the shorter term's finding on that row (longest-match-wins).

## 3. Angle-bracket display text treated as tags (A and B: 2 FP, both tag errors)
Examples:
- `luanti.po:333`: `<empty>`→`<なし>`.
- `luanti.po:507`: `<none available>`→`<利用できません>`.

Fix in `src/core/checks/rules.ts` (`TAG`/`tags()`):
- When the source `<…>` is not a known markup/TMP/XLIFF tag and the target holds the same number of `<…>` segments with Japanese inside, treat them as translated text.
- Never treat `<word word>` (a bare second word with no `=`) as a tag.

## 4. Minor: inflection or particle and kept-English key names (B: 2 FP)
- `luanti.po:7382`: ジョイスティックのボタン vs ジョイスティックボタン.
- `luanti.po:2098`: "Clear Key" → Clearキー.

The JA loose-match and verbatim-source fixes described for Godot (`src/core/text.ts` `containsPhrase`, `src/core/checks/terms.ts`) cover these.

## Misses worth a rule
- **イ/ー katakana variants** (プレイヤー ×34 / プレーヤー ×8; `luanti.po:5826`). `katakanaKey` in `src/core/text.ts` folds ー/・/ヴ/small kana but not the イ↔ー pair.
  - Suggested fix: add a fold for `([ェエケセテネヘメレ])イ` ⇔ `$1ー` (and `ウ`↔`ー` after o-row kana) as a second-tier key, and report it as "possible variant".
  - トライリニア/トリリニア (outside the sample) would need an edit-distance-1 katakana pass between frequent runs.
- **Kanji homophone drift** 既定 ×30 / 規定 ×7 (`luanti.po:3559`).
  - Suggested fix: a small built-in list of common UI homophone pairs (既定/規定, 表示/標示, 制御/制語…) checked in `checkNotation`.

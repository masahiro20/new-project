# FP patterns: Pixelorama ja_JP.po

Precision: A (no glossary) 4/4 = 1.0. B (draft glossary) 12/30 = 0.40, with 1 unsure. All `notation.katakana` findings were TP. All 18 FPs come from `term.missing` against draft-glossary entries.
The same patterns appear in SuperTuxKart: see `../stk/fp-patterns.md`.

## 1. The draft glossary pairs a term with an unrelated target (7 FP)
- `ja_JP.po:261`, `:3058`, `:3061`, `:4173`: draft entry "Modify → チャンネル" (confidence 0.5). The targets 修正 and 変更 are fine.
- `ja_JP.po:446`, `:963`, `:2102`: draft entry "Display → カーソル" (confidence 0.5). The target is 表示.

**Fix:** `src/core/draft.ts`, `draftGlossary()`, the `accepted` condition (around line 389). Both entries pass with `dice == MIN_DICE` exactly. Fix options:
- Require `dice > 0.5`.
- Require coverage `best.co / rows.length >= 0.5`. Modify has 8 rows but only about 2 contain チャンネル.
- Otherwise leave `target` undefined.

## 2. The draft takes a longer compound than the term itself, or a fragment of one (6 FP)
- `ja_JP.po:3165`, `:3168`: Error → エラー is correct. The draft target is エラーコード.
- `ja_JP.po:663`, `:753`: Directory → ディレクトリ is correct. The draft target is ディレクトリパス.
- `ja_JP.po:3504`: "User data:" → ユーザーデータ is correct. The draft target is レイヤーユーザーデータ.
- `ja_JP.po:403`: "Rename" → 名前を変更 is correct. The draft target 名の変更 is a fragment of レイヤー名の変更.

**Fix:** `src/core/draft.ts`, `align()`, the extension loop. The condition `r.co * 2 >= core.co` lets a compound used in only half the rows win. Fix options:
- Use `r.co >= 0.8 * core.co`, and extend only when the source candidate is itself multi-word.
- Otherwise keep the core as target and list the longer forms as `allowed`.
- Reject targets that start with a particle or are mid-word fragments, such as `名の…`.

## 3. `term.missing` on common words or context-dependent senses (4 FP, 1 unsure)
- `ja_JP.po:4000`: "Hold Shift" → 押したまま is right. The draft entry is Hold → 長押.
- `ja_JP.po:2244`: "Start" is a noun in a Start/End pair, so スタート is legitimate. The draft entry is Start → 開始.
- `ja_JP.po:2963`: Expand group → 展開 is correct. The draft entry 拡張 is a different sense.
- `ja_JP.po:1215`: Linear interpolation → 線形 is fine.
- `ja_JP.po:552`: unsure.

**Fix:**
- `src/core/draft.ts`: for single-word English candidates, require `cap && mid` (a capitalized UI term) or coverage ≥ 0.7. Add frequent UI verbs and adjectives to `EN_STOP`: hold, start, expand, linear, display, modify, error, user, sort, merge.
- `src/core/checks/terms.ts`: downgrade draft-origin single-word `term.missing` findings to `info`.

## 4. A reference to a third-party product's feature (1 FP)
- `ja_JP.po:2467`: "Krita's curve tool" → 曲線ツール. This is not Pixelorama's own Curve Tool label.

**Fix (low priority):** `src/core/checks/terms.ts`. Skip `term.missing` when the source match is directly preceded by a possessive proper noun (`[A-Z]\w+'s `). Otherwise accept it as residual noise.

## Misses (60-entry sample: 5)
- **Term drift on terms the draft did not propose or did not unify:**
  - 切り抜き at :3675 vs トリミング/クロップ/切り取り for crop
  - ペン/鉛筆 at :3326 vs 鉛筆 at :1685
  - スプラッシュ スクリーン at :1363 vs スプラッシュ画面 at :3189
  - 前回の vs 最後の for "last project" at :3393
- **No identical-to-source untranslated check:** "Donate" → "Donate" at :1426. Fix: add `untranslated.identical` in `src/core/checks/rules.ts`. It fires when the source has ≥1 lowercase English word, the target is identical, and the target language is ja. Skip strings that are only proper nouns or URLs.

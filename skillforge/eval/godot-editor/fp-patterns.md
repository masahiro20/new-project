# Godot editor (ja.po): false-positive patterns

Precision with unsure findings left out: **A 0.787** (63 TP / 17 FP, sample of 80 out of 99 findings) and **B 0.367** (29 TP / 50 FP / 1 unsure, sample of 80 out of 229).
- Every FP in A comes from placeholder.mismatch or tag.mismatch.
- Over the full file, 21 of 21 placeholder/tag findings are FP.
- The katakana rule had no FPs: 78 of 78 are real drifts.

## 1. Draft glossary pairs a term with the wrong target, then term.missing fires everywhere (B: 16 FP in the sample, the largest cause)
Examples:
- `ja.po:18174`: "App Store" drafted as 配布; the translation keeps "App Store".
- `ja.po:17130`: "Sums" drafted as 絶対導関数の合計.
- `ja.po:5771`: "Xcode" drafted as ライン. Also AABB→可視性, OpenXR→アクションマップ, Move Node→順序.

Fix in `src/core/draft.ts` (`align()` and the accept condition around line 389):
- When the source n-gram is Latin script and appears verbatim in at least 50% of its targets, propose `target = source` instead of the co-occurring JA n-gram. Most of these are kept product or class names.
- Reject a pair whose JA target also co-occurs with many other source keys (high target document frequency, like ライン or 配布). Today only the source side's `df` is used.
- Do not emit a term whose top rendering count is below about 3 when the confidence is under 0.8.

Fix in `src/core/checks/terms.ts` (`checkTerms`): when the target contains the source term verbatim (ASCII), count the row as "kept as-is" and do not raise term.missing.

## 2. Draft target is over-extended or truncated (B: 7 FP)
Examples:
- `ja.po:2065`: "Keyframe" expected as アニメーションキーフレーム; the target has キーフレーム.
- `ja.po:12713`: "Font Size" expected as フォントサイズアイテム.
- `ja.po:5066`: "Recent" expected as 最近開, a cut-off of 最近開いた.

Fix in `src/core/draft.ts`:
- After alignment, trim the target to the shortest JA n-gram that keeps at least 90% of the co-occurrence count. キーフレーム covers every row that アニメーションキーフレーム covers, so it wins.
- Reject targets that end in a verb stem or okurigana-less kanji fragment (開, 並) unless the term is a single kanji. A JA tokenizer heuristic is enough: a target must end at a kana/kanji script boundary or a full katakana run.

## 3. Inflection, particles and kept-English names make term.missing fire on correct renderings (B: 6 inflection + 7 kept-as-is + 4 common-word paraphrase)
Examples:
- `ja.po:765`: 選択を解除 vs glossary 選択解除.
- `ja.po:19081`: 準備しています vs 準備中.
- `ja.po:1281`: "RESET" (an animation name) matched the term "Reset" case-insensitively. Also `ja.po:15606`: GridMap kept in English.

Fixes:
- `src/core/text.ts` `containsPhrase` for `lang === "ja"`: add a loose JA match. Let a single particle (の/を/が/に) sit between kanji/katakana segments of the approved target (選択解除 ⇔ 選択を解除, バスレイアウト ⇔ バスのレイアウト). Strip a trailing 中/する/します from the target term before matching.
- `src/core/checks/terms.ts`: match all-caps source tokens (RESET) case-sensitively, so a source word in caps is treated as an identifier.
- `src/core/draft.ts`: skip single common English verbs (Reset, Lock, Inspect, Shrink, Generating, Preparing) unless the rendering is at least 90% consistent with at least 5 rows. Raise the bar for single-word terms in `short`.

## 4. Japanese plural forms: msgid compared with msgstr[0] (A: 7 FP in the sample, 7 of 7 `{num}` entries)
Examples:
- `ja.po:12613`: "1 color" / "{num} colors" → `{num}色`, reported as unexpected {num}.
- `ja.po:13401`: "Node has one connection." → `ノードには {num} 個の接続があります。`
- `ja.po:12641`: "1 icon" → `{num} アイコン`.

Fix in `src/core/parsers/po.ts` around lines 120–140:
- When an entry has `msgid_plural` and the header `Plural-Forms` says `nplurals=1` (or only `msgstr[0]` exists), set `source = msgid_plural` for the row.
- Or, more generally, in `src/core/checks/rules.ts` `placeholder.mismatch`, accept placeholders that appear in either msgid or msgid_plural for plural rows. The row context already carries `plural:`, so it could carry the plural text in a field.

## 5. Bracketed or angle-bracketed display labels treated as placeholders or tags (A: 4 + 4 + 2 FP in the sample, 13 across the full file)
Examples:
- `ja.po:1167` `[foreign]`→`[外部]`, `ja.po:4579` `[empty]`→`[空]`, `ja.po:19593` `[auto]`→`[自動]`. These are placeholder.mismatch errors.
- `ja.po:4378` `<unknown>`→`<不明>`, `ja.po:6696` `<Unnamed Material>`. These are tag.mismatch errors.
- `ja.po:18467`: the translator wrote the menu path as `[エクスポート] > [macOS] > [rcodesign]`, which produced unexpected `[rcodesign]`.

Fixes in `src/core/text.ts` (`PLACEHOLDER`) and `src/core/checks/rules.ts` (`TAG`, `tags()`):
- Treat lowercase `[word]` as a placeholder only when it does not form the whole string or a whole bracketed label. Simplest version: if the target has a bracketed segment at the same position with Japanese text inside, pair them and do not report. Or limit lowercase `[x]` to `[a-z_]+[._][a-z0-9_.]+` (has a separator) and leave `[UPPER]` as it is.
- For TAG: skip `<word>` when it is not a known markup tag and the target has `<…>` containing Japanese text at the same count. Also skip when the "tag" contains a space (`<none available>`, `<Unnamed Material>`), since real tags put attributes after the name, never bare words.
- Do not report `extra` lowercase `[x]` placeholders that appear in the source as bare words (rcodesign is in the source without brackets).
- At minimum, downgrade these to a warning: they are errors today and would fail CI.

## Not FP, but noise
- Katakana findings are precise but numerous: 78 findings from 24 groups, 17 for フォルダ/フォルダー alone. The CLI should collapse them into one finding per group with occurrence lines, or allow `--group-notation`.
- Compound groups give contradicting advice. Base-word majority is フォルダ (25×), yet `ja.po:5488` says change データフォルダ → データフォルダー and `ja.po:5242` says ユーザーデータフォルダ → ユーザーデータフォルダー.
- Fix in `src/core/checks/terms.ts` `checkNotation`: compute the preferred form per suffix family (the shared trailing ー/non-ー), or take the expected value from the base word's group when a compound group has fewer than 3 hits.

# Wesnoth (JA .po): false-positive patterns and suggested engine fixes

Evaluator 2, 2026-10-09. Data: wesnoth@9ec35a2f, `po/wesnoth-httt/ja.po` (EN→JA dialogue) and `po/wesnoth-lib/ja.po` (EN→JA UI). See labels.csv and summary.json.

| File / config | Findings | TP | FP | Unsure | Precision |
|---|---|---|---|---|---|
| httt A (no glossary) | 4 | 1 | 3 | 0 | 0.25 |
| httt B (auto draft) | 23 | 2 | 19 | 2 | 0.10 |
| httt C (hand names) | 49 | 1 | 45 | 3 | 0.02 |
| lib A (no glossary) | 28 | 11 | 17 | 0 | 0.39 |
| lib B (auto draft) | 72 | 17 | 52 | 3 | 0.25 |

Only one rule was reliable: `notation.katakana`, with 11 TP out of 12 unique findings (ユーザ/ユーザー, パーティ/パーティー, コミュニティ/コミュニティー). Every other rule was dominated by the patterns below, which are listed by FP count. Configs A and B share the A findings, so those are counted once here.

---

## 1. Auto-drafted EN→JA glossary maps terms to co-occurring fragments (51 FPs: httt B 16, lib B 35)

This translation keeps names in Latin script. `jaGrams` only proposes Japanese n-grams, so the draft picks a kanji that happens to co-occur with the term.
- httt/ja.po:4129 — draft `Garard → 世` (from "Garard II 世"). Five lines flagged where "Garard 王" is correct.
- httt/ja.po:692 — draft `Alduin → 島`. The target is "船で Alduin まで行く"; the name is present.
- lib/ja.po:9113 — draft `Toggle → ミニマップ`. "Toggle Full Screen" → "フルスクリーンの切り替え" (8 such lines). Other examples: `RNG → 予測可能`, `Shift → マウス`, `Aquatic → 水の野営地`.

A second group comes from generic single words used as terms: `Find → 探索` (lib:9760 "検索" is correct), `Hide → 非表示` (lib:4035 "表示しない"), and `Ruined → 廃墟` (lib:1521 "Ruined Castle" → "荒城").

**Fix: `src/core/draft.ts`**
- Passthrough detection: in `draftGlossary`, when the EN candidate appears verbatim in the JA target of ≥50% of its rows, propose `target = source` (or skip the candidate) instead of aligning `jaGrams`.
- Extend the single-kanji guard (`short`, around line 388) to JA targets in EN→JA tables. Reject 1-character targets (世, 島, 様, 頭, 剣) unless they have ≥3 rows and dice ≥0.8.
- Reject a target that only matches as part of a longer drafted compound. For example, `Aquatic → 水の野営地` is really "Aquatic Encampment".
- Add a UI-verb/adjective stoplist for EN sources (Toggle, Find, Hide, Show, Hold, Shift, Flip, Copy, Browse, Additional, Dead, Great, Regular, Ruined), or require the term to be a capitalized noun phrase that appears in at least two different contexts.
- **`src/core/checks/terms.ts`**: findings from terms whose `note` starts with `draft:` should be `info` until a person confirms the term.

## 2. Typographic apostrophe in names not normalized (26 FPs, httt C `name.missing`)

The source uses `Li’sar` (U+2019). The target and the hand glossary use `Li'sar`. The name is present, but `name.missing` fires on every Li'sar line.
- httt/ja.po:2599 — "That’s the Princess, Li’sar." / "王女の Li'sar です"
- httt/ja.po:4779 — "Death of Li’sar" / "Li'sar の死"
- httt/ja.po:8676 — "Li’sar strikes a killing blow!"

**Fix: `src/core/text.ts`**. Fold `’ ‘ ʼ ′` to `'` in both `enPhraseRegex`/`containsPhrase` (text and phrase) and `visibleText`. Alternatively, build the regex with `['’ʼ]` wherever the phrase has an apostrophe. Apply the same folding in `checks/names.ts` (the `jaNames().some(ja.includes)` test and near-miss tokens) and in `checks/voice.ts` `enRendering`.

## 3. "40% defense" parsed as a printf placeholder `% d` (15 FPs, lib A/B `placeholder.mismatch`, all severity error)

The printf branch of `PLACEHOLDER` allows the space flag, so `% d` inside "50% defense" counts as a placeholder. The JA target writes "50%の回避率", so the check reports a missing placeholder.
- lib/ja.po:327 — "Most units receive 20 to 40% defense in sand."
- lib/ja.po:1995 — "about 50% defense in hills… limited to 40%."
- lib/ja.po:2147 — "Elves… enjoy 60 to 70% defense"

**Fix: `src/core/text.ts` `PLACEHOLDER`**
- Drop the space from the flag class (`[-+0#]*`). Allow it only when the entry has `#, c-format` (pass the flag from `parsers/po.ts` into the row).
- Add `(?![A-Za-z])` after the conversion letter, so `%d` must not run into a word.
- Coverage gap found at the same time: Wesnoth's `$var` / `$var|` placeholders (64 entries here, e.g. `$isle_damned_starting_gold`) are not in `PLACEHOLDER`. Add `\$[A-Za-z_][A-Za-z0-9_.]*\|?`.

## 4. Honorific checks misread EN→JA, and a JA suffix after a space is invisible (15 FPs, httt C `honorific.drift`/`source-shift`)

`checkHonorifics` groups by JA honorific and then compares EN forms. The JA regex `(name)(様|さん…)?` needs the suffix right after the name, but this translation writes "Kalenz 様" and "Konrad 王子". Every hit becomes `(呼び捨て)`, so EN title variation in the source is reported as drift even though the JA target is consistent.
- httt/ja.po:4210 — "Prince Konrad" → "Konrad 王子" (9 such lines flagged)
- httt/ja.po:362 — "Master Delfador!" → "Delfador 師匠"
- httt/ja.po:7033 — "Kalenz様" (no space) is reported as a source shift against "Kalenz 様"

**Fix: `src/core/checks/voice.ts`**
- In `nameRes`, allow `[\s　]?` between the name and the suffix.
- Add the title nouns 王子, 王女, 姫, 卿, 師匠, 閣下, 殿下 (as titles) to the JA honorific list.
- When `sourceLang === "en"`, group by `(speaker, char, EN rendering)` and flag differing JA suffixes on the target side. EN source variation is not a translation error.
- **`src/core/parsers/po.ts` `speakerFrom`**: also accept `speaker=X`, which is Wesnoth's `#. [message]: speaker=Konrad`. Ignore generic values (`unit`, `second_unit`, `narrator`). Today 0 of 1230 httt rows get a speaker, so per-speaker voice and honorific logic is inert: Delfador's わし profile produced nothing, and all lines fall into one speaker bucket.

## 5. Tag check on non-functional markup (4 FPs: httt A 2, lib A 2)

- Emphasis dropped: httt/ja.po:8764 — "my <i>friend</i>… <i>foully</i>". The JA target omits italics, which is normal for Japanese. Severity was error.
- Literal angle-bracket text: lib/ja.po:7250 — "cpu_architecture^<unknown>" → "<不明>". This is visible text, not a tag.

**Fix: `src/core/checks/rules.ts`**
- When the target is JA and the only differences are pure emphasis tags (`i b em strong u italic`), emit `tag.emphasis-dropped` at `info` instead of a `tag.mismatch` error.
- In `tags()`, treat `<word>` as literal text when it has no attributes, no closing tag in the string, and is the whole string or lies outside any markup context. A simpler version: treat it as literal when the target has `<…>` with non-ASCII content at the same position.

## 6. Interjection spelled two ways (1 FP, httt A)

- httt/ja.po:9100 — "アアァ！" (a death cry) is flagged against "アアア".

**Fix: `src/core/checks/terms.ts` (notation)**: skip katakana runs made of one repeated mora or vowel extension (アアア, ハハハ, グオオオォ) before grouping by `katakanaKey`.

---

## Misses that point to engine work (see misses.csv)

- **Fuzzy entries are treated as translated.** lib has 98. lib/ja.po:7409 and 8446 hold stale, wrong translations. Fix: in `parsers/po.ts`, mark `row.fuzzy`, then emit a `po.fuzzy` warning and exclude those rows from the consistency statistics.
- **Empty msgstr gets only a stderr total.** Emit per-row `untranslated` info findings with file:line.
- **Latin names in a JA target are never near-miss scanned.** Examples: httt:7591 "Ashaviere", httt:2306 "Garald", httt:8478 "Welgyn". In `checks/names.ts`, also run the near-miss scan on the JA side's Latin tokens against glossary names, and against capitalized source tokens when there is no glossary.
- **Kanji/kana notation drift is not checked.** httt has 事ができ ×64 vs ことができ ×4 and 為に ×45 vs ために ×8. lib has 下さい ×7 vs ください ×15. Add a small pair list (事/こと, 為/ため, 下さい/ください, 全て/すべて, 出来る/できる, 殆ど/ほとんど) to the notation check.

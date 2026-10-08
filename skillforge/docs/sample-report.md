# Script consistency report

- **script.csv** — CSV, 30 rows, ja → en
- **ch2.json** — JSON, 3 rows, ja → en
- Glossary: 5 terms, 3 characters

| Check | ❌ error | ⚠️ warning | ℹ️ info |
|---|---:|---:|---:|
| Glossary term drift / 用語の訳揺れ | 2 | 2 | 0 |
| Katakana notation drift / 表記揺れ | 0 | 1 | 0 |
| Character name drift / キャラ名の揺れ | 1 | 3 | 1 |
| Honorific drift / 敬称の揺れ | 1 | 2 | 1 |
| Voice drift / 口調の揺れ | 0 | 5 | 0 |
| Placeholders (bonus) | 1 | 0 | 0 |
| Tags (bonus) | 2 | 0 | 0 |
| Ruby (bonus) | 1 | 0 | 0 |
| Length limits (bonus) | 1 | 0 | 0 |

## Glossary term drift / 用語の訳揺れ

### 星詠み → Stargazer
Usage: Stargazer ×3 · (not found) ×2

- ⚠️ `script.csv:16` `ch1_013` (target) — Source contains "星詠み" but the translation does not use "Stargazer".
- ⚠️ `script.csv:27` `ch1_024` (target) — Source contains "星詠み" but the translation does not use "Stargazer".

### 魔導石 → Mana Stone
Usage: Mana Stone ×6 · Magic Stone ×2

- ❌ `script.csv:6` `ch1_005` (target) — "魔導石" is rendered as forbidden variant "Magic Stone"; glossary says "Mana Stone".
- ❌ `script.csv:17` `ch1_014` (target) — "魔導石" is rendered as forbidden variant "Magic Stone"; glossary says "Mana Stone".

## Katakana notation drift / 表記揺れ

### ルーンゲート / ルーン・ゲート
Usage: ルーンゲート ×2 · ルーン・ゲート ×1

- ⚠️ `script.csv:21` `ch1_018` (source) — Katakana spelling "ルーン・ゲート" differs from the majority form "ルーンゲート" (2×).

## Character name drift / キャラ名の揺れ

### speaker トビアス

- ⚠️ `ch2.json:15` `ch2_003` (source) — Speaker label "Tobias" differs from "トビアス" used in 7 other rows.

### speaker ミナ

- ⚠️ `script.csv:26` `ch1_023` (source) — Speaker label "MINA" differs from "ミナ" used in 9 other rows.

### リゼット → Lisette
Usage: Lisette ×7 · Lizette ×1 · (not rendered) ×1

- ❌ `script.csv:23` `ch1_020` (target) — Character name written as "Lizette"; the approved spelling is "Lisette".
- ⚠️ `script.csv:24` `ch1_021` (target) — "Lisete" looks like a misspelling of "Lisette". Add it to ignoreWords if it is a real word.
- ℹ️ `script.csv:24` `ch1_021` (target) — "リゼット" appears in the Japanese but "Lisette" does not appear in the English (fine if replaced by a pronoun).

## Honorific drift / 敬称の揺れ

### トビアス → Lisette

- ℹ️ `script.csv:24` `ch1_021` (source) — In Japanese this speaker uses "様" here but "(呼び捨て)" in 2 other lines. Confirm it is an intentional shift (and that the English reflects it).

### ミナ → Lisette (様)
Usage: Lady Lisette ×3 · Lisette ×1 · Lisette-sama ×1

- ⚠️ `script.csv:15` `ch1_012` (target) — "Lisette" here, but this speaker's "様" is rendered "Lady Lisette" in 3 other lines.
- ❌ `script.csv:18` `ch1_015` (target) — Romanized honorific "Lisette-sama" but the project policy is "localize".
- ⚠️ `script.csv:18` `ch1_015` (target) — "Lisette-sama" here, but this speaker's "様" is rendered "Lady Lisette" in 3 other lines.

## Voice drift / 口調の揺れ

### トビアス / Tobias

- ⚠️ `script.csv:20` `ch1_017` (source) — トビアス / Tobias uses "僕" but their profile says "俺".

### リゼット / Lisette

- ⚠️ `script.csv:19` `ch1_016` (target) — リゼット / Lisette never uses contractions, but this line has "I'm".
- ⚠️ `script.csv:25` `ch1_022` (source) — リゼット / Lisette is written polite but this line is plain.
- ⚠️ `script.csv:25` `ch1_022` (target) — リゼット / Lisette never uses contractions, but this line has "We're".
- ⚠️ `script.csv:25` `ch1_022` (target) — リゼット / Lisette should not say "gonna".

## Placeholders (bonus)

- ❌ `script.csv:26` `ch1_023` (target) — missing [PLAYER]

## Tags (bonus)

- ❌ `script.csv:22` `ch1_019` (target) — missing </color>
- ❌ `script.csv:22` `ch1_019` (target) — Unbalanced tags: <color>

## Ruby (bonus)

- ❌ `script.csv:27` `ch1_024` (target) — Ruby markup copied into the English text.

## Length limits (bonus)

- ❌ `script.csv:32` `ch1_029` (target) — Length 66 exceeds the limit of 30.

## Needs judgement (review packets)

4 packet(s) for the reviewer: voice — リゼット / Lisette (12 lines); voice — ミナ / Mina (10 lines); voice — トビアス / Tobias (8 lines); unglossaried-term — 封印術 (4 lines)


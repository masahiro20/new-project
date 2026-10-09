# Kotomark（仮称）: Landing Page Copy (DRAFT)

> **DRAFT — NOT FOR PUBLICATION.** Internal copy source for P1 SkillForge (Growth).
> **"Kotomark" is a working name (仮称).** The trademark registry check (J-PlatPat / USPTO etc.) is still pending; see `docs/name-check.md`. The name may change before launch.
> **This file is the copy source for `lp/index.html`.** Change copy here first, then mirror it in the HTML (both languages). The page is not published, posted, or linked anywhere.
> All script lines, character names and terms are invented sample data (`samples/ja-en`). Every example below is real output of:
> `npx tsx src/cli/index.ts check samples/ja-en/script.csv samples/ja-en/ch2.json --glossary samples/ja-en/glossary.json`

Audience: game localization vendors (LSP / LQA teams) and indie developers / publishers shipping JA↔EN.
Tone: factual, no testimonials, no customer logos, no invented metrics, no prices.

---

## 0. Header

- Brand: **Kotomark**（仮称）/ Kotomark (working name)
- Nav: 検出できること / What it catches · 使い方 / How it works · データの扱い / Data · 試用協力 / Pilot
- Language toggle: **日本語 / English** (default from `navigator.language`: `ja*` → 日本語, else English; choice saved in localStorage, ignored if storage is unavailable)

## 1. Hero

- Eyebrow: `JA ⇄ EN · game localization QA · prototype`
- **JA:** 訳の「揺れ」を、プレイヤーより先に。
- **EN:** Catch the drift before your players do.
- **JA lede:** Kotomark は日英ゲームローカライズ向けの**台本全体の一貫性チェック**です。用語、カタカナ表記、キャラ名、敬称、口調が台本のどこで揺れているかを、ファイル名と行番号付きで指摘します。
- **EN lede:** Kotomark checks a **whole Japanese↔English game script** for consistency. It finds where terms, katakana spellings, character names, honorifics and character voices drift, and points to each case by file and line.
- Primary CTA: **デモを試す / Try the demo** → `https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr` (**currently private to the owner — must be shared publicly before going live**)
- Secondary CTA: **試用協力者を募集中 / Looking for pilot partners** → `#pilot`
- Note: デモはブラウザ内だけで動きます。台本ファイルはどこにも送信されません。サンプル台本入り。 / The demo runs entirely in your browser. Your script files are not uploaded anywhere. Sample script included.
- Visual (real output): `script.csv:6` 「俺は魔導石なんて信じねえぞ。」→ "I don't believe in **Magic Stones**." · `script.csv:17` 「魔導石を一個もらえれば、俺が運んでやる。」→ "Give me one **Magic Stone** and I'll carry the lot." · tally **Mana Stone ×6 / Magic Stone ×2** · `error script.csv:6, :17 — forbidden variant "Magic Stone"; glossary says "Mana Stone".`

## 2. 検出できること / What it catches

Intro — JA: 1行ずつではなく、台本全体を見比べて「どこで揺れたか」を探します。下の例はすべて同梱の架空サンプル台本（`samples/ja-en`）を実際に検査した結果です。
EN: Instead of checking one segment at a time, it compares the whole script with itself and finds where things drift. Every example below is real output from the bundled sample script (`samples/ja-en`, invented text).

| Check (JA / EN) | Copy (EN; JA mirrored on page) | Real example | Needs glossary |
|---|---|---|---|
| 用語の訳揺れ / Glossary term drift | Counts every rendering of each glossary term across the script, and points to the outliers and forbidden variants. | 魔導石 → Mana Stone ×6 / Magic Stone ×2 — `script.csv:6, :17` | yes |
| カタカナの表記揺れ / Katakana notation drift | Flags Japanese spelling variants, such as middle dots and long vowels, against the majority form. | ルーンゲート ×2 / ルーン・ゲート ×1 — `script.csv:21` | no |
| キャラ名の揺れ / Character names | Finds forbidden spellings, near-miss spellings and inconsistent speaker labels. | Lizette `:23`, Lisete `:24`, speaker MINA / ミナ `:26` | partly |
| 敬称の揺れ / Honorific drift | Tracks each speaker → addressee pair: is 様 rendered the same way every time, and does it follow your honorific policy (e.g. localize)? | ミナ → リゼット様: Lady Lisette ×3 / Lisette ×1 `:15` / Lisette-sama ×1 `:18` | partly |
| 口調の揺れ / Voice drift | Flags lines that break a character profile: first-person pronoun, politeness, "never uses contractions" and so on. | Tobias (俺) says 僕 `:20`; Lisette: "We're gonna be fine." `:25` | profiles help |

**基本のチェックも同時に / The basics, in the same pass:** placeholders `{0}` `%s` `[PLAYER]`; missing or unbalanced tags `<color>`; ruby markup `{漢字|かんじ}` `｜漢字《かんじ》` `<ruby>`; length limits (optionally counting full-width as 2).

**Review packets** — JA: ルールで決めきれない行は「レビュー用パケット」に。「この行はまだ彼女らしいか」「用語集にない頻出語」など、判断が要る箇所は必要な行だけをまとめて返し、あなたのAIアシスタントと担当者が判断します。最終判断は人が行います。
EN: Lines the rules can't judge become review packets. "Does this still sound like her?" or a recurring term that isn't in the glossary: Kotomark bundles just the lines needed, and your own AI assistant and your reviewers make the call. A person makes the final decision.

**Limits note (keep on page)** — JA: 日本語の解析は正規表現ベースのヒューリスティックです（形態素解析は使っていません）。見逃しや誤検出があり得るため、口調の指摘は「警告」「情報」にとどめています。
EN: Japanese analysis is heuristic and regex-based (no morphological analyzer). It will miss or misread some lines, which is why voice findings stay at warning or info level.

## 3. 使い方は3通り / Three ways to run it

All three use the same engine; every finding comes back with `file:line`.

- **A. ブラウザのデモ / Browser demo** — Nothing to install. Drop in your files and the check runs inside your browser.
- **B. コマンドライン / Command line** — Runs on your own machine with no network calls. Exit codes (0 clean / 1 errors / 2 bad input) make it CI-friendly. `kotomark check script.csv ch2.json --glossary glossary.json`
- **C. MCP ＋ Claude Code プラグイン / MCP + Claude Code plugin** — Run `/lqa-check` from the assistant you already use. The server does the rule-based checks; your assistant works through the lines that need judgment.
- Diagram: **Your AI assistant** (reads files, judges review packets, writes the final report; reasoning runs on your own subscription) ⇄ MCP ⇄ **Kotomark engine** (deterministic, rule-based; stateless; scripts not stored; never receives your AI credentials).

## 4. 台本は保存しません / Your script is not stored

Designed on the assumption that your script is under NDA.

- **The demo stays in your browser.** The demo's engine runs inside the page. Files you load are not sent to any server.
- **Memory only on the server.** Scripts sent over MCP are checked in memory and discarded once the result is returned. Nothing is written to disk or a database.
- **No content in logs.** Logs hold only method, path, status, user ID and timing. No text, file names or terms (covered by automated tests).
- **Glossaries saved only if you choose.** Each saved glossary is encrypted with AES-256-GCM. Delete any time.
- Fine print: Server-side AI judging (for batch use) is off by default.

Source of truth: `docs/data-policy.md`. If code, policy and LP disagree, the LP is wrong.

## 5. 誰のためのツールか / Who it's for

**ローカライズ会社・LQAチーム / Localization vendors & LQA teams** — you check scripts that several translators worked on over months, before delivery.
- Spend review time on judgment, not searching: work from a list of line references.
- Fits into CI: the CLI returns exit codes.
- Use what you already have: CSV / TSV / JSON / XLIFF string tables and CSV glossaries.

**インディー開発者・パブリッシャー / Indie developers & publishers** — you ship a JA↔EN version but can't read every line on the other side.
- Check what you can't read: "line 17 calls it something else" is a concrete question for your translator.
- Try it without installing anything (browser demo).
- No glossary yet? Notation, speaker labels and tags are checked without one, and it can draft a glossary from your script for you to review.

## 6. 試用協力者を募集中 / Looking for pilot partners

JA: 実際の日英台本で試し、指摘が当たりか外れかを教えてくださる方を探しています。結果は誤検出と見逃しを減らすために使います。
EN: We're looking for teams who will run it on a real JA↔EN script and tell us which findings were right and which were wrong. We use the results to cut false positives and misses.

1. Expect about 60–90 minutes. (source: `docs/pilot-guide.md`)
2. You can use the local version, which makes no network calls. Please stay within your NDA.
3. All you send back is a sheet marking each finding right or wrong. You can delete the source and target columns first.

Contact: **`pilot@example.com` — PLACEHOLDER.** Shown as plain text only; no form, no mailto, nothing is submitted. The owner must supply a real address or form (and a privacy policy) before launch.
Ask for: file format, language direction, rough line count.

## 7. FAQ

- **Formats?** Scripts: CSV / TSV (header row required), JSON, XLIFF 1.2 / 2.0. Glossaries: JSON or CSV. Several files can be checked together.
- **Do I need a glossary?** Katakana notation, speaker labels, placeholders, tags, ruby and length work without one. Term, honorific and voice checks need a glossary with character profiles. A heuristic glossary draft can be generated from the script — always review it.
- **Both directions?** Direction is detected per table; Japanese-side checks run on whichever side is Japanese. Honorific and voice checks are built mainly around Japanese source rendered in English.
- **Does it replace LQA testers?** No. It speeds up finding drift; deciding whether a line is right is a person's job.
- **Which AI assistant?** Currently tested with a Claude Code plugin. The browser demo and the CLI need no AI assistant. Independent product, not affiliated with any AI provider.
- **False positives?** Yes, e.g. a real English word one letter away from a character name (can be added to an ignore list). Measuring this is what the pilot is for.
- **Price?** 未定 / TBD. (Do not show prices until the owner approves them.)

## 8. Footer

- 「Kotomark」は仮称です。商標の確認が済んでいないため、名称は変わる可能性があります。 / "Kotomark" is a working name (仮称). The trademark check is not finished, so the name may change.
- All script lines, character names and terms on this page are invented for illustration. Kotomark is an independent product, not affiliated with or endorsed by Anthropic or any other AI provider. Claude Code is named only as a compatible client.

---

## Notes for HQ (not part of the page)

### 未確認の主張 / Claims to verify before publishing

1. **「台本は保存しません」/ stateless, no content in logs.** True for `src/server` today (data-policy.md, tests). Must also hold for the real hosting: platform/CDN request logs, error trackers, crash reports. Otherwise reword to "not retained beyond X".
2. **「デモはブラウザ内だけ」.** True for `web/demo.template.html` (no fetch/XHR; engine bundled). Re-check the built file before linking, and note the page itself is served by claude.ai (Google Fonts are also loaded).
3. **Formats and directions** (CSV/TSV/JSON/XLIFF 1.2/2.0; JA→EN and EN→JA). Parsed and tested in the prototype; EN→JA honorific/voice coverage is weaker — keep the FAQ wording.
4. **Glossary draft** ("can draft a glossary from your script"). Heuristic CLI/MCP feature; confirm it is in the pilot build and that the demo exposes it if we imply it.
5. **"Currently tested with Claude Code."** Only claim clients we have actually tested. Keep the non-affiliation line; never use "Claude" in the product name or logo.
6. **AES-256-GCM glossary encryption / delete any time.** True in `FileGlossaryStore`; KMS, key rotation and backup deletion are still open (data-policy.md §6).
7. **Pilot effort "60–90 minutes"** comes from `docs/pilot-guide.md`; keep them in sync.
8. **Sample example counts.** `Mana Stone ×6 / Magic Stone ×2` verified 2026-10-09 against the CLI. The README table still said ×5 at that time — fix the README (or re-verify) whenever samples change.
9. **Invented names** (Lisette, Mina, Tobias, 魔導石, ルーンゲート): confirm no collision with a real game before publishing.
10. **ToS:** the "reasoning runs on your own subscription" model must comply with the AI provider's terms; server-side judging must use our own API key only.
11. Removed from the earlier draft until re-approved: prices ($49 / $29 / $99), the AMTA 2026 F1 ≈ 0.77 citation, competitor comparisons, enterprise promises (dedicated instance, no-retention mode), "works with any MCP client", Claude Desktop.

### 公開前チェックリスト / Pre-launch checklist

- [ ] **Demo shared publicly** — `https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr` is private to the owner; set it to public-link before the LP goes live (and check it still says Kotomark).
- [ ] **Real contact address** — replace `pilot@example.com` (HTML + this file) with a real address or form.
- [ ] **Privacy policy for the waitlist / pilot contact** — required before collecting any email (APPI; GDPR if EU visitors). No form until it exists.
- [ ] **Trademark check** — registry search for "Kotomark" (JP + US at minimum), then drop or keep 仮称.
- [ ] **Owner approval** — of the final copy, the domain/hosting, and publishing itself (no posting, accounts or outreach without it).
- [ ] Claims list above reviewed and each item either confirmed or reworded.
- [ ] Remove `<meta name="robots" content="noindex">` only when approved to go public.

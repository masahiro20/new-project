# Kotomark（仮称）: LP の文面（下書き）

> **下書きです。公開しないでください。** P1 SkillForge（Growth）の社内用の文面の元です。
> **「Kotomark」は仮称です。** 商標の登録確認（J-PlatPat / USPTO など）はまだ済んでいません。`docs/name-check.md` を参照してください。公開前に名前が変わる可能性があります。
> **このファイルは `lp/index.html` の文面の元です。** 文面はまずここで直し、そのあと HTML に反映します（両方の言語）。ページは公開・投稿・リンクのどれもしていません。
> 台本の行、キャラ名、用語はすべて架空のサンプルデータ（`samples/ja-en`）です。下の例はすべて、次のコマンドの実際の出力です：
> `npx tsx src/cli/index.ts check samples/ja-en/script.csv samples/ja-en/ch2.json --glossary samples/ja-en/glossary.json`

対象読者：ゲームローカライズ会社（LSP / LQA チーム）と、日英版を出すインディー開発者・パブリッシャー。
トーン：事実だけを書く。利用者の声、顧客ロゴ、作った数字、価格は載せない。ページに載せる数字は `docs/real-world-eval.md` のものだけ。

---

## 0. Header

- Brand: **Kotomark**（仮称）/ Kotomark (working name)
- Nav: 検出できること / What it catches · 実績 / Results · 使い方 / How it works · データの扱い / Data · 試用協力 / Pilot
- Language toggle: **日本語 / English** （既定は `navigator.language` で決める：`ja*` → 日本語、それ以外は English。選んだ言語は localStorage に保存し、使えない場合は保存しない）

## 1. Hero

- Eyebrow: `JA ⇄ EN · game localization QA · prototype`
- **JA:** 訳の「揺れ」を、プレイヤーより先に。
- **EN:** Catch the drift before your players do.
- **JA lede:** Kotomark は日英ゲームローカライズ向けの**台本全体の一貫性チェック**です。用語、カタカナ表記、キャラ名、敬称、口調が台本のどこで揺れているかを、ファイル名と行番号付きで指摘します。
- **EN lede:** Kotomark checks a **whole Japanese↔English game script** for consistency. It finds where terms, katakana spellings, character names, honorifics and character voices drift, and points to each case by file and line.
- Primary CTA: **デモを試す / Try the demo** → `https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr` （**今はオーナーだけが見られる非公開の状態。公開前に必ず公開リンクに切り替えること**）
- Secondary CTA: **試用協力者を募集中 / Looking for pilot partners** → `#pilot`
- Note: デモはブラウザ内だけで動きます。台本ファイルはどこにも送信されません。サンプル台本入り。 / The demo runs entirely in your browser. Your script files are not uploaded anywhere. Sample script included.
- ビジュアル（実際の出力）: `script.csv:6` 「俺は魔導石なんて信じねえぞ。」→ "I don't believe in **Magic Stones**." · `script.csv:17` 「魔導石を一個もらえれば、俺が運んでやる。」→ "Give me one **Magic Stone** and I'll carry the lot." · tally **Mana Stone ×6 / Magic Stone ×2** · `error script.csv:6, :17 — forbidden variant "Magic Stone"; glossary says "Mana Stone".`

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

**限界の注記（ページに必ず残す）** — JA: 日本語の解析は正規表現ベースのヒューリスティックです（形態素解析は使っていません）。見逃しや誤検出があり得るため、口調の指摘は「警告」「情報」にとどめています。
EN: Japanese analysis is heuristic and regex-based (no morphological analyzer). It will miss or misread some lines, which is why voice findings stay at warning or info level.

## 2b. 実績：実際の翻訳ファイルで検証 / Tested on real translations

出典：`docs/real-world-eval.md`（2026-10-09）。「検出できること」のすぐ後ろに置く（ページ上はセクション 02。以降のセクションは 03〜07 に番号を振り直した）。ナビ：実績 / Results。

Intro — JA: オープンソースのゲーム・アプリが公開している英→日の翻訳ファイル6本（合計 約12,600エントリ）に Kotomark をかけ、指摘を1件ずつ確認しました。
EN: We ran Kotomark on 6 public English→Japanese translation files from open-source games and apps (about 12,600 entries in total) and checked the findings one by one.

**見出しの数字：190 / 190**
- JA: CI で止める警告・エラーは、抜き取り確認した**190件すべてが実際の問題**でした（改善後）。改善前は同じ基準で約70%でした。
- EN: Of the warnings and errors that fail a CI check, **all 190 sampled findings were real issues** (after improvements). Before the improvements, the same measure was about 70%.
- Meta — JA: 2026年10月、自社調べ。抜き取った指摘にラベルを付けて判定。 / EN: October 2026, in-house evaluation of a labeled sample of findings.

**裏付けの事実**
- **97 / 97** — JA: **カタカナ表記揺れ**は、確認した97件すべてが本物でした。例：ユーザ／ユーザー、プレイヤー／プレーヤー。 / EN: **Katakana notation drift:** all 97 checked findings were real, e.g. ユーザ / ユーザー and プレイヤー / プレーヤー.
- **156 / 156** — JA: **未翻訳・要確認（fuzzy）の行**を、行番号付きで1件ずつ報告します。確認した156件すべてが本物でした。 / EN: **Untranslated and fuzzy lines** are reported one by one, with line numbers. All 156 checked were real.
- **6** — JA: **公開翻訳ファイル**（約12,600エントリ）。改善前の誤検知の多くはプレースホルダーやタグの誤判定で、エンジン側で直してテストを追加しました。 / EN: **Public translation files** (~12,600 entries). Most earlier false positives came from misreading placeholders and tags; we fixed them in the engine and added tests.

**プロジェクト**（公開リポジトリへの文字リンク。名前だけで、ロゴは使わない）: [SuperTuxKart](https://github.com/supertuxkart/stk-code) · [Pixelorama](https://github.com/Orama-Interactive/Pixelorama) · [Luanti](https://github.com/luanti-org/luanti) · [Godot Engine](https://github.com/godotengine/godot)（エディタ / editor） · [Battle for Wesnoth](https://github.com/wesnoth/wesnoth)（キャンペーン・UI / campaign, UI）
- JA: これらのプロジェクトが Kotomark を推奨しているわけではありません。公開されている翻訳ファイルに検査をかけただけです。ライセンス：GPL / LGPL / MIT。
- EN: These projects did not endorse Kotomark; we only ran it on their public translation files. Licenses: GPL/LGPL/MIT.

**限界（ページに必ず残す）**
- JA: 限界：ラベル付けは評価者1名によるものです。対象は英→日の UI・ゲーム文字列で、日→英の台本での検証は協力者の方と行う予定です（未実施）。用語集を使う指摘の精度は、用語集の質に左右されます。[評価の詳細](https://github.com/masahiro20/new-project/blob/peter/p1-skillforge/skillforge/docs/real-world-eval.md)
- EN: Limits: one evaluator labeled the findings. The files are English→Japanese UI and game strings; evaluation on Japanese→English scripts with pilot partners is still pending. Glossary-based term checks are only as good as the glossary. [Full evaluation](https://github.com/masahiro20/new-project/blob/peter/p1-skillforge/skillforge/docs/real-world-eval.md)
- **公開前の TODO：** リポジトリが非公開なので、「Full evaluation」のリンクは訪問者には 404 になる。公開リンクに差し替えること（HTML 側にもコメントで印を付けてある）。

フッターを調整済み：「すべて説明用の架空のもの」という文から、このセクションのオープンソースのプロジェクト名を除外した。

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

正とする文書：`docs/data-policy.md`。コード・ポリシー・LP が食い違ったら、間違っているのは LP。

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

1. Expect about 60–90 minutes. （出典：`docs/pilot-guide.md`）
2. You can use the local version, which makes no network calls. Please stay within your NDA.
3. All you send back is a sheet marking each finding right or wrong. You can delete the source and target columns first.

Contact: **`pilot@example.com` — 仮の値（PLACEHOLDER）。** 文字として表示するだけ。フォームも mailto も無く、何も送信されない。公開前に、オーナーが本物のアドレスかフォーム（とプライバシーポリシー）を用意すること。
Ask for: file format, language direction, rough line count.

## 7. FAQ

- **Formats?** Scripts: CSV / TSV (header row required), JSON, XLIFF 1.2 / 2.0. Glossaries: JSON or CSV. Several files can be checked together.
- **Do I need a glossary?** Katakana notation, speaker labels, placeholders, tags, ruby and length work without one. Term, honorific and voice checks need a glossary with character profiles. A heuristic glossary draft can be generated from the script — always review it.
- **Both directions?** Direction is detected per table; Japanese-side checks run on whichever side is Japanese. Honorific and voice checks are built mainly around Japanese source rendered in English.
- **Does it replace LQA testers?** No. It speeds up finding drift; deciding whether a line is right is a person's job.
- **Which AI assistant?** Currently tested with a Claude Code plugin. The browser demo and the CLI need no AI assistant. Independent product, not affiliated with any AI provider.
- **False positives?** Yes, e.g. a real English word one letter away from a character name (can be added to an ignore list). Measuring this is what the pilot is for.
- **Price?** 未定 / TBD. （オーナーが承認するまで価格は表示しない）

## 8. Footer

- 「Kotomark」は仮称です。商標の確認が済んでいないため、名称は変わる可能性があります。 / "Kotomark" is a working name (仮称). The trademark check is not finished, so the name may change.
- Apart from the open-source project names in the results section, all script lines, character names and terms on this page are invented for illustration. (JA: このページの台本・キャラ名・用語は、「実績」欄の公開プロジェクト名を除き、すべて説明用の架空のものです。) Kotomark is an independent product, not affiliated with or endorsed by Anthropic or any other AI provider. Claude Code is named only as a compatible client.

---

## 本部向けメモ（ページには載せない）

### 公開前に確認が必要な主張

1. **「台本は保存しません」/ 状態を持たない・ログに本文を残さない。** 今の `src/server` では正しい（data-policy.md、テストあり）。本番のホスティングでも成り立つ必要がある：基盤や CDN のリクエストログ、エラー追跡、クラッシュレポート。成り立たないなら「X を超えて保持しない」という言い方に変える。
2. **「デモはブラウザ内だけ」。** `web/demo.template.html` では正しい（fetch/XHR なし、エンジンを同梱）。リンクする前にビルド後のファイルを再確認する。また、ページ自体は claude.ai から配信されている（Google Fonts も読み込んでいる）ことに注意。
3. **形式と向き**（CSV/TSV/JSON/XLIFF 1.2/2.0、日→英と英→日）。試作品で読み込み・テスト済み。英→日の敬称・口調の対応は弱いので、FAQ の書き方はそのままにする。
4. **用語集の下書き**（「台本から用語集の下書きを作れる」）。CLI/MCP のヒューリスティックな機能。試用版に入っていること、そしてそれをほのめかすならデモでも使えることを確認する。
5. **「今は Claude Code で試験済み」。** 実際に試したクライアントだけを書く。提携していないという一文は残す。製品名やロゴに「Claude」を使わない。
6. **AES-256-GCM による用語集の暗号化 / いつでも削除可能。** `FileGlossaryStore` では正しい。KMS、鍵の入れ替え、バックアップからの削除はまだ未解決（data-policy.md §6）。
7. **試用の所要時間「60〜90分」** は `docs/pilot-guide.md` から取っている。両方を一致させておく。
8. **サンプルの例の件数。** `Mana Stone ×6 / Magic Stone ×2` は 2026-10-09 に CLI で確認済み。その時点で README の表はまだ ×5 だった。サンプルを変えたら README を直す（または再確認する）。
9. **架空の名前**（Lisette、Mina、Tobias、魔導石、ルーンゲート）：公開前に、実在のゲームと重なっていないか確認する。
10. **利用規約：** 「推論はあなた自身のサブスクリプションで動く」という仕組みが、AI 提供元の規約に合っている必要がある。サーバー側の判断には、必ず当社の API キーだけを使う。
11. 再承認されるまで、以前の下書きから外したもの：価格（$49 / $29 / $99）、AMTA 2026 の F1 ≈ 0.77 の引用、競合との比較、法人向けの約束（専用インスタンス、データを保持しないモード）、「どの MCP クライアントでも動く」、Claude Desktop。
12. **「190 / 190」の精度の数字**（`docs/real-world-eval.md`）。評価者は1名。抜き取りによる（設定ごと・ファイルごとに最大50件の指摘にラベルを付けたもので、全件ではない）。対象は英→日の .po の UI・ゲーム文字列だけ。注意：評価者は人間の LQA 担当者ではなく、AI のサブエージェントだった。ページでは意図的に「評価者1名」「自社調べ」とだけ書き、「人が確認した」とは書いていない。公開前に、人間の LQA 担当者にラベルを再確認してもらうか、AI がラベルを付けたことを明記するかを決める。2回目の QA そのものは TP 190 / FP 2（0.99）だった。その2件の FP（日本語で斜体が落ちたもの）は info に下げたので、CI の判定には数えなくなった。「100%」と書くときは、必ず「抜き取り」と「警告＋エラー」を添える。ルールや重大度を変えたら再確認する。「改善前は約70%」は設定 A（用語集なし）の数字で、設定 B は 0.34 だった。
13. **プロジェクト名の使い方**（SuperTuxKart、Pixelorama、Luanti、Godot Engine、Battle for Wesnoth）。名前を指し示すためだけに使う：文字の名前とリポジトリへのリンクだけ、ロゴやスクリーンショットは使わない、推奨していない旨の一文を隣に置く、提携や顧客だと受け取れる言い方をしない。公開前に各プロジェクトの商標ポリシーを確認する（Godot などは公開している）。翻訳の本文はページに載せていない。例（ユーザ／ユーザー、プレイヤー／プレーヤー）は一般的な語。

### 公開前チェックリスト

- [ ] **デモを公開する** — `https://claude.ai/artifact/SYxoeqmhYquutDJGCoa7kr` は今オーナーだけが見られる。LP を公開する前に公開リンクに切り替える（名前がまだ Kotomark になっているかも確認）。
- [ ] **本物の連絡先** — `pilot@example.com`（HTML とこのファイル）を本物のアドレスかフォームに差し替える。
- [ ] **順番待ち・試用の連絡用のプライバシーポリシー** — メールアドレスを集める前に必要（個人情報保護法。EU からの訪問者がいれば GDPR も）。できるまではフォームを置かない。
- [ ] **商標の確認** — 「Kotomark」の登録状況を調べる（最低でも日本と米国）。そのうえで「仮称」を外すか残すかを決める。
- [ ] **オーナーの承認** — 最終の文面、ドメインとホスティング、そして公開すること自体（承認なしに投稿、アカウント作成、営業連絡をしない）。
- [ ] **評価の公開リンク** — 非公開の GitHub の「評価の詳細 / Full evaluation」の URL を差し替える。
- [ ] 上の主張の一覧を見直し、各項目を確認済みにするか、言い方を変える。
- [x] `<meta name="robots" content="noindex">` を外した（2026-10-09、公開承認 b13 を受けて）。

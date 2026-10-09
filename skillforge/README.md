# Kotomark（仮称）— 日英ゲーム台本の一貫性QA

> P1 SkillForge、ステージ2の試作品です。**社内用・未公開です。**「Kotomark」は仮の名前で、商標の確認はまだ済んでいません。
> このディレクトリは独立したプロジェクトです。リポジトリ直下の Next.js アプリとは関係ありません。

**台本全体をまとめて**検査し、行と行のあいだで揺れている箇所を `file:line` 付きで報告します。

| 検査 | 例 | 用語集が必要か |
|---|---|---|
| **用語の訳揺れ** | 魔導石 → "Mana Stone" ×6、"Magic Stone" ×2（`script.csv:6`、`:17`） | 必要 |
| **カタカナの表記揺れ** | ルーンゲート ×2 / ルーン・ゲート ×1、サーバー / サーバ | 不要 |
| **キャラ名の揺れ** | "Lizette"（禁止表記）、"Lisete"（つづりの近い誤り）、話者ラベル `MINA` と `ミナ` | 一部必要 |
| **敬称の揺れ** | ミナの「リゼット様」→ "Lady Lisette" ×2、"Lisette" ×1、"Lisette-sama" ×1（方針：英語らしく訳す） | 一部必要 |
| **口調の揺れ** | トビアス（一人称「俺」）が「僕」と言う。リゼット（丁寧、短縮形を使わない）が "We're gonna be fine" と言う | プロフィールがあると精度が上がる |
| おまけのルール | プレースホルダー `{0}` `%s` `$var` `[PLAYER]`、タグ、ルビ（`{漢字|かんじ}`、`｜漢字《かんじ》`、`<ruby>`）、文字数制限、未翻訳の行（空欄、PO の fuzzy、日本語訳の欄に英語がそのまま入っている） | 不要 |

ルールでは決めきれない行（「この行はまだ彼女らしいか」、用語集に無いのに何度も出てくる語）は、**レビュー用パケット**として返します。判断するのはユーザー自身のアシスタント（Claude Code など）です。当社のサーバーがモデルを呼ぶ必要はありません。

## 構成

```
user's Claude Code ──(plugin: skill + /lqa-check + .mcp.json)──► remote MCP server (this repo, src/server)
   │ reads files, judges review packets,                           │ deterministic engine (src/core)
   │ writes the final report                                       │ stateless: nothing stored, content never logged
   └── reasoning runs on the user's own subscription               └── optional server-side judge: OFF by default,
                                                                       uses OUR API key only (KOTOMARK_ANTHROPIC_API_KEY)
```

- **推論はユーザー側で行います。** サーバーはユーザーのモデル用の認証情報を受け取らず、中継もしません。将来サーバー側で判断する場合（一括処理や CI 向け）は、`KOTOMARK_ANTHROPIC_API_KEY` に入れた当社のキーを使い、その費用はプラン料金に含めます。ツール `judge_review_packets_server_side` は、このキーが設定されているときだけ現れます。
- **価値はサーバー側に置きます**（ルールエンジン、日本語向けの判定ロジック、将来はホスティングする共有用語集）。コピーできるスキルファイルには置きません。
- 製品名に「Claude」は使いません。Claude Code は、対応しているクライアントとして名前を出すだけです。

## ディレクトリ

```
src/core/         engine — parsers (CSV/TSV, XLSX, JSON incl. i18n locale files, XLIFF 1.2/2.0, gettext PO), loadInputs + pairing, glossary, checks, Markdown report
src/server/       remote MCP server (Streamable HTTP, stateless) + optional server-side judge
src/cli/          local CLI (same engine; handy for tests and demos)
plugin/           thin Claude Code plugin: skill, /lqa-check command, .mcp.json
samples/          invented sample scripts and glossaries (no real game text)
test/             node:test suites (parsers, checks, MCP over HTTP)
docs/lp.md        landing-page copy draft (NOT published)
docs/data-policy.md  data handling policy draft
docs/pilot-guide.md  pilot instructions for testers + false-positive measurement procedure
docs/ci.md        running `kotomark check` in GitHub Actions / GitLab CI (formats, exit codes)
scripts/build-cli.mjs  bundles the CLI into dist/kotomark.mjs (the package bin)
action/           GitHub Action (composite; runs the committed bundle action/dist/kotomark.mjs; `npm run build:action`)
.github-example/  sample workflow using the action (copy into your repo's .github/workflows/)
```

各ディレクトリの中身：

- `src/core/`：エンジン本体。各形式の読み込み（CSV/TSV、XLSX、i18n ロケールファイルを含む JSON、XLIFF 1.2/2.0、gettext PO）、`loadInputs` とファイルの組み合わせ、用語集、検査、Markdown レポート。
- `src/server/`：リモート MCP サーバー（Streamable HTTP、状態を持たない）と、任意のサーバー側判断機能。
- `src/cli/`：ローカルで動く CLI（エンジンは同じ。テストやデモに便利）。
- `plugin/`：薄い Claude Code プラグイン（スキル、`/lqa-check` コマンド、`.mcp.json`）。
- `samples/`：架空のサンプル台本と用語集（実在のゲームの文章は入っていません）。
- `test/`：node:test のテスト（読み込み、検査、HTTP 経由の MCP）。
- `docs/lp.md`：LP の文面の下書き（未公開）。`docs/data-policy.md`：データ取り扱いポリシーの下書き。`docs/pilot-guide.md`：試用協力者向けの説明と、誤検出の測り方。`docs/ci.md`：GitHub Actions / GitLab CI で `kotomark check` を動かす方法（出力形式、終了コード）。
- `scripts/build-cli.mjs`：CLI を `dist/kotomark.mjs`（パッケージの bin）に1ファイルにまとめます。
- `action/`：GitHub Action（composite 形式。コミット済みのバンドル `action/dist/kotomark.mjs` を実行します。再生成は `npm run build:action`）。
- `.github-example/`：この Action を使うワークフローの例（自分のリポジトリの `.github/workflows/` にコピーして使います）。

## 動かし方

```bash
cd skillforge
npm install
npm test                       # node:test: parsers, checks, regressions, draft, store/auth, CLI, MCP end-to-end
npm run check:sample           # CLI report for samples/ja-en
npx tsx src/cli/index.ts check samples/en-ja/ui.xlf --glossary samples/en-ja/glossary.json

npm run serve                  # MCP on http://localhost:8787/mcp (no auth in dev)
KOTOMARK_API_TOKENS=secret1 NODE_ENV=production npm run build && npm start
```

- `npm test`：全テスト（読み込み、検査、回帰、用語集の下書き、保存と認証、CLI、MCP の通し）。
- `npm run check:sample`：`samples/ja-en` を CLI で検査してレポートを出します。
- `npm run serve`：MCP サーバーを `http://localhost:8787/mcp` で起動します（開発時は認証なし）。

Claude Code から使う（ローカルでの試験）：

```bash
npm run serve &
claude --plugin-dir ./plugin   # then: /lqa-check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json
```

起動したら、Claude Code の中で `/lqa-check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json` と打ちます。

## CLI

コマンドは1つで、そのまま CI で使えます。1ファイルの実行ファイル（`dist/kotomark.mjs`、Node 20 以上、依存パッケージは同梱）をビルドするか、ソースから直接動かします。

```bash
npm run build:cli && node dist/kotomark.mjs check samples/ja-en/script.csv --glossary samples/ja-en/glossary.json
npm run kotomark -- check samples/          # from source via tsx
npm pack                                    # kotomark-0.1.0.tgz → npm i ./kotomark-0.1.0.tgz → npx kotomark …
```

```bash
kotomark check <file|dir>... [options]
  -g, --glossary <file>          JSON, CSV/TSV (incl. Crowdin/Phrase exports) or TBX glossary. Default:
                                 ./kotomark.glossary.json, ./glossary.json or ./kotomark.glossary.csv if present
                                 (noted on stderr); --no-glossary disables it. Import notes go to stderr
  --source-lang ja|en            force the direction a TBX / ja,en CSV glossary is read in (default: the script's)
  --format md|json|junit|github  report format (default md); --json = --format json
  --input-format <fmt>           force the input parser (csv|tsv|json|xliff|xlsx|po|i18n-json|unity-csv|unreal-csv|yaml|renpy); default: detected
  --columns source=原文,target=訳文  column override for tables;  --sheet <name|1-based number> for .xlsx
  --fail-on error|warning|never  exit 1 at/above this severity (default error)
  --min-severity info|warning|error  hide lower findings in the report (gating still sees them); --no-info = warning
  --junit-fail-on <sev|never>    which severities become JUnit <failure> (default: follows --fail-on)
  --locale en|ja  --no-rules  --wide  -o, --out <file>
```

主なオプション：

- `-g, --glossary <file>`：用語集（JSON、CSV/TSV（Crowdin・Phrase の書き出しを含む）、TBX）。指定しないと、`./kotomark.glossary.json`、`./glossary.json`、`./kotomark.glossary.csv` のうち最初にあるものを使います（stderr に通知）。`--no-glossary` で無効にします。読み込み時の注意は stderr に出ます。
- `--source-lang ja|en`：TBX や `ja,en` 形式の CSV 用語集を、どちらの向きで読むかを固定します（既定は台本の向き）。
- `--format md|json|junit|github`：レポートの形式（既定は `md`）。`--json` は `--format json` と同じです。
- `--input-format <fmt>`：入力の読み込み方を固定します。既定は自動判別です。
- `--columns source=原文,target=訳文`：表の列の指定を上書きします。`--sheet <name|1-based number>` は `.xlsx` のシート指定です。
- `--fail-on error|warning|never`：この重大度以上の指摘があれば終了コード 1 にします（既定は `error`）。
- `--min-severity info|warning|error`：これより低い指摘をレポートから隠します（合否判定には全件を使います）。`--no-info` は `warning` と同じです。
- `--junit-fail-on <sev|never>`：どの重大度を JUnit の `<failure>` にするか（既定は `--fail-on` に合わせます）。

補足：

- 引数にはファイルもディレクトリも渡せます。ディレクトリは中まで探します（対象：`.csv .tsv .json .xlf .xliff .xlsx .po .pot .yml .yaml .rpy`）。
  `node_modules`、`.git`、`.github`、名前に `*glossary*` を含むファイル、`package.json`/`tsconfig.json`、設定用の YAML（`docker-compose.yml`、`pnpm-lock.yaml`、`crowdin.yml` など）は飛ばします。レポートのファイル名は
  作業ディレクトリからの相対パスなので、CI の注釈が実際のファイルを指します。
- **終了コード：** `0` 合格 · `1` `--fail-on` 以上の指摘あり · `2` 入力または使い方の誤り。
- **出力形式：** `json` = 全結果に `summary {errors, warnings, infos, byCategory}` を加えたもの。`junit` = カテゴリごとに
  `<testsuite>` を1つ、指摘ごとに `<testcase>` を1つ（`file:line rule`）。`github` = `::error file=…,line=…::` 形式の
  注釈。GitHub Actions と GitLab での設定方法：[`docs/ci.md`](docs/ci.md)。
- **GitHub Action：** `uses: masahiro20/new-project/skillforge/action@<ref>` に `paths`/`glossary`/`fail-on` を渡します。
  注釈、ジョブサマリー、JUnit/JSON ファイル、件数の出力が得られ、npm install は不要です。詳しくは [`action/README.md`](action/README.md)。
- **変更点：** 以前は `--format` で*入力*形式を選んでいました。今はレポートの形式を選びます。`--format csv|tsv|xliff|xlsx|po`
  は今も入力形式として動きます（注意が出ます）。ただし `--format json` は JSON 出力の意味になりました。入力に使うときは `--input-format json` を使ってください。

その他のコマンド：

```bash
kotomark draft <files|dirs...> [--glossary existing.json] --out draft.json   # glossary draft from the script
kotomark glossary convert <in.csv|in.tsv|in.tbx> [--source-lang ja|en] --out glossary.json   # termbase → Kotomark JSON
kotomark labels <files|dirs...> --glossary g.json --out labels.csv            # labeling sheet for the pilot
kotomark score labels.csv [--known known.csv]                                 # precision / recall
kotomark token create <user> --plan solo|studio                               # per-user API token (shown once)
kotomark token list | token revoke <user|prefix>
```

- `draft`：台本から用語集の下書きを作ります。
- `glossary convert`：用語ベース（CSV/TSV/TBX）を Kotomark の JSON に変換します。
- `labels`：試用で印を付けるための表を書き出します。
- `score`：適合率（precision）と再現率（recall）を集計します。
- `token create`：利用者ごとの API トークンを発行します（表示は1回だけ）。`token list` で一覧、`token revoke` で失効。

## アカウント・保存・利用制限

- **トークン：** 利用者ごとの Bearer token を `$KOTOMARK_DATA_DIR/tokens.json` に置きます（保存するのは SHA-256 のハッシュだけ。新しいトークンは再起動なしで有効になります）。以前の `KOTOMARK_API_TOKENS` も使えます。トークンが1つも無いとサーバーは認証なしで動きます。本番環境ではその状態では起動しません。
- **保存した用語集：** `GlossaryStore` という共通の窓口と、ローカル用の実装 `FileGlossaryStore`（ファイルごとに AES-256-GCM で暗号化、名前も暗号化、鍵は `KOTOMARK_ENCRYPTION_KEY`）。ツールに手を入れずに保存先を差し替えられます。
- **利用制限（メモリ上で管理、外部サービス不要）：** Solo は 30 リクエスト/分 · 20万行/日 · 用語集10件。Studio は 120 · 100万 · 50。超えると HTTP 429 と `Retry-After` を返します。
- **環境変数の名前変更：** 設定はすべて `KOTOMARK_*` です。変更前の `YURAGI_*` も予備として読みます（両方あれば `KOTOMARK_*` が優先）。`src/server/env.ts` を参照してください。データ置き場の既定は `./.kotomark-data` になりました。
- 台本は保存しません。キャッシュはリクエストのたびに消します。ログには方法・パス・状態・ユーザー・時刻だけを書きます（テスト済み）。`docs/data-policy.md` を参照してください。

## 入力形式

どの行にも、ユーザーが開いて確認できる `file:line` が付きます。行番号は、ファイル上の行（CSV、JSON、PO、YAML、Ren'Py）か、表計算の行（XLSX）です。

- **CSV/TSV**：1行目に列名が必要です。自動で見分ける列：`id|key`、`ja|source|原文`、`en|target|訳文`、`speaker|character|話者`、`max_length|limit|文字数`、`context|notes|comment`。`Japanese(ja)`、`English (en)`、`ja-JP`、`Japanese` のような言語名の列名も使えます。行番号はその行が始まるファイル上の行なので、セルの中の改行も正しく扱えます。
- **Excel `.xlsx`**：文字が入っている最初のシート（または `sheet` で名前か1始まりの番号を指定）。列名の行は CSV と同じです。行番号は表計算の行番号で、ファイル名にはシート名が付きます（例：`book.xlsx#Script`）。共有文字列、書式付き文字列、インライン文字列を読みます。ふりがな（`<rPh>`）は読み飛ばします。数式はキャッシュされた値を使います。日付はシリアル値のままです。SheetJS は使いません。`fflate` で展開し、小さな XML リーダーで読みます（ブラウザでも動きます）。
- **gettext `.po` / `.pot`**：`msgctxt` → ID（無ければ `msgid`）、`msgid` → 原文、`msgstr`（または `msgstr[0]`）→ 訳文。ほかの複数形は別の行になります（`id[1]` = `msgid_plural` ↔ `msgstr[1]`）。`#.` コメント、`#:` 参照、`fuzzy` フラグは文脈（context）に入ります。ヘッダーと廃止済みの `#~` 項目は飛ばします。ヘッダーの `Language:` で訳文の言語を決めます。行番号は `msgctxt`（無ければ `msgid`）の行です。Unreal Engine の `.po` 書き出し（`msgctxt "Namespace,Key"`、`#. Key:` / `#. SourceLocation:`）もそのまま読めます。
- **JSON**：`[{...}]`、`{"strings": [{...}]}`、`{"key": {"ja": "...", "en": "..."}}`。行番号はその項目の開き波かっこの行です。
- **i18n ロケール JSON**（`ja.json` = `{"menu": {"start": "開始"}}`）：文字列の値がすべて1つの言語のオブジェクトです。キーはドットでつなぎます（`menu.start`、配列は `items.0`）。行番号はキーが現れる行です。`{"ja": {...}}` という包み方も理解します。
- **YAML のロケールファイル**（`.yml` / `.yaml`。Rails i18n の `ja:` で始まるファイル、Misskey の `ja-JP.yml`、Crowdin の YAML）：i18n ロケール JSON と同じ扱いです。キーはドットでつなぎ（`menu.start`、リストは `tips.0`）、行番号はキーの行（リストの項目は `- ` の行）です。最上位のキーが言語コード1つだけ（`ja:`、`ja-JP:`、`en-US:` など）なら、それを外して言語の手がかりにします。Misskey の `_lang_: "日本語"` も言語の手がかりにします（行にはしません）。どちらも無ければファイル名、最後に中身で言語を決めます。数値・真偽値・null の値は飛ばします。依存ライブラリなしの小さな YAML パーサーで読みます。対応：ブロックのマッピングとリスト（インデントの入れ子、`- key: v` の形）、引用なし／`'…'`／`"…"`（エスケープ、複数行の折り返し）、`|` と `>` のブロック（`-`/`+`、インデント指定の数字）、コメント、文書の前後の `---` / `...`、フローの `[a, b]` / `{a: b}`、アンカー `&a`・エイリアス `*a`・マージキー `<<: *a`（エイリアスで入った値の行番号はアンカー側の行）、タグ（`!!str` などは無視）。非対応の書き方（`? ` の複合キー、1ファイルに複数の文書、タブでのインデント、複数の言語ルートを持つファイル）は、行番号付きのエラーになります。
- **Ren'Py の翻訳ファイル**（`game/tl/<言語>/*.rpy`）：2言語の表として読みます。
  - 台詞のブロック（`translate english start_a1b2c3d4:`）：コメントにある元の台詞（`# e "…"`）が原文、その下の訳の台詞が訳文です。ID はラベル（`start_a1b2c3d4`。1つのブロックに台詞が2つ以上あれば `#2` 以降を付けます）、話者は台詞の前のキャラクター変数（`e`）、文脈はブロックの前の `# game/script.rpy:123` です。行番号は**訳の台詞の行**です（直すのは訳文なので）。地の文（`# "…"` / `"…"`）、`"名前" "…"` の形、属性付き（`e happy "…"`）、`with …` などの後置きも読みます。`extend` は直前の話者を引き継ぎ、文脈に `extend` と書きます。`voice "…"` は文脈（`voice: …`）に入れ、`nvl clear` などの台詞でない文は飛ばします。原文と訳で台詞の数が違うブロックは、余った訳をブロックの最後の行にまとめます（注意が出ます）。
  - 文字列のブロック（`translate english strings:`）：`old "…"` が原文、`new "…"` が訳文です。ID は `strings:` と `old` の文字列のハッシュ（8桁）、行番号は `new` の行、文脈は直前の `# game/screens.rpy:45` です。
  - 文字列の中の `\"`、`\'`、`\\`、`\n` は元に戻します。`[player]` のような変数の埋め込みと `{b}…{/b}` のようなテキストタグは、書かれたまま残します。`translate english python:` と `style` のブロックは飛ばします。
  - 向きは原文（コメント側の台詞）の中身から判別します。日本語の作品なら日→英です。
  - 話者の表示名：`define e = Character("アイリーン")`（`_("…")` で囲んだものも可）を含むゲーム本体のスクリプト（`translate` のブロックが無い `.rpy`）を一緒に渡すと、変数を表示名に置き換えます。こうしたスクリプトは表としては検査しません（注意に読み込んだ名前が出ます）。渡さなければ変数名のままです。
- **Unity Localization の文字列テーブル CSV**（`Key,Id,Shared Comments,Japanese(ja),English(en)`）：`Key` が ID、`Shared Comments` が文脈です。普通の `ja,en` 列と同じく、左側の言語の列を原文とします。
- **Unreal の文字列テーブル CSV**（`Key,SourceString,Comment`）：1言語のファイルです。`\n` のようなエスケープを元に戻します。コメントに `Speaker: X` があれば話者として使います。
- **XLIFF 1.2**（`<trans-unit>`、`maxwidth`）と **2.0**（`<unit><segment>`）。話者は `<note from="speaker">`、`<note category="speaker">`、または `speaker: X` という注記から取ります。インラインタグ（`<g>`、`<x/>`、`<ph>`、`<pc>`）はタグ検査のために残します。
- **1言語のファイルはキーで組み合わせます。** `loadInputs` は、日本語の表と英語の表（ロケール JSON、ロケール YAML、Unreal の文字列テーブル、`key,ja` のように文字の列が1つだけの CSV/XLSX）を1つの表にまとめ、`ja.json+en.json` という名前を付けます（行番号は元のファイルの行）。候補が複数あるときは、言語の部分を伏せた名前で組み合わせます：`ui_ja.csv` ↔ `ui_en.csv`、`locales/ja/ui.json` ↔ `locales/en/ui.json`、`ja-JP.yml` ↔ `en-US.yml`。片方にしか無いキーは、もう片方を空にした行になります（注意に一覧が出ます）。訳文側のファイルにしか無いキーは、訳文側のファイルの行番号を使い、その旨を文脈に書きます。組み合わせ相手の無いファイルも単独で検査します。`langs.source` が `"en"` でなければ、日本語のファイルを原文とします。
- 文字コードは UTF-8（BOM は除去）か、BOM 付きの UTF-16 として読みます。UTF-8 として不正な場合、実行環境が対応していれば Shift_JIS で読み直します。
- 向き（日→英か英→日か）は表ごとに判別します。日本語向けの検査は、日本語の側に対して行います。
- **用語集**：JSON（用語、キャラクター、別名、禁止表記、口調プロフィール、`honorificPolicy`）。簡単な CSV も使えます：`type,source,target,allowed,forbidden,note`。`samples/ja-en/glossary.json` と `plugin/skills/script-consistency/SKILL.md` を参照してください。
- **用語ベースからの用語集の取り込み**（`parseGlossary` / `parseGlossaryWithNotes`、CLI の `--glossary`、デモ、MCP）。拡張子と中身から形式を判別します。
  - **CSV/TSV の用語ベース書き出し**：普通の2言語リスト（`ja,en` · `Japanese,English` · `日本語,英語` · `ja-JP,en-US` · `source,target`）、Crowdin の用語集 CSV（`Term [ja],Description [ja],Part of Speech [ja],Status [ja],Term [en],…,Concept Definition`）、`note`/`definition` 付きの Phrase/Memsource 風 `ja,en`、言語ごとの `ja_note`/`en_status`、`status` 列や yes/no の `forbidden` 列。ほかの言語の列は無視します（注意が出ます）。
  - **TBX**（ISO 30042）：TBX v2 `<martif>`（TBX-Basic/Core：`termEntry` → `langSet` → `tig`/`ntig` → `term`）と TBX v3 `<tbx>`（`conceptEntry` → `langSec` → `termSec`）。`xml:lang` は `ja`/`ja-JP`/`en`/`en-US` を読み、ほかの言語は無視します。内蔵の小さな XML リーダーで読みます（名前空間、実体参照、CDATA に対応）。BOM 付き UTF-16 のファイル（Excel や Trados の書き出し）も、バイト列として渡せば読めます。
  - **状態（ステータス）**：推奨（`preferredTerm-admn-sts`、`preferred`、`approved`）→ `target`（最初の1つ。同じ原語の2つ目以降の推奨訳は `allowed` にし、注意を出します）。許容 → `allowed`。非推奨・置き換え済み・廃止・推奨しない・禁止 → `forbidden`。禁止訳しか無い原語は飛ばします（注意が出ます）。`descrip type="definition"` / `note` / 説明の列 → `note`。
  - **向き**：TBX と、言語名の付いた CSV 列は、台本の向きで読みます（CLI、デモ、MCP は表の原文の言語を使います。`--source-lang ja|en` で固定できます）。台本が無いときは、TBX のルートの `xml:lang` か最初の言語列で決め、それも無ければ日→英です。`source,target` 列と Kotomark 形式の CSV（`type`/`allowed`/リスト形式の `forbidden` がある）は、向きが固定です。
  - **キャラクター**（名前、別名、口調プロフィール）は TBX では表せません。Kotomark の JSON 用語集に書いてください。`kotomark glossary convert terms.tbx --out glossary.json` で、どの取り込み形式も Kotomark の JSON に変換でき、確認や追記ができます。
  - サンプル：`samples/glossaries/glossary.tbx`（TBX v2）と `samples/glossaries/crowdin-glossary.csv` には `samples/ja-en/glossary.json` と同じ用語が入っていて、`samples/ja-en` に対して同じ用語の指摘が出ます。
- すべての形式のサンプル（わざと揺れを入れたもの）は `samples/formats/` にあります（`samples/ja-en/glossary.json` と一緒に検査してください）。`samples/formats/book.xlsx` は `scripts/make-sample-xlsx.ts` で生成しています。YAML は `samples/formats/yaml/`（`ja-JP.yml` + `en-US.yml`）、Ren'Py は `samples/formats/renpy/game/`（`tl/english/script.rpy` と、話者名の `define` がある `script.rpy`）です。

エンジンの API（ブラウザでも動き、デモのバンドルからも書き出しています）：

```ts
import { loadInputs, runChecks, parseGlossary, parseGlossaryWithNotes } from "./src/core/index.js";
const { tables, notes } = loadInputs([{ name: "locales/ja.json", data: jaBytes }, { name: "locales/en.json", data: enBytes }, { name: "book.xlsx", data: xlsxBytes }], { sheet: "Script" });
const { glossary, notes: glossaryNotes } = parseGlossaryWithNotes(tbxBytes, "terms.tbx", { sourceLang: "ja" }); // parseGlossary(text, name) → Glossary only
const result = runChecks(tables, glossary);
```

## MCP ツール

| ツール | 内容 |
|---|---|
| `check_script` | すべての検査を実行します。Markdown のレポート（content）と、指摘・使用回数の集計・パケットの概要（structuredContent）を返します。オプション：`rules`、`wideAsTwo`、`minSeverity`。 |
| `get_review_packets` | 口調と、用語集に無い語のパケットを返し、クライアントに判断してもらいます。`subjects` で絞り込めます。 |
| `validate_glossary` | 用語集（JSON、CSV/TSV の用語ベース書き出し、TBX。`filename` を渡し、`sourceLang` は任意）を読み、理解した内容・取り込み時の注意・エラーを返します。 |
| `draft_glossary` | 台本で繰り返し出てくる原語と、最も一貫した訳から、用語とキャラクターを提案します（何も保存しません）。 |
| `save_glossary` / `list_glossaries` / `get_glossary` / `delete_glossary` | 利用者ごとにホスティングする用語集。`check_script` と `get_review_packets` は `glossaryName` を受け付けます。 |
| `get_usage` | プラン、今日の行数、上限。 |
| prompt `review-script` | 手順に沿ったレビューの進め方。 |

1回の呼び出しの上限：表 20個、表1つあたり 500万文字、10万行、リクエスト 25 MB。

## 既知の限界（試作品）

- 日本語の解析はヒューリスティックです。正規表現ベースで、形態素解析は使っていません。代名詞と丁寧さの判定は、見た目が似ているだけの語（私服、こわしが）を拾わないよう調整していますが、見逃しや読み違いはあります。そのため、口調の指摘は warning / info にとどめ、パケットはモデルに回します。
- 名前のつづり違いの検出は、キャラ名と1文字違いの実在の英単語を拾うことがあります。そういう語は `ignoreWords` に追加してください。
- 認証は利用者ごとの Bearer token で、利用制限はメモリ上です。試用には十分ですが、複数台で運用する前に OAuth と共有の制限管理が必要です。
- 用語集の下書きはヒューリスティックです（モデルは使いません）。日常語は内蔵のリストと `stopwords`/`ignoreWords` で除き、訳が一貫しない候補は下位に並べます。漢字1文字の語（剣、祈り）は、一貫した行が3行以上必要です。必ず目で確認してください。

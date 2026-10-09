# CI で Kotomark を動かす

`kotomark check` は1つのコマンドです。台本のファイル（またはディレクトリごと）を読み、すべての検査を行い、
指定した重大度に達する指摘があれば 0 以外で終了します。必要なのは Node 20 以上だけです。公開する
`bin` は、1つにまとめたファイル（`dist/kotomark.mjs`）です。

> Kotomark はまだ npm レジストリにありません（社内の試作品です）。公開されるまでは、固めた tarball から入れてください
> （`skillforge/` で `npm pack` → `kotomark-0.1.0.tgz`）。リポジトリにコミットするか、ビルド成果物として置きます。
> 例：`npm install --no-save ./tools/kotomark-0.1.0.tgz` のあと `npx --no-install kotomark …` で実行します。
> 以下の例はこの前提で書いています。公開後は `npx kotomark@<version>` に置き換えてください。

## 終了コード

| コード | 意味 |
|---:|---|
| `0` | 合格：`--fail-on` 以上の指摘なし（それより低い指摘はレポートに出ることがあります） |
| `1` | `--fail-on`（既定は `error`）以上の指摘あり |
| `2` | 入力または使い方の誤り：ファイルが無い、表が読めない／未対応、オプションの値が不正、知らないフラグ |

`--fail-on error|warning|never` で合否の基準を決めます。合否判定は常に**すべて**の指摘を見ます。`--min-severity`
は、重大度の低い指摘をレポートから隠すだけです。

## レポートの形式

| `--format` | 用途 |
|---|---|
| `md`（既定） | 人が読む Markdown レポート（ジョブサマリーにも向いています：`>> $GITHUB_STEP_SUMMARY`） |
| `json` | `CheckResult` 全体（`tables`、`glossary`、`findings`、`usage`、`reviewPackets`）に `summary: {errors, warnings, infos, byCategory}` を加えたもの。`--json` は別名です。 |
| `junit` | テストレポート画面（GitLab、Jenkins、Azure DevOps、GitHub のテストレポート用 Action）向けの JUnit XML |
| `github` | GitHub Actions のワークフローコマンド。指摘が、変更されたファイルの注釈として表示されます |

`--out <file>` でレポートをファイルに書きます（stdout には何も出ません）。Markdown 以外の形式では、1行の要約が必ず stderr に出ます。
`--locale ja` にすると、どの形式でもメッセージとカテゴリ名が日本語になります。

### JUnit の構成

- **カテゴリ**ごとに `<testsuite>` を1つ作ります（`term`、`notation`、`name`、`honorific`、`voice`、`placeholder`、`tag`、
  `ruby`、`length`）。毎回すべてのカテゴリを出すので、実行ごとにレポートの形が変わりません。
- 指摘ごとに `<testcase>` を1つ作ります：`name="<file>:<line> <rule>"`、`classname="<category>"`。
- `--junit-fail-on` 以上の指摘には `<failure type="<rule>" message="…">` が付きます。既定は
  `--fail-on` に合わせます（`--fail-on never` のときは `warning`）。これでテストレポートと終了コードが一致します。
  重大度の低い指摘は合格のテストケースになり、詳細は `<system-out>` に入ります。
- 指摘の無いカテゴリには、合格のテストケース `<category>: no findings` を1つ作ります。

### GitHub の注釈

`error` → `::error`、`warning` → `::warning`、`info` → `::notice` です。`file=` と `line=` は作業ディレクトリからの
相対パスです（注釈が正しいファイルに付くよう、リポジトリのルートで実行してください）。プロパティの値は
`%`、CR、LF、`:`、`,` を、メッセージは `%`、CR、LF をエスケープします（ワークフローコマンドの仕様どおり）。

## 入力と用語集

```bash
kotomark check loc/                          # recurse: .csv .tsv .json .xlf .xliff .xlsx .po .pot
kotomark check loc/ch1.csv loc/ch2.xlsx --glossary loc/glossary.json
kotomark check script.txt --input-format csv
```

- ディレクトリを渡すと、`node_modules`、`.git`、名前に `glossary` を含むファイル、ツールの設定ファイル
  （`package.json`、`tsconfig.json` など）を飛ばします。直接指定したファイルは必ず読みます。
- `--glossary` が無いときは、作業ディレクトリにある `kotomark.glossary.json`、`glossary.json`、`kotomark.glossary.csv`
  のうち最初に見つかったものを使います（stderr に通知が出ます）。`--no-glossary` で無効にします。
- 読み込み時の注意（飛ばしたシート、推測した列など）は stderr に出ます。

## GitHub Action（おすすめ）

このリポジトリには composite 形式の Action、[`action/`](../action/README.md) が入っています。まとめた CLI
（`action/dist/kotomark.mjs`、コミット済み）をランナーの Node 20 以上で動かすので、インストールの手順は要りません。

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@v4
  - id: kotomark
    uses: masahiro20/new-project/skillforge/action@<ref>   # pin a SHA or tag
    with:
      paths: loc/                 # one per line for paths with spaces
      glossary: kotomark.glossary.json
      fail-on: error              # error | warning | never
      junit-path: reports/kotomark-junit.xml   # optional; json-path too
  # outputs: steps.kotomark.outputs.errors / warnings / infos / exit-code
```

JSON で1回だけ検査し（出力と合否判定）、そのあと注釈（`annotations: true`）、Markdown の
ジョブサマリー（`summary: true`）、任意の JUnit/JSON ファイルを作ります。`fail-on` に応じた終了コードで終わるのは、
すべてのレポートを書き終えてからです。別のリポジトリから `uses: owner/repo/path@ref` で使うには、このリポジトリが
公開されているか、同じ組織からのアクセスが許可されている必要があります。入力・出力の一覧と JUnit のアップロード例：
[`action/README.md`](../action/README.md)。コピーして使えるワークフロー：[`.github-example/kotomark.yml`](../.github-example/kotomark.yml)。
CLI や core を変えたら、`npm run build:action` でコミット済みのバンドルを作り直してください。

## GitHub Actions（CLI を直接使う）

```yaml
# .github/workflows/localization-qa.yml
name: Localization QA
on:
  pull_request:
    paths: ["loc/**", "kotomark.glossary.json"]
  push:
    branches: [main]

jobs:
  kotomark:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write          # only needed for the test-report step
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install Kotomark
        run: npm install --no-save ./tools/kotomark-0.1.0.tgz

      # Annotations on the PR diff; fails the job on errors (exit 1).
      - name: Check script consistency
        run: npx --no-install kotomark check loc/ --format github --fail-on error

      # JUnit for the test-report UI + Markdown job summary, even when the check above failed.
      - name: JUnit report
        if: always()
        run: |
          npx --no-install kotomark check loc/ --format junit --out kotomark-junit.xml --fail-on never
          npx --no-install kotomark check loc/ --min-severity warning --fail-on never >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: kotomark-junit
          path: kotomark-junit.xml
      - uses: mikepenz/action-junit-report@v5   # or dorny/test-reporter
        if: always()
        with:
          report_paths: kotomark-junit.xml
          check_name: Kotomark
```

GitHub の PR の「Files changed」画面に出る注釈は、1ステップあたり各レベル最大10件、1ジョブあたり最大50件です。
全件は JUnit レポートとジョブサマリーにあります。

## GitLab CI

```yaml
kotomark:
  image: node:22
  stage: test
  script:
    - npm install --no-save ./tools/kotomark-0.1.0.tgz
    - npx --no-install kotomark check loc/ --format junit --out kotomark-junit.xml
  artifacts:
    when: always
    reports:
      junit: kotomark-junit.xml
    paths: [kotomark-junit.xml]
```

エラーがあるとジョブは失敗し（終了コード 1）、指摘はマージリクエストのテスト結果に表示されます。
警告でも止めたいときは `--fail-on warning`、止めずに報告だけしたいときは `--fail-on never` を使ってください。

## その他の CI

終了コードを読める CI なら何でも使えます。独自の判定には `--format json` と `jq` を組み合わせます。例：
`kotomark check loc/ --json --fail-on never | jq -e '.summary.byCategory.term.errors // 0 | . == 0'`。

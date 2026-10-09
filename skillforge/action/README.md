# Kotomark GitHub Action

台本ファイルに `kotomark check`（日英ローカライズの一貫性QA）をかけ、指摘を PR の注釈、ジョブサマリー、
任意の JUnit / JSON ファイルとして報告します。composite 形式の Action で、`dist/kotomark.mjs` にコミットした
まとめ済みの CLI をランナーの Node で動かします。`npm install` も、ほかの Action も要りません。

> English version: see [English](#english) at the end of this file.

```yaml
- uses: actions/checkout@v4
- uses: masahiro20/new-project/skillforge/action@<ref>   # pin a commit SHA or tag
  with:
    paths: loc/
    glossary: loc/kotomark.glossary.json
```

> **置き場所について。** 今のところ、この Action は `masahiro20/new-project` のサブディレクトリ（`skillforge/action`）にあります。
> 別のリポジトリから `uses: owner/repo/path@ref` で使えるのは、このリポジトリが**公開**されている場合か、
> 非公開／internal のリポジトリなら、呼び出し側が同じ組織／エンタープライズにいて、リポジトリの
> *Settings → Actions → General → Access* で許可されている場合だけです。このリポジトリの中では、`actions/checkout` のあとに
> `uses: ./skillforge/action` とも書けます。Kotomark を専用のリポジトリに移すときは、ディレクトリをそのまま
> （`action.yml`、`run.sh`、`dist/`）移します。変わるのは `uses:` のパスだけです。

## 必要なもの

- **Node.js 20 以上**が `PATH` にあること。GitHub のホステッドランナーには入っています。セルフホストのランナーや Node の無いコンテナでは、
  この Action の前に `actions/setup-node` を入れてください。Node が無いか古いと、この Action は終了コード 2 で失敗します。
- **bash 4 以上**。Linux で試験済みです。macOS のランナーは `/bin/bash` が bash 3.2 ですが、GitHub の macOS イメージでは
  新しい bash が `PATH` の先にあります。Windows のランナー（Git Bash）は未検証です。
- **権限：** `contents: read`（checkout 用）以外は要りません。注釈とジョブサマリーにトークンは不要です。
  チェックランを作る別のテストレポート用 Action を使う場合は、そのジョブに `checks: write` が必要です。

## 入力

| 入力 | 既定値 | 説明 |
|---|---|---|
| `paths` | `.` | 検査するファイルまたはディレクトリ。1行に1つ（行の中に空白があっても構いません）、または1行に空白区切りで並べます。1行だけで、それが実在するパス1つを指す場合は、そのまま使います。ディレクトリは中まで探し、`.csv .tsv .json .xlf .xliff .xlsx .po .pot` を対象にします。 |
| `glossary` | — | 用語集（JSON または CSV）。空のときは、作業ディレクトリに `kotomark.glossary.json`、`glossary.json`、`kotomark.glossary.csv` があればそれを使います。 |
| `fail-on` | `error` | この重大度以上の指摘があれば失敗にします：`error`、`warning`、`never`。 |
| `locale` | `en` | メッセージとラベルの言語：`en`、`ja`。 |
| `min-severity` | — | 注釈・JUnit・サマリーで、`info`/`warning`/`error` より低い指摘を隠します。合否判定と件数の出力は、常に**すべて**の指摘を使います。 |
| `input-format` | — | 入力形式を固定します（`csv`、`tsv`、`json`、`xliff`、`xlsx`、`po`、`i18n-json`、`unity-csv`、`unreal-csv`）。 |
| `junit-path` | — | JUnit XML のレポートをここに書きます。`<failure>` は `fail-on` に合わせます（`fail-on: never` のときは `warning`）。 |
| `json-path` | — | JSON の全結果（全指摘と `summary`）をここに書きます。 |
| `annotations` | `true` | 指摘を、検査したファイルへの `::error` / `::warning` / `::notice` 注釈として出します。 |
| `summary` | `true` | Markdown のレポートをジョブサマリーに追記します。 |
| `license-key` | `""` | ライセンスキー（任意）。リポジトリの Secret から渡してください（例：`secrets.KOTOMARK_LICENSE_KEY`）。オフラインで検証し、ログではマスクされます。**プレビュー期間中は不要**（全機能が無料）。 |
| `working-directory` | `.` | 実行するディレクトリ。上の相対パスはここを基準にします。注釈が正しいファイルに付くよう、リポジトリのルートのままにしてください。 |

## 出力

| 出力 | 説明 |
|---|---|
| `errors` | error の指摘の件数 |
| `warnings` | warning の指摘の件数 |
| `infos` | info の指摘の件数 |
| `exit-code` | `0` 合格、`1` `fail-on` 以上の指摘あり、`2` 入力または使い方の誤り（ファイルが無い、オプションが不正、Node が古い） |

このステップは、すべてのレポートを書き終えた**あとで** `exit-code` で終了します。検査が失敗しても、
注釈、サマリー、JUnit/JSON ファイルは残ります。それらを使う後続のステップには `if: always()` を付けてください。

## 例：JUnit のアップロードと独自の判定

```yaml
name: Localization QA
on:
  pull_request:
    paths: ["loc/**"]

permissions:
  contents: read

jobs:
  kotomark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: kotomark
        uses: masahiro20/new-project/skillforge/action@<ref>
        with:
          paths: |
            loc/main story
            loc/side quests
          glossary: loc/kotomark.glossary.json
          fail-on: error
          junit-path: reports/kotomark-junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: kotomark-junit
          path: reports/kotomark-junit.xml
      - if: always()
        run: echo "Kotomark found ${{ steps.kotomark.outputs.errors }} error(s), ${{ steps.kotomark.outputs.warnings }} warning(s)"
```

JUnit ファイルをテストレポートとして表示するには、後ろにレポート用の Action を追加します（例：`mikepenz/action-junit-report`
や `dorny/test-reporter`、`if: always()` 付き）。これらには `checks: write` が必要です。

コピーして使えるワークフローは [`../.github-example/kotomark.yml`](../.github-example/kotomark.yml) にあります。

PR の差分に出る注釈は、1ステップあたり各レベル最大10件、1ジョブあたり最大50件です。全件は
ジョブサマリーと JUnit/JSON レポートにあります。

## 開発

- ステップの処理は `run.sh` にあります。`action.yml` は入力を `INPUT_*` 環境変数に渡すだけです（入力をスクリプトに
  直接埋め込むことはしません）。ローカルで動かすには：
  `INPUT_PATHS=samples/ja-en/script.csv INPUT_GLOSSARY=samples/ja-en/glossary.json bash action/run.sh`。
- CLI や core を変えたら、`skillforge/` で `npm run build:action` を実行してバンドルを作り直し、
  `action/dist/kotomark.mjs` をコミットしてください。依存パッケージをすべて含む1ファイルで、
  Node の組み込みモジュール以外を import してはいけません。
- テスト：`test/action.test.ts`（偽の `GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY` で `run.sh` を動かします）。

---

## English

# Kotomark GitHub Action

Runs `kotomark check` (JA↔EN localization consistency QA) on your script files and reports the findings as
PR annotations, a job summary and optional JUnit / JSON files. It is a composite action that runs the bundled
CLI committed at `dist/kotomark.mjs` with the runner's Node — no `npm install`, no other actions.

```yaml
- uses: actions/checkout@v4
- uses: masahiro20/new-project/skillforge/action@<ref>   # pin a commit SHA or tag
  with:
    paths: loc/
    glossary: loc/kotomark.glossary.json
```

> **Where it lives.** For now the action is a subdirectory (`skillforge/action`) of `masahiro20/new-project`.
> `uses: owner/repo/path@ref` works from other repositories only if that repository is **public**, or — for a
> private/internal repository — when the caller is in the same organization/enterprise and the repository's
> *Settings → Actions → General → Access* allows it. Within this repository you can also use
> `uses: ./skillforge/action` after `actions/checkout`. When Kotomark moves to its own repository the
> directory moves as-is (`action.yml`, `run.sh`, `dist/`); only the `uses:` path changes.

## Requirements

- **Node.js 20+** on `PATH`. GitHub-hosted runners have it; on self-hosted runners or containers without Node,
  add `actions/setup-node` before this action. The action fails with exit code 2 if Node is missing or older.
- **bash 4+**. Tested on Linux; macOS runners ship bash 3.2 as `/bin/bash` but GitHub's macOS images put a
  newer bash first on `PATH`. Windows runners (Git Bash) are untested.
- **Permissions:** nothing beyond `contents: read` (for checkout). Annotations and the job summary need no
  token. A separate test-report action that creates check runs needs `checks: write` for that step's job.

## Inputs

| Input | Default | Description |
|---|---|---|
| `paths` | `.` | Files or directories to check. One per line (lines may contain spaces), or whitespace separated on one line. A single line that names one existing path is taken as-is. Directories are searched recursively for `.csv .tsv .json .xlf .xliff .xlsx .po .pot`. |
| `glossary` | — | Glossary (JSON or CSV). Empty = `kotomark.glossary.json`, `glossary.json` or `kotomark.glossary.csv` in the working directory if present. |
| `fail-on` | `error` | Fail when findings at or above this severity exist: `error`, `warning`, `never`. |
| `locale` | `en` | Language of messages and labels: `en`, `ja`. |
| `min-severity` | — | Hide findings below `info`/`warning`/`error` in annotations, JUnit and the summary. Gating and the count outputs always use **all** findings. |
| `input-format` | — | Force the input format (`csv`, `tsv`, `json`, `xliff`, `xlsx`, `po`, `i18n-json`, `unity-csv`, `unreal-csv`). |
| `junit-path` | — | Write a JUnit XML report here. `<failure>`s follow `fail-on` (`warning` when `fail-on: never`). |
| `json-path` | — | Write the full JSON result (all findings + `summary`) here. |
| `annotations` | `true` | Emit findings as `::error` / `::warning` / `::notice` annotations on the checked files. |
| `summary` | `true` | Append the Markdown report to the job summary. |
| `license-key` | `""` | License key (optional). Pass it from a repository secret (e.g. `secrets.KOTOMARK_LICENSE_KEY`). Verified offline and masked in logs. **Not needed during the preview** — every feature is free. |
| `working-directory` | `.` | Directory to run in; relative paths above resolve against it. Keep the repository root so annotations land on the right files. |

## Outputs

| Output | Description |
|---|---|
| `errors` | Number of error findings |
| `warnings` | Number of warning findings |
| `infos` | Number of info findings |
| `exit-code` | `0` passed, `1` findings at/above `fail-on`, `2` bad input or usage (missing file, bad option, Node too old) |

The step exits with `exit-code` **after** all reports are written, so a failing check still leaves the
annotations, summary and JUnit/JSON files behind. Use `if: always()` on later steps that consume them.

## Example: JUnit upload and a custom gate

```yaml
name: Localization QA
on:
  pull_request:
    paths: ["loc/**"]

permissions:
  contents: read

jobs:
  kotomark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: kotomark
        uses: masahiro20/new-project/skillforge/action@<ref>
        with:
          paths: |
            loc/main story
            loc/side quests
          glossary: loc/kotomark.glossary.json
          fail-on: error
          junit-path: reports/kotomark-junit.xml
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: kotomark-junit
          path: reports/kotomark-junit.xml
      - if: always()
        run: echo "Kotomark found ${{ steps.kotomark.outputs.errors }} error(s), ${{ steps.kotomark.outputs.warnings }} warning(s)"
```

To show the JUnit file as a test report, add a reporter action after it (e.g. `mikepenz/action-junit-report`
or `dorny/test-reporter`, with `if: always()`); those need `checks: write`.

A copyable workflow is in [`../.github-example/kotomark.yml`](../.github-example/kotomark.yml).

GitHub shows at most 10 annotations of each level per step and 50 per job in the PR diff; the full list is in
the job summary and the JUnit/JSON reports.

## Development

- `run.sh` holds the step logic; `action.yml` only maps inputs to `INPUT_*` environment variables (inputs are
  never interpolated into the script). Run it locally:
  `INPUT_PATHS=samples/ja-en/script.csv INPUT_GLOSSARY=samples/ja-en/glossary.json bash action/run.sh`.
- Rebuild the bundle after CLI/core changes with `npm run build:action` (from `skillforge/`) and commit
  `action/dist/kotomark.mjs`. It is a single file with all dependencies bundled; it must not import anything
  outside Node built-ins.
- Tests: `test/action.test.ts` (runs `run.sh` with fake `GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY`).

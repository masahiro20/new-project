# atlas-scan（日本語版）

English: [README.md](README.md)

> オーナー向けの日本語版。製品の文書は英語版（README.md）で、内容は同等にしてある。英語版を変えたらこちらも合わせる。

MCP サーバー、Claude のスキル、プラグインを対象にした、1コマンドで動く**読み取り専用**の静的スキャナー。ディレクトリをテキストとして読み、危険なパターン（ツール説明文への毒入れ、パイプでシェルに渡すインストーラー、デコードしてから実行、環境変数の一括出力、認証情報のパスへのアクセス、権限確認を飛ばす指示など）を探す。一致したものは Python／JavaScript／TypeScript の AST で文脈を確かめ、グレードと、ファイル・行・スニペット・理由付きの全検出を出力する。

```sh
npx atlas-scan ./path/to/server
```

> **npm にはまだ公開していない。** 誤って `npm publish` しても失敗するよう、`package.json` にはわざと `"private": true` を入れてある。公開が承認されたら、オーナーがこの行を消す。それまでは「インストールと実行」の方法を使う。

## 安全性

- **何も実行しない。** 検査対象のファイルは、実行・import・インストール・ビルド・型チェックのどれもしない。Python は `ast`／`tokenize` で、JS/TS は TypeScript の**パーサー**（`ts.createSourceFile`）だけで読む。
- **インストールスクリプトなし。** このパッケージには `preinstall`／`install`／`postinstall` がない。依存は `typescript`（5.9.3 に固定）だけで、こちらにもない。
- **ネットワーク通信なし。** CLI はネットワークに一切リクエストしない。OSV の照会、レジストリやパッケージの取得、テレメトリもない（OSV やレジストリの確認は Atlas の別のツールで行い、このパッケージには含めない。今後ここに加える場合は、明示的に指定するオプションにし、通信することを文書に書く）。`npx` 自体がダウンロードするのは、このパッケージと `typescript` を npm レジストリから取得する分だけ。
- **安全な出力。** スニペット中の制御文字と不可視文字（ANSI エスケープ、bidi の上書き、ゼロ幅文字）は `\uXXXX` で表示する。検査対象のファイルが端末を操作することはできない。
- **文言。** 結果は「パターンを検出」であり、判決ではない。コードを「マルウェア」と断定することはない。

## 必要なもの

- Node.js 18 以上
- Python 3.9 以上。`python3` または `python`（Windows では `py -3`）で見つける。使う Python は `ATLAS_PYTHON=/path/to/python3` で指定できる。Python は分離モード（`python3 -I -B`）で動かすので、`PYTHON*` 環境変数とユーザーの site-packages は無視され、`.pyc` も書き出さない。

## インストールと実行

公開後：

```sh
npx atlas-scan ./my-mcp-server
```

公開前は、このリポジトリのチェックアウトから使う：

```sh
# 1) 直接実行する（JS/TS の AST 層のため、atlas/cli で一度 `npm install --ignore-scripts` を実行しておく）
node atlas/cli/bin/atlas-scan.js ./my-mcp-server

# 2) 利用者が受け取るのと同じ形の tarball にして実行する
cd atlas/cli && npm pack            # -> atlas-scan-0.1.0.tgz
npx --yes ./atlas-scan-0.1.0.tgz ../../path/to/scan
# 別のディレクトリからは file: 指定を使う（絶対パスだけを渡すとコマンドとして実行される）
npx --yes file:/abs/path/to/atlas-scan-0.1.0.tgz ./path/to/scan
```

依存の `typescript` がなくても検査は動く。その場合、JS/TS ファイルは正規表現の段階だけになり、警告を出す。

## 使い方

```
atlas-scan PATH [PATH ...] [options]
```

| オプション | 意味 |
| --- | --- |
| `--format text\|json\|sarif` | 標準出力の形式（既定は `text`。`sarif` は SARIF 2.1.0） |
| `--json FILE` | JSON のレポートを `FILE` にも書き出す |
| `--sarif FILE` | SARIF 2.1.0 のレポートを `FILE` にも書き出す（GitHub code scanning 用） |
| `--fail-on high\|critical\|none` | `src`／`skill` のコードでどの重大度が出たら終了コードを 1 にするか（既定の `high` は high か critical。`none` なら 1 にしない） |
| `--fail-on-reach REACH[,REACH]` | 終了コード 1 の判定に数える [reach](#reach検出の場所) をカンマ区切りで指定する：`agent`、`exec`、`other`（既定は3つすべて＝今までどおり）。例：`--fail-on-reach agent,exec` |
| `--findings FILE` | 抑制した候補も含め、全検出を JSON Lines で書き出す |
| `--min-severity LEVEL` | `info`／`low`／`medium`／`high`／`critical` のうち、指定より下の検出をレポートで隠す（終了コードと `--findings` には影響しない） |
| `--show-suppressed` | 文脈層が抑制した候補も、理由付きで表示する |
| `--no-ast` | 正規表現の段階だけで動かす（AST による文脈層を飛ばす） |
| `--quiet`, `-q` | text 形式で、対象ごとに1行の要約だけを出す |
| `--version` | バージョンを表示する |
| `--help` | ヘルプを表示する |

text 出力の中身（対象ごと）：グレードと信頼スコア、ファイル数とスキル数、`src`／`skill` のコードでの high/critical の件数の reach 別の内訳（例：`agent 2 · exec 1 · other 5 (review)`）、スコアの上限があればその内容、能力の表示（例：`shell-exec`）、そして reach 別の見出し（`REACHES THE AGENT`、`RUNS AS CODE`、最後に要レビューの `OTHER STRINGS, COMMENTS, DOCS AND DATA`）の下に、重大度ごとにまとめた検出。各検出には、ルール ID、`file:line`、文脈（`src`、`skill`、`docs`、`test` など）、一致した場所（ツール説明文、コメント、コードなど）、reach、短いスニペット、文脈層が判定を変えた場合はその `why` が付く。`Result:` の行は、`agent` と `exec` の high/critical があるかで決まる。`other` にだけある high/critical は、要レビューとしてその行に件数を出す。レポートの最後には必ず次の1行が出る（CLI の出力なので英語のまま）：

> Static analysis only — nothing was executed. Findings are patterns, not a verdict of intent.

**スコアについて。** 信頼スコアは `0.60 × security + 0.25 × provenance + 0.15 × maintenance`。ローカルの検査では出所（検証済みの名前空間、attestation など）も保守状況も確かめられないので、それぞれ 0 と中立の 25 になる。そのため、検出のないツリーでも上限は 64 前後（グレード C）。セキュリティのスコアと検出の中身を見ること。グレードは、ツリー同士を比べるときに一番役に立つ。

出力のパスは、渡したパスからの相対パスになる。レポートを共有するなら、相対パスで渡す。

実際の出力例は [`examples/`](examples/) にある。スキャナーの陽性対照フィクスチャー（`pos`）と、検出のない陰性対照フィクスチャー（`neg`）を検査したもの：
[`sample-output.txt`](examples/sample-output.txt)、[`sample-output.json`](examples/sample-output.json)、
[`sample-output.sarif`](examples/sample-output.sarif)。
リポジトリのルートで次のように作った：

```sh
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg --format json
node atlas/cli/bin/atlas-scan.js atlas/scanner/tests/fixtures/pos atlas/scanner/tests/fixtures/neg -q --sarif atlas/cli/examples/sample-output.sarif
```

## reach：検出の場所

各検出には `reach` が付く。文脈層が決めた一致の場所（`loc`）、`why`、ルール、パスから決める。reach が変えるのは表示と、`--fail-on-reach` を指定したときに終了コードの判定に数える検出だけで、重大度・抑制・信頼スコアは変わらない。

- **`agent`**：エージェントに届く文章。ツールの説明文、コードがモデルに送るプロンプト、skill、MCP のマニフェストやツール定義、`.claude/`（と同種のエージェント設定ディレクトリ）や `hooks/` の中のファイル。
- **`exec`**：実行されるコード。AST によるコードの検出、インストール時のスクリプト、シェルの実行、動的な評価、環境変数の一括出力、実行文脈での pipe-to-shell、コード中の送信先（コールバック用のエンドポイント）。
- **`other`**：それ以外の文字列リテラル、コメント、ドキュメント、データファイル、例。引用やデータ（たとえばセキュリティツール自身のルールやテスト用コーパス）であることが多いので、**レビューしてから**判断する。

対応表（上から順に調べ、最初に当てはまったものを使う）：

| # | 条件 | reach |
| --- | --- | --- |
| 1 | ルール `ATL-CE-*`、`ATL-CR-*`、`ATL-IN-*`、`ATL-OB-003`、`ATL-NW-001` | `exec` |
| 2 | ルール `ATL-PL-001`（hooks／settings のコマンド）か `ATL-SK-002`（skill に同梱のスクリプト）。文脈が `skill`（`SKILL.md` の本文やコードブロック）。パスが `.claude/`、`.claude-plugin/`、`.cursor/`、`.codex/`、`.gemini/`、`.vscode/`、`.windsurf/`、`.continue/`、`.kiro/`、`.roo/`、`.amazonq/`、`hooks/` の下。ファイル名が `server.json`、`mcp.json`、`manifest.json`、`plugin.json` など（MCP のマニフェスト名） | `agent` |
| 3 | `why` が「data file (not an MCP manifest/tool definition)」 | `other` |
| 4 | データファイル（`.json`、`.jsonc`、`.jsonl`、`.ndjson`、`.yaml`、`.yml`、`.toml`）：一致した位置についてのスキャナーのデータファイル判定で決める。マニフェスト／ツール定義 → `agent`、コマンドのキー（`command`、`run`、`script` など）→ `exec`、ただのデータやコメント → `other` | 左のとおり |
| 5 | `loc` が `string:desc`、`string:prompt`、`string:prompt~` | `agent` |
| 6 | `loc` が `code` | `exec` |
| 7 | 文字列（`string:plain`、`string~`、`string:prompt`、`string:prompt~`）の中の `ATL-RF-001` で、スキャナーが medium 以上のままにし、`why` がないもの（`exec(`／`spawn(`／`$(` などの実行文脈にある） | `exec` |
| 8 | コードファイルの文字列（`string:plain`、`string~`）の中の `ATL-NW-002`（コールバック用のエンドポイント）で、`why` がないもの | `exec` |
| 9 | `loc` が `string:plain`、`string~`、`string:example`（プロンプト内の few-shot の例）、`string:catalog`、`string:corpus`、`string:pattern`、`string:patternlist`、`string:test`、`regex`、`comment`、`comment~`、`fenced`、`prose` | `other` |
| 10 | `loc` がない（`--no-ast`、または文脈層の外で決まるルール）：対象がコードのルール（`ATL-FS-001`、`ATL-OB-004` など）→ `exec`、ドキュメントやデータのファイル → `other`、それ以外 → `agent`（場所が分からないので、`other` に埋もれさせない） | 左のとおり |
| 11 | 上のどれにも当てはまらない | `other` |

JSON のレポートでは、すべての検出に `reach` が付き、対象ごとに `high_or_critical_src_skill_by_reach`（`{"agent": n, "exec": n, "other": n}`）が付く。`--findings` の各行にも `reach` が付く。SARIF の各結果には `properties.reach` と、`properties.tags` の `reach:agent`／`reach:exec`／`reach:other` が付くので、code scanning で絞り込める。

`--fail-on-reach agent,exec` を指定すると、エージェントに届くか実行される場所の high/critical では今までどおり終了コード 1 になり、`other`（レビュー待ちの引用やデータ）ではビルドを失敗させない。既定ではすべての reach を数えるので、既存のパイプラインの動きは変わらない。

## SARIF

`--format sarif`／`--sarif FILE` は、SARIF 2.1.0 の run を1つ書き出す（`tool.driver.name` は `atlas-scan`）。
- アーティファクトの URI は**カレントディレクトリ**からの相対（`uriBaseId` は `%SRCROOT%`）で、先頭に各対象の相対パスが付く。GitHub code scanning に使うなら、CLI はリポジトリのルートから実行する。
- カレントディレクトリの外にある対象は、その対象からの相対 URI になる。絶対パスは書き出さない。
- レベル：critical／high → `error`、medium → `warning`、low／info → `note`。
- `--min-severity` と `--show-suppressed` が効く。抑制した候補には `suppressions: [{kind: "external", justification}]` が付く。
- 各結果には、変わらない `partialFingerprints["atlasFindingHash/v1"]` が付く。

## 終了コード

| コード | 意味 |
| --- | --- |
| `0` | `src`／`skill` のコードで high・critical のパターンを検出しなかった（docs／tests／examples／CI の検出や、より低い重大度の検出は表示されることがある） |
| `1` | `src`／`skill` のコードで high または critical のパターンを1件以上検出した |
| `2` | 使い方または実行時のエラー：不正なオプション（`--fail-on-reach` の不正な値を含む）、パスがない、Python が見つからない、スキャナーの異常終了 |

`--fail-on critical` なら critical のパターンでだけ 1 で終わる。`--fail-on none` なら 1 で終わることはない。`--fail-on-reach agent,exec` なら、指定した reach の検出でだけ 1 で終わる（`--fail-on` と組み合わせて効く）。既定（すべての reach）なら終了コードは今までと同じ。

## CI の例（GitHub Actions）

```yaml
name: atlas-scan
on: [pull_request]
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      # src/skill のコードで high/critical のパターンを検出したら、ジョブを失敗させる（exit 1）
      - run: npx --yes atlas-scan@0.1.0 . --json atlas-report.json
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: atlas-report
          path: atlas-report.json
```

パッケージを公開するまでは、`npx` の行を、pack した tarball か、このリポジトリのチェックアウトにある `bin/atlas-scan.js` へのパスに置き換える。

SARIF を GitHub code scanning にアップロードするには、[`atlas/action`](../action/README.ja.md) の composite action を使う。

## ルール

ルール ID（`ATL-TP-001`、`ATL-RF-001` など）と重大度は、スキャナーのルール表（`scanner/scan.py` の `R`）で定義している。元になっているのは Atlas のルール仕様 `scan-rules-v0.md`。文脈層がどう一致を抑制・格下げするかは、スキャナーの README（リポジトリの `atlas/scanner/README.md`）に書いてある。抑制した候補も残す（`--show-suppressed`、`--findings`）ので、すべての判断を監査できる。

## 制約

- 静的解析はすり抜けられる。難読化、実行時に取得・生成するコード、ネイティブバイナリ、何段階もの間接参照は検出できないことがある。検出がなくても安全の保証ではなく、検出があっても意図の証明ではない。
- AST による文脈判定は Python、JavaScript、TypeScript だけ。ほかの言語（Go、Rust、shell、PowerShell など）は、正規表現での一致と、コメント・文字列の簡易な判定になる。
- 1 MB を超えるファイル、バイナリ、シンボリックリンク、よくある vendor／ビルド用ディレクトリ（`node_modules`、`dist`、`build`、`.venv` など）は飛ばす。
- 出所と保守状況は評価しない（「スコアについて」を参照）。

## 開発

Python のスキャナー本体は `atlas/scanner/` にある。ここの `scanner/` はバイト単位で同じコピーで、パッケージ単体で完結させるために置いている。

```sh
cd atlas/cli
npm install --ignore-scripts
npm run sync         # ../scanner から cli.py, scan.py, ast_py.py, trust.py, js/ast_dump.cjs をコピーする
npm test             # node:test。../scanner/tests/fixtures に対して CLI を実行する
```

`npm pack` は先に `npm run sync:check` を実行し、コピーが古ければ pack しない。
スキャナー自体のテスト：`python3 -I -m unittest discover -s atlas/scanner/tests`。

## ライセンス

MIT（[LICENSE](LICENSE) を参照）。スキャナーの CLI は無料で使え、Atlas のアカウントがなくても全機能が動く。

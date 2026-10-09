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
| `--findings FILE` | 抑制した候補も含め、全検出を JSON Lines で書き出す |
| `--min-severity LEVEL` | `info`／`low`／`medium`／`high`／`critical` のうち、指定より下の検出をレポートで隠す（終了コードと `--findings` には影響しない） |
| `--show-suppressed` | 文脈層が抑制した候補も、理由付きで表示する |
| `--no-ast` | 正規表現の段階だけで動かす（AST による文脈層を飛ばす） |
| `--quiet`, `-q` | text 形式で、対象ごとに1行の要約だけを出す |
| `--version` | バージョンを表示する |
| `--help` | ヘルプを表示する |

text 出力の中身（対象ごと）：グレードと信頼スコア、ファイル数とスキル数、スコアの上限があればその内容、能力の表示（例：`shell-exec`）、そして重大度ごとにまとめた検出。各検出には、ルール ID、`file:line`、文脈（`src`、`skill`、`docs`、`test` など）、一致した場所（ツール説明文、コメント、コードなど）、短いスニペット、文脈層が判定を変えた場合はその `why` が付く。レポートの最後には必ず次の1行が出る（CLI の出力なので英語のまま）：

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
| `2` | 使い方または実行時のエラー：不正なオプション、パスがない、Python が見つからない、スキャナーの異常終了 |

`--fail-on critical` なら critical のパターンでだけ 1 で終わる。`--fail-on none` なら 1 で終わることはない。

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

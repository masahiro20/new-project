# atlas-scan GitHub Action（日本語版）

English: [README.md](README.md)

> オーナー向けの日本語版。製品の文書は英語版（README.md）で、内容は同等にしてある。英語版を変えたらこちらも合わせる。

[`atlas-scan`](../cli/README.ja.md)（MCP サーバー、Claude のスキル、プラグイン向けの、**読み取り専用**の静的なパターンスキャナー）をリポジトリに対して実行する composite action。SARIF 2.1.0 のレポートを書き出して GitHub code scanning にアップロードし、`fail-on` に従ってジョブを失敗させる。

検査対象のツリーにあるものは、何も実行・インストール・import しない。結果は「パターンを検出」であり、意図の判定ではない。

> **GitHub Marketplace には出していない。** リポジトリのパスで指定し、このリポジトリのコミット SHA（完全な形）に固定して使う：`uses: <owner>/<repo>/atlas/action@<commit-sha>`。`<owner>`、`<repo>`、`<commit-sha>` は実際の値に置き換える。action は同じチェックアウトの `atlas/cli`（`${{ github.action_path }}/../cli`）から CLI を動かすので、`atlas/` ディレクトリは丸ごとそろえておく必要がある。

## ワークフローの例

```yaml
name: atlas-scan
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write   # SARIF を code scanning にアップロードする

jobs:
  atlas-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - id: atlas
        uses: <owner>/<repo>/atlas/action@<commit-sha>
        with:
          path: .
          fail-on: high          # critical | high | none
          # min-severity: low    # info の検出をレポート／SARIF から隠す
          # sarif-file: atlas-scan.sarif
          # upload-sarif: "true"
      - if: always()
        run: echo "atlas-scan findings=$FINDINGS exit-code=$EXIT_CODE"
        env:
          FINDINGS: ${{ steps.atlas.outputs.findings }}
          EXIT_CODE: ${{ steps.atlas.outputs.exit-code }}
```

フォークからのプルリクエストでは `GITHUB_TOKEN` が読み取り専用になり、SARIF のアップロードは拒否される。そうしたワークフローでは `upload-sarif: "false"` にする（ジョブの成否は `fail-on` で決まるまま）か、SARIF ファイルをビルドの artifact としてアップロードする。

## 入力

| 入力 | 既定値 | 意味 |
| --- | --- | --- |
| `path` | `.` | 検査するディレクトリ。ワークスペースからの相対パス。 |
| `min-severity` | `info` | `info`／`low`／`medium`／`high`／`critical` のうち、指定より下の検出をレポートと SARIF で隠す。終了コードは変わらない。 |
| `fail-on` | `high` | `src`／`skill` のコードで、この重大度以上のパターンを検出したら失敗させる：`high`（high か critical）、`critical`、`none`（検出では失敗させない）。 |
| `sarif-file` | `atlas-scan.sarif` | SARIF 2.1.0 のレポートの書き出し先（ワークスペースからの相対パス）。 |
| `upload-sarif` | `true` | `github/codeql-action/upload-sarif`（category は `atlas-scan`）で SARIF をアップロードする。`security-events: write` が必要。 |

## 出力

| 出力 | 意味 |
| --- | --- |
| `findings` | レポートにある検出の数（抑制されていないもの、`min-severity` 以上のもの、全文脈）。 |
| `exit-code` | `0`：`fail-on` のしきい値未満。`1`：`src`／`skill` のコードで `fail-on` 以上のパターンを検出。`2`：使い方または実行時のエラー。 |

## 何をするか

1. `actions/setup-node`（Node 22）と `actions/setup-python`（Python 3.12）。どちらもコミット SHA に固定。
2. `atlas/cli` で `npm ci --ignore-scripts`。入るのは `typescript`（パーサーとして使う）だけで、インストールスクリプトは動かない。
3. ワークスペースから `node atlas/cli/bin/atlas-scan.js --sarif <sarif-file> --fail-on <fail-on> -- <path>` を実行する。SARIF の URI はリポジトリのルートからの相対（`%SRCROOT%`）になる。このステップ自体は失敗しないので、パターンを検出してもアップロードは行われる。
4. SARIF ファイルをアップロードする（`upload-sarif` が `true` でない場合と、検査がエラーになった場合は除く）。
5. スキャナーの終了コードが `1`（`fail-on` による）か `2` なら、その終了コードでジョブを失敗させる。

入力はすべて環境変数経由でだけシェルに渡す（`run:` の中で `${{ }}` は使わない）。`min-severity`／`fail-on` は決まった一覧と照合するので、入力値からシェルコマンドを注入することはできない。スキャナーはネットワークにリクエストしない。ダウンロードするのは、固定した action と、npm レジストリからの `typescript` だけ。

## SARIF の詳細

- run は1つで、`tool.driver.name` は `atlas-scan`。`rules` には実際に出たルール ID だけを入れ、それぞれにタイトル、既定のレベル、`security-severity`（code scanning の重大度用）を付ける。
- レベル：critical／high → `error`、medium → `warning`、low／info → `note`。
- 各結果には `partialFingerprints["atlasFindingHash/v1"]`（ルール・ファイル・スニペットのハッシュ）と、`properties.severity`／`ctx`／`loc`／`suppressed` が付く。
- 抑制した候補が出るのは、CLI の `--show-suppressed` を使った場合だけ（action の入力にはない）。`suppressions: [{kind: "external", justification: <why>}]` の形で出る。
- サンプル：[`../cli/examples/sample-output.sarif`](../cli/examples/sample-output.sarif)。

## 固定している依存

| Action | 固定先 | 固定した時点のタグ |
| --- | --- | --- |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | v7.1.0 |
| `actions/setup-python` | `5fda3b95a4ea91299a34e894583c3862153e4b97` | v7.0.0 |
| `github/codeql-action/upload-sarif` | `24c54180a607b1449ed407dd24f251e4e9147c8d` | v4.38.3 |
| `actions/checkout`（例でだけ使用） | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 |

SHA は github.com に対する `git ls-remote --tags` で求めた。上げる前にリリースノートを確認し、固定は完全な SHA のままにする（Dependabot の `github-actions` エコシステムで更新できる）。

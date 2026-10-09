# ステージ2：ルール別の集計表（100件試験）

`atlas/scanner/compare_runs.py` が出力した表に、日本語の見出しを付けたもの。スクリプトで作り直すと英語の見出しに戻る。本文の説明は `stage2-scan-100.md` を参照。

| ルール | v0 全体 | v0 src | v1 正規表現のみ 全体 | v1 全体 | v1 src+skill | v1 src+skill の high/critical | 抑制 | AST で新たに検出 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ATL-CE-001 | 329 | 60 | 360 | 345 | 113 | 0 | 359 | 344 |
| ATL-CE-002 | 100 | 31 | 100 | 95 | 12 | 0 | 89 | 84 |
| ATL-CR-001 | 84 | 52 | 84 | 11 | 1 | 1 | 79 | 6 |
| ATL-DP-001 | 7 | 3 | 7 | 7 | 3 | 0 | 0 | 0 |
| ATL-FS-001 | 179 | 79 | 179 | 132 | 55 | 0 | 47 | 0 |
| ATL-IN-001 | 21 | 19 | 21 | 21 | 19 | 6 | 0 | 0 |
| ATL-NW-001 | 101 | 47 | 101 | 87 | 21 | 0 | 61 | 47 |
| ATL-NW-002 | 64 | 48 | 47 | 36 | 20 | 0 | 11 | 0 |
| ATL-OB-001 | 14 | 4 | 14 | 7 | 4 | 0 | 7 | 0 |
| ATL-OB-003 | 14 | 0 | 14 | 13 | 0 | 0 | 14 | 13 |
| ATL-OB-004 | 12 | 5 | 12 | 8 | 1 | 0 | 4 | 0 |
| ATL-PL-001 | 19 | 19 | 19 | 19 | 19 | 0 | 0 | 0 |
| ATL-RF-001 | 244 | 100 | 244 | 216 | 72 | 6 | 28 | 0 |
| ATL-SK-001 | 37 | 1 | 37 | 7 | 0 | 0 | 30 | 0 |
| ATL-SK-002 | 255 | 190 | 255 | 255 | 189 | 0 | 0 | 0 |
| ATL-TP-001 | 25 | 10 | 25 | 24 | 9 | 9 | 1 | 0 |
| ATL-TP-002 | 14 | 5 | 15 | 13 | 5 | 5 | 2 | 0 |
| ATL-TP-003 | 85 | 18 | 91 | 45 | 8 | 3 | 46 | 0 |
| ATL-TP-004 | 36 | 5 | 36 | 32 | 2 | 2 | 4 | 0 |
| ATL-TP-005 | 6 | 2 | 6 | 6 | 1 | 0 | 0 | 0 |
| **合計** | **1646** | **698** | **1667** | **1379** | **554** | **32** | **782** | **494** |

抑制の理由（出力の `why` は英語のまま）：

| 理由（`why`） | 意味 | 件数 |
|---|---|---:|
| not confirmed as executable code by AST | AST で実行されるコードと確認できなかった | 323 |
| duplicate of AST finding | AST による検出と重複 | 275 |
| negated or cited as an example | 否定文の中、または例としての引用 | 35 |
| inside a detection pattern / pattern list (AST) | 検出パターン・パターン一覧の中（AST） | 32 |
| quoted in documentation | ドキュメント中の引用 | 26 |
| inside a code comment (AST) | コードのコメントの中（AST） | 23 |
| inside a detection pattern / assertion (AST) | 検出パターン・アサーションの中（AST） | 22 |
| placeholder, not a concrete command | プレースホルダーで、具体的なコマンドではない | 13 |
| inside a line comment (heuristic) | 行コメントの中（簡易判定） | 11 |
| detection-rule file (YARA/semgrep) | 検出ルールのファイル（YARA/semgrep） | 9 |
| assertion literal (AST) | アサーションのリテラル（AST） | 7 |
| embedded media (magic bytes) | 埋め込みメディア（マジックバイト） | 4 |
| inside a code comment (heuristic) | コードのコメントの中（簡易判定） | 2 |

セキュリティ部分のスコアを A〜F のしきい値で分けたもの（今回は出所と保守状況を集めていない）：

| グレード | リポジトリ数 |
|---|---:|
| A | 78 |
| B | 10 |
| C | 7 |
| D | 0 |
| F | 5 |

ファイル数：36,873。AST で解析：16,078、解析に失敗：8、圧縮されたファイルとして除外：3。

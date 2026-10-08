# Atlas scanner v1

読み取り専用の静的スキャナー。検査対象の import・実行・インストール・ビルドは一切しない。

## 仕組み
1. **候補の抽出：** `scan-rules-v0.md` の [P] ルールを正規表現で拾う（v0 と同じ）。
2. **文脈の判定：** 拾った候補ごとに、本物かどうかを判定する。
   - **Python（`ast_py.py`）と JS/TS（`js/ast_dump.cjs`、TypeScript の `createSourceFile` だけを使う）：**
     - 文字列リテラルとコメントの範囲を求める。
     - 文字列の役割を判別する：ツールの説明文（docstring、`description=`、`server.tool(name, desc)`）、検出パターン（`re.compile`・`RegExp`・`includes` の引数、パターン名の変数、3件以上の文字列リスト）、アサーション。
   - **コード系ルール（CE-001、CE-002、OB-003、CR-001、NW-001）：** AST の呼び出しから判定し直す（例：`shell=True` のキーワード、`exec(b64decode(...))`、`JSON.stringify(process.env)`、`listen(..., "0.0.0.0")`）。
   - **Markdown・SKILL.md：**
     - フェンス付きコードブロックを見分ける。
     - インラインコードや引用を見分ける。
     - 否定語を探す（同じ文の直前90文字）。ただし、否定語の後に命令形が続けば否定として扱わない。ツール説明文の中では、直前の強い否定だけを数える。
   - **抑制した検出も残す：** `suppressed: true` と理由（`why`）を付けて出力に残すので、監査できる。信頼スコアには数えない。
3. **v1 で変えた重大度：**
   - **RF-001：** 既知のインストーラー、コメント、実行されない案内文字列、docs/CI のものは low に下げる。プレースホルダー（`curl ... | sh`）は除外する。
   - **NW-002：** Discord / Telegram API は、トークンが直書きされていなければ low にし、能力表示を付ける。
   - **IN-001：** `"private": true` の package.json なら low にする。
   - **TP-001：** 同じ説明文の中に TP-002 または TP-004 もあれば critical に上げる。
   - **文脈 `ci`：** 新設した（重み 0.3）。
   - **test の判定を広げた：** `*_test.go`、`*_tests.rs`、`test_*.py`、`test-*/` もテストとして扱う。

## 使い方
```sh
python3 -I scan.py <dir> [...] [--json summary.json] [--findings findings.jsonl] [--no-ast] [--quiet]
```
- `scan.scan_repo(root)` は v0 と互換で、`(findings, n_files, n_skill_dirs)` を返す（Allowlist Builder が使う）。
- JS/TS の補助プログラムには `js/node_modules/typescript` が必要。`npm install --ignore-scripts` で入れる。入っていなければ、JS/TS は v0 相当の判定になる。

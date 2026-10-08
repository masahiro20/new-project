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

## UP-002：版間の差分（`updiff.py`、`../allowlist/atlas_watch.py`）
承認した版と新しい版を比べ、「挙動の変化：新しいパターンを検出（behaviour changed: new pattern(s) detected）」を出す。どちらの版もインストール・実行しない（アーカイブはデータとして展開し、`scan_repo` で検査するだけ）。

- **比較：** 抑制されていない検出を (rule, file, 空白を詰めた snippet) で突き合わせ、追加・削除・変化なしを数える。同じ rule と snippet が別ファイルに移っただけなら「移動」とし、新規に数えない。ファイル単位の追加・削除・変更と、ツール説明文の差分（Python は `@*.tool` の docstring と `Tool(name=, description=)`、JS/TS は `.tool(name, desc)`・`registerTool(name, {description})`・`{name, description}`）も出す。
- **UP-002 の条件：** src/skill に high/critical の検出が増えた。TP-* が増えた（src/skill かツール説明文の中なら重大度を問わない）。NW-002・CR-001・RF-001・OB-* が src/skill に増えた。IN-001 が増えた、または preinstall/install/postinstall が追加・変更された。レジストリのリポジトリ URL が変わった、または attestation が無くなった。保守者・ライセンス・公開者の変更は根拠として表示するだけ。
- **該当したとき：** `up002: true`、`trust_cap: 50`、英日のバナー、`ATL-UP-002`（high）の finding を返す。
- **パッケージ版の比較では `dist/`・`build/` も検査する**（公開物の本体がそこにあるため。ソースリポジトリの検査では従来どおり除外）。

```sh
python3 -I atlas/allowlist/atlas_watch.py diff npm:@modelcontextprotocol/server-filesystem 2025.7.1 2025.7.29 --json d.json --md d.md
python3 -I atlas/allowlist/atlas_watch.py diff pypi:mcp-server-time 2026.7.10 2026.8.18
python3 -I atlas/allowlist/atlas_watch.py diff-dirs old/ new/          # オフライン
python3 -I atlas/allowlist/atlas_watch.py check decisions.json --out-dir watch   # report.json も可
#   → watch/atlas-watch-report.json と .md、watch/atlas-watch-state.json
#   終了コード：0 新しい版なし／10 新しい版あり（UP-002 なし）／20 UP-002 該当／2 エラーのみ
```
- **承認した版：** 設定で固定した版。固定していなければ state ファイルに記録した版。初回は最新版を基準として記録する（再承認するまで基準は変えない）。
- **通知：** ローカルのレポートファイルと終了コードだけ。外部には送らない。

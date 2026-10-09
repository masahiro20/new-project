# Atlas scanner v1（v1.1）

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

## v1.1：誤検知を減らす規則
どれも「抑制」ではなく **medium への格下げ**（`review: true` と `why` を付ける）にとどめる。作者が書き換えられる手がかりだけで、配布されるコードの critical を消せないようにするため。リポジトリ名・パッケージ名による許可リストは使わない。

- **脅威・ルールの一覧（`string:catalog`）：** dict／オブジェクトリテラルの `description` の値で、同じ dict に `severity`・`risk`・`threat`・`taxonomy`・`cwe`・`mitre`・`remediation`・`mitigation`・`owasp`・`aitech` などのキーがあるものは、攻撃文を引用する一覧の項目とみなす（`ast_py.CATALOG_KEYS`、`js/ast_dump.cjs` の `CATALOG_KEYS`）。TP-*／SK-001 は medium に下げる。否定語はツール説明文と同じく strict で判定する。`name`・`category` だけの dict（ツール定義の一覧）は対象外。**タグ＋隠蔽／認証情報の組み合わせがあれば、従来どおり critical に上げる**（`severity` キーを足しても逃げられない）。
- **出力整形用のタグ：** ツール説明文以外の文字列で、TP-001 のタグが対になって閉じ、その中身が整形の指示（output、format、list、numbers、new lines など）だけで、同じ文字列に隠蔽・認証情報・上書き・送信の語（hide、secret、do not tell、ignore、credential、token、ssh、send、upload、curl、URL など）や TP-002〜005・SK-001 の一致がなければ medium に下げる。
- **Rust・Go の簡易トークナイザー（`lex_spans`）：** 文字列リテラル（複数行の `"..."`、`r#"..."#`、Go の `` `...` ``）とコメント（入れ子の `/* */` を含む）の範囲を求める。文字列内の案内文は `string~` として扱う（RF-001 は low）。ただし同じ文の手前（直前の `;`・`{`・`}` まで）に `Command::new`・`exec` などがあれば下げない。`description =`・`WithDescription(` の直後の文字列は説明文（`string:desc`）とする。
- **正直さを求める「〜と言うな」：** TP-002 の直後が主張（`it will work`、`X is open`、`that ... is impossible` など）で、同じ節に `unless`・`until`・`without verifying` などの確認条件があり、文中に隠蔽・送信・認証情報の語がなく、目的語が `this`・`about ...`・`anything` でないものは medium に下げる（例：「アカウントなしで動くとユーザーに言うな」）。
- **テストのパスを追加：** `__fixtures__/`、`mocks/`、`cypress/`、`playwright/`、`.storybook/`、`*.stories.*`、`*.bench.*`、`*_spec.rb`、`src/test/`、`FooTest.java`／`FooTests.cs` など。`demo*`・`*-docs/` のような名前は配布物の本体であることがあるため、広げていない。

## 使い方
```sh
python3 -I scan.py <dir> [...] [--json summary.json] [--findings findings.jsonl] [--no-ast] [--quiet]
```
- `scan.scan_repo(root)` は v0 と互換で、`(findings, n_files, n_skill_dirs)` を返す（Allowlist Builder が使う）。
- JS/TS の補助プログラムには `js/node_modules/typescript` が必要。`npm install --ignore-scripts` で入れる。入っていなければ、JS/TS は v0 相当の判定になる。
- 環境変数 `ATLAS_TS_PATH`（typescript パッケージのディレクトリ）と `ATLAS_NODE`（node の実行ファイル）で上書きできる。未設定なら従来どおり。
- `cli.py` は argparse 版の入口（`--format text|json`、`--min-severity`、`--show-suppressed`、終了コード 0／1／2）。npm パッケージ `atlas/cli`（`atlas-scan`）がこれを同梱して使う。`cli.py`・`scan.py`・`ast_py.py`・`trust.py`・`js/ast_dump.cjs` を変えたら `cd atlas/cli && npm run sync` でコピーを更新する。

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

## UP-002：公式 MCP Registry の版間差分（`registry_diff.py`）
公式レジストリの版履歴（`/v0/servers/{name}/versions`、名前の `/` は URL エンコード）から2つの版の server.json を取り出して比べる。読むのはレジストリの JSON だけで、何もインストール・実行しない。パッケージを持たない**リモート専用サーバー**は、この版履歴で監視する。

- **UP-002 の条件：** リポジトリ URL が変わった（または消えた）。パッケージの identifier・registryType が追加・変更された。パッケージの版が浮動指定（`latest`、`^1`、`*`、タグなし OCI など）になった。リモート URL のホストが変わった、または新しいホストのリモートが増えた（一時トンネル（trycloudflare.com、ngrok など）・IP 直書き・平文 http は理由に明記）。パッケージの transport が変わった（stdio → http など）。必須かつ secret の環境変数が増えた。説明文・タイトルに TP-001〜005（と OB-001/002）のパターンが増えた。
- **情報のみ：** status が deprecated／deleted に変わった。**根拠として表示するだけ：** 版の更新、説明文の変更（difflib の差分）、同じホスト内の URL 変更、リモート種別（sse ↔ streamable-http）、ヘッダー・引数の変更。
- **`--deep`：** npm／PyPI のパッケージ版が変わっていれば `updiff.diff_package_versions` も実行し、どちらかで該当すれば UP-002。
- **`check` での監視：** 項目の `registry_name`／`x-registry-name`（設定内でも可）、設定の `"//"` コメント（`registry-name: <名前>`）、または `--registry-map 名前=レジストリ名` でレジストリ名を指定する。承認した版は `registry_version`（設定では `x-registry-version`）、なければ state ファイルの `registry` 欄、初回は最新版を基準として記録する。終了コードは従来どおり（0／10／20）。

```sh
python3 -I atlas/allowlist/atlas_watch.py registry-diff io.github.github/github-mcp-server            # 直前の版 → 最新版
python3 -I atlas/allowlist/atlas_watch.py registry-diff <name> 1.0.0 1.1.0 --deep --json d.json --md d.md
python3 -I atlas/allowlist/atlas_watch.py check decisions.json --out-dir watch --registry-map wx=io.github.acme/weather
```

## OCI イメージの検査（`oci.py`）
コンテナイメージを OCI Distribution API（https の読み取りだけ）で取得し、**データとして**検査する。docker・podman などのランタイムは使わず、イメージの中身は一切実行しない。

- **参照の解釈：** `mcp/foo`、`docker.io/mcp/foo:tag`、`ghcr.io/org/img@sha256:...` に対応する。タグが無ければ `latest` とみなし、UP-001（medium、浮動タグ）を出す。digest で固定していないタグは low。
- **認証と通信先：** WWW-Authenticate の Bearer チャレンジに従い、匿名トークンを取る（Docker Hub は `auth.docker.io`、GHCR は `ghcr.io/token`）。通信先は許可リストのホストだけで、リダイレクトも1回ずつ確認する。別ホストへのリダイレクトには認証ヘッダーを付けない。マニフェストリスト／OCI インデックスからは `linux/amd64` を選ぶ（`platform=` で変更可）。
- **config の検査：** Entrypoint・Cmd・WORKDIR・ExposedPorts・Labels を表示する。Env の秘密らしい値は伏せ字にし、CR-003 を出す（既知のトークン形式は high、名前だけ秘密らしいものは medium）。User が空・`root`・`0` なら IN-003（medium、root で動く）。`org.opencontainers.image.source` は `source_repo` として返す（DP-004 に使える）。`history` の `created_by` は IN-003（`curl | sh`、`ADD https://`、`chmod 777`、`--privileged`）と RF-001 で検査する。
- **レイヤー：** 1レイヤー 200 MB 超は取得しない。合計 500 MB で打ち切る（どちらも引数で変更可）。sha256 を照合し、不一致はエラーにする。展開は通常ファイルだけで、シンボリックリンク・デバイス・絶対パス・`..` は書き出さない。whiteout（`.wh.*`、`.wh..wh..opq`）を反映する。
- **検査範囲：** OS ベース全体は検査しない。`/app`・`/srv`・`/opt`・`/usr/src/app`・`/home/*`・WORKDIR・Entrypoint のディレクトリと、MCP パッケージ本体（`node_modules/<pkg>`、`site-packages/<pkg>`。`.venv` の中も含む）だけを `scan_repo(..., skip_dirs=PACKAGE_SKIP_DIRS)` にかける。ファイル一覧はイメージ全体について集計する。
- **OB-006：** アプリのパスにあるネイティブバイナリ（ELF・PE・Mach-O、`.node`、`.so`）を数える。依存パッケージ内のものと Entrypoint 本体は info、アプリ自身のものは medium。

```sh
python3 -I atlas/scanner/oci.py ghcr.io/github/github-mcp-server --json r.json
python3 -I atlas/scanner/oci.py mcp/time --no-layers        # config だけ
```
- 結果の finding は scan.py と同じ形で、`source: "oci"` が付く。zstd 圧縮のレイヤーは Python 3.14 未満では読めないため、`skipped-format` として注記する。

- **v1.1.1：** Rust/Go の文字列で「実行の文脈」を判定するとき、同じ文のうちコード部分だけを見る（コメントと文字列の中身を除く）。対象は `Command::new`・`exec.Command`・`.spawn(` などの実行呼び出しに限った。ドキュメントコメント中の「system」やバッククォートで、案内文が critical に戻るのを防ぐ。

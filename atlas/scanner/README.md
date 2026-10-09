# Atlas scanner v1（v1.3）

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

## v1.2：ホールドアウトで見つかった誤検知の種類への対策
ホールドアウト（`../reports/stage3-holdout.md` §4）の誤検知を**種類の単位で**一般化した規則。ホールドアウトのファイル名・文字列には合わせていない（フィクスチャーはすべて合成）。検証は3つ目の新しい標本で行う。v1.1 と同じく、格下げは medium（`review: true` と `why`）か、明らかに実行されないものだけ low にとどめる。リポジトリ名・所有者・パッケージ名による許可リストは使わない。`scan.SCANNER_VERSION = "1.2"`。

- **(1) データファイル（`DATA_EXT`：.json・.jsonc・.jsonl・.ndjson・.yaml・.yml・.toml）：** TP-*・RF-*・SK-* の一致は、その文字列が MCP マニフェストやツール定義でなければ medium（`why`：「data file (not an MCP manifest/tool definition)」）にする。文字列ごとにキーの経路を求めて判定する（JSON は字句解析、YAML はインデント、TOML は `[table]` と `key =` から求める。どれも実行・import はしない）。
  - **満額のまま残すもの：**
    - ファイル名が `server.json`・`mcp.json`・`.mcp.json`・`manifest.json`・`plugin.json`・`marketplace.json`・`hooks.json`・`smithery.yaml`・`glama.json`・`gemini-extension.json` など（`MANIFEST_NAMES`）のもの。
    - `.claude/`・`.claude-plugin/`・`.cursor/`・`.vscode/`・`.gemini/` などのエージェント設定ディレクトリの中のもの。
    - 経路に `tools`・`prompts`・`resources`・`functions`・`mcpServers`・`mcp` があるもの。
    - 同じオブジェクトに `inputSchema`・`input_schema`・`outputSchema` があるもの、または `name` と `parameters`／`arguments` が並ぶもの（関数呼び出し形式のツール定義）。
    - 経路に `scripts`・`command`・`run`・`postinstall`・`hooks`・`args` などの**実行されるキー**（`EXEC_KEYS`）があるもの。package.json の `mcp`・`bin`・`main` の値。
  - **glama.json などのインストール用メタデータは満額のまま**にした。レジストリやクライアントがその内容でインストールを実行するため、そこに書かれた `curl | sh` は実行される文字列だからである。ホールドアウトでも、これらは誤検知ではなく「実在するが正当」に分類されていた。
  - JSON として読めないときは、ファイル全体に `inputSchema`・`mcpServers` があればマニフェスト扱いにする。
- **(2) 検出ルール・コーパスの集まり（AST、Python と JS/TS）：** ツールの説明文**以外**の文字列で、次のどちらかに当てはまるものは medium（`why`：「detection rule / corpus data」）にする。
  - **同じリテラルに攻撃句が並ぶ：** 一番外側の list／tuple／set／dict（JS の配列・オブジェクト）の中で、TP/RF/SK に一致する文字列が**9件以上**（自分＋兄弟8件以上、`CORPUS_MIN_STRINGS`）ある。
  - **名前が検出データを示す（`string:corpus`）：** そのリテラルを受ける変数名・キー名を単語に分け（snake・camel・大文字）、pattern(s)・regex・signature・rule(s)・vector(s)・corpus・sample(s)・payload(s)・expected・fixture(s)・blocklist・denylist のどれかを含む（`ast_py.CORPUS_WORDS`）。または、すぐ外側の dict に期待結果のキー（`expected*`・`verdict`・`ground_truth`・`is_malicious`・`should_block` など、`EVAL_KEYS`）がある。
  - **説明文への流れ込みを確認する：** 変数が `description=`・`{"description": X}`・`server.tool(name, X)`・`FOO_DESCRIPTION = X` に使われていれば、パターンともコーパスとも扱わない。これは v1 の「`rules = "..."` という名前の変数はパターン扱いで抑制」の穴も塞いでいる（v1.2 からは説明文として判定する）。
  - **説明文と期待結果のキー：** 期待結果のキーと並ぶ `description` の値は、v1.1 の脅威カタログ（`string:catalog`）として medium にする。タグ＋隠蔽／認証情報の組み合わせは、従来どおり critical に上げる。
- **(3) Rust のインラインテスト：** v1.1 の字句解析で文字列とコメントを除いたうえで中括弧の対応をとる。`#[cfg(test)]`（`all(test, …)` を含む）が付いた mod／fn と、`#[test]`・`#[tokio::test]` などが付いた fn の範囲にある検出は、文脈を `test` にする（`ctx_why` を付ける）。範囲の外、たとえばテストモジュールの後ろにある通常の関数は src のまま。Go の `_test.go` は従来どおり test。
- **(4) 表示用の不可視文字（OB-001）：** CSS・SCSS・Less の `content:` の値の中、または圧縮されたファイル（`*.min.*`、または1行1,000文字超の CSS／JS）にあるものは low（「presentational character in stylesheet / minified bundle」）にする。JS のツール説明文（`string:desc`）の中にあるものは対象外で、high のまま。
- **(5) setup.py の IN-002：** AST で setuptools／distutils の `setup()`（`from setuptools import setup`、`setuptools.setup(...)`、`distutils.core.setup` と別名）を呼んでいるかを確かめる。呼んでいなければ、pip が実行するインストールスクリプトではない（例：CLI の `setup` サブコマンドのモジュール）。この場合は info にし、`suppressed: true` と理由を付ける。構文エラーで読めないときは、文字列から判定する。
- **見送ったもの：** 攻撃句を3つ以上例として並べる docstring の格下げ。FastMCP では docstring がそのままツールの説明文になるため、例として引用しているのか本物の毒入れなのかを区別する確かな手がかりがない。

**回帰テスト：** `tests/fixtures/v12/` に、仕組みごとの誤検知の形と、それに似た攻撃の形を合成して置いた。攻撃の形の例は次のとおり。
- JSON の `tools[].description`、関数呼び出し形式の定義、YAML の `tools:`、server.json、package.json の `postinstall`
- `rules` という名前の攻撃文字列を `description=` に渡すもの、毒入れした説明文が9件並ぶツール一覧
- `expected` キーを足しても critical のままになるタグ＋`~/.ssh`
- `#[cfg(test)]` の後ろにある通常の関数
- JS のツール説明文にあるゼロ幅空白
- 本物の setuptools の setup.py

## v1.3：high/critical を出す条件を「エージェントに届く場所」に限る
3つの標本（`../reports/stage3-validation.md` §3・§4）から、公式レジストリの無作為標本には攻撃型パターンがほとんど無く、high/critical の多くが誤った警告になることが分かった。v1.3 では、誤検知の形を1つずつ塞ぐのではなく、**high/critical を出す条件そのもの**を変えた。v1.1・v1.2 と同じく、格下げは medium（`review: true` と `why`）か、明らかに能力表示にすぎないものだけ low にとどめ、検出は消さない。リポジトリ名・所有者・パッケージ名による許可リストは使わない。フィクスチャーはすべて合成（`tests/fixtures/v13/`）で、ホールドアウトと検証用の標本のファイル名・文字列には合わせていない。`scan.SCANNER_VERSION = "1.3"`。

- **(1) TP-001〜005 と SK-001 の high/critical は、エージェントに届く場所に限る。** 届く場所は次のとおり。
  - ツールの説明文（`string:desc`。docstring、`description=`、`server.tool(name, desc)`、`mcp.WithDescription(...)` など）。**変数経由の説明文**も含む。v1.3 からは、名前が何であっても、`description=`・`{"description": X}`・`server.tool(name, X)`・`add_tool(..., description=X)` に使われる変数に代入した文字列を説明文として扱う（v1.2 ではパターン名・コレクションだけだった）。
  - SKILL.md と skill の文脈（従来どおり）。マニフェストとツール定義（v1.2 のデータファイルの判定を流用）。
  - **モデルへ送るプロンプトの組み立て（`string:prompt`）。** AST で判定する（`ast_py.py` の `prompt_ctx`、`js/ast_dump.cjs` の `promptCtx`）。対象は次のとおり。
    - `messages`・`system`・`prompt`・`instructions`・`content`・`system_prompt`/`systemPrompt` などのキーやキーワード引数の値（`ast_py.PROMPT_KEYS`）。
    - `role: "system"`（または `"developer"`）を持つオブジェクトの値。
    - LLM 呼び出し（`.create(`・`.chat(`・`generate*(`・`generateText(`・`.invoke(`・`.complete(`・`create_message(` など、`ast_py.LLM_CALL`）の引数。
    - `system_prompt`・`SYSTEM_PROMPT`・`*_PROMPT`・`PROMPT_TEMPLATE`・`*_INSTRUCTIONS` など、プロンプトの語で**終わる**名前の変数への代入（`ast_py.PROMPT_NAME`。`PROMPT_INJECTION_SAMPLE` や `promptUser` は対象外）。
    - 上のどれかで使われる変数への代入（例：`system = "..." + page` を `create(system=system)` に渡す）。名前が `build_prompt`・`get_system_prompt` のような関数の戻り値。
    - Go・Rust など AST の無い言語では、字句解析で同じ文の直前のコードを見る（`string:prompt~`。`Content:`・`systemPrompt :=`・`.content(` や、閉じていない `.Create(`・`.Chat(` の呼び出し、`ChatMessageRoleSystem`）。
  - それ以外の文字列リテラルとコメントの中の TP 系（コード系の拡張子のファイルに限る）は medium にする（`why`：「string outside agent-reaching locations (may be a quote, example or data); review」＝エージェントに届く場所の外にある文字列（引用・例・データの可能性））。文字列の外にある一致（`loc: code`。例：`open(... "~/.ssh/id_rsa")` という実際の読み取り）と、`.claude/`・`hooks/` などフックやエージェント設定のディレクトリにあるコードは、出力がエージェントに届くため対象外とした。
- **(2) プロンプトの中の防御文。**
  - 否定語の判定：プロンプトの中では、直前の強い否定（v1.0 の strict）なら抑制、v1.0 の広い否定語・引用の判定（`such as`・`e.g.`・`like` など）に当たれば medium にする（`why`：「negated or cited as an example inside a prompt」）。プロンプトの中では `e.g.`・`i.e.` を文の終わりとみなさない。
  - 一般的な規則を追加した（`defensive_override`、TP-003 のみ）：同じ文に「ignore／disregard／do not follow ＋ such／any／embedded／untrusted … instructions」や「instructions embedded in／found in documents」「treat it as data」があり、かつ一致した句が文頭の命令（`Ignore previous instructions and ...`、`IMPORTANT: ignore ...`、`Please ignore ...`）でなければ medium にする。ツールの説明文には適用しない。
  - **攻撃文は high のまま：** 取得したデータを `system` プロンプトに連結し、文頭で「Ignore all previous instructions」と命じたり「Do not tell the user about this step」と書いたりするものは high。プロンプトの中で `<IMPORTANT>` ＋ `~/.ssh` などが揃えば critical に上げる（ツールの説明文と同じ。ただし既に格下げされた検出は上げない）。
- **(3) few-shot の例（`string:example`）は medium。** `examples`・`few_shot`・`shots`・`demos` という名前のコンテナ、`input`/`output`（`query`/`answer` など）の組を持つレコード、プロンプト文字列の中で直前に `Example:`・`Examples:`・`Input:`・`Q:` のラベルがあり、その間に空行が無いもの。**ツールの説明文の中は除く**（説明文に `Example:` と書いても critical のまま）。ラベルから段落が変わった後の命令は high のまま。
- **(4) CR-001 を Go にも揃えた。** `os.Environ()` は、同じ関数の中で、その結果（代入した変数、`range` のループ変数、ループ内で詰め替えた map／slice）が `json.Marshal`・`fmt.Print*`/`Fprint*`・`log.*`/`slog.*`・`http.*`・`.Write*`・`.Encode`・`os.WriteFile` などに渡るときだけ high にする（字句解析。文字列とコメントは伏せてから調べる）。`cmd.Env = append(os.Environ(), ...)` などの子プロセスへの引き継ぎ、`strings.HasPrefix` などで名前を選ぶ走査、それ以外の使い方は low（`badge: env-access`、能力表示）。文字列やコメントの中の `os.Environ()` は抑制する。
- **(5) テストのパスを追加：** `scripts/test-*.{js,mjs,cjs,ts,py}`（`scripts/test_*` も）、`*-test.*`（`stress-test.*` を含む）、`*.test-*.*`、`test_*.{mjs,cjs,js,ts}`。`test` が単語として区切られている場合だけで、`latest.js`・`contest.ts`・`attestation.ts`・`testimony.js` は拾わない。
- **既存テストの変更：** v1.1 の「出力整形タグの近い攻撃形」（`format_tag.py:8`・`format_tag.ts:10`）と v1.2 の「Rust のテスト範囲の外」（`scan.rs:4`・`:30`）は、どれも関数が返すだけのただの文字列なので、v1.3 では medium（上の why）になる。テストは「v1.1 の格下げ規則が働いていない」「ctx が src のまま」「抑制されていない」ことを確かめる形に直した。同じ文字列が説明文やプロンプトにあれば high/critical のまま残ることは `V13Mechanisms` で確かめている。
- **チューニング用の標本：** 攻撃型 17/17、陽性対照 18/18、誤検知 0 を維持した（v1.2 と同じ24件が範囲内）。この標本では v1.2 の時点で誤検知が0件だったため、v1.3 の効果は4つ目の新しい無作為標本で測る。

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

# Atlas Allowlist Builder（試作）

MCP 設定またはスキル一覧を読み込み、scan-rules-v0 の信頼スコア（`atlas/scanner/trust.py`）で項目ごとに根拠付きの判定を出す。そのうえで、**人が承認した項目だけ**から許可リストを生成する。Python 3.13、標準ライブラリのみ。

判定文は「パターンを検出（pattern detected）」と表記し、意図の判断はしない。

## 使い方

```sh
cd atlas/allowlist
# 評価（ネットワークなし。atlas/data/index.json があれば参照する）
python3 -I atlas_allowlist.py evaluate path/to/.mcp.json --json report.json
python3 -I atlas_allowlist.py evaluate path/to/skills-dir          # SKILL.md を含むディレクトリ
python3 -I atlas_allowlist.py evaluate skills.json                 # [{"name","source"}]
python3 -I atlas_allowlist.py evaluate cfg.json --fetch            # npm/PyPI のメタデータ取得と浅いクローン

# 生成（承認した項目だけを出力）
python3 -I atlas_allowlist.py build report.json --approve filesystem,github --out-dir out --by "山田"
python3 -I atlas_allowlist.py build report.json --approve-recommended --out-dir out
#   拒否推奨（deny）の項目を承認するには --allow-deny が必要。上書きとして decisions.md に記録する。

# Web UI（127.0.0.1 のみで待ち受け。--fetch は既定でオフ）
python3 -I web.py --port 8765        # http://127.0.0.1:8765/

# テスト
python3 -I -m unittest discover -s tests -v
```

- **入力：** `mcpServers` 形式（`.mcp.json`、`managed-mcp.json`、Claude Desktop）と `servers` 形式（VS Code `mcp.json`）。
- **推奨：** A/B は承認推奨（approve）、C は要レビュー（review）、D/F または隔離は拒否推奨（deny）。
- **index.json：** `{"generated", "entries":[{"repo","packages":["npm:…","pypi:…","oci:…"],"commit","findings","files"}]}`。任意で `license`、`osv_ids`、`provenance`、`maintenance` も読む。

## 追加した設定レベルのルール

| ID | 重大度 | 内容 |
|---|---|---|
| ATL-UP-001 | medium | 起動設定のバージョンが固定されていない（`npx -y pkg`、`@latest`、範囲指定、`uvx pkg`、`:latest`、タグなしのイメージ） |
| ATL-PL-002 | high | git ソースの参照が可変（コミット SHA がない） |
| ATL-CR-003 | high | env、headers、args、url にシークレットが直書きされている（AKIA、ghp_、sk-ant-、xoxb-、PEM など） |
| ATL-CR-005 | medium | 認証情報らしいキーにリテラル値が入っている |
| ATL-CE-005 | medium | シェル経由で起動している（`bash -c` など） |
| ATL-NW-006 | high | localhost 以外への平文 `http://` |
| ATL-NW-007 | high | 一時トンネルのホスト（trycloudflare、ngrok など） |
| ATL-NW-008 | medium | IP アドレスを直接指定している |
| ATL-PM-004 | high | `docker --privileged`、ホスト側 `/` のマウント、host ネットワーク |

コマンドライン全体には、既存スキャナーの any/text ルールも適用する。これで RF-001（`curl | sh`）、SK-001、NW-002 などを検出する。

- 検出したシークレットは、レポートにも生成ファイルにも残さない。値は `${VAR}` に置き換える（managed-mcp.json は全ユーザーが読めるため）。

## 出力形式（2026-10-08 に公式ドキュメントで確認）

| ファイル | 中身 | 配置先 | 根拠 |
|---|---|---|---|
| `managed-mcp.json` | `{"mcpServers": {...}}`。`.mcp.json` と同じ形式。承認したサーバーに限る | macOS `/Library/Application Support/ClaudeCode/`、Linux/WSL `/etc/claude-code/`、Windows `C:\Program Files\ClaudeCode\` | https://code.claude.com/docs/en/managed-mcp |
| `claude-managed-settings.json` | `allowManagedMcpServersOnly: true` と `allowedMcpServers`（`serverCommand` の配列による完全一致、または `serverUrl`） | 同じディレクトリの `managed-settings.json`（または `managed-settings.d/`）にマージする | https://code.claude.com/docs/en/managed-mcp 、https://code.claude.com/docs/en/managed-settings |
| `copilot-managed-settings.json` | `allowedMcpServers`（同じマッチャー構文。`serverCommand` は配列） | 組織の `.github-private` リポジトリの `copilot/managed-settings.json` にマージする。Copilot アプリ、Copilot CLI、VS Code に適用 | https://github.blog/changelog/2026-08-06-mcp-allowlists-in-enterprise-managed-settings 、https://docs.github.com/en/copilot/reference/enterprise-administrators/enterprise-managed-settings 、https://docs.github.com/enterprise-cloud@latest/copilot/how-tos/administer-copilot/manage-for-enterprise/manage-agents/configure-enterprise-managed-settings |
| `decisions.md` | 監査ログ（承認者、日時、承認・不承認と理由、根拠、上書き） | ― | ― |
| `approved-skills.json` | 承認したスキル。Atlas 独自の形式 | ― | 公式のスキル許可リスト形式は確認できていない |

- **2つの導入パターン：**
  - managed-mcp.json は「固定配布（排他制御）」。
  - managed-settings の allowlist は「承認済みカタログ」。
  - どちらか一方を選ぶ。両方を置いても矛盾はしない。ただし ${VAR} を含まない managed-mcp.json のサーバーには allowlist が適用されない（v2.1.259 以降）。
- **`serverName` を出力しない理由：** ドキュメントによれば、名前はユーザーが付けるラベルにすぎず、セキュリティ制御にならない。
- **確認できなかった点：**
  - Copilot の `overridable` でラップしたときの MCP リストの JSON 例。
  - VS Code 単体の `chat.mcp.access`（レジストリ方式）の正確な値。

## 制限

- **信頼スコアの上限：** 出所情報（インデックスの一致、npm attestation、OSI ライセンス）がないと最大でも C（約64点）になる。インデックスに載っていない項目は、ほぼ「要レビュー」になる。
- **リモート専用サーバー：** URL しか見ないので「静的検査なし」と表示する。OCI イメージの中身とローカルのコマンドも検査しない。
- **`--fetch`：**
  - 公開されているリポジトリ URL を信じてクローンする（パッケージ内容との照合 DP-004 は v1）。
  - バージョンのタグが見つからなければ既定ブランチを検査する。
  - インストール、ビルド、実行、npm/pip/uvx/docker の起動はしない。
  - git は hooks を無効にし、LFS の smudge をオフにし、https 以外を拒否する。
- **未実装：** OSV の照会、UP-002（版間の差分）。
- **Web UI：** 認証はない。127.0.0.1 だけで待ち受け、Host ヘッダーを検査し、JSON 以外の POST は拒否する。

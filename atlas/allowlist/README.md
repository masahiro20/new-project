# Atlas Allowlist Builder（試作）

MCP 設定またはスキル一覧を読み込み、scan-rules-v0 の信頼スコア（`atlas/scanner/trust.py`）で項目ごとに根拠付きの判定を出す。そのうえで、**人が承認した項目だけ**から許可リストを生成する。Python 3.13、標準ライブラリのみ。

判定文は「パターンを検出（pattern detected）」と表記し、意図の判断はしない。

## 使い方

```sh
cd atlas/allowlist
# 評価（既定はネットワークなし。atlas/data/index.json があれば参照する）
python3 -I atlas_allowlist.py evaluate path/to/.mcp.json --json report.json
python3 -I atlas_allowlist.py evaluate path/to/skills-dir          # SKILL.md を含むディレクトリ
python3 -I atlas_allowlist.py evaluate skills.json                 # [{"name","source"}]
python3 -I atlas_allowlist.py evaluate cfg.json --osv              # OSV だけ照会（api.osv.dev）
python3 -I atlas_allowlist.py evaluate cfg.json --fetch            # 公開パッケージ取得＋リポジトリ照合（DP-004）＋OSV
python3 -I atlas_allowlist.py evaluate cfg.json --policy policy.json

# 生成（承認した項目だけを出力）
python3 -I atlas_allowlist.py build report.json --approve-recommended --out-dir out --by "山田"
python3 -I atlas_allowlist.py build report.json --approve filesystem,github --out-dir out --by "山田" \
    --reason github="シークレットは Vault に移した（SEC-123）"
#   approve 以外の項目を承認する（上書き承認）には項目ごとに --reason が必須。
#   deny の項目はさらに --allow-deny が必要。

# Web UI（127.0.0.1 のみ。--osv / --fetch は既定でオフ）
python3 -I web.py --port 8765        # http://127.0.0.1:8765/

# テスト（ネットワーク不要。取得・clone・OSV はモック）
python3 -I -B -m unittest discover -s tests -v
(cd ../.. && python3 -I -B -m unittest discover -s atlas/scanner/tests -v)
```

- **入力：** `mcpServers` 形式（`.mcp.json`、`managed-mcp.json`、Claude Desktop）と `servers` 形式（VS Code `mcp.json`）。
- **index.json：** `{"generated", "entries":[{"repo","packages":["npm:…","pypi:…","oci:…"],"commit","findings","files"}]}`。任意で `license`、`osv_ids`、`provenance`、`maintenance` も読む。

## 推奨の決め方（ポリシー）

1. OSV の `MAL-*`（隔離・Trust 0）、または src/skill/起動設定に critical がある → **deny**。
2. 等級で決める：A/B → approve、C → review、D/F → deny。docs・テスト・例・CI に critical がある → 自動で拒否はしないが、少なくとも **review** にして理由を表示する（本部承認 2026-10-08）。
3. 起動設定またはスキルに high がある → 少なくとも **review**（自動承認しない）。ポリシーで deny にもできる。
4. approve には検証済みの出所が必要：DP-004 が clean（`repo_matches_package`）か npm attestation。なければ review。出所情報がないと点数上も最大 C（約64点）。

`policy.json`（Web UI ではセレクトで同じ設定）：

```json
{"high_in_skill_or_launch": "review", "require_provenance_for_approve": true}
```

`high_in_skill_or_launch` は `"review"` か `"deny"`。使ったポリシーは report.json と decisions に記録する。

## 上書き承認（Overrides）

- approve 以外の項目を承認するには理由が必須。CLI は `--reason 名前="理由"`、Web UI はチェックすると理由欄が出る。理由がなければエラー。
- `decisions.md` の「Overrides / 上書き承認」に、承認者・日時・理由・等級・点数・主な検出を記録する。
- `decisions.json`（機械可読）にも同じ内容を記録する。項目ごとに `decision`、`override`、`reason`、`config`、`packages` を持つ。`atlas_watch.py check decisions.json` がこれを読む。

## `--osv` / `--fetch`（ネットワークは読み取りだけ）

- **OSV（`atlas/scanner/osv.py`、ATL-DP-002）：**
  - `querybatch` で照会する。`next_page_token` をたどり、結果はメモリにキャッシュする。通信に失敗したら `unavailable` と表示し、処理は止めない。
  - 固定版は名前＋版で、固定していなければ名前だけで照会する（`MAL-*` はどの版でも適用）。
  - `MAL-*` → critical。表題は「Listed as malicious in OSV (MAL-…)」で、この語を使うのはここだけ。Trust 0・隔離・deny になる。
  - 固定版に影響する既知の脆弱性 → high。
  - 直接依存（`--fetch` 時。package.json の `dependencies`、PyPI の Requires-Dist / pyproject）：`MAL-*` → critical（隔離）。脆弱性は info（版は範囲の下限で推定）。
  - **実データで確認（2026-10-08）：** npm `postmark-mcp` → `MAL-2025-47604`（「Malicious code in postmark-mcp (npm)」、1.0.16 から）。
- **`--fetch`（`--osv` を含む）：**
  - `pkgfetch` で公開アーカイブをデータとして展開する。宣言されたリポジトリは版のタグ（`v1.2.3`、`pkg@1.2.3` など。`git ls-remote` で探す）で浅くクローンし、なければ既定ブランチを使う。
  - **DP-004（`atlas/scanner/dp004.py`）：**
    - パッケージの preinstall/install/postinstall がリポジトリにない、または違う → **high**。
    - ソース系ファイル（.js/.mjs/.cjs/.ts/.py/.sh。dist/、build/、リポジトリにない lib/、*.map、*.d.ts、*.min.js、egg-info などは除く）がパッケージにしかない、または内容が違う → **medium**。件数と最大10件の例を出す。
    - ビルド出力しかない → info「not comparable」。
  - リポジトリがない、または到達できない → **ATL-DP-005 low**。100件の試験では、レジストリのリポジトリ URL の約15%に到達できなかった。
  - 公開パッケージそのもの（利用者が実際に入れるもの。dist/ も含む）も `scan_repo` で検査し、`source: "package"` を付ける。リポジトリと同一のファイルや、同じ検出は除く。
  - 出所の根拠行：`repo_matches_package`（DP-004 が clean のときだけ true）、`provenance_attested`（npm `dist.attestations`）、`osi_license`、`pinned_launch`。

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

- **リモート専用サーバー：** URL しか見ないので「静的検査なし」と表示する。OCI イメージの中身とローカルのコマンドも検査しない。
- **`--fetch`：**
  - インストール、ビルド、実行、npm/pip/uvx/docker の起動はしない。
  - git は hooks を無効にし、LFS の smudge をオフにし、https 以外を拒否する。
  - TypeScript など、ビルド出力しか公開しないパッケージは DP-004 で照合できない（not comparable）。この場合は attestation がないと approve にならない。
  - PyPI の attestation はまだ読まない。
- **OSV：** 依存の版はロックファイルがないため推定（範囲の下限）。推移的な依存は見ない。
- **UP-002（版間の差分）：** `atlas_watch.py` で実装済み（`check decisions.json`）。
- **Web UI：** 認証はない。127.0.0.1 だけで待ち受け、Host ヘッダーを検査し、JSON 以外の POST は拒否する。

## OCI イメージ（`--fetch`）
- `docker run ... <image>` の起動設定では、`--fetch` を付けると `atlas/scanner/oci.py` でイメージを**データとして**読む。コンテナは起動しない。
- 読む内容：
  - イメージ設定（Entrypoint、User、Env、ラベル、ビルド手順の履歴）
  - アプリ層（`/app`、WORKDIR、パッケージのフォルダなど）
- 判定の表示は `oci-scanned` になる。
- 出所の扱い：
  - Docker Hub の `mcp/*` は、名前空間を確認済みとして扱う。
  - ダイジェスト（`@sha256:`）で固定していれば、起動設定は固定済み（pinned）とみなす。


# Atlas（P5）— 企業向け MCP／スキル許可リスト（ステージ2 試作・非公開）

MCP サーバーとエージェントスキルを**静的に**検査し、根拠付きで判定する。そのうえで、承認したものだけで Claude Code と Copilot / VS Code の許可リストを生成する。検査対象のコードは**決して実行しない**。

| ディレクトリ | 中身 |
|---|---|
| `scanner/` | スキャナー v1（正規表現の候補 → Python `ast` と TypeScript パーサーで文脈を判定）、信頼スコア（`trust.py`）、コーパスの取得、インデックスの生成、テスト |
| `allowlist/` | Allowlist Builder（CLI ＋ 127.0.0.1 だけで動く Web UI）。詳細は `allowlist/README.md` |
| `data/index.json` | 100件を検査した結果のインデックス。Builder が参照する |
| `reports/` | 100件試験のレポート（`stage2-scan-100.md`）、ルール別の表、リポジトリ別の CSV、対象一覧 |
| `docs/lp.md` | LP 原稿（下書き。公開にはオーナーの承認が必要） |

**判定の文言：** 判定は「パターンを検出（pattern detected）」と書く。「マルウェア」とは書かない。例外は OSV の `MAL-*` だけ。

```sh
(cd atlas/scanner/js && npm install --ignore-scripts)        # JS/TS パーサー（無い場合は Python の AST だけで動く）
python3 -I atlas/scanner/scan.py <repo_dir>                   # 検査
python3 -I -m unittest discover -s atlas/scanner/tests        # スキャナーのテスト
cd atlas/allowlist && python3 -I -m unittest discover -s tests
python3 -I atlas_allowlist.py evaluate examples/demo.mcp.json --index ../data/index.json --json r.json
python3 -I atlas_allowlist.py build r.json --approve-recommended --out-dir out
python3 -I web.py   # http://127.0.0.1:8765/
```

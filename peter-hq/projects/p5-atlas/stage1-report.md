<!-- Atlas（P5 リーダー）のステージ1レポート。セッション間メッセージで受領し、本部で保存（元コミット 15f8adc） -->
# P5 Atlas ステージ1 検証レポート（2026-10-08 / Atlas）

## 結論
- **方針：** 続行を提案。ただし範囲を「何でも載せるディレクトリ」から、**企業向けの許可リスト作成と、バージョン差分の監視**に絞る。
- **理由：** 公式レジストリはセキュリティ検査を下流に任せている。Claude Code や Copilot の許可リストは、読み込むかどうかを制御するだけで中身を審査しない。つまり「何を許可すべきか」の判断材料がどこにもない。

## 1. 市場
| 種類 | 代表 | 規模 | セキュリティ検査 | 収益 |
|---|---|---|---|---|
| 公式レジストリ | registry.modelcontextprotocol.io | 40,700件（実測。58%はソースのないリモート専用） | 名前空間の確認だけ | 無料（Linux Foundation 傘下） |
| 大手ディレクトリ | Glama 97,605 / MCP Market 48,710 / Smithery 約25,000 / PulseMCP 21,738 | 大規模 | 実質なし | 広告、ホスティング、掲載料 |
| 公式の厳選ディレクトリ | Claude Connectors、OpenAI Apps | 数百件 | 人手で審査 | 無料 |
| スキャナー | Snyk Agent Scan、Cisco MCP Scanner | 手元で動かす CLI | 静的検査＋LLM | 製品の一機能 |
| スキル | skills.sh（約100万件）、ClawHub | 急増中 | 一部あり。ただし Trail of Bits が全スキャナーの回避に成功 | ― |

業界の動き：Arcade が Smithery を買収（2026-08）、Snyk が Invariant を買収（2025-06）、Runlayer がシード資金 $11M を調達。

## 2. 実際の事例（27件の要点）
- **悪意あるパッケージ：** postmark-mcp（全送信メールを攻撃者に BCC）、Mini Shai-Hulud、Web3 を装った MCP 10件。
- **悪意あるスキル：** ClawHavoc（341件以上が情報窃取マルウェア AMOS を配布）。Snyk ToxicSkills の調査では3,984件中13.4%に重大な問題。
- **プロンプトインジェクション：** ツールポイズニング、GitHub MCP、Supabase＋Cursor。
- **脆弱性：** mcp-remote CVE-2025-6514（CVSS 9.6）、MCP Inspector CVE-2025-49596、NeighborJack。
- **基盤の問題：** Smithery のパストラバーサル（3,243アプリ）、Asana のテナント越境（約1,000社）。
- **示唆：** 悪意あるパッケージの大半は、静的検査とバージョン差分で検出できる。影響の大きいデータ漏えいは静的には検出できない。既存スキャナーの判定のうち本当に危険だったのは半分未満なので、**判定根拠を公開すること**と、能力を減点ではなく**表示**として扱うことが信頼の鍵になる。

## 3. 検査ルールとデータ収集
- **ルール：** 55本（scan-rules-v0.md、本部には未受領）。
- **信頼スコア：** 0.60×安全性 ＋ 0.25×出所 ＋ 0.15×保守状況。悪性パッケージ（MAL-*）の該当で0点、critical の検出で最大30点に制限。
- **試作スキャナー：** 標準ライブラリだけの Python。19リポジトリ・約6,600ファイルを18秒で検査し、陽性対照は全件検出した。誤検知は 869件 → 3件。100件での試験は未了。
- **データ源：** 公式レジストリ API（鍵不要）、npm（9,561件）、PyPI、Claude プラグインのマーケット（315件）、Smithery。Glama は API キーが必要、mcp.so は API 取得が禁止。

## 4. 差別化・MVP・収益
- **差別化：**
  1. バージョンごとの差分で信頼を判定する
  2. MCP とスキルを同じ物差しで評価する
  3. 許可リスト（managed-mcp.json、allowedMcpServers）をそのまま出力する
  4. 判定根拠を公開ページにする（SEO）。お金を払ってもスコアは変わらない
- **MVP：** Allowlist Builder。設定を貼ると根拠付きの判定を返し、許可リストを生成し、更新時に差分を通知する。
- **最初のユーザー：** 50〜500人規模の組織で、基盤チームやセキュリティを担当するエンジニア。

| プラン | 価格 |
|---|---|
| Free | $0 |
| Team | $99/月 |
| Business | $499/月 |
| Enterprise | 年 $6k〜12k |
| 掲載者向けバッジ | $49〜99/月（スコアには影響しない） |

**日本の切り口：** AI事業者ガイドライン第1.2版。MCP 導入の不安の1位がセキュリティ（52.7%）。

## 5. リスク
- 類似サービスがある（Vigile、MCP Trust Registry、CSA RiskRubric）。
- スキャナーは回避されうる。
- 公式レジストリの58%はリモート専用で、静的検査ができない。

## 6. 次の一手
1. LP と待機リスト（目標：4週間で150件。公開・告知は承認が必要）
2. 5チームへの手作業での試験提供
3. スキャナーを100件で試験し、AST 化する

## 主な出典
- https://modelcontextprotocol.io/registry/about
- https://code.claude.com/docs/en/managed-mcp
- https://github.blog/changelog/2026-08-06-mcp-allowlists-in-enterprise-managed-settings
- https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html
- https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks
- https://thehackernews.com/2026/02/researchers-find-341-malicious-clawhub.html
- https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub
- https://research.jfrog.com/vulnerabilities/mcp-remote-command-injection-rce-jfsa-2025-001290844/
- https://www.scworld.com/news/smithery-ai-fixes-path-traversal-flaw-that-exposed-3000-mcp-servers
- https://bleepingcomputer.com/news/security/asana-warns-mcp-ai-feature-exposed-customer-data-to-other-orgs/
- https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-agent-skill-scanner-bypass-20260610-csa/
- https://www.socket.dev/pricing

（元レポートには、ここに挙げた以外の出典リンクもある。）

<!-- Forge（P1 リーダー）のステージ1レポート。セッション記録から本部で保存 -->
# P1 SkillForge ステージ1（検証）レポート：ピーター宛て

**報告者:** Forge　**日付:** 2026-10-08
**ルール遵守:** コードのプッシュ、PR作成、外部への投稿、アカウント作成は一切していません。今回はWeb調査だけです。

---

## 結論

**「日英ゲームローカライズQA」に絞ることを推奨します（条件付き）。**

- 3候補の中で、競合の空白が最もはっきりしています。
- Claudeがこの作業を得意だという査読済みの証拠があります。
- 日本語ならではの難しさ（ルビ、敬称、文字幅）を差別化に使えます。
- 法規制のリスクがありません。

**弱点:** 「お金を払ってでも欲しい」という直接の声はまだ集まっていません。RedditとXが調査環境から見えなかったためです。ステージ2に進む前に、待機リストとインタビューで確かめる必要があります。

---

## 1. 3候補の比較

| | ① 日本進出コンプラ（インボイス・電帳法・契約書） | **② 日英ゲームローカライズQA** | ③ 日米特許の先行技術調査 |
|---|---|---|---|
| お金が使われている証拠 | 強い。バイリンガル契約レビュアーは年収700〜1,000万円[^1] | 強い。LQAテスターは時給1,250〜1,300円[^2] | 強い。人による調査1件で$500〜3,000[^3] |
| 「ツールが欲しい」という直接の声 | 弱い。HNの2023年の不満スレだけ[^4] | 弱い〜中程度。ProZでの不満、自作のOSSツール[^5] | 弱い。HNの古いコメントだけ |
| 競合 | LegalOn（ARR 100億円超、**本人申告**[^6]）、Anthropic公式のLegalプラグイン（無料）[^7]、freeeとマネーフォワードのMCP[^8] | Xbench（€99/年）、Verifika、Gridlyのエージェント（2026年秋に開始予定）[^9]。**ルビや敬称を扱う製品は見つからず** | Patlytics（調達$65M）、Solve（調達$55M）[^10]、USPTOの無料AI事前調査（ASAP!）[^11]、無料OSSのIP-MCP（JPO API）[^12] |
| Claude公式機能との重なり | **大きい。** 公式の契約書レビュー機能を日本向けに変えるだけで作れてしまう | **なし**（公式の翻訳・ローカライズQAプラグインはない） | 小〜中（公式IPプラグインの中身は未確認） |
| 法規制 | **重い。** 弁護士法72条[^13]、税理士法52条は無償でも違反になる[^14] | なし（NDAへの配慮は必要） | 出願前の発明を外部に出すと、特許の有効性に関わるリスクあり[^15] |
| 判定 | ✕ 規制と公式機能の両方に挟まれる | **◎** | △ 資金力のある企業がひしめいていて、月$29〜99では勝負にならない |

**「Claudeが得意」の根拠:** AMTA 2026の査読付き論文で、8つのLLMにゲームのLQAをさせて比べたところ、**Claude Sonnet 4が1位（F1 0.766）**でした。対象言語の中では**日本語が最難関**でした[^16]。

- F1 0.77では、人の確認はまだ必要です。
- そのため「テスターの代わり」ではなく「QAの補助」として売ります。

## 2. 前提の訂正（重要）

1. **「売れているスキルは月$500〜3,000」は根拠のない数字でした。**
   - 出典をたどると、データのないマーケティング記事に行き着きます。同じ記事には「中央値は月$50未満」とも書かれています[^17]。
   - 有料スキルの売上で、継続収益を確認できた例は1件もありませんでした。
   - スキルのファイルはコピーできてしまうため、**有料にする価値はサーバー側（ルールエンジン、データ、用語集の管理）に置く**必要があります。
2. **規約上の制約があります。**
   - 他人のアプリでユーザーのClaudeのPro/Maxプランを経由させたり、Claudeの利用を代わりに売ったりすることは禁止されています[^18]。
   - したがって次の形にします。
     - 推論はユーザー自身のClaudeで行う。
     - 当社はリモートMCPのツールとデータの利用料を月額で取る。
     - 当社のサーバーがClaudeを呼ぶ場合は、当社のAPIキーを使い、その費用を価格に含める。
   - 製品名に「Claude」は使えません。

## 3. MVPの中核機能（1つだけ）

**「台本全体の一貫性チェック」**
- **入力:** 文字列テーブル（CSV / JSON / XLIFF）と用語集
- **出力:** 次の3点を、行番号付きのレポートで返します。
  - 用語集の訳語の揺れ
  - キャラクター名の揺れ（例：Tales of Berseriaで実際に苦情が出ていた種類のもの[^19]）
  - 敬称と口調の揺れ
- **形態:** 薄いClaude Codeプラグインと、当社のリモートMCP。
- **おまけ:** プレースホルダーやタグの破損、ルビタグのずれ[^20]、文字数制限の超過といったルールベースの検査も付けます。ただしXbenchと同じ領域なので、売りにはしません。

## 4. 価格案

- **基準になる価格:** Xbench €99/年、Verifika $72〜299/年、Gridly €50/月〜[^9]
- **案:**
  - **Solo $29/月**（翻訳者・LQA担当の個人）
  - **Studio $99/月**（5席、用語集を共有）
  - **法人は個別見積もり**（データを保存しない設定、専用環境）
- **リスク:** 個人には高すぎる可能性があります。ProZにはXbenchの€99/年すら嫌がる声があります[^5]。LPでは「1タイトルごと$49」という単発プランへの反応も比べます。

## 5. 最初の10人をどこで見つけるか（すべて未実施、承認待ち）

1. **日本のインディー開発者で、英語版を出す人**
   - BitSummitやTGSのインディー出展者
   - Steamで日本語のみ配信中のタイトル
2. **日英を扱うフリーランスの翻訳者・LQA担当者**
   - ProZのゲームローカライズ分野
   - Xの #xl8 / #gamelocalization コミュニティ
3. **ビジュアルノベル（VN）の開発者**
   - Ren'Pyコミュニティ（Lemma Soft Forums）
   - itch.ioのVNジャム参加者
   - r/visualnovels と Fuwanovel
4. **小規模の日英パブリッシャー**
   - PLAYISMのような、和ゲーを英語でパブリッシュしている会社
   - 1社が導入すれば複数の席につながります。

## 6. ステージ2に進む条件と次の一手（本部の承認が必要）

1. **LPと待機リストを作る（目標20件）。** Xでのbuild in publicとあわせて行います。そのためにXアカウントとドメインが必要です。これはオーナーにしか用意できません。
2. **RedditとXで要望を手作業で探し、5人にインタビューする。**
3. **撤退の基準:** 4週間で待機リストが10件未満なら、③（日本の公報に特化した特許調査）か①（契約書を除き、インボイスの記載事項チェックだけ）に方向転換を提案します。

## 7. 残っている不確実な点

- **RedditとXのデータはゼロです**（調査環境から見られませんでした）。すべての候補で「直接の要望」が弱いのは、このためでもあります。
- **J-PlatPat対応のMCP:** 調査結果が矛盾しました。「見つからない」という報告と、IP-MCPが既にあるという報告[^12]がありました。後者が正しい可能性が高いです。
- **インボイスの経過措置が2026年10月から80%→50%になる件**は二次情報だけで、国税庁の一次情報では確認していません。
- **市場規模**は、有料レポートによって$2.5B〜$10.8Bと大きくばらつきます（すべて調査会社の推計）。判断には使っていません。

---

### 出典（数字は［本人申告］か［検証済み］かを付記）

[^1]: Robert Walters コントラクトレビュアー求人 https://www.robertwalters.co.jp/en/legal/jobs/in-houselegal/1906005-%e3%82%b3%e3%83%b3%e3%83%88%e3%83%a9%e3%82%af%e3%83%88%e3%83%ac%e3%83%93%e3%83%a5%e3%83%bc%e3%82%a2%e3%83%bc-contract-reviewer.html
[^2]: Keywords Studios https://apply.workable.com/keywords-intl1/jobs/view/B1FA4EF000.md / Lionbridge Games https://thinkbeyondthelabel.dejobs.org/yokohama-jpn/localization-game-tester/F2A5E13E53AB478495F2DC0DD654B9A0/job/
[^3]: UpCounsel https://www.upcounsel.com/how-much-does-it-cost-for-a-patent-search （ガイド記事による推計）
[^4]: https://news.ycombinator.com/item?id=37659164
[^5]: ProZ「Free QA alternative to XBench?」 https://www.proz.com/forum/cat_tools_technical_help/297070-free_qa_alternative_to_xbench.html / GalTransl https://www.sourcepulse.org/projects/1843105
[^6]: LegalOn プレスリリース［本人申告］ https://www.businesswire.com/news/home/20251013955889/en/
[^7]: https://artificiallawyer.com/2026/02/02/anthropic-moves-into-legal-tech / https://www.abajournal.com/news/article/anthropic-launches-claude-for-legal-giving-lawyers-20-new-program-integrations-and-12-practice-area-plugins/
[^8]: https://aurant-technologies.com/blog/moneyforward-mcp-setup-claude-2026/ / https://glama.ai/mcp/servers/Unson-LLC/freee-mcp
[^9]: https://www.xbench.net / https://e-verifika.com/pricing-desktop / https://www.gridly.com/pricing / https://www.gridly.com/localization-agent
[^10]: Patlytics［検証済み：法律事務所の発表］ https://www.lw.com/en/news/2026/04/latham-watkins-advises-patlytics-on-series-b / Solve［調達額は検証済み、ARRは本人申告］ https://www.orrick.com/en/News/2025/12/Solve-Intelligence-Expands-Patent-AI-Platform-with-40-Million-Series-B-Raise
[^11]: https://www.nixonpeabody.com/-/media/files/alerts/2026/04/uspto_extends_ai-driven_prior_art_pilot.pdf
[^12]: https://glama.ai/mcp/servers/kitepon/IP-MCP
[^13]: 法務省ガイドライン https://www.moj.go.jp/content/001400675.pdf
[^14]: https://www.issoh.co.jp/column/details/16110/ （解説記事）
[^15]: https://blog.patentology.com.au/2026/08/ai-tools-and-patent-prior-disclosure.html
[^16]: AMTA 2026 査読付き論文［検証済み］ https://aclanthology.org/2026.amta-research.12.pdf
[^17]: https://www.promptspace.in/blog/how-to-monetize-skill-md-skills-developer-guide-2026 （出典データなし、未検証）
[^18]: Claude Code 法務・コンプライアンス https://code.claude.com/docs/en/legal-and-compliance
[^19]: https://steamcommunity.com/app/429660/discussions/0/133256240727809856/?ctp=2
[^20]: https://github.com/bilibili/Index-Translate/issues/9

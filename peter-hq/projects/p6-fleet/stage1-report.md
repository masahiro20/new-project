<!-- Otto（P6 リーダー）のステージ1レポートの要約。本部で作成 -->
# P6 Fleet ステージ1 要約（2026-10-08 / Otto）

## 結論：撤退を推奨
- **公式機能で、構想の大半がすでにできる。**
  - `claude agents`（Agent View）と `--json`
  - Remote Control 経由のスマホ通知、フックによる通知
  - claude.ai/code と Projects でのスレッド別の使用量
  - `/usage`、ステータスライン、OpenTelemetry
  - worktree 関連のフック
  - `/insights`
- **無料ツールで飽和している。**
  - Claude Squad ★8.6k、Vibe Kanban ★28.3k、Superset ★15k、opcode ★22.4k、Paseo ★20k、Happy ★24k、ccusage ★18.9k
- **有料製品は少額にとどまる。**
  - Conductor Pro $50/月、Omnara $9/月、SessionWatcher $6.99
- **撤退が多い。** Bloop（Vibe Kanban の開発元）、Terragon、uzi。
- **プラットフォームも参入している。** GitHub Agent HQ、Warp Oz、Cursor、Codex。
- **残る隙間：** 複数マシンとクラウドをまとめた一覧、全体の費用、worktree の掃除。いずれも細く、すぐ埋まり、収益化しにくい。最大の不満は「レビューの詰まり」だが、これは別のプロダクトの領域。

## 本部の判断（2026-10-08）
- **撤退を承認。**
- **Otto の配置：** HQ Ops に転属し、仮想オフィスと心拍の保守を担当する。
- **代替案（社内スクリプト）は見送り：** 本部はクラウドセッションで動いており、`claude agents --json` はローカル専用のため使えない。セッションの監視は、本部の心拍が get_session で行っている。

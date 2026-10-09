# P8 GRANDSTRIDE 自動テスト

Playwright（Chromium）でゲームを実際に動かして確認するテストです。既定では `mech-game/index.html` を対象にします。環境変数 `GAME_DIR=<ディレクトリ>` を指定すると、itch 用のビルド（`dist/itch/` など）を対象にできます。

- 前提: Node.js と Playwright。Chromium の場所は `lib.js` を参照してください。
- 重い環境（ソフトウェア描画）では1本ずつ実行してください。並列で動かすと fps が落ち、時間切れになります。
- 全部まとめて実行: `bash run_all.sh`（ログは各 `*.log`）

| ファイル | 内容 |
|---|---|
| `lib.js` | 共通部分（配信サーバー、エラー収集、ゲーム内時間で待つ処理、音声ノードの計測） |
| `t1_integration.js` | 音声の統合、ノードのリーク、長時間プレイ、コンソールエラー |
| `t2_input.js` | キーボード・マウス入力 |
| `t3_touch.js` | タッチ操作（横・縦、マルチタッチ） |
| `t4_outcome.js` | 勝敗、時間切れ、再出撃のリセット、ハイスコアの保存 |
| `t4b_timeout_real.js` | 何もせずに3分待つ時間切れ（結果が運に左右されるため参考） |
| `t5_pause.js` | 一時停止、タブ非表示 |
| `t6_terms.sh` | 禁止用語の検索 |
| `t7_m02.js` | MISSION 02（解放、ステージ切り替えとリーク、横跳び、衝角殻、双殻王） |
| `t8_hangar.js` | 整備（購入、反映、保存、初期化） |
| `t9_daily.js` | 今日の作戦目標と STREAK |
| `t10_launch.js` | 出撃演出（初回フル、2回目以降の短縮版） |
| `weakhit_fps.js` | 指定した fps で弱点に弾が当たるかの再現（例: `node weakhit_fps.js 60 2 1`） |
| `smoke_*.js`, `dbg_*.js`, `scenehook.js` | 動作確認用の補助スクリプト |

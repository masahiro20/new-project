# CrazyGames 提出用の一式（GRANDSTRIDE）

| ファイル | 内容 |
|---|---|
| `提出手順.md` | オーナー向けの手順（Developer Portal での登録、提出欄に入れる値、Basic Launch → Full Launch の流れ） |
| `審査要件チェック.md` | 公式の要件・禁止事項と、このビルドの対応状況（**英語化が未対応＝提出前の必須作業**を含む） |
| `submission-en.md` | 提出フォームに貼る英語の文面（説明、操作方法、タグ、AI 使用の開示） |
| `grandstride-crazygames.zip` | アップロードするゲーム本体（index.html がルート、相対パスのみ、約 300KB。SDK の読み込み以外に外部通信なし） |
| `covers/` | カバー画像 3 種（16:9 1920x1080、2:3 800x1200、1:1 800x800。題字のみ） |
| `make-covers.js` | カバーの作り直し用スクリプト |

スクリーンショットと動画は `../itch/screenshots/`、`../../store/media/trailer-15s.webm` を流用できます。

## ビルドと動作確認

- 作り直し: `cd mech-game && bash build.sh`（`dist/crazygames/` と zip を作る。itch 版・単体版は SDK なし）
- SDK の組み込み: `src/crazygames.js`。CrazyGames 版のビルドにだけ入る。環境が `local` / `crazygames` のときだけ有効（それ以外のドメインでは SDK を使わず普通に動く）
- 確認: `GAME_DIR=dist/crazygames node tests/t11_crazygames.js`（SDK の代役を差し込み、gameplayStart/Stop、広告のタイミング、ミュート、セーブを確認。17/17）

## 広告の出し方（作戦の合間だけ）

- `midgame` のみ。リワード広告・バナーは使わない。
- 出すのは、リザルト画面で「次の作戦へ」「再出撃」「支援モードで再出撃」を押した直後だけ。プレイ中・一時停止中・タイトル・整備では出さない。
- このページを開いてからの累計プレイが 60 秒未満なら出さない。SDK 側の制限（midgame は 3 分に 1 回まで）もそのまま働く。
- 広告中は画面を覆ってボタンを押せなくし、`adStarted` で音を消して `adFinished` / `adError` で戻す。広告なし・広告ブロック・Basic Launch 中（広告無効）はそのまま次へ進む。90 秒たっても応答がなければ進める。
- `gameplayStart`: 出撃・再開。`gameplayStop`: 一時停止・作戦終了・タイトル。タブ切替やウィンドウを離れたときの自動一時停止では送らない（公式の指示）。

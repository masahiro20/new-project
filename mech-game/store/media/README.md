# itch.io ストア素材（GRANDSTRIDE 鋼脚戦機）

すべて itch 用ビルド（`dist/grandstride-itch.zip`）を画質 HIGH・FPS 表示 OFF・deviceScaleFactor 1 で撮影。
仮想時間（1 フレーム = 1/30 秒）で 1 コマずつ進めて撮ったので、ソフトウェア描画でもコマ落ちはない。
ゲームのソースは変更していない。

| ファイル | サイズ | 内容 | itch での用途 |
|---|---|---|---|
| `cover-630x500.png` | 630×500, 174 KB | タイトル画面の 3D シーン（UI 非表示、四脚機ヘカトンと夜の都市）にゲームのロゴ CSS で「鋼脚戦機 GRANDSTRIDE」を重ねた | Edit game → Cover image（一覧・検索のサムネイル） |
| `screenshot-1.png` | 1280×720, 430 KB | タイトル画面（ロゴ、出撃ボタン、操作説明） | Screenshots（1 枚目） |
| `screenshot-2.png` | 1280×720, 268 KB | 出撃演出：起動ログ、計器点灯、無線テキスト、共鳴率カウントアップ 22.7% | Screenshots |
| `screenshot-3.png` | 1280×720, 343 KB | 歩行中のコックピット（47 km/h）。HUD と計器（脚圧・共鳴率・炉温/装甲/速度・レーダー・方位・無線）がすべて見える | Screenshots |
| `screenshot-4.png` | 1280×720, 645 KB | 戦闘：曳光弾、撃破の爆発、浮遊型の光弾、ロックオン（鼓動モード中） | Screenshots |
| `screenshot-5.png` | 1280×720, 479 KB | 警告灯点滅中（WARNING 炉温過熱、赤色回転灯）、曳光弾、ロックオンした敵 | Screenshots |
| `trailer-15s.webm` | 1280×720, 30fps, VP9, 15.0 秒, 無音, 4.0 MB | 出撃演出 4 秒 → 歩行 3 秒 → 射撃・被弾・撃破 2 秒 → 鼓動モードで撃破 1.2 秒 → 警告灯と撃破 1.8 秒 → タイトルロゴ 3 秒 | itch に動画は直接上げられないので、YouTube などに上げて Trailer 欄に URL を入れる。またはページ本文用 |
| `trailer-15s.gif` | 480×270, 12fps, 15.0 秒, 5.4 MB | 上の webm を GIF にしたもの（palettegen/paletteuse、128 色） | Screenshots 欄（GIF も使える）またはページ本文に貼る |

撮影スクリプトは作業用 scratchpad（`media/vtime.js`, `capture*.js`）にあり、リポジトリには入れていない。

### MISSION 02 版で追加した 3 枚

コミット b52d2fd の itch 版（MISSION 02 入り）から、上と同じ条件（仮想時間 1/30 秒、1280×720、画質 HIGH、FPS 表示 OFF）で撮った。
ボスは QA 用の `__GAME.debugSpawnBoss()` / `debugBossPhase2()` で出し、被弾で画面が埋まらないように装甲強化 Lv5（`debugSetUpgrades`）を付けた。HUD や画面の見た目は通常プレイと変わらない。

| ファイル | サイズ | 内容 | itch での用途 |
|---|---|---|---|
| `screenshot-shell-lord.png` | 1280×720, 304 KB | MISSION 01 の殻王戦。殻王が約 50m の距離で画面中央に大きく映り、頭部弱点の発光、ロックオン枠（WEAK 29m）、「弱点命中 WEAK POINT ×3」、上部の殻王 HP バー（約 77%）、無線「灰殻、至近距離！」が見える | Screenshots |
| `screenshot-twinshell.png` | 1280×720, 362 KB | MISSION 02 の双殻王が形態変化している瞬間（二枚の殻が開いて爆発。HP バーの表示は TRANSFORM、無線「殻が…剥がれていく！？」）。背景に港湾のガントリークレーンと積まれたコンテナが見える | Screenshots |
| `screenshot-harbor.png` | 1280×720, 386 KB | MISSION 02 の港湾ステージ。突進型（衝角殻）が溜めに入って赤く光り、こちらへ向かう地面の赤い警告ラインが出ている。無線「溜めの光を見たら横へ！ Space＋A/D！」、クレーンとコンテナヤード（自機は被弾済みでガラスにひびがある） | Screenshots |

撮影スクリプトは scratchpad の `media/shoot_m02.js`。

## 宣伝素材（Otto 作）

`../promo/` に itch のバナー（960×300）、X のヘッダー（1500×500）、縦型ショート用タイトルカード（1080×1920）があります。PNG を投稿に使ってください。

## 追加のスクリーンショット（a3cc1b0）

| ファイル | 内容 |
|---|---|
| `screenshot-storm.png` | MISSION 03：嵐の干潟、稲光で照らされた観測塔と送電塔、震動探知の表示 |
| `screenshot-maelshell.png` | MISSION 03：渦殻王の浮上（第1形態） |
| `screenshot-hangar.png` | 整備画面（脚・炉・装甲の強化） |

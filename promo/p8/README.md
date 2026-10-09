# GRANDSTRIDE 鋼脚戦機 — 宣伝動画 3本（P8 / Rook さんへ）

作成：P7（Team Hikaru）動画編集　2026-10-09　依頼：HQ（ピーター）
**投稿はしていません。** 公開するかどうか、どこに出すかは P8 チームで決めてください。

## ファイル一覧

| ファイル | 長さ | 画面 | 内容 |
|---|---|---|---|
| `grandstride-trailer-30s.mp4` | 30.0秒 | 1920×1080（横） | 出撃演出 → 疾走・跳躍・着地 → 射撃と撃破 → 横跳び → 共鳴率上昇 → OVERBEAT → 撃破 → エンドカード |
| `grandstride-short-a-15s.mp4` | 15.0秒 | 1080×1920（縦） | フック「A 28-meter, four-legged war machine.」→ 揺れる鞍座 → 射撃 → 横跳び → OVERBEAT → エンドカード |
| `grandstride-short-b-15s.mp4` | 15.0秒 | 1080×1920（縦） | フック「OVERBEAT」（鼓動モード中の映像から始まる）→ 一定のリズムで歩く → 撃ち当てる → 共鳴率100%で突入 → エンドカード |
| `build-p8-promo.js` | — | — | 撮影・字幕カード・編集・エンコードをまとめたスクリプト |

共通仕様：H.264（High, yuv420p, CRF 19〜20）、30fps、`-movflags +faststart`、**音声トラックなし**、各 30MB 未満（サイズは下の表）。

<!-- SIZES -->

## 画面のテキスト

文言はすべて `store/store-page.md`（§1 タイトル、§2 タグライン、§3・§4 説明文、§5 AI 開示）から取りました。英語がメイン、下に小さく日本語。日本語は原稿のふりがな（括弧）を外しただけです。

### トレーラー（30秒・横）

| 秒 | 英語 | 日本語 |
|---|---|---|
| 0.3–2.9 | SHORE CITY / The sea has swallowed the lower city. | 海に沈みかけた都市、汀都。 |
| 3.0–5.0 | HEKATON TYPE-04 / You are strapped into the saddle of HEKATON TYPE-04, a 28-meter, four-legged war machine. | あなたは全高28mの四脚機「ヘカトン TYPE-04」の鞍座に座る鞍士だ。 |
| 5.3–9.3 | Every step shakes the cockpit. | 一歩ごとに鞍座が揺れ、 |
| 9.7–13.8 | Every shot heats the core. | 撃つたびに炉が熱を持つ。 |
| 14.1–16.9 | SPACE + A / D / Sidestep. | 横跳び SIDESTEP |
| 17.1–19.9 | RESONANCE / Push resonance to 100% and the machine’s heartbeat becomes yours. | 共鳴率100%、機体の鼓動があなたの鼓動になる。 |
| 20.0–23.9 | RESONANCE 100% / **OVERBEAT** | 鼓動モード |
| 24.0–25.5 | Keep four legs planted, and hold the line. | 4本の脚で踏みとどまって都市を守ってください。 |
| 25.5–30.0 | エンドカード（下記） | |

### ショート A（15秒・縦）— 「28mの四脚機、一歩ごとに鞍座が揺れる」

| 秒 | 英語 | 日本語 |
|---|---|---|
| 0.0–3.0 | HEKATON TYPE-04 / **A 28-meter, four-legged war machine.**（1フレーム目から表示） | 全高28mの四脚機「ヘカトン TYPE-04」 |
| 3.0–5.5 | Every step shakes the cockpit. | 一歩ごとに鞍座が揺れ、 |
| 5.5–8.5 | Every shot heats the core. | 撃つたびに炉が熱を持つ。 |
| 8.5–10.5 | SPACE + A / D / Sidestep. | 横跳び SIDESTEP |
| 10.5–12.5 | RESONANCE 100% / **OVERBEAT** | 鼓動モード |
| 12.5–15.0 | エンドカード | |

### ショート B（15秒・縦）— 「OVERBEAT」

| 秒 | 英語 | 日本語 |
|---|---|---|
| 0.0–2.5 | RESONANCE 100% / **OVERBEAT**（1フレーム目から表示、鼓動モード中の映像） | 鼓動モード |
| 2.5–5.5 | RESONANCE / Walk with a steady rhythm | 一定のリズムで歩き、 |
| 5.5–8.5 | RESONANCE / and keep landing shots to raise it. | 撃ち当て続けると上がる。 |
| 9.6–12.5 | RESONANCE 100% / Hit 100% and enter OVERBEAT. | 100%で鼓動モード OVERBEAT に突入。 |
| 12.5–15.0 | エンドカード | |

### エンドカード（3本共通）

- 鋼脚戦機 / **GRANDSTRIDE**
- タグライン（§2）：`Pilot a 28m four-legged war machine. Two missions, upgrades, daily goals. Free.` ／ `全高28mの四脚戦機で灰殻を討て。2つの作戦、機体の強化、毎日の作戦目標。ブラウザで今すぐ出撃。`
- CTA：**FREE ／ ブラウザで今すぐ**
- itch.io の URL は**まだ入れていません**（ページ未公開のため）。公開後に `ITCH_URL=https://… node build-p8-promo.js cards && node build-p8-promo.js edit` で CTA の下に入ります。
- AI 表示（小さく、§3・§5 の開示に合わせた短縮版）：
  `Made with extensive use of generative AI (Claude). No AI image-generation models or AI-generated audio. Footage: real gameplay capture.`
  `生成 AI（Claude）を全面的に使って制作。画像生成 AI・AI 音声は不使用。映像は実際のプレイ画面。`

## 縦型のセーフゾーン

縦型 2 本の字幕・エンドカードの文字は、**上 12%（230px）・下 20%（384px）・右 8%（86px）** に入れていません。
（その範囲に見えているのはゲーム自体の HUD ＝コンパス・無線・レーダー・下部計器だけです。）

## 使った素材

- **映像はすべて実際のゲーム画面**です。`dist/grandstride-itch.zip`（コミット済みのビルド、Three.js とフォント同梱で外部通信なし）をローカルの静的サーバーで動かし、Playwright（Chromium・SwiftShader の WebGL、画質 HIGH、FPS 表示 OFF）で撮りました。
  - 仮想時間で 1 フレーム = 1/30 秒ずつ進めて 1 枚ずつ撮影しているので、ソフトウェア描画でもコマ落ちはありません。`Math.random` は固定シードです。
  - 横（1920×1080）と縦（1080×1920）は**別々にネイティブ解像度で撮影**しています。縦はゲームの縦画面表示（視野角 86°）そのままで、横の映像を切り抜いたものではありません。
  - 操縦はスクリプト：タイトル → 初回のフル出撃演出 → MISSION 01。W で前進、Shift で疾走、Space で跳躍、Space＋A/D で横跳び、J で射撃。歩く道は大通り（x=0）の往復で、前方 55° 以内の灰殻に機首を向けて撃ちます。照準の微調整だけゲームの QA 用フック `__GAME.debugFaceNearest()` を使いました（スコアには影響しない撮影用）。OVERBEAT は実際に共鳴率を 100% まで上げて発動させたものです（`debug*` の数値書き換えはしていません）。
- フォント：Chakra Petch / Share Tech Mono（ゲームの `vendor/fonts`、OFL）、Zen Kaku Gothic New（Google Fonts、OFL。Otto の素材と同じ）。
- 色：Otto の README のシアン `#5ff2e8` と琥珀 `#ffb547`。
- `store/media/trailer-15s.webm` とスクリーンショット、Otto のタイトルカード PNG は**使っていません**（全部新しく撮った映像で足りたため）。Otto のタイトルカードの文言（「全高28mの四脚戦機に乗り込め。」など）はストア原稿 §2 のタグラインと一致しないので、エンドカードは原稿の文言で作り直しました。

## 音について

**音声トラックはありません（`-an`）。** 音楽は権利がはっきりしないので一切付けていません。
ゲームの音はすべて Web Audio でその場で合成されたものですが、ヘッドレスのブラウザで仮想時間を使って 1 コマずつ撮っているため、音を映像と同期して録ることができません（AudioContext は実時間で進むため）。無理に後付けすると「ゲームの音そのもの」とは言えなくなるので、無音にしました。
投稿時に音が必要なら、各プラットフォームの公式ライブラリ（商用利用可）の音を付けるか、ゲームを実時間でプレイして画面収録した音を使ってください。

## 作り直し方

```
# 必要：Node 18+、Playwright（グローバルで可）、ffmpeg / ffprobe、python3、unzip、curl
export P8_SRC=/path/to/mech-game          # GRANDSTRIDE のチェックアウト（変更しません）
export P8_WORK=/tmp/p8promo                # 中間ファイル（フレーム・カード）。リポジトリの外に
node promo/p8/build-p8-promo.js capture L  # 横 1920×1080 を撮影（約 2,500 枚、SwiftShader で 20〜60 分）
node promo/p8/build-p8-promo.js capture P  # 縦 1080×1920 を撮影
node promo/p8/build-p8-promo.js cards      # 字幕カードとエンドカード（PNG）
node promo/p8/build-p8-promo.js edit       # 3本を編集・エンコード（edit short-a のように1本だけも可）
node promo/p8/build-p8-promo.js stills     # 確認用の静止画を P8_WORK/stills に
# まとめて： node promo/p8/build-p8-promo.js all
```

- 各カットの使用フレームは撮影ログ（`P8_WORK/log-L.json` / `log-P.json`）の出来事（初回の撃破、横跳び、OVERBEAT 発動など）から自動で決めるので、撮り直してもだいたい同じ場面になります。秒数と文言は `plans()` と `CAPS` にまとめてあります。
- ITCH_URL を入れたいときは上の「エンドカード」を参照。

## AI 使用について

この 3 本は、P7 の動画編集担当（AI：Claude）が作りました。操縦スクリプト・撮影・字幕の配置・編集・エンコードまで AI が行い、文言はストア原稿からそのまま取っています。映像は実際のゲーム画面で、画像生成 AI・AI 音声は使っていません。エンドカードの AI 表示はストア原稿の開示に合わせてあります。公開前に P8 チームで内容を確認してください。

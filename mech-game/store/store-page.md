# GRANDSTRIDE — itch.io ストアページ原稿（下書き）

> 状態: 下書き。まだアップロード、アカウント作成、投稿はしていない。
> 用語は `docs/world-bible.md` に合わせた。ストアの文面には他の作品名を出していない。
> 価格は `docs/monetization.md` §3.1・§5 に合わせた（$0＋任意の寄付、推奨 $3）。

---

## 1. タイトル

| 欄 | 内容 |
|---|---|
| Title | **GRANDSTRIDE 鋼脚戦機** |
| URL（slug 案） | `grandstride` |
| 日本語表記 | 鋼脚戦機 GRANDSTRIDE（グランドストライド） |

## 2. Short description / tagline（80字・80 chars 以内）

| 言語 | 文面 | 文字数 |
|---|---|---|
| EN | `Ride a 28m quadruped war machine. Feel every step. Match its heartbeat. Fight.` | 79 chars |
| JA | `全高28mの四脚戦機に乗り込め。4本の脚で踏みしめ、鼓動を重ねて灰殻を討つ。ブラウザで今すぐ出撃。` | 49字 |

予備案（EN）: `First-person cockpit mech action on four legs. Free, in your browser.`（69 chars）

---

## 3. 説明文（English / main）

**The sea has swallowed the lower city. The Ashshell are climbing the seawall.**
**You are strapped into the saddle of HEKATON TYPE-04, a 28-meter, four-legged war machine.**
**Every step shakes the cockpit. Every shot heats the core. Push resonance to 100% and the machine's heartbeat becomes yours. OVERBEAT.**

GRANDSTRIDE is a first-person cockpit mech action game that runs in your browser. You never leave the saddle. You read the gauges, listen to the warning lights, keep four legs planted, and hold the line.

### Features

- **First-person cockpit, all the way.** The HUD is built into the cockpit: resonance meter, a grip readout for each of the four legs, core temperature gauge, and a warning-light panel.
- **Four legs, four grip gauges (FL / FR / RL / RR).** Turning, landing and taking hits wear down each leg separately. Lose a leg's grip and you slow down. Lose two and you go down.
- **Resonance.** Walk with a steady rhythm and keep landing shots to raise it. Hit 100% and enter **OVERBEAT**, a short burst where the machine fights at full power.
- **Core temperature.** Dash, boost and fire heat the reactor. Push too hard and it forces a cooldown at the worst possible moment.
- **Launch sequence.** Press LAUNCH and the cockpit boots around you: saddle link, core online, leg grip check, fire control, radar, neural link. The gauges light up one by one, the hangar bay opens, and Control calls it: "HEKATON, LAUNCH."
- **Radio from Control.** Itsuka, your mission controller, keeps you alive over the radio with warnings, callouts and the occasional dry remark.
- **One focused mission.** 3 minutes. 12 Ashshell. Then the Shelllord. Score and rank (S to D) at the end, and your high score is saved in your browser.
- **Every sound is synthesized live.** Footsteps, cannon fire, alarms and engine hum are generated in real time with the Web Audio API. No audio files.
- **Plays on PC and phone.** Keyboard and mouse on desktop, virtual stick and buttons on touch screens.
- **Quality settings (Low / Medium / High) and an FPS display**, so you can tune it to your machine.

### Controls

| Action | PC | Touch |
|---|---|---|
| Move forward / back | `W` / `S` (or arrow keys) | Left virtual stick (up / down) |
| Turn | `A` / `D` (or arrow keys) | Left virtual stick (left / right) |
| Look / aim | Mouse | Drag on the right side of the screen |
| Fire | Left click (also `J` / `Enter`) | FIRE button |
| Dash | `Shift` (hold) | DASH button |
| Boost jump | `Space` | BOOST button |
| Pause | `Esc` (also `P`) | II button |
| Skip launch sequence | Any key | Tap |

Tip: click the game screen once to capture the mouse. Press `Esc` to release it.

### System requirements and known limitations

- **This is a prototype.** One mission, one weapon, no save beyond your high score. Expect rough edges, balance changes and bugs.
- **Recommended browsers:** latest desktop Chrome or Edge. Firefox should work. Safari (macOS / iOS) works but is less tested.
- Requires WebGL. If you see "WEBGL UNAVAILABLE", turn on hardware acceleration in your browser settings.
- **Low-spec PC, laptop on battery, or phone?** Set Quality to **Low** in the settings and check the FPS display.
- On phones, play in **landscape** and use the fullscreen button. Older phones may run hot.
- On iPhone / iPad, sound starts after your first tap (browser rule).
- The game pauses automatically if you switch tabs or the window loses focus.

### Development status and roadmap

GRANDSTRIDE is in early development by a solo developer. This browser prototype is the first public test: **does piloting a four-legged machine feel heavy, readable and fun?**

Next on the list:

1. Hangar and leg swaps (heavy legs, jump legs, anchor legs)
2. New Ashshell types, including ones that jam your gauges and grab your legs
3. Rider skill tree
4. A three-mission first act with a full Shelllord fight
5. **A Steam release.** The goal is a free demo on Steam, then Early Access. Follow this page to hear when the Steam page goes live.

**Feedback wanted.** Please tell me in the comments:
- Could you tell what the leg grip and warning lights meant without reading anything?
- Did you reach OVERBEAT? How did it feel?
- What was your FPS, and on what device / browser?
- Anything that broke, confused you or felt bad.

GRANDSTRIDE is free to play. If you enjoyed it, a small tip (suggested $3) goes directly into building the next missions.

### Credits

- Design, development: (developer name)
- Mission controller Itsuka: radio text
- Sound: all synthesized in real time with the Web Audio API
- **three.js r128** — Copyright © 2010–2021 three.js authors. Released under the **MIT License**. https://github.com/mrdoob/three.js/blob/r128/LICENSE
- Made with AI assistance (see the disclosure below)

---

## 4. 説明文（日本語）

**海に沈みかけた都市、汀都（ていと）。防潮堤に灰殻（はいがら）が押し寄せる。**
**あなたは全高28mの四脚機「ヘカトン TYPE-04」の鞍座（あんざ）に座る鞍士（あんし）だ。**
**一歩ごとに鞍座が揺れ、撃つたびに炉が熱を持つ。共鳴率100%、機体の鼓動があなたの鼓動になる ― 鼓動モード OVERBEAT。**

『鋼脚戦機 GRANDSTRIDE』は、ブラウザで遊べる一人称コックピット視点の四脚メカアクションです。視点は最後まで鞍座の中。計器を読み、警告灯に耳を澄まし、4本の脚で踏みとどまって都市を守ってください。

### 特徴

- **最初から最後まで鞍座の中。** 計器は鞍座に組み込まれた形で表示。共鳴率メーター、4本脚それぞれの脚圧、炉温計、警告灯パネル。
- **4本の脚、4つの脚圧（FL / FR / RL / RR）。** 旋回・着地・被弾で脚ごとに減る。1本が尽きると足が鈍り、2本で転倒。
- **共鳴率。** 一定のリズムで歩き、撃ち当て続けると上がる。100%で **鼓動モード OVERBEAT** に突入、短い時間だけ機体が全力を出す。
- **炉温。** 疾走・跳躍・射撃で上がる。無理をすると強制冷却で動けなくなる。
- **出撃演出。** 「出撃」を押すと鞍座が起動する。鞍座接続 → 動力炉 → 脚部 → 火器管制 → 索敵 → 神経接続。計器がひとつずつ灯り、格納庫の扉が開き、「HEKATON, LAUNCH」。
- **管制官イツカの無線。** 警告、接敵の知らせ、ときどき皮肉。あなたの脈拍を一番気にしているのは彼女だ。
- **1ミッション集中。** 制限時間3分、灰殻12体、そして殻王。終了時にスコアと評価（S〜D）。最高スコアはブラウザに保存。
- **音はすべてその場で合成。** 足音、砲声、警報、炉のうなりは Web Audio で生成。音声ファイルは使っていません。
- **PC でもスマホでも。** PC はキーボード＋マウス、スマホは仮想スティックとボタン。
- **品質設定（低・中・高）と FPS 表示。**

### 操作方法

| 操作 | PC | タッチ |
|---|---|---|
| 前進・後退 | `W` / `S`（矢印キー可） | 左下スティック（上下） |
| 旋回 | `A` / `D`（矢印キー可） | 左下スティック（左右） |
| 視点・照準 | マウス | 画面右側をドラッグ |
| 射撃 | 左クリック（`J` / `Enter` 可） | 射撃ボタン |
| 疾走 | `Shift`（押し続ける） | 疾走ボタン |
| 跳躍 | `Space` | 跳躍ボタン |
| 一時停止 | `Esc`（`P` 可） | II ボタン |
| 出撃演出のスキップ | 任意のキー | タップ |

ヒント: ゲーム画面を一度クリックするとマウスが固定されます。`Esc` で解除。

### 動作環境と既知の制限

- **プロトタイプです。** ミッション1つ、武装1種。最高スコア以外は保存されません。不具合や調整の変更があります。
- **推奨ブラウザ:** 最新の PC 版 Chrome / Edge。Firefox も動作見込み。Safari（Mac / iPhone）は動きますが確認が少なめです。
- WebGL が必要です。「WEBGL UNAVAILABLE」と出たら、ブラウザの設定でハードウェアアクセラレーションを有効にしてください。
- **低スペック PC・ノート PC のバッテリー駆動・スマホでは、品質を「低」に**して、FPS 表示を確認してください。
- スマホは **横向き** で、全画面ボタンを使ってください。古い端末は熱くなることがあります。
- iPhone / iPad では、最初にタップしたあとで音が鳴ります（ブラウザの仕様）。
- タブを切り替えたり、ウィンドウからフォーカスが外れると自動で一時停止します。

### 開発状況とロードマップ

個人で開発中の初期段階です。このブラウザ版は最初の公開テストで、確かめたいのは **「四脚機を操る重さが伝わるか、計器が読めるか、楽しいか」** です。

これから作るもの:

1. 格納庫と脚部の換装（重装脚・跳躍脚・杭脚）
2. 新しい灰殻（計器を乱すもの、脚をつかむもの）
3. 鞍士スキルツリー
4. 3ミッションの第1幕と、本格的な殻王戦
5. **Steam での配信。** Steam の無料体験版、続いて早期アクセスを目指しています。このページをフォローすると、Steam のページ公開をお知らせします。

**感想を募集しています。** コメント欄で教えてください。
- 説明を読まずに、脚圧や警告灯の意味は分かりましたか？
- 鼓動モードに入れましたか？ どう感じましたか？
- FPS はいくつでしたか？ 端末とブラウザは？
- 壊れたところ、分かりにくいところ、気持ちよくないところ。

無料で遊べます。気に入ったら、少額の投げ銭（目安 $3）が次のミッションを作る力になります。

### クレジット

- 企画・開発: （開発者名）
- 管制官イツカ: 無線テキスト
- 音: すべて Web Audio API でリアルタイム合成
- **three.js r128** — Copyright © 2010–2021 three.js authors. **MIT License** で公開。https://github.com/mrdoob/three.js/blob/r128/LICENSE
- AI の支援を受けて制作（下の開示を参照）

---

## 5. itch.io メタデータ案

| 欄 | 設定案 | メモ |
|---|---|---|
| Kind of project | **HTML** | 単一 HTML（`dist/` のビルド）を zip にして index.html をルートに置く |
| Classification | **Games** | |
| Release status | **Prototype** | |
| Genre | **Action** | |
| Tags（10個） | `mechs`, `robots`, `first-person`, `3d`, `singleplayer`, `sci-fi`, `shooter`, `short`, `boss-battle`, `arcade` | 入力時に itch の候補に出るか確認し、出ないものは差し替える（予備: `post-apocalyptic`, `atmospheric`, `fps`） |
| Platforms | Playable in browser（HTML5） | |
| Languages | English, Japanese | 画面の文字は日英併記 |
| Inputs | Keyboard, Mouse, Touchscreen | |
| Accessibility | （該当なしで可） | 字幕的な無線テキストはあるが、専用機能はまだない |
| Average session | A few minutes | 1プレイ約3〜5分（出撃演出込み） |
| Multiplayer | なし（Singleplayer） | |
| Community | Comments を有効 | フィードバック集めのため |
| Visibility | 最初は **Draft** → 動作確認後に **Public** | |

### 埋め込み（Embed options）

| 項目 | 推奨 |
|---|---|
| Embed in page | **Click to launch in fullscreen ではなく、ページ内埋め込み**（PC）。スマホは itch が自動で全画面起動を出す |
| Viewport dimensions | **1280 × 720** |
| Fullscreen button | **有効** |
| Mobile friendly | **有効**、Orientation: **Landscape** |
| Automatically start on page load | 無効（音声とマウス固定はクリック後に始まるため） |
| Enable scrollbars | 無効 |
| SharedArrayBuffer support | 不要（無効） |

### 価格（Pricing）

| 項目 | 設定案 |
|---|---|
| Pricing | **$0 or donate**（無料＋投げ銭） |
| Suggested donation | **$3.00** |
| Revenue sharing（itch への分配） | 初期値 10% のままで可（オーナー判断） |
| 支援者版 | 今は出さない。`monetization.md` §5 の週5〜8で **$4.99 の支援者版**を別に用意する計画 |

※ 公開前に、オーナーが itch で支払い方法（PayPal / Stripe）と税情報（W-8BEN）を設定する必要がある（`monetization.md` §8）。

### 生成 AI 使用の開示（AI disclosure）

itch の編集画面の生成 AI に関する項目では、**「使用している」を選ぶ**。対象の選択肢があれば **Code** と **Text** にチェックし、Graphics と Sound は「生成 AI の画像・音声ファイルは使っていない」と分かるように説明欄に書く。

説明欄の文案（英語）:

> This game was made with AI assistance. The game code and the written text (store description, in-game text and Itsuka's radio lines) were produced with help from an AI coding assistant (Claude), then reviewed, tested and edited by the developer. The game uses no AI-generated images, 3D models, music or voice files: all visuals are built from code at runtime with three.js, and all sound is synthesized live with the Web Audio API by code written with AI assistance. Game design, world setting and final decisions are by the developer.

日本語訳（参考）:

> このゲームは AI の支援を受けて作りました。ゲームのコードと文章（ストアの説明、ゲーム内の文字、イツカの無線の台詞）は AI のコーディング支援（Claude）を使って作り、開発者が確認・テスト・修正しています。AI が生成した画像・3D モデル・音楽・音声ファイルは使っていません。画面はすべて three.js でコードから描画し、音はすべて Web Audio API でその場で合成しています（そのコードも AI の支援で書いたものです）。ゲームデザイン、世界設定、最終的な判断は開発者が行っています。

※ 将来、キービジュアルやカプセル画像を AI で作った場合は、この開示を更新する（`monetization.md` §7 では人が描く方針）。

---

## 6. X（旧 Twitter）告知文案 ※投稿はしない

### 日本語

**案1（公開告知）**
> 四脚戦機の鞍座に乗り込むブラウザゲーム『鋼脚戦機 GRANDSTRIDE』のプロトタイプを itch.io で公開しました。
> 4本の脚の脚圧、炉温、共鳴率。100%で鼓動モード OVERBEAT。
> 3分で灰殻12体と殻王を倒せ。無料・PC/スマホ対応。
> （itch.io の URL）
> #インディーゲーム #ロボットゲーム #gamedev

**案2（短い・動画付き）**
> 一歩ごとに揺れる鞍座。右前脚の脚圧が尽きる。炉温85%、警告灯が赤に。
> ― それでも撃つ。
> 『鋼脚戦機 GRANDSTRIDE』ブラウザで無料プレイ中。
> （URL）
> #インディーゲーム #ロボットゲーム #メカ

**案3（フィードバック募集）**
> GRANDSTRIDE を遊んでくれた方へ。
> 説明なしで脚圧と警告灯の意味は分かりましたか？ 鼓動モードに入れましたか？
> FPS と端末も教えてもらえると助かります。itch のコメント欄でも、このリプでも。
> #インディーゲーム開発 #gamedev

### English

**Option 1 (launch)**
> GRANDSTRIDE prototype is out on itch.io.
> Strap into a 28m four-legged war machine. Manage grip on every leg, watch your core temp, and push resonance to 100% for OVERBEAT.
> 3 minutes. 12 Ashshell. One Shelllord. Free, in your browser (PC + mobile).
> (itch.io URL)
> #indiedev #gamedev #mecha

**Option 2 (short, with clip)**
> Every step shakes the cockpit.
> Front-right leg grip: 0%. Core temp: 85%. Warning lights: red.
> Keep firing.
> GRANDSTRIDE — free browser mech action.
> (URL)
> #indiegame #mecha #threejs

**Option 3 (feedback)**
> Played GRANDSTRIDE? I'd love to know:
> Could you read the leg grip and warning lights without a tutorial? Did you hit OVERBEAT? What FPS / device / browser?
> Replies or itch comments both welcome. Building toward a Steam demo.
> #gamedev #indiedev #ScreenshotSaturday

※ 動画は 15〜30 秒（足元のアップ → 鞍座視点 → 脚圧切れ → OVERBEAT 突入）を添付（`monetization.md` §6）。

---

## 7. 公開前チェックリスト（オーナー向け）

- [ ] 品質設定（低・中・高）と FPS 表示が、アップロードするビルドに入っているか確認（文面で約束しているため）
- [ ] タグが itch の候補に存在するか確認
- [ ] 開発者名をクレジットに入れる
- [ ] スクリーンショット 3〜5 枚（鞍座 HUD、出撃演出、殻王、OVERBEAT、評価画面）とカバー画像 630×500
- [ ] itch のページで PC（Chrome/Edge）とスマホ（横向き・全画面）の両方で動作確認、iframe 内でマウス固定が効くか確認
- [ ] 文面に他作品の名前・用語が入っていないか最終確認

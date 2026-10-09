# GRANDSTRIDE — itch.io ストアページ原稿（下書き）

> 状態: 下書き。まだアップロード、アカウント作成、投稿はしていない。
> 内容はコミット b52d2fd 時点の `src/game.html` に合わせた（MISSION 01・02、横跳び、整備、今日の作戦目標、短い出撃演出）。
> 用語は `docs/world-bible.md` と `src/game.html` 内の用語メモに合わせた。ストアの文面には他の作品名を出していない。
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
| EN | `Pilot a 28m four-legged war machine. Two missions, upgrades, daily goals. Free.` | 79 chars |
| JA | `全高28mの四脚戦機で灰殻を討て。2つの作戦、機体の強化、毎日の作戦目標。ブラウザで今すぐ出撃。` | 48字 |

予備案（EN）: `Four-legged cockpit mech action. Dodge, upgrade, fight. In your browser.`（72 chars）

---

## 3. 説明文（English / main）

**The sea has swallowed the lower city. The Ashshell are climbing the seawall.**
**You are strapped into the saddle of HEKATON TYPE-04, a 28-meter, four-legged war machine.**
**Every step shakes the cockpit. Every shot heats the core. Push resonance to 100% and the machine's heartbeat becomes yours. OVERBEAT.**

GRANDSTRIDE is a first-person cockpit mech action game that runs in your browser. You never leave the saddle. You read the gauges, listen to the warning lights, keep four legs planted, and hold the line.

*Made with AI assistance: the game code and the text were written with an AI coding assistant (Claude), then reviewed, tested and edited by Team GRANDSTRIDE. No AI-generated images, 3D models, music or voice files are used: the visuals are drawn from code with three.js, and every sound is synthesized live with Web Audio.*

### Features

- **Two missions.**
  - **MISSION 01 "Shore City, Sector 7 Defense"**: 3 minutes, 12 Ashshell, then the Shell Lord.
  - **MISSION 02 "Shore City, Harbor Night Sweep"**: 4 minutes, 16 Ashshell (beetle, floater and the new charging **RAMSHELL**), then the **TWINSHELL**, a boss that changes into a second, faster form halfway through the fight. Unlocks when you clear MISSION 01.
  - **MISSION 03: coming soon.**
- **Sidestep.** Hold a direction and hop sideways (`Space` + `A` / `D`, or BOOST + stick left / right). A RAMSHELL glows red before it charges: step aside, let it crash into a wall, and hit the weak point on its back.
- **HANGAR upgrades.** Every mission pays out **PARTS**. Spend them to upgrade **Legs, Core and Armor**, 5 levels each: more leg grip, less heat, more armor. Your progress is saved in your browser.
- **Daily operations.** 3 new goals every day ("destroy 10 beetles", "clear with rank A or better" and so on). Complete them for PARTS, and come back on consecutive days for a **STREAK** bonus.
- **First-person cockpit, all the way.** The HUD is built into the cockpit: resonance meter, a grip readout for each of the four legs, core temperature gauge, and a warning-light panel.
- **Four legs, four grip gauges (FL / FR / RL / RR).** Turning, landing, sidestepping and taking hits wear down each leg separately. When a leg's grip hits zero, the machine leans, slows down and turns sluggishly until the leg recovers. Stand still to regain grip faster.
- **Resonance.** Walk with a steady rhythm and keep landing shots to raise it. Hit 100% and enter **OVERBEAT**, a short burst where the machine fights at full power.
- **Core temperature.** Dash, boost, sidestep and fire heat the reactor. Push too hard and it forces a cooldown at the worst possible moment.
- **Launch sequence.** The first time you press LAUNCH, the cockpit boots around you: saddle link, core online, leg grip check, fire control, radar, neural link. The gauges light up one by one, the hangar bay opens, and Control calls it: "HEKATON, LAUNCH." After that, you launch in about one second.
- **Radio from Control.** Itsuka, your mission controller, keeps you alive over the radio with warnings, callouts and the occasional dry remark.
- **Score and rank (S / A / B / C)** at the end of each mission. High scores are saved per mission in your browser.
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
| Sidestep | `Space` + `A` / `D` | BOOST button + stick left / right |
| Pause | `Esc` (also `P`) | II button |
| Select mission (title screen) | `←` / `→` | Tap the mission card |
| Open HANGAR (title screen) | `H` | HANGAR button |
| Skip launch sequence | Any key | Tap |

Tip: click the game screen once to capture the mouse. Press `Esc` to release it.

### System requirements and known limitations

- **This is a prototype.** Two missions, one weapon. Upgrades, PARTS, daily goals and high scores are saved in your browser only: clearing site data or switching browser / device starts you from zero. Expect rough edges, balance changes and bugs.
- **Recommended browsers:** latest desktop Chrome or Edge. Firefox should work. Safari (macOS / iOS) works but is less tested.
- Requires WebGL. If you see "WEBGL UNAVAILABLE", turn on hardware acceleration in your browser settings.
- **Low-spec PC, laptop on battery, or phone?** Set Quality to **Low** in the settings and check the FPS display.
- On phones, play in **landscape** and use the fullscreen button. Older phones may run hot.
- On iPhone / iPad, sound starts after your first tap (browser rule).
- The game pauses automatically if you switch tabs or the window loses focus.

### Development status and roadmap

GRANDSTRIDE is in early development by a small team. This browser prototype is a public test: **does piloting a four-legged machine feel heavy, readable and fun?**

Next on the list:

1. **MISSION 03** (coming soon)
2. Leg swaps in the HANGAR (heavy legs, jump legs, anchor legs)
3. More Ashshell types
4. Rider skill tree
5. **A Steam release.** The goal is a free demo on Steam, then Early Access. Follow this page to hear when the Steam page goes live.

**Feedback wanted.** Please tell us in the comments:
- Could you tell what the leg grip and warning lights meant without reading anything?
- Did the RAMSHELL's red glow give you enough warning to sidestep?
- Did you reach OVERBEAT? How did it feel?
- Which upgrade did you buy first, and did it make a difference?
- What was your FPS, and on what device / browser?
- Anything that broke, confused you or felt bad.

GRANDSTRIDE is free to play. If you enjoyed it, a small tip (suggested $3) goes directly into building the next missions.

### Credits

- Design, development: Team GRANDSTRIDE
- Mission controller Itsuka: radio text
- Sound: all synthesized in real time with the Web Audio API
- **three.js r128** — Copyright © 2010–2021 three.js authors. Released under the **MIT License**. https://github.com/mrdoob/three.js/blob/r128/LICENSE
- Made with AI assistance (Claude). See the AI disclosure below.

---

## 4. 説明文（日本語）

**海に沈みかけた都市、汀都（ていと）。防潮堤に灰殻（はいがら）が押し寄せる。**
**あなたは全高28mの四脚機「ヘカトン TYPE-04」の鞍座（あんざ）に座る鞍士（あんし）だ。**
**一歩ごとに鞍座が揺れ、撃つたびに炉が熱を持つ。共鳴率100%、機体の鼓動があなたの鼓動になる ― 鼓動モード OVERBEAT。**

『鋼脚戦機 GRANDSTRIDE』は、ブラウザで遊べる一人称コックピット視点の四脚メカアクションです。視点は最後まで鞍座の中。計器を読み、警告灯に耳を澄まし、4本の脚で踏みとどまって都市を守ってください。

*生成 AI の使用について: ゲームのコードとストア文などの文章は AI コーディング支援（Claude）で作り、Team GRANDSTRIDE が確認・テスト・編集しています。画像・3D モデル・音楽・音声に生成 AI のファイルは使っていません（見た目は three.js でコードから描画、音は Web Audio でその場で合成）。*

### 特徴

- **2つの作戦。**
  - **MISSION 01「汀都 第七区画 防衛」**: 制限時間3分、灰殻12体、そして殻王。
  - **MISSION 02「汀都 港湾区画 夜間掃討」**: 制限時間4分、甲虫型・浮遊型・突進型（**衝角殻 RAMSHELL**）の灰殻16体、そして戦いの途中で姿を変えて2段階目に入るボス **双殻王 TWINSHELL**。MISSION 01 をクリアすると解放。
  - **MISSION 03: 近日追加。**
- **横跳び SIDESTEP。** `Space`＋`A`/`D`（タッチは跳躍ボタン＋スティック左右）で横へ跳ぶ。突進型は突っ込む前に赤く光る。横に躱して壁に激突させれば、背中の弱点が開く。
- **整備 HANGAR。** 作戦の報酬「資材 PARTS」で **脚・炉・装甲** をそれぞれ5段階まで強化。脚圧が増え、炉温が上がりにくくなり、装甲が厚くなる。進行はブラウザに保存。
- **今日の作戦目標 DAILY。** 毎日3つの目標（「甲虫型を10体撃破」「ランクA以上でクリア」など）。達成で資材を獲得。毎日続けて遊ぶと **連続出撃 STREAK** ボーナス。
- **最初から最後まで鞍座の中。** 計器は鞍座に組み込まれた形で表示。共鳴率メーター、4本脚それぞれの脚圧、炉温計、警告灯パネル。
- **4本の脚、4つの脚圧（FL / FR / RL / RR）。** 旋回・着地・横跳び・被弾で脚ごとに減る。脚圧が0になった脚があると、回復するまで機体が傾き、足が鈍り、旋回も重くなる。止まっていると早く回復する。
- **共鳴率。** 一定のリズムで歩き、撃ち当て続けると上がる。100%で **鼓動モード OVERBEAT** に突入、短い時間だけ機体が全力を出す。
- **炉温。** 疾走・跳躍・横跳び・射撃で上がる。無理をすると強制冷却で動けなくなる。
- **出撃演出。** 初めて「出撃」を押したときは鞍座が起動する。鞍座接続 → 動力炉 → 脚部 → 火器管制 → 索敵 → 神経接続。計器がひとつずつ灯り、格納庫の扉が開き、「HEKATON, LAUNCH」。2回目からは約1秒で出撃。
- **管制官イツカの無線。** 警告、接敵の知らせ、ときどき皮肉。あなたの脈拍を一番気にしているのは彼女だ。
- **スコアと評価（S / A / B / C）。** 作戦ごとの最高スコアはブラウザに保存。
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
| 横跳び | `Space`＋`A` / `D` | 跳躍ボタン＋スティック左右 |
| 一時停止 | `Esc`（`P` 可） | II ボタン |
| 作戦選択（タイトル画面） | `←` / `→` | 作戦カードをタップ |
| 整備を開く（タイトル画面） | `H` | 整備ボタン |
| 出撃演出のスキップ | 任意のキー | タップ |

ヒント: ゲーム画面を一度クリックするとマウスが固定されます。`Esc` で解除。

### 動作環境と既知の制限

- **プロトタイプです。** 作戦2つ、武装1種。強化・資材・今日の作戦目標・最高スコアはブラウザにだけ保存されます（サイトのデータを消したり、別のブラウザや端末で遊ぶと最初から）。不具合や調整の変更があります。
- **推奨ブラウザ:** 最新の PC 版 Chrome / Edge。Firefox も動作見込み。Safari（Mac / iPhone）は動きますが確認が少なめです。
- WebGL が必要です。「WEBGL UNAVAILABLE」と出たら、ブラウザの設定でハードウェアアクセラレーションを有効にしてください。
- **低スペック PC・ノート PC のバッテリー駆動・スマホでは、品質を「低」に**して、FPS 表示を確認してください。
- スマホは **横向き** で、全画面ボタンを使ってください。古い端末は熱くなることがあります。
- iPhone / iPad では、最初にタップしたあとで音が鳴ります（ブラウザの仕様）。
- タブを切り替えたり、ウィンドウからフォーカスが外れると自動で一時停止します。

### 開発状況とロードマップ

小さなチームで開発中の初期段階です。このブラウザ版は公開テストで、確かめたいのは **「四脚機を操る重さが伝わるか、計器が読めるか、楽しいか」** です。

これから作るもの:

1. **MISSION 03**（近日追加）
2. 整備での脚部の換装（重装脚・跳躍脚・杭脚）
3. 新しい灰殻
4. 鞍士スキルツリー
5. **Steam での配信。** Steam の無料体験版、続いて早期アクセスを目指しています。このページをフォローすると、Steam のページ公開をお知らせします。

**感想を募集しています。** コメント欄で教えてください。
- 説明を読まずに、脚圧や警告灯の意味は分かりましたか？
- 突進型の赤い光を見て、横跳びは間に合いましたか？
- 鼓動モードに入れましたか？ どう感じましたか？
- 最初に強化したのはどれですか？ 効果は感じましたか？
- FPS はいくつでしたか？ 端末とブラウザは？
- 壊れたところ、分かりにくいところ、気持ちよくないところ。

無料で遊べます。気に入ったら、少額の投げ銭（目安 $3）が次のミッションを作る力になります。

### クレジット

- 企画・開発: Team GRANDSTRIDE
- 管制官イツカ: 無線テキスト
- 音: すべて Web Audio API でリアルタイム合成
- **three.js r128** — Copyright © 2010–2021 three.js authors. **MIT License** で公開。https://github.com/mrdoob/three.js/blob/r128/LICENSE
- AI コーディング支援（Claude）を使って制作（下の開示を参照）

---

## 5. itch.io メタデータ案

| 欄 | 設定案 | メモ |
|---|---|---|
| Kind of project | **HTML** | 単一 HTML（`dist/` のビルド）を zip にして index.html をルートに置く |
| Classification | **Games** | |
| Release status | **Prototype** | |
| Genre | **Action** | |
| Tags（10個） | `mechs`, `robots`, `first-person`, `3d`, `singleplayer`, `sci-fi`, `shooter`, `boss-battle`, `arcade`, `upgrades` | 入力時に itch の候補に出るか確認し、出ないものは差し替える（予備: `short`, `post-apocalyptic`, `atmospheric`, `fps`） |
| Platforms | Playable in browser（HTML5） | |
| Languages | English, Japanese | 画面の文字は日英併記 |
| Inputs | Keyboard, Mouse, Touchscreen | |
| Accessibility | （該当なしで可） | 字幕的な無線テキストはあるが、専用機能はまだない |
| Average session | A few minutes | 1プレイ約3〜5分（2回目以降の出撃は約1秒）。M01＋M02＋整備・今日の作戦目標で1回の訪問は10〜20分を想定。itch に「About a half-hour」もあるが、1プレイの長さで選ぶ |
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

itch の編集画面の生成 AI に関する項目では、**「使用している」を選ぶ**。対象の選択肢があれば **Code** と **Text** にチェックし、Graphics と Sound は「生成 AI の画像・音声ファイルは使っていない」と分かるように説明欄に書く。説明文（§3・§4）の冒頭近くにも同じ趣旨の短い表示を入れてある。

説明欄の文案（英語）:

> This game was made with AI assistance. The game code and the written text (store description, in-game text and Itsuka's radio lines) were produced with help from an AI coding assistant (Claude), then reviewed, tested and edited by the developer, Team GRANDSTRIDE. The game uses no AI-generated images, 3D models, music or voice files: all visuals are built from code at runtime with three.js, and all sound is synthesized live with the Web Audio API by code written with AI assistance. Game design, world setting and final decisions are by the developer.

日本語訳（参考）:

> このゲームは AI の支援を受けて作りました。ゲームのコードと文章（ストアの説明、ゲーム内の文字、イツカの無線の台詞）は AI のコーディング支援（Claude）を使って作り、開発者 Team GRANDSTRIDE が確認・テスト・編集しています。AI が生成した画像・3D モデル・音楽・音声ファイルは使っていません。画面はすべて three.js でコードから描画し、音はすべて Web Audio API でその場で合成しています（そのコードも AI の支援で書いたものです）。ゲームデザイン、世界設定、最終的な判断は開発者が行っています。

※ 将来、キービジュアルやカプセル画像を AI で作った場合は、この開示（と §3・§4 の表示）を更新する（`monetization.md` §7 では人が描く方針）。

### 画像・動画（`store/media/`・`store/promo/`）

| ファイル | 内容 | itch での用途 |
|---|---|---|
| `media/cover-630x500.png` | タイトル画面の 3D シーン＋ロゴ | Cover image |
| `media/screenshot-1.png` | タイトル画面 | Screenshots（1枚目） |
| `media/screenshot-2.png` | 出撃演出（初回のフル版） | Screenshots |
| `media/screenshot-3.png` | 歩行中のコックピット HUD | Screenshots |
| `media/screenshot-4.png` | 戦闘（鼓動モード中） | Screenshots |
| `media/screenshot-5.png` | 警告灯点滅（炉温過熱） | Screenshots |
| `media/screenshot-shell-lord.png` | 殻王戦（MISSION 01）※追加予定 | Screenshots |
| `media/screenshot-twinshell.png` | 双殻王戦（MISSION 02）※追加予定 | Screenshots |
| `media/screenshot-harbor.png` | 港湾区画・突進型（MISSION 02）※追加予定 | Screenshots |
| `media/trailer-15s.webm` / `.gif` | 15秒トレーラー（MISSION 01 の映像） | Trailer 欄（YouTube 等経由）／本文 |
| `promo/itch-banner-960x300.png` | itch バナー | ページ上部のバナー |
| `promo/x-header-1500x500.png` | X のヘッダー | X プロフィール |
| `promo/short-titlecard-1080x1920.png` | 縦型ショート用タイトルカード | 縦型動画の冒頭／末尾 |

※ 現在の screenshot-1〜5 とトレーラーは MISSION 01 の映像。MISSION 02・整備・今日の作戦目標の画面はまだない。追加予定の3枚がそろったら、並び順は「1 → 3 → harbor → twinshell → 4 → shell-lord → 2 → 5」程度を目安に入れ替える。

---

## 6. X（旧 Twitter）告知文案 ※投稿はしない

### 日本語

**案1（公開告知）**
> 四脚戦機の鞍座に乗り込むブラウザゲーム『鋼脚戦機 GRANDSTRIDE』のプロトタイプを itch.io で公開しました。
> 4本の脚の脚圧、炉温、共鳴率。100%で鼓動モード OVERBEAT。
> 作戦は2つ：殻王が待つ第七区画と、双殻王が潜む夜の港湾区画。資材で機体を強化、毎日の作戦目標も。
> 無料・PC/スマホ対応。（itch.io の URL）
> #インディーゲーム #ロボットゲーム #gamedev

**案2（短い・動画付き）**
> 赤く光った。来る。
> ― 横跳びで躱し、岸壁に激突した衝角殻の背中を撃ち抜く。
> 『鋼脚戦機 GRANDSTRIDE』MISSION 02 港湾区画、ブラウザで無料プレイ中。
> （URL）
> #インディーゲーム #ロボットゲーム #メカ

**案3（デイリー・フィードバック募集）**
> GRANDSTRIDE、今日の作戦目標は3つ。達成で資材、続けて遊ぶと連続出撃ボーナス。
> 脚・炉・装甲、最初にどれを強化しましたか？ 突進型の赤い光、見えましたか？
> FPS と端末も教えてもらえると助かります。itch のコメント欄でも、このリプでも。
> #インディーゲーム開発 #gamedev

### English

**Option 1 (launch)**
> GRANDSTRIDE prototype is out on itch.io.
> Strap into a 28m four-legged war machine. Manage grip on every leg, watch your core temp, and push resonance to 100% for OVERBEAT.
> Two missions, two bosses. Earn PARTS, upgrade legs / core / armor, clear 3 daily goals.
> Free, in your browser (PC + mobile). (itch.io URL)
> #indiedev #gamedev #mecha

**Option 2 (short, with clip)**
> It glows red. It's coming.
> Sidestep. Let it hit the wall. Shoot the weak point on its back.
> GRANDSTRIDE MISSION 02: Harbor Night Sweep. Free browser mech action.
> (URL)
> #indiegame #mecha #threejs

**Option 3 (feedback)**
> Played GRANDSTRIDE? I'd love to know:
> Which upgrade did you buy first? Could you see the RAMSHELL's red glow in time to sidestep? What FPS / device / browser?
> Replies or itch comments both welcome. Building toward a Steam demo.
> #gamedev #indiedev #ScreenshotSaturday

※ 動画は 15〜30 秒を添付（`monetization.md` §6）。現在の `trailer-15s` は MISSION 01 の映像なので、案1・案3 に使う。案2 は MISSION 02（突進型の溜め → 横跳び → 激突 → 背面を撃破）の映像がそろってから投稿する。

---

## 7. 公開前チェックリスト（オーナー向け）

- [ ] 品質設定（低・中・高）と FPS 表示が、アップロードするビルドに入っているか確認（文面で約束しているため）
- [ ] アップロードするビルドに MISSION 02・整備・今日の作戦目標・短い出撃演出が入っているか確認（b52d2fd 以降）
- [ ] MISSION 03 が入ったら、§3・§4・§6 の「coming soon／近日追加」を更新
- [ ] タグが itch の候補に存在するか確認（`upgrades` は特に）
- [x] 開発者名をクレジットに入れる（Team GRANDSTRIDE）
- [x] 説明文（英語・日本語）の本文に生成 AI の使用表示を入れる（§3・§4、§5 の開示と同じ内容）
- [ ] スクリーンショット: 現在の 1〜5 に加え、追加予定の shell-lord / twinshell / harbor をそろえる。カバー画像 630×500
- [ ] itch のページで PC（Chrome/Edge）とスマホ（横向き・全画面）の両方で動作確認、iframe 内でマウス固定と保存（localStorage）が効くか確認
- [ ] 文面に他作品の名前・用語が入っていないか最終確認

# P8 鋼脚戦機 GRANDSTRIDE　X 投稿案（build in public・10本・日英）

作成：Midas（2026-10-09）　状態：**下書き。オーナーの承認前は投稿しない**

- 使うアカウント：既存の自動化用アカウント（オーナー指示）。日本語と英語は同じ日に別々の投稿として出す
- 内容は `peter/p8-mech-game` の実装とストアページ原稿（`mech-game/store/store-page.md`）に合わせた。まだない機能（格納庫、脚の換装、Steam 版など）は「予定」とだけ書いた
- 用語は `mech-game/docs/world-bible.md` に従う（鞍士・鞍座・共鳴率・脚圧・炉温・灰殻・汀都・殻王・イツカ）。**他の作品名、「〜風」「〜好きに」は使わない**
- AI と一緒に作っていることは隠さない（8本目）
- `{ITCH_URL}` は itch.io 公開後に置き換える。リンク付きは9・10本目だけ（公開前はリンクなしで反応を見る）
- 各投稿に「添える素材」を書いた。動画・GIF はオーナーの確認後に、ゲーム画面から本部で切り出す
- 文字数：X の数え方（日本語1字＝2、URL＝23）で、全20本が280以内であることを確認済み
- ハッシュタグ：日本語は `#indiedev` `#ゲーム制作` のうち1〜2個、英語は `#indiedev` `#gamedev` `#threejs` のうち1〜2個

---

### 1. 出撃シーケンス
**JA**
全高28mの四脚機に乗るゲームを作っています。
出撃ボタンを押すと、鞍座の計器が一つずつ点灯し、炉が点火し、神経接続が完了して、格納庫の扉が開く。
この20秒を、毎回わくわくできるものにしたい。
#indiedev #ゲーム制作

**EN**
I'm building a game where you pilot a 28-meter, four-legged war machine.
Press LAUNCH and the cockpit boots around you: gauges light up one by one, the core ignites, the neural link connects, the hangar opens.
I want those 20 seconds to feel good every time.
#indiedev

添える素材：出撃シーケンスの画面録画（15秒）

### 2. 4本の脚
**JA**
このゲームの体力は「脚」です。
前後左右4本の脚にそれぞれ踏ん張り（脚圧）があって、旋回すると外側の脚が、被弾すると当たった側の脚が削れる。
1本が限界になると遅くなり、2本で転倒。
「右前脚がもう持たない」という焦りを作りたい。

**EN**
In this game, your health bar is your legs.
Each of the four legs has its own grip gauge (FL / FR / RL / RR). Turning wears the outer legs, hits wear the side that got hit.
Lose one leg's grip and you slow down. Lose two and you go down.

添える素材：脚圧4本のメーターが赤くなる場面のスクリーンショット

### 3. 共鳴率
**JA**
リズムよく歩いて、撃ち続けて当てると「共鳴率」が上がります。
100%を超えると、短い時間だけ機体が全力で戦う「OVERBEAT（鼓動モード）」に。
計器の色が切り替わる瞬間を、いちばんの見せ場にしたいと思っています。
#ゲーム制作

**EN**
Walk with a steady rhythm and keep landing shots, and your RESONANCE climbs.
Past 100% you hit OVERBEAT: a short burst where the machine fights at full power.
That moment when the gauges change color is the one I'm building everything around.
#gamedev

添える素材：OVERBEAT に入る瞬間の GIF（5秒）

### 4. 炉温
**JA**
撃ちすぎると炉温が上がり、100%で強制冷却。数秒間、動けず撃てなくなります。
いちばん撃ちたい瞬間に、手を止めるかどうか。
重い機体に乗っている感じは、こういう我慢から生まれる気がしています。

**EN**
Fire too much and the core overheats. At 100% the machine forces a cooldown, and for a few seconds you can't move or shoot.
Do you hold fire at the exact moment you most want to shoot?
I think that restraint is where the feeling of weight comes from.

添える素材：炉温計が85%で警告を出す場面

### 5. 音はすべてその場で合成
**JA**
足音、主砲、警報、エンジンのうなり。このゲームの音は、音声ファイルを1つも使わず、ブラウザの Web Audio でその場で合成しています。
28mの脚が地面を踏む「ドン」を作るのに、いちばん時間がかかりました。
#indiedev

**EN**
Footsteps, cannon fire, alarms, engine hum. Every sound in this game is synthesized live with the Web Audio API. There isn't a single audio file.
Getting the thud of a 28-meter leg hitting the ground took the longest.
#indiedev #gamedev

添える素材：音ありの歩行シーン（10秒、音量注意の一言を添える）

### 6. テストで直したこと
**JA**
社内のテストプレイで直したこと：
・発射ボタンを1回タップしただけでも撃てるように
・敵から受けるダメージを半分に
・画質の切り替え（低・中・高）と FPS 表示を追加
最初の1分で投げ出されないことを、いちばん大事にしています。

**EN**
Changes after our internal playtests:
- a single tap now fires
- incoming damage cut in half
- Low / Medium / High quality presets and an FPS display
The thing I care about most is that nobody quits in the first minute.
#gamedev

添える素材：設定画面のスクリーンショット

### 7. 敵と舞台
**JA**
舞台は2091年、海に沈みかけた巨大都市「汀都（ていと）」。
敵は旧時代の自律兵器「灰殻（はいがら）」。
最初の作戦は3分間で12体を倒し、そのあと大型の「殻王」が現れます。
防波堤を越えてくる灰殻を、四脚で食い止める。

**EN**
The setting: Shore City, 2091, a giant city sinking into the sea.
The enemy: the Ashshell, autonomous weapons left over from an older age.
Mission 01 gives you 3 minutes and 12 Ashshell. Then the Shelllord shows up.
#indiedev

添える素材：殻王が現れる場面のスクリーンショット

### 8. AI と一緒に作っている
**JA**
このゲームは AI のコーディング支援を使って、ひとりで作っています。
3D はブラウザで動く Three.js。ファイル1つで、PC でもスマホでも遊べる形にしました。
何を任せて、何を自分で決めたのか。作り方も、ここで少しずつ書いていきます。
#indiedev #ゲーム制作

**EN**
I'm making this solo, with AI coding assistance.
The 3D runs on Three.js in the browser, packed into a single file that plays on PC and phone.
What I hand off and what I decide myself: I'll share that here as I go.
#indiedev #threejs

添える素材：スマホで横向きにプレイしている画面

### 9. 無料公開のお知らせ（itch.io 公開後）
**JA**
四脚機に乗るブラウザゲーム『鋼脚戦機 GRANDSTRIDE』の試作版を無料で公開しました。
1作戦・約3分。ブラウザで今すぐ遊べます。
まだ試作なので、操作の重さや分かりにくい所を教えてもらえるととても助かります。
{ITCH_URL}

**EN**
The GRANDSTRIDE prototype is out, free in your browser.
One mission, about 3 minutes, PC or phone. Pilot a 28m four-legged war machine.
It's early and rough. Tell me where the controls feel too heavy or unclear.
{ITCH_URL}
#indiedev

添える素材：30秒の紹介動画（出撃 → 戦闘 → OVERBEAT → 殻王）

### 10. 次に作るもの（公開の数日後）
**JA**
遊んでくれた方、ありがとうございます。
次は、格納庫で脚を付け替えられるようにする予定です（重い脚、跳ぶ脚、地面に食い込む脚）。
どの脚に乗ってみたいか、返信で教えてください。
{ITCH_URL}

**EN**
Thanks to everyone who played.
Next up: a hangar where you swap legs. Heavy legs, jump legs, anchor legs.
Which one would you want to ride first? Reply and tell me.
{ITCH_URL}
#gamedev

添える素材：脚の3種類のラフ（本部で作る。未着手）

---

## 承認前のチェック
- [ ] 9・10本目は itch.io の公開後に出す。`{ITCH_URL}` を置き換える
- [ ] 6本目の修正内容が、公開する版と一致しているか
- [ ] 10本目の「脚の付け替え」は予定。時期は書かない
- [ ] 動画・画像に、他の作品を思わせる見た目が入っていないか（`docs/monetization.md` §7 の注意点）

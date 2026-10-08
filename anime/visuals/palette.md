# RED LEDGER — Master Palette（マスターパレット）

作成：P7 Anime キャラクターデザイン／美術監督　2026-10-08（シリーズ・バイブル準拠版）
正典：`bible/series-bible.md` §2-2（貸主と印の色）・§4（キャラクター外見）。ここに定義した HEX が全部署（作画・色彩設計・撮影・宣伝・グッズ）の基準値。

---

## 1. Series Palette（シリーズ共通 10色）

| # | Name | HEX | 用途 / Usage |
|---|---|---|---|
| 1 | **Ledger Red**（帳簿赤） | `#E5172F` | 作品のシグネチャー。ジンとハザマの印、ロゴ、タイトル、「払わねえよ。」の発動エフェクト、ランキング盤の書き換え演出。**画面内で最も彩度の高い赤はこれだけ**にする。 |
| 2 | **Ink Black**（墨黒） | `#0E0B10` | 線画・最暗部・キービジュアル背景。純黒 `#000` は使わない（わずかに紫寄りで赤が映える）。 |
| 3 | **Bourse Gold**（取引所金） | `#C9A24A` | 頂〈バース〉の白大理石と金の塔・九条の装飾・公開ランキング盤の枠。くすんだ金属金で、豊かさの貸主の発光色（Abundance Gold）とは区別する。 |
| 4 | **Underledger Teal-Gray**（底帳鈍青） | `#3E5A5C` | 底帳（スラム）の湿気・汚水の滝・夜の基調色。 |
| 5 | **Ribcage Bone**（肋骨白） | `#E9E1CF` | 神の肋骨（白い化石の柱）・仮面・紙の帳簿。ハイライト用の“白”はこれ。 |
| 6 | **Mid-Tier Rust**（中層錆） | `#8A4B32` | 中層の配管・看板・ロープウェイの鉄骨。 |
| 7 | **Debt Smoke**（負債煙） | `#5C5466` | 中間影・霧・遠景の減衰色。 |
| 8 | **Settlement Ivory**（決算象牙） | `#F5EEDD` | 字幕・UI テキストの明色、ロゴの白抜き。 |
| 9 | **Vault Night**（金庫夜） | `#1B1F2E` | 夜空・地下金庫〈深庫〉・暗い室内のベース。 |
| 10 | **Collector Ash**（取立灰） | `#9A958C` | 取立日に“奪われたもの”の脱色表現（色の抜けた目・物）。 |

### ルール
- **赤は「負債」専用。** 背景美術・モブ衣装に `#E5172F` 系の高彩度赤を使わない（看板の赤は `#8A4B32` 寄りに落とす）。
- **金は二種類。** 建築・権力 = Bourse Gold `#C9A24A`（不透明・金属）／発光する借力 = Abundance Gold `#FFDC5A`。
- 取立日の鐘の後、返済できなかった者の印は「赤黒く点滅」（Ledger Red `#E5172F` ⇄ Dried Ink `#7A0614`）。担保を奪われた部分は Collector Ash `#9A958C` に置換。

---

## 2. Ledger-Mark Colors（印の色）── バイブル §2-2 準拠

全市民の **左手首** の印は、契約した貸主の色で発光する。発光色は「コア（明）」と「グロー（外側の滲み）」の2値で管理。強い借力ほど同色の **筋（ライン）** が手首から伸びる（AA は首元まで）。

| 貸主 | 借力 | バイブルの色名 | Mark Name | Core HEX | Glow HEX | 主な所持者 |
|---|---|---|---|---|---|---|
| 鉄の貸主〈カナギ〉 | 硬化・鉄の生成 | 鈍銀（ガンメタル） | **Kanagi Gunmetal** | `#9AA3AD` | `#4A525C` | 榊ドウゲン（両腕・肩までライン） |
| 炎の貸主〈ヒクベ〉 | 発火・熱 | 朱 | **Hikube Vermilion** | `#FF5A1F` | `#A8300A` | （S1 敵選手・モブ） |
| 眼の貸主〈ミハル〉 | 視る力 | 琥珀 | **Miharu Amber** | `#F0921E` | `#8F5208` | 葛葉ミオ |
| 速さの貸主〈トキハヤ〉 | 加速・反射 | 翠 | **Tokihaya Jade** | `#2FC48D` | `#127352` | ツバメ |
| 声の貸主〈ナリヒビキ〉 | 声の支配・衝撃波 | 藍 | **Narihibiki Indigo** | `#4F63E8` | `#212C80` | 霧島ケイ（**色あせ**：`#6F78A8`） |
| 豊かさの貸主〈ウルオイ〉 | 富・幸運 | 金 | **Uruoi Gold** | `#FFDC5A` | `#B8941A` | 九条レイジ（表向き） |
| ゼロの貸主〈ハザマ〉 | 踏み倒し | 赤 | **Ledger Red** | `#E5172F` | `#7A0614` | 赤羽ジン／ハザマ |

### 特殊な印

| 印 | Core HEX | Rim / Glow | 説明 |
|---|---|---|---|
| **Collector Black**（取立人の雇用印） | `#0A0A0C` | 縁 `#9A958C`（発光しない“逆光”） | バースとの雇用契約の色。コレクター共通。光らず、周囲の光を吸うように描く（黒い芯＋灰の細い縁）。ニルの〈差押鎖〉は鉄の貸主からバース経由で借りた力なので、**鎖そのものは Kanagi Gunmetal 系の灰** `#8C949C`。 |
| **Faded Indigo**（ケイ） | `#6F78A8` | `#3A4066` | 声の貸主の藍が色あせたもの。ケイが大声を出さなくなってから光が弱い。7〜9話の過去回想では Narihibiki Indigo `#4F63E8` に戻す。 |
| **ZERO / −∞**（ジン） | `#E5172F` | `#7A0614` | 手首から肘まで真っ赤。残高の数字の代わりに「−∞」。〈肩代わり〉した借力は、その色の筋が赤い印に一本ずつ加わる（9話以降）。 |
| **六色の隠し印**（九条） | 6色すべて | — | 白手袋の下。表向きは金のみ。最終話まで画面に出さない。 |

### 印のデザイン規則
- 形状は共通：手首を一周する **帳簿罫線（二重線）** ＋ 手首内側に **残高の数字**。
- 罫線の本数＝格付け（D=1本 … AAA=6本）。
- ジンの〈デフォルト〉発動時は、相手の印の数字に **赤い取り消し線**（Ledger Red）が入る。

---

## 3. Per-Character Palettes（キャラクター別）── バイブル §4 準拠

各キャラ 5色：Key（シルエット/最大面積）・Sub・Accent(印)・Skin・Hair/Eye。

### 1. 赤羽 ジン Akaba Jin
黒髪＋赤い一房／焦げ茶の目／片袖を切った紺の作業着／首に屋台の手ぬぐい（アニメ表現では長く伸ばした赤い手ぬぐい＝マフラー状にスタイライズ）。

| Role | Name | HEX |
|---|---|---|
| Key | Tenugui Crimson（手ぬぐい・マフラー） | `#C8102E` |
| Sub | Work Navy（紺の作業着） | `#1F2A44` |
| Accent / Mark | Ledger Red（印・赤い前髪の一房） | `#E5172F` |
| Skin | Warm Tan | `#E2B48E` |
| Hair / Eye | Ember Black 髪 / Scorched Brown 瞳（焦げ茶） | `#141012` / `#3B2418` |

### 2. 葛葉 ミオ Kuzuha Mio
銀に近い灰色のボブ＋片目にかかる長い前髪／琥珀の目／小柄／黒いスーツの上着を肩掛け／指先の出た手袋。

| Role | Name | HEX |
|---|---|---|
| Key | Broker Black（肩掛けのスーツ上着） | `#1C1B22` |
| Sub | Silver Bob（髪） | `#B9BCC4` |
| Accent / Mark | Miharu Amber（瞳・印） | `#F0921E` |
| Skin | Porcelain | `#F1D7C4` |
| Shirt / Gloves | Ledger Paper シャツ / Charcoal 手袋 | `#EDE6D6` / `#3A3840` |

### 3. 榊 ドウゲン Sakaki Dōgen
短く刈った白髪混じりの黒髪／灰色の鋭い目／長身・肩幅広い／白い神官服を改造した戦闘着／鈍銀のラインが両腕の肩まで。

| Role | Name | HEX |
|---|---|---|
| Key | Rite White（神官戦闘着） | `#E8E9EA` |
| Sub | Iron Sash（帯・脚絆・杖） | `#3A4048` |
| Accent / Mark | Kanagi Gunmetal（印・腕のライン） | `#9AA3AD` |
| Skin | Cool Beige（体温を払っているため血色が薄い） | `#DCC3AC` |
| Hair / Eye | Frosted Black 髪（白髪混じり） / Slate Gray 瞳 | `#24272C` / `#7E868F` |

### 4. 霧島 ケイ Kirishima Kei
黒髪をきつく後ろでまとめ、こめかみに白髪／切れ長の黒い目・左頬に古傷／がっしり／割烹着の下に古いコレクターの黒いベスト。

| Role | Name | HEX |
|---|---|---|
| Key | Kappōgi Cream（割烹着） | `#E6DCC6` |
| Sub | Collector Vest Black（黒いベスト・ズボン） | `#1E1E24` |
| Accent / Mark | Faded Indigo（色あせた藍） | `#6F78A8` |
| Skin | Weathered Tan | `#C99A76` |
| Hair / Eye | Black + Temple White 髪 / Black 瞳 | `#1A1718` / `#D8D4CC`（白髪） |

### 5. ニル Nil
白い陶器の仮面（目の穴に横線一本、罫線模様）／長い黒コート／異様に長い手袋の指／痩せて長身／灰色の〈差押鎖〉。

| Role | Name | HEX |
|---|---|---|
| Key | Writ Black（長い黒コート） | `#15161A` |
| Sub | Porcelain Mask（仮面） | `#F2EEE6` |
| Accent / Mark | Collector Black（印）＋縁 Collector Ash | `#0A0A0C` / `#9A958C` |
| Chain | Seizure Chain Gray（帳簿の頁を連ねた鎖） | `#8C949C` |
| Gloves / Lining | Glove Charcoal | `#2A2C33` |

### 6. ツバメ Tsubame
ぼさぼさの茶色の短髪をゴーグルで押さえる／大きな緑の目・すきっ歯／小さく細い／ぶかぶかのパーカー／裸足同然のサンダル。

| Role | Name | HEX |
|---|---|---|
| Key | Hand-me-down Ochre（ぶかぶかパーカー） | `#D08A2E` |
| Sub | Goggle Brass / Patch Denim | `#B08D57` / `#3D5A80` |
| Accent / Mark | Tokihaya Jade（印） | `#2FC48D` |
| Skin | Sun Peach | `#EDB98F` |
| Hair / Eye | Chestnut 髪 / Leaf Green 瞳 | `#6B3A1F` / `#4FAF5A` |

### 7. 九条 レイジ Kujō Reiji
きれいに撫でつけた金茶色の髪／細い金縁眼鏡／薄い青灰色の目／中背で姿勢が良い／白い三つ揃い＋白手袋。

| Role | Name | HEX |
|---|---|---|
| Key | Audit White（白い三つ揃い） | `#F2EEE6` |
| Sub | Bourse Gold（眼鏡の縁・タイピン・杖頭） | `#C9A24A` |
| Accent / Mark | Uruoi Gold（印・表向き） | `#FFDC5A` |
| Skin | Pale Ivory | `#EFD9C3` |
| Hair / Eye | Gilded Tea 髪（金茶） / Pale Blue-Gray 瞳 | `#A8783A` / `#9FB0BC` |

### 8. ハザマ Hazama
実体はない。ジンの印から浮かぶ **赤いインクの文字** と子どもの声だけで存在する。夢の中では **顔が帳簿のページで隠れた裸足の子ども**。ビジュアル化する場合（夢・キービジュアル・グッズ）は「赤インクでできた、宙に浮く小さな裸足の子ども、顔に帳簿の頁」で統一。

| Role | Name | HEX |
|---|---|---|
| Key | Ledger Red（インクの身体） | `#E5172F` |
| Sub | Dried Ink（輪郭・滴り） | `#7A0614` |
| Accent | Wet Highlight（インクの照り） | `#FF6B7A` |
| Page | Ribcage Bone（顔を隠す帳簿の頁） | `#E9E1CF` |
| Void | Ink Black（頁の罫線・文字） | `#0E0B10` |

---

## 4. Contrast Notes（コントラスト）

WCAG 相対輝度で算出（小数第1位）。

| 前景 / 背景 | 比 | 判定・用途 |
|---|---|---|
| Settlement Ivory `#F5EEDD` on Ink Black `#0E0B10` | 16.9:1 | 字幕・本文。最優先の組み合わせ。 |
| Ledger Red `#E5172F` on Ink Black `#0E0B10` | 4.2:1 | 大見出し・ロゴ OK（AA Large）。通常サイズの赤文字は避ける。 |
| Ledger Red `#E5172F` on Settlement Ivory `#F5EEDD` | 4.0:1 | 明背景のロゴ OK（Large のみ）。本文は不可。 |
| Bourse Gold `#C9A24A` on Ink Black | 8.1:1 | 格付け UI・クレジット。 |
| Bourse Gold on Settlement Ivory | 2.1:1 | **不可**。明背景では金に Ink Black の縁取りを付ける。 |
| Underledger Teal-Gray `#3E5A5C` on Ink Black | 2.6:1 | 背景同士の分離のみ。文字には使わない。 |

### 印同士の識別（重要）
バイブルの7色は **暖色が4つ（赤353°・朱16°・琥珀33°・金47°）に集中** するため、色相だけに頼らない。

| 近接ペア | 区別の仕方 |
|---|---|
| Ledger Red `#E5172F` vs Hikube Vermilion `#FF5A1F` | 赤は「インクの滴り＋取り消し線」、朱は「炎状に揺らぐグロー」。同一カットでは赤側に Ink Black の罫線を入れる。 |
| Miharu Amber `#F0921E` vs Uruoi Gold `#FFDC5A` | 明度差（琥珀 L0.53／金 L0.68）。琥珀は瞳の中を流れる数字、金は硬貨状の粒子。ミオと九条が同じ画面に並ぶ場合、九条の金は手袋の縫い目から漏れる細い光に限定。 |
| Kanagi Gunmetal `#9AA3AD` vs Collector Black `#0A0A0C` | 鈍銀は鈍く光る、黒は光を吸う（周囲を暗くする逆光処理）。ニルの鎖は灰 `#8C949C`＝鉄由来であることを示す。 |
| Narihibiki Indigo `#4F63E8` vs Faded Indigo `#6F78A8` | 同じ貸主。彩度の差で「現役／色あせ」を表す。 |

**色覚多様性への配慮**：赤（ジン）と翠（ツバメ）、朱と琥珀は P型/D型で混同しうる。印は色だけでなく **長さ・形** で識別できるようにする（ジン＝肘まで、ドウゲン＝肩までのライン、ニル＝光らない黒、ケイ＝布で半分隠す）。

**明暗両背景での運用**：ロゴ・印は必ず Ink Black `#0E0B10` の2〜4px縁取り（または暗いプレート）を伴って配置し、白背景のストア画面でも黒背景のプレイヤーでも同じ見え方にする。Collector Black の印は暗背景では Collector Ash の縁で、明背景ではそのまま黒で見せる。

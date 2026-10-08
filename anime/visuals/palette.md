# RED LEDGER — Master Palette（マスターパレット）

作成：P7 Anime キャラクターデザイン／美術監督　2026-10-08
正典ブリーフ（`docs/01-concept-selection.md`）準拠。ここに定義した HEX が全部署（作画・色彩設計・撮影・宣伝・グッズ）の基準値。

---

## 1. Series Palette（シリーズ共通 10色）

| # | Name | HEX | 用途 / Usage |
|---|---|---|---|
| 1 | **Ledger Red**（帳簿赤） | `#E5172F` | 作品のシグネチャー。ジンとハザマの印、ロゴ、タイトル、「払わねえよ。」の発動エフェクト。**画面内で最も彩度の高い赤はこれだけ**にする。 |
| 2 | **Ink Black**（墨黒） | `#0E0B10` | 線画・最暗部・キービジュアル背景。純黒 `#000` は使わない（わずかに紫寄りで赤が映える）。 |
| 3 | **Bourse Gold**（取引所金） | `#C9A24A` | 頂〈バース〉の建築・九条の装飾・格付けボード。くすんだ金属金で、レンダーの「豊かさ」の発光色（Harvest Gold）とは区別する。 |
| 4 | **Underledger Teal-Gray**（底帳鈍青） | `#3E5A5C` | 底帳（スラム）の空気・湿った壁・夜の基調色。 |
| 5 | **Ribcage Bone**（肋骨白） | `#E9E1CF` | 神の肋骨・仮面・紙の帳簿。ハイライト用の“白”はこれ。 |
| 6 | **Mid-Tier Rust**（中層錆） | `#8A4B32` | 中層の配管・看板・鉄骨。 |
| 7 | **Debt Smoke**（負債煙） | `#5C5466` | 中間影・霧・遠景の減衰色。 |
| 8 | **Settlement Ivory**（決算象牙） | `#F5EEDD` | UI テキスト／字幕の明色、ロゴの白抜き。 |
| 9 | **Vault Night**（金庫夜） | `#1B1F2E` | 夜空・地下金庫・暗い室内のベース。 |
| 10 | **Collector Ash**（取立灰） | `#9A958C` | 取立日に“奪われたもの”の脱色表現（色を抜かれた目・物）。 |

### ルール
- **赤は「負債」専用。** 背景美術・モブ衣装に `#E5172F` 系の高彩度赤を使わない（看板の赤は `#8A4B32` 寄りに落とす）。
- **金は二種類。** 建築・権力 = Bourse Gold `#C9A24A`（不透明・金属）／発光する力 = Harvest Gold `#FFD23F`（レンダー印）。
- 取立日のシーンでは担保を奪われた部分を Collector Ash `#9A958C` に置換して“色が消える”演出を統一する。

---

## 2. The Seven Lenders — Ledger-Mark Colors（7柱の貸主と印の色）

全市民の **左手首** の印は、貸主の色で発光する。発光色は「印のコア（明）」と「グロー（外側の滲み）」の2値で管理。

| Lender（貸主） | 司るもの | Mark Name | Core HEX | Glow HEX | 主な所持者 |
|---|---|---|---|---|---|
| 鉄の貸主 Lender of Iron | 鉄・硬さ・防御 | **Iron Slate** | `#9FB4C8` | `#5E7890` | 榊ドウゲン |
| 炎の貸主 Lender of Flame | 炎・熱 | **Furnace Orange** | `#FF7A1A` | `#B8410A` | 霧島ケイ（元コレクター期） |
| 眼の貸主 Lender of the Eye | 視る力・解析 | **Seer Violet** | `#A77BFF` | `#6A3FD6` | 葛葉ミオ |
| 速さの貸主 Lender of Speed | 速さ・反射 | **Gale Lime** | `#B8F03C` | `#6E9E12` | ツバメ |
| 声の貸主 Lender of Voice | 声・命令・音 | **Echo Blue** | `#3FA9F5` | `#1A64A8` | ニル（取立人の“呼び声”） |
| 豊かさの貸主 Lender of Abundance | 富・増殖・契約 | **Harvest Gold** | `#FFD23F` | `#B8901A` | 九条レイジ |
| ゼロの貸主 ハザマ Lender of Zero | 無・踏み倒し | **Ledger Red** | `#E5172F` | `#7A0614` | 赤羽ジン／ハザマ |

### 印のデザイン規則
- 形状は共通：手首を一周する **帳簿罫線（二重線）** ＋ 手の甲側に **貸主の紋章**（後述 `ledger-mark.svg` 参照）。
- 罫線の本数＝格付け（D=1本 … AAA=6本）。残高が多いほど発光が強い。
- **ジンだけ例外**：手首から肘まで赤い罫線が螺旋状に這い上がり、紋章の代わりに「∅（ゼロ）」の穴が開いている。
- 7色は色相環上でほぼ等間隔（赤0°/橙25°/金47°/ライム80°/青205°/鉄210°(低彩度)/紫260°）。Iron と Echo Blue は色相が近いため、**Iron は彩度を落とした鈍色、Echo は高彩度**で必ず区別する。

---

## 3. Per-Character Palettes（キャラクター別）

各キャラ 5色：Key（シルエット/最大面積）・Sub・Accent・Skin・Hair/Eye。

### 1. 赤羽 ジン Akaba Jin
| Role | Name | HEX |
|---|---|---|
| Key | Scarf Crimson（マフラー） | `#C8102E` |
| Sub | Stall Charcoal（ジャケット） | `#2B2A30` |
| Accent / Mark | Ledger Red | `#E5172F` |
| Skin | Warm Tan | `#E2B48E` |
| Hair / Eye | Ember Black 髪 / Amber 瞳 | `#1E1214` / `#F2A33A` |

### 2. 葛葉 ミオ Kuzuha Mio
| Role | Name | HEX |
|---|---|---|
| Key | Broker Indigo（ロングコート） | `#4B3A8C` |
| Sub | Ledger Paper（シャツ） | `#EDE6D6` |
| Accent / Mark | Seer Violet（片眼レンズ・印） | `#A77BFF` |
| Skin | Porcelain | `#F1D7C4` |
| Hair / Eye | Ash Lilac 髪 / Pale Gray 瞳（担保で色が薄れている） | `#BFB6C9` / `#C9CCD3` |

### 3. 榊 ドウゲン Sakaki Dōgen
| Role | Name | HEX |
|---|---|---|
| Key | Iron Vestment（神官服） | `#4E5D6C` |
| Sub | Rite White（高襟・袖） | `#DDE2E6` |
| Accent / Mark | Iron Slate | `#9FB4C8` |
| Skin | Cool Beige | `#D9B99B` |
| Hair / Eye | Gunmetal 髪 / Steel Blue 瞳 | `#2F3540` / `#6F8FAF` |

### 4. 霧島 ケイ Kirishima Kei
| Role | Name | HEX |
|---|---|---|
| Key | Broth Ochre（作務衣） | `#B5652E` |
| Sub | Apron Canvas（前掛け） | `#E3D3B0` |
| Accent / Mark | Furnace Orange（今は灰色に褪せた印） | `#FF7A1A` |
| Skin | Weathered Tan | `#C99A76` |
| Hair / Eye | Salt-Pepper Black 髪 / Dark Brown 瞳 | `#2C2826` / `#4A2E1E` |

### 5. ニル Nil
| Role | Name | HEX |
|---|---|---|
| Key | Collector Slate（ロングコート） | `#2A3540` |
| Sub | Writ Black（裏地・手袋） | `#141A20` |
| Accent / Mark | Echo Blue（仮面の目スリット・印） | `#3FA9F5` |
| Mask | Ribcage Bone（仮面） | `#E9E1CF` |
| Hook / Metal | Debt Hook Steel（鉤） | `#8C949C` |

### 6. ツバメ Tsubame
| Role | Name | HEX |
|---|---|---|
| Key | Moss Hoodie（オーバーサイズパーカー） | `#7FAE2E` |
| Sub | Patch Denim（短パン・継ぎ当て） | `#3D5A80` |
| Accent / Mark | Gale Lime | `#B8F03C` |
| Skin | Sun Peach | `#EDB98F` |
| Hair / Eye | Chestnut 髪 / Bright Hazel 瞳 | `#6B3A1F` / `#A8B83A` |

### 7. 九条 レイジ Kujō Reiji
| Role | Name | HEX |
|---|---|---|
| Key | Tailcoat Onyx（燕尾服） | `#1C1A22` |
| Sub | Bourse Gold（装飾・懐中時計） | `#C9A24A` |
| Accent / Mark | Harvest Gold | `#FFD23F` |
| Skin | Pale Ivory | `#EFD9C3` |
| Hair / Eye | Silver-White 長髪 / Champagne 瞳 | `#E6E2DA` / `#D8B76A` |

### 8. ハザマ Hazama
| Role | Name | HEX |
|---|---|---|
| Key | Ledger Red（赤インクの身体） | `#E5172F` |
| Sub | Dried Ink（輪郭・滴りの暗部） | `#7A0614` |
| Accent | Wet Highlight（インクの照り） | `#FF6B7A` |
| Void | Ink Black（目と口の“穴”） | `#0E0B10` |
| Paper | Ribcage Bone（帳簿紙の欠片） | `#E9E1CF` |

---

## 4. Contrast Notes（コントラスト）

WCAG 相対輝度で概算（小数点以下丸め）。

| 前景 / 背景 | 比 | 判定・用途 |
|---|---|---|
| Settlement Ivory `#F5EEDD` on Ink Black `#0E0B10` | 約 16.9:1 | 字幕・本文。最優先の組み合わせ。 |
| Ledger Red `#E5172F` on Ink Black `#0E0B10` | 約 4.2:1 | 大見出し・ロゴ OK（AA Large 合格／通常サイズ文字は AA 未満）。小さい赤文字は避ける。 |
| Ledger Red `#E5172F` on Settlement Ivory `#F5EEDD` | 約 4.0:1 | 明背景のロゴ OK（Large）。本文は不可。 |
| Bourse Gold `#C9A24A` on Ink Black | 約 8.1:1 | 格付け UI・クレジット。 |
| Bourse Gold on Settlement Ivory | 約 2.1:1 | **不可**。明背景では金を Ink Black の縁取り付きで使う。 |
| Underledger Teal-Gray `#3E5A5C` on Ink Black | 約 2.6:1 | 背景同士の分離のみ。文字には使わない。 |
| Iron Slate `#9FB4C8` vs Echo Blue `#3FA9F5` | 色相近接 | 同一カットに並ぶ場合は明度差（Iron=鈍く明るい／Echo=鮮やか）と紋章形状で区別。 |
| Ledger Red vs Furnace Orange `#FF7A1A` | 色相近接 | ジン vs ケイの同時発光時は、赤側に Ink Black の罫線を入れ、橙側は炎形のグローで差別化。 |

**色覚多様性への配慮**：赤（ジン）と緑系（ツバメ Gale Lime）はP型/D型で混同しうる。印は色だけでなく **紋章形状**（ゼロ＝穴、速さ＝燕尾、など）で必ず識別できるようにし、ジンの印は「肘まで伸びる長さ」という形でも識別可能にする。

**明暗両背景での運用**：ロゴ・印は必ず Ink Black `#0E0B10` の2〜4px縁取り（または暗いプレート）を伴って配置し、白背景のストア画面でも黒背景のプレイヤーでも同じ見え方にする。

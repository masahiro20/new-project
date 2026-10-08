# RED LEDGER — Character & Key-Visual Prompts（画像生成プロンプト集）

作成：P7 Anime キャラクターデザイン／美術監督　2026-10-08（シリーズ・バイブル準拠版）
正典は `bible/series-bible.md` §2-2・§4。色の基準値は `palette.md`、シルエット基準は `characters-lineup.svg`、構図基準は `key-visual.svg`。

## 共通ルール

- **すべてオリジナル。** プロンプトに既存作品名・作家名・スタジオ名・「〜風」を書かない。
- 画風の指定は描写語だけで行う：`clean anime cel-shading, 2-tone shadows, crisp 1.5px ink line, flat color fills, subtle rim light`。
- 帳簿の印〈レジャーマーク〉は **全員左手首**。ジンだけ手首〜肘まで真っ赤。
- HEX はプロンプト末尾にまとめて書く（多くのモデルは HEX を色名のヒントとして扱うので色名も併記）。

### 推奨アスペクト比

| 用途 | 比率 | 推奨解像度 |
|---|---|---|
| キャラクターシート（ターンアラウンド：正面・3/4・横・背面＋表情） | **3:2** | 3072×2048 |
| 単体立ち絵（全身） | 2:3 | 1365×2048 |
| KV1 メインポスター | **2:3**（縦マスター）＋ 16:9 派生 | 2048×3072 / 3840×2160 |
| KV2 キャストアンサンブル | **16:9** | 3840×2160 |
| KV3 配信サムネイル | **16:9** | 1920×1080（最小 1280×720） |

### 共通ネガティブプロンプト（全プロンプトに追加）

```
photorealistic, 3d render, western cartoon, chibi (unless specified), extra fingers, fused fingers, missing hands, extra limbs, deformed face, asymmetric eyes, blurry, lowres, jpeg artifacts, watermark, signature, text artifacts, existing brand logo, copyrighted character, famous character likeness, mark on right wrist, multiple ledger marks, gradient mesh shading, oversaturated background
```

---

## 1. 赤羽 ジン — Akaba Jin（16, 主人公, 格付け ZERO）

**Silhouette key**: spiky black hair with ONE red forelock; left sleeve cut off at the shoulder so the red mark (wrist→elbow) is always visible; long crimson stall towel worn like a scarf, tails trailing to the ankles.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 facial expressions (crooked grin, furious, exhausted), original anime character, clean anime cel-shading with 2-tone shadows, crisp ink lineart, plain warm-gray background with thin ledger grid lines.
16-year-old boy, slim and quick, average height (168 cm), loose street-kid posture.
Hair: spiky, untamed jet-black hair (#141012) with a single bright red forelock (#E5172F) falling over the forehead.
Eyes: dark scorched-brown eyes (#3B2418); a thin red line crosses the irises only when his power activates. Confident crooked grin.
Outfit: navy work coverall jacket (#1F2A44) with the LEFT sleeve roughly cut off at the shoulder, right sleeve rolled, patched work pants, worn canvas boots.
Signature: a noodle-stall towel (tenugui) around his neck, stylized as an extremely long tattered crimson cloth (#C8102E) whose tails trail to the ankles, faint ruled ledger lines printed along it.
Ledger mark: on the LEFT arm, solid glowing Ledger Red (#E5172F) from wrist to elbow, double ruled lines spiraling up the forearm, the symbol "−∞" floating at the inner wrist instead of a balance number, red ink droplets lifting off the skin.
Palette: Tenugui Crimson #C8102E, Work Navy #1F2A44, Ledger Red #E5172F, skin Warm Tan #E2B48E, hair #141012, eyes #3B2418.
```

**Negative**: 共通ネガ + `amber eyes, golden eyes, clean pristine clothes, armor, cape, both sleeves intact, mark on right arm, blue scarf, short scarf, all-red hair`

> **設計メモ（JP）**：記号は「黒髪に赤い一房」「片袖のない紺の作業着」「足首まで届く赤い手ぬぐい（バイブルの“首に屋台の手ぬぐい”をアニメ的に誇張）」。手ぬぐいは帳簿の罫線のように動き、アクションの軌跡が赤い線になる。左袖がないので、肘までの赤い印が常に見える。目は焦げ茶、発動時のみ瞳に赤い線。

---

## 2. 葛葉 ミオ — Kuzuha Mio（17, 投資家・参謀）

**Silhouette key**: small figure; sharp silver-grey bob with a long fringe hiding one eye; black suit jacket draped over the shoulders like a cape with empty sleeves hanging; slim calculating fan.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (cool appraisal, smug "that's why I'm buying", hidden worry), original anime character, clean anime cel-shading, crisp ink lineart, plain light background with faint ledger grid.
17-year-old girl, petite (152 cm), upright composed posture.
Hair: precise chin-length bob in near-silver grey (#B9BCC4), one long fringe falling over her RIGHT eye.
Eyes: amber eyes (#F0921E); when using her power, tiny glowing numerals stream across the irises. Her right eye is going blind (slightly clouded under the fringe).
Outfit: oversized black suit jacket (#1C1B22) worn draped over her shoulders like a cape, sleeves hanging empty; crisp ledger-paper white shirt (#EDE6D6) with a thin black ribbon tie; dark fitted trousers or short skirt with tights; fingerless charcoal gloves (#3A3840); low-heeled boots. Holds a slim folding calculating fan.
Ledger mark: on the LEFT wrist, Miharu Amber (#F0921E) double ruled lines with a balance number, softly glowing above the fingerless glove.
Palette: Broker Black #1C1B22, Silver Bob #B9BCC4, Miharu Amber #F0921E, skin Porcelain #F1D7C4, shirt #EDE6D6.
```

**Negative**: 共通ネガ + `violet eyes, purple, long hair, twin tails, glasses on both eyes, school uniform, cleavage, fanservice pose, tall`

> **設計メモ（JP）**：「小柄な体に大きすぎる黒い上着」の三角シルエット。肩掛けの上着の空っぽの袖が、彼女が“自分では戦わない投資家”であることの記号。右目は前髪で隠れ、視力を担保にしているため話数が進むほど白濁を強める（色彩設計で段階管理）。瞳の琥珀はジンの焦げ茶と明確に区別する。

---

## 3. 榊 ドウゲン — Sakaki Dōgen（18, ライバル, 格付け AA）

**Silhouette key**: tallest teen in the cast, perfectly vertical; white priest-style combat garb with a stiff high collar; gunmetal lines running up BOTH arms to the shoulders; an iron staff he forges from his own power.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (stern, disdainful, rare doubt), original anime character, clean anime cel-shading, crisp ink lineart, plain cool-gray background.
18-year-old young man, tall and broad-shouldered (188 cm), rigid ceremonial posture.
Hair: short-cropped black hair (#24272C) with streaks of white mixed in.
Eyes: sharp slate-gray eyes (#7E868F), heavy straight brows, pale complexion (he pays with his body heat; faint frost on his breath).
Outfit: white priest-style combat garb (#E8E9EA) modified for fighting: stiff high collar, layered white robe cut at the shins, wide sleeves bound tight at the forearms with iron rings, dark iron-gray sash and leggings (#3A4048), metal-soled sandals.
Power lines: glowing Kanagi Gunmetal (#9AA3AD) lines running from both wrists up both arms to the shoulders (AA class).
Prop: a long iron staff taller than himself, formed from his borrowed iron, topped with a ring shaped like a vault lock.
Ledger mark: on the LEFT wrist, Kanagi Gunmetal (#9AA3AD) six perfectly straight ruled lines (never late), cold steady glow.
Palette: Rite White #E8E9EA, Iron Sash #3A4048, Kanagi Gunmetal #9AA3AD, skin Cool Beige #DCC3AC, hair #24272C.
```

**Negative**: 共通ネガ + `gray robe, colored robe, smiling broadly, long hair, messy hair, red accents, knight helmet, sword, warm skin tones`

> **設計メモ（JP）**：「白い垂直線」のキャラ。高襟・杖・直立姿勢ですべて縦の線を揃え、ジンの斜めでぐにゃっとした線と対比させる。白い衣装に鈍銀のラインが肩まで這うのが“AAの強さ”の視覚記号。体温を払っているので、肌は血色を抜き、吐く息を白くする。

---

## 4. 霧島 ケイ — Kirishima Kei（40代, 保護者・師匠）

**Silhouette key**: sturdy wide stance; hair pulled tightly back into a hard knot; long kappōgi (sleeved work apron) to the knees with an old black collector vest visible at the collar; noodle strainer as a prop.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (gruff "Eat. Then we talk.", rare laugh, haunted), original anime character, clean anime cel-shading, crisp ink lineart, plain warm background.
Woman in her mid-40s, strong and broad-shouldered, solid grounded stance (168 cm), burn marks on her forearms.
Hair: black hair (#1A1718) pulled tightly back into a hard low knot, white streaks at the temples (#D8D4CC).
Eyes: narrow, sharp black eyes, an old scar across the LEFT cheek, laugh lines.
Outfit: cream sleeved work apron / kappōgi (#E6DCC6) reaching the knees, with broth stains; underneath, an old fitted black collector's vest (#1E1E24) with tarnished buttons showing at the collar and hem; dark work trousers; wooden platform sandals; a long-handled noodle strainer hanging from her belt like a weapon.
Ledger mark: on the LEFT wrist, a faded indigo (#6F78A8) mark, half hidden under a wrapped cloth bandage.
Palette: Kappōgi Cream #E6DCC6, Collector Vest Black #1E1E24, Faded Indigo #6F78A8, skin Weathered Tan #C99A76, hair #1A1718.
```

**Negative**: 共通ネガ + `young girl, slim model figure, glamorous makeup, kimono, maid outfit, orange mark, topknot with ornaments`

> **設計メモ（JP）**：台形（下が広い）シルエット。きつい後ろまとめ髪と膝までの割烹着で遠目にも識別できる。割烹着の襟元から黒いベストが覗く＝コレクターの過去を“着たまま”でいる記号。印は藍が色あせた灰青で、布で半分隠す。7〜9話の回想では Narihibiki Indigo `#4F63E8` に戻す。

---

## 5. ニル — Nil（年齢不詳, 仮面の取立人）

**Silhouette key**: white porcelain oval mask; floor-length black coat with a split hem like torn ledger pages; unnaturally long gloved fingers; tall, thin, slightly stooped; a gray chain made of linked ledger pages.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 poses (idle menace, chain throw, mask cracked), original anime character, clean anime cel-shading, crisp ink lineart, plain dark slate background.
Masked collector of indeterminate age, very tall and thin (185 cm), slightly stooped, abnormally long gloved fingers.
Mask: smooth white porcelain oval mask (#F2EEE6) with no mouth; each eye hole is crossed by a single horizontal line, and faint ruled ledger lines are engraved across the surface.
Outfit: floor-length black collector's coat (#15161A) with a high collar and a deep split hem that flares like torn pages, charcoal gloves (#2A2C33) with elongated fingers, a belt of small tally beads.
Prop / power: the "Seizure Chain" — a long gray chain (#8C949C) whose links look like folded ledger pages, wrapped around his right arm and trailing to the ground.
Ledger mark: on the LEFT wrist, a BLACK collector employment mark (#0A0A0C) that does not glow — it seems to swallow light — outlined by a thin ash-gray rim (#9A958C).
Palette: Writ Black #15161A, Porcelain Mask #F2EEE6, Collector Black #0A0A0C, Seizure Chain Gray #8C949C, gloves #2A2C33.
```

**Negative**: 共通ネガ + `visible face, mouth on mask, skull face, gore, hockey mask, scythe, hook, blue glow, glowing eyes, colored mark`

> **設計メモ（JP）**：顔がない＝「名前を奪われた人」。印は黒＝バースの雇用契約の色で、光らずに周りの光を吸う。〈差押鎖〉は鉄の貸主からバース経由で借りた力なので鉄系の灰。鎖の輪は帳簿の頁を折ったデザインにし、縛った相手から担保が“頁”として引きずり出される。コートの裾も頁のように割れて揺れる。

---

## 6. ツバメ — Tsubame（12, 情報屋, 格付け D）

**Silhouette key**: smallest human in the cast; huge baggy hoodie with the hood down (two swallow-tail points on the hood); goggles pushed up on messy hair; skinny bare legs in flat sandals.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 4 expressions (gap-toothed grin, panic, pouting, proud), original anime character, clean anime cel-shading, crisp ink lineart, plain light background.
12-year-old girl, tiny and thin (136 cm), crouched ready-to-run posture.
Hair: messy short chestnut-brown hair (#6B3A1F) held back by a pair of brass flight goggles (#B08D57) pushed up on her forehead.
Eyes: big bright green eyes (#4FAF5A), gap-toothed grin, band-aid on the nose.
Outfit: hugely oversized ochre hoodie (#D08A2E) reaching mid-thigh, sleeves swallowing her hands, hood down with two pointed swallow-tail tips; patched denim shorts (#3D5A80); worn flat sandals that are almost barefoot; a string of stolen keys and coins at her hip.
Ledger mark: on the LEFT wrist, small Tokihaya Jade (#2FC48D) mark with a single ruled line (rank D), peeking out of the sleeve cuff.
Palette: Hand-me-down Ochre #D08A2E, Patch Denim #3D5A80, Tokihaya Jade #2FC48D, skin Sun Peach #EDB98F, hair #6B3A1F, goggles #B08D57.
```

**Negative**: 共通ネガ + `adult proportions, sexualized, makeup, long legs model pose, school uniform, sneakers, lime green mark`

> **設計メモ（JP）**：大きなパーカーで「頭でっかちの逆三角形」シルエット。フードの燕尾2本が名前（ツバメ）の記号、ゴーグルは「いつか空を見る」夢の記号。子どもなので性的な強調は一切しない（全媒体で厳守）。9話以降（肩代わり後）は印の翠が消え、空白の印になる。

---

## 7. 九条 レイジ — Kujō Reiji（30代, バース頭取, S1の黒幕）

**Silhouette key**: medium height, immaculate straight posture; white three-piece suit with a long jacket line; slicked-back hair; thin gold-rim glasses catching the light; white gloves; slim cane topped with a gold balance scale.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (gentle smile, glasses-glint cold smile, the smile finally cracking), original anime character, clean anime cel-shading, crisp ink lineart, plain dark background with faint gold ledger grid.
Man in his mid-30s, medium height (175 cm), perfect upright posture, graceful.
Hair: neatly slicked-back golden-tea brown hair (#A8783A), not a strand out of place.
Eyes: pale blue-gray eyes (#9FB0BC) behind thin gold-rim glasses (#C9A24A).
Outfit: immaculate white three-piece suit (#F2EEE6) — jacket, waistcoat and trousers — gold tie pin and pocket-watch chain in Bourse Gold (#C9A24A), pale gray shirt and tie, white gloves, white shoes. Optional prop: slim white cane topped with a small golden balance scale.
Ledger mark: on the LEFT wrist, Uruoi Gold (#FFDC5A), mostly hidden by the white glove, light leaking through the seams. (Secret, never shown in S1 promo: all six lender colors under the glove.)
Palette: Audit White #F2EEE6, Bourse Gold #C9A24A, Uruoi Gold #FFDC5A, skin Pale Ivory #EFD9C3, hair #A8783A, eyes #9FB0BC.
```

**Negative**: 共通ネガ + `black suit, tailcoat, top hat, long hair, silver hair, monster villain, scars, armor, red eyes, cape, multiple colored marks visible`

> **設計メモ（JP）**：真っ白な三つ揃い＝「帳簿の白い頁」。バース（白大理石と金）と同じ配色で、彼が都市そのものであることを示す。笑顔が基本で、眼鏡の反射で目を隠すカットを“本性”の演出に使う。手袋は絶対に外さない（六色の隠し印は最終話まで秘匿）。

---

## 8. ハザマ — Hazama（ゼロの貸主）

バイブル上、ハザマは **実体を持たない**（ジンの印から浮かぶ赤インクの文字＋子どもの声）。本編では「インクの文字」として演出し、**夢の中とプロモーション用ビジュアルに限り**、下記の姿で描く。

**Silhouette key**: a small barefoot child made of red ink, floating; face completely hidden behind a single ledger page; body dissolving into dripping ink and handwritten red characters at the edges.

```
Creature/character design sheet, 4 views (front, three-quarter, side, back) plus 3 variants (ink text only, dream child, giggling with the page fluttering), original anime character, clean anime cel-shading, crisp ink lineart, plain cream ledger-paper background.
A small child-shaped being (about the size of a 6-year-old), floating barefoot a little above the ground, made entirely of glossy red ink (#E5172F) with dark dried-ink outlines (#7A0614) and pink wet highlights (#FF6B7A).
Face: completely hidden behind a single old ledger page (#E9E1CF) stuck to the face like a mask, with ruled lines and handwritten numbers in ink black (#0E0B10); only a wide childlike smile is hinted through the paper.
Body: simple oversized shirt-like silhouette, tiny bare feet with ink dripping from the toes; the edges of the body dissolve into floating handwritten red characters and ruled lines.
Connection: a thin thread of red ink always links the child to the boy's left wrist.
Palette: Ledger Red #E5172F, Dried Ink #7A0614, Wet Highlight #FF6B7A, Ribcage Bone #E9E1CF, Ink Black #0E0B10.
```

**Negative**: 共通ネガ + `visible face, eyes, human child skin, realistic blood, gore, demon horns, wings, cute mascot plush, shoes`

> **設計メモ（JP）**：可愛さと不気味さの境界線。顔は常に帳簿の頁で隠す（顔を見せない＝正体不明）。本編の通常回では姿を出さず、ジンの手首から浮かぶ赤い手書き文字（「つけとくね」）で存在を示す。グッズでは「頁で顔を隠した赤い子ども」をシンボルとして使用可。

---

# Key Visuals（キービジュアル）

## KV1 — Main Poster「I'm not paying.」

**Aspect**: 2:3 vertical master (2048×3072)、16:9 派生 (3840×2160)（`key-visual.svg` が 16:9 派生の構図基準）。

```
Original anime key visual, vertical poster composition, clean anime cel-shading with dramatic painted background, high contrast, cinematic low-angle.
Foreground: a 16-year-old boy seen from a low three-quarter back angle, spiky black hair with one red forelock, navy work jacket with the left sleeve cut off, a very long tattered crimson tenugui scarf (#C8102E) whipping in the wind toward the city; he raises his bare LEFT arm straight up toward the sky, fist clenched; the forearm glows solid Ledger Red (#E5172F) from wrist to elbow with spiraling ruled lines, red ink droplets rising upward from it; a tiny red-ink child with a ledger page over its face peeks over his shoulder.
Background: Kanegura, a colossal vertical city built on the giant fossilized ribcage of a dead god: white fossil ribs (#E9E1CF) rising hundreds of stories, buildings clinging between the bones like bird nests, the Underledger slum with teal-gray haze (#3E5A5C) and thin waterfalls of runoff at the bottom, neon mid-tier with ropeways (#8A4B32), and at the summit the Bourse, a white marble and gold tower (#C9A24A) above the clouds with a huge circular public ranking board projected into the sky.
Sky: ink black (#0E0B10) to deep vault blue (#1B1F2E), a huge blood-red moon behind the summit, horizontal red ledger lines ruled across the sky as if the world is written on accounting paper.
Lighting: strong red rim light on the boy from his own arm, cold gold light from the summit.
Leave the top 15% and bottom 20% clear for title and tagline.
```

**Negative**: 共通ネガ + `text, title lettering, daytime, blue sky, crowd, multiple boys, right arm raised, both sleeves intact`

> 構図メモ：主人公を下1/3に大きく、腕と肋骨の曲線で視線を「赤い月→頂のバース」へ導く。タイトル「RED LEDGER / 赤い帳簿」、タグライン *Everything is borrowed. He's not paying.*

## KV2 — Cast Ensemble

**Aspect**: 16:9 (3840×2160)。

```
Original anime ensemble key visual, 16:9, clean anime cel-shading, painted background, layered composition by power hierarchy (lowest rank in front, highest at the top).
Center-front: spiky-haired boy with one red forelock, navy work jacket with the left sleeve cut off, long crimson tenugui scarf, red glowing left forearm, grinning, fist toward the viewer; a tiny red-ink child with a ledger page over its face floats at his shoulder, linked to his wrist by a thread of ink.
Left-front: petite girl with a silver-grey bob and long fringe over one eye, amber eyes with streaming numerals, black suit jacket draped over her shoulders, folding fan, cool smirk.
Right-front: tiny girl in a huge ochre hoodie with swallow-tail hood, goggles on messy brown hair, sandals, grinning, juggling stolen coins.
Mid-left: sturdy woman in her 40s with hair pulled tightly back, white at the temples, scar on her cheek, cream kappōgi over a black vest, noodle strainer, arms crossed.
Mid-right: tall young man with short black-and-white cropped hair in white priest-style combat garb, gunmetal lines up both arms, iron staff, glaring at the boy.
Back-left: very tall thin masked collector in a floor-length black coat, white porcelain mask with a line across each eye hole, gray chain of ledger pages.
Back-top, largest and furthest: man in an immaculate white three-piece suit, slicked-back golden-brown hair, gold-rim glasses glinting, white gloves, smiling, framed by the white-and-gold Bourse tower.
Left-wrist marks: red #E5172F (boy), amber #F0921E (broker girl), jade #2FC48D (small girl), faded indigo #6F78A8 (woman), gunmetal #9AA3AD (priest), black non-glowing #0A0A0C (collector), gold #FFDC5A (man in white).
Background: the vertical city on a giant ribcage, red ledger lines across a night sky, red moon.
```

**Negative**: 共通ネガ + `text, all characters same height, flat lineup, chibi, mismatched colors`

## KV3 — Streaming Thumbnail（配信サービス用サムネイル）

**Aspect**: 16:9 (1920×1080)。**Title-safe**：左40%をロゴ・タイトル用に空ける（Ink Black のグラデーションで沈める）。右上と下端 8% はサービス側 UI（バッジ・プログレスバー）が重なるため顔・手を置かない。中央の 1:1 クロップと 2:3 クロップでも主人公の顔と赤い腕が残る位置に配置。

```
Original anime streaming thumbnail, 16:9, bold and readable at small sizes, clean anime cel-shading, extreme close-up.
Right 55% of the frame: tight close-up of a 16-year-old boy's face, spiky black hair with one red forelock, dark brown eyes with a thin red line through the irises, defiant crooked grin; his bare LEFT forearm raised in front of his chin glowing solid Ledger Red (#E5172F) with ruled lines and "−∞" at the wrist, red ink splashing outward; a long crimson tenugui scarf (#C8102E) slicing diagonally across the frame.
Left 40%: dark negative space fading to ink black (#0E0B10) with faint red ledger grid lines, kept empty for the title logo.
Simple high-contrast lighting, strong red rim light, no small details, readable at 320x180.
```

**Negative**: 共通ネガ + `text, logo, busy background, multiple characters, face in left half, face at frame bottom, amber eyes`

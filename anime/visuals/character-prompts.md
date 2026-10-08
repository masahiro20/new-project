# RED LEDGER — Character & Key-Visual Prompts（画像生成プロンプト集）

作成：P7 Anime キャラクターデザイン／美術監督　2026-10-08
色の基準値は `palette.md`、シルエット基準は `characters-lineup.svg`、構図基準は `key-visual.svg`。

## 共通ルール

- **すべてオリジナル。** プロンプトに既存作品名・作家名・スタジオ名・「〜風」を書かない。
- 画風の指定は描写語だけで行う：`clean anime cel-shading, 2-tone shadows, crisp 1.5px ink line, flat color fills, subtle rim light`。
- 帳簿の印〈レジャーマーク〉は **全員左手首**。ジンだけ手首〜肘まで。
- HEX はプロンプト末尾にまとめて書く（多くのモデルは HEX を「色名のヒント」として扱うので色名も併記）。

### 推奨アスペクト比

| 用途 | 比率 | 推奨解像度 |
|---|---|---|
| キャラクターシート（ターンアラウンド：正面・3/4・横・背面） | **3:2** | 3072×2048 |
| 単体立ち絵（全身） | 2:3 | 1365×2048 |
| KV1 メインポスター | **2:3**（縦）＋ 16:9 派生 | 2048×3072 / 3840×2160 |
| KV2 キャストアンサンブル | **16:9** | 3840×2160 |
| KV3 配信サムネイル | **16:9** | 1920×1080（最小 1280×720） |

### 共通ネガティブプロンプト（全プロンプトに追加）

```
photorealistic, 3d render, western cartoon, chibi (unless specified), extra fingers, fused fingers, missing hands, extra limbs, deformed face, asymmetric eyes, blurry, lowres, jpeg artifacts, watermark, signature, text artifacts, logo of existing brand, copyrighted character, famous character likeness, mark on right wrist, multiple ledger marks, gradient mesh shading, oversaturated background
```

---

## 1. 赤羽 ジン — Akaba Jin（16, 主人公）

**Silhouette key**: spiky up-swept hair + very long scarf trailing behind like a red ledger line; long left arm with glowing red mark from wrist to elbow.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 facial expressions (grinning, furious, exhausted), original anime character, clean anime cel-shading with 2-tone shadows, crisp ink lineart, plain warm-gray background with thin ledger grid lines.
16-year-old boy, lean and wiry, slightly hunched street-kid posture, 165 cm.
Hair: spiky, up-swept, untamed black hair with dark red undertone (#1E1214), one stubborn cowlick.
Eyes: sharp amber eyes (#F2A33A), slightly sleepy lids, a confident crooked grin showing one chipped canine.
Outfit: oversized charcoal work jacket (#2B2A30) with rolled sleeves, left sleeve permanently pushed to the elbow, patched cargo pants, worn canvas boots, a noodle-stall towel tucked in back pocket.
Signature: extremely long tattered crimson scarf (#C8102E) wrapped twice around the neck, the tails trailing to the ankles like a ruled ledger line, with faint ruled lines printed along it.
Ledger mark: on the LEFT wrist, glowing Ledger Red (#E5172F) double ruled lines that spiral up the forearm to the elbow, with a hollow "zero" ring on the back of the hand; faint red ink drips.
Palette: Scarf Crimson #C8102E, Stall Charcoal #2B2A30, Ledger Red #E5172F, skin Warm Tan #E2B48E, hair #1E1214, eyes #F2A33A.
```

**Negative**: 共通ネガ + `clean pristine clothes, heroic armor, cape, mark on right arm, blue scarf, short scarf`

> **設計メモ（JP）**：シルエットの記号は「逆立った髪」と「足首まで届く長いマフラー」。マフラーは帳簿の罫線を引くように動き、アクションの軌跡＝赤い線になる。左袖は常にまくり上げ、肘までの赤い印を隠さない。“笑う主人公”なので、口元は基本的に片側だけ上がった笑い。

---

## 2. 葛葉 ミオ — Kuzuha Mio（17, ブローカー／参謀）

**Silhouette key**: sharp chin-length bob + ankle-length long coat with a stiff flared hem + single round lens over the right eye.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (cool appraisal, smug, hidden worry), original anime character, clean anime cel-shading, crisp ink lineart, plain light background with faint ledger grid.
17-year-old girl, slim, upright posture, 160 cm, always holding a slim abacus-like calculating fan.
Hair: precise chin-length bob in ash lilac (#BFB6C9), straight blunt bangs cut slightly asymmetrically.
Eyes: pale gray eyes (#C9CCD3) with faded color (her eyesight is collateral), right eye covered by a round monocle-like violet lens (#A77BFF) with tiny floating numerals projected inside it.
Outfit: ankle-length indigo broker's long coat (#4B3A8C) with stiff flared hem and high turned-up collar, cream ledger-paper shirt (#EDE6D6) with a thin black ribbon tie, black gloves on the right hand only, short boots.
Ledger mark: on the LEFT wrist, Seer Violet (#A77BFF) double ruled lines with an eye-shaped crest, glowing softly.
Palette: Broker Indigo #4B3A8C, Ledger Paper #EDE6D6, Seer Violet #A77BFF, skin Porcelain #F1D7C4, hair #BFB6C9.
```

**Negative**: 共通ネガ + `glasses on both eyes, eyepatch, long hair, twin tails, school uniform, cleavage, fanservice pose`

> **設計メモ（JP）**：ボブ＋ロングコートの「縦長の三角形」シルエット。右目の単眼レンズに数字（残高・勝率）が浮かぶのが能力表現。視力を担保にしているため瞳は色が薄く、話数が進むほど彩度を下げていく（色彩設計で段階管理）。

---

## 3. 榊 ドウゲン — Sakaki Dōgen（18, ライバル／AA）

**Silhouette key**: tallest teen in the cast, perfectly vertical; very high stiff collar framing the jaw; long iron staff held upright taller than himself.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (stern, disdainful, rare surprised), original anime character, clean anime cel-shading, crisp ink lineart, plain cool-gray background.
18-year-old young man, tall and broad-shouldered, rigid ceremonial posture, 188 cm.
Hair: neat swept-back gunmetal hair (#2F3540), one short lock falling over the forehead.
Eyes: narrow steel-blue eyes (#6F8FAF), heavy straight brows.
Outfit: iron-gray priestly vestment (#4E5D6C), layered like overlapping steel plates, with a very high stiff white collar (#DDE2E6) that reaches the jawline, white wide sleeves bound with iron rings, long tabard panels to the shins, sandals with metal soles.
Prop: a long iron staff taller than him, topped with a ring-shaped seal that looks like a vault lock.
Ledger mark: on the LEFT wrist, Iron Slate (#9FB4C8) six perfectly straight ruled lines (rank AA, never late), square crest; the glow is cold and steady.
Palette: Iron Vestment #4E5D6C, Rite White #DDE2E6, Iron Slate #9FB4C8, skin Cool Beige #D9B99B, hair #2F3540, eyes #6F8FAF.
```

**Negative**: 共通ネガ + `smiling broadly, messy hair, red accents, armor knight helmet, sword`

> **設計メモ（JP）**：「垂直線」のキャラ。高襟・杖・直立姿勢ですべて縦の線を揃え、ジンの斜め・ぐにゃっとした線と対比させる。印の罫線も一切乱れない6本線＝“完済者”の几帳面さ。

---

## 4. 霧島 ケイ — Kirishima Kei（40代, 保護者／師匠）

**Silhouette key**: sturdy wide stance; topknot bun; long apron to the shins; ladle or noodle strainer as a prop.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (gruff, laughing, haunted), original anime character, clean anime cel-shading, crisp ink lineart, plain warm background.
Woman in her mid-40s, strong and broad-shouldered, solid grounded stance, 170 cm, burn scars on forearms.
Hair: black hair streaked with gray (#2C2826), tied in a tight topknot bun held by two chopsticks, loose strands at the temples.
Eyes: dark brown tired eyes (#4A2E1E) with laugh lines, a thin old scar across the left eyebrow.
Outfit: ochre work jacket (#B5652E) with sleeves tied back by a cord, long canvas apron (#E3D3B0) reaching the shins with broth stains, dark trousers, wooden geta-like platform sandals; a long-handled noodle strainer hanging from her belt like a weapon.
Ledger mark: on the LEFT wrist, a faded Furnace Orange (#FF7A1A) mark that is mostly ash-gray, partly hidden under a wrapped cloth bandage (she hides her collector past).
Palette: Broth Ochre #B5652E, Apron Canvas #E3D3B0, Furnace Orange #FF7A1A (faded), skin Weathered Tan #C99A76, hair #2C2826.
```

**Negative**: 共通ネガ + `young girl, slim model figure, glamorous makeup, kimono, maid outfit`

> **設計メモ（JP）**：台形（下が広い）シルエット。お団子と長い前掛けで遠目にも識別できる。印は布で隠しており、過去が露見する7〜9話で初めて“炎色に戻る”演出をする（それまでは灰色寄り）。

---

## 5. ニル — Nil（年齢不詳, 仮面の取立人）

**Silhouette key**: featureless oval mask; floor-length coat with a split hem; a large debt-hook on a chain in the right hand; slightly stooped, too-long arms.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 poses (idle menace, hook throw, mask cracked), original anime character, clean anime cel-shading, crisp ink lineart, plain dark slate background.
Masked collector of indeterminate age, tall and thin with unnaturally long arms, slightly stooped, 182 cm.
Mask: smooth bone-white oval mask (#E9E1CF) with no mouth, a single horizontal eye slit glowing Echo Blue (#3FA9F5), a ledger-line engraving down the middle, and a blank name plate on the forehead (his name was taken as collateral).
Outfit: floor-length collector's coat in dark slate (#2A3540) with a deep split hem that flares like torn pages, high collar, black inner lining and gloves (#141A20), rows of small brass tally beads on the belt.
Prop: a large curved debt hook (#8C949C) attached to a long chain wrapped around the right arm.
Ledger mark: on the LEFT wrist, Echo Blue (#3FA9F5) mark crossed out by a black line (a defaulted contract).
Palette: Collector Slate #2A3540, Writ Black #141A20, Echo Blue #3FA9F5, Ribcage Bone #E9E1CF, Debt Hook Steel #8C949C.
```

**Negative**: 共通ネガ + `visible face, mouth on mask, skull face, horror gore, hockey mask, scythe`

> **設計メモ（JP）**：顔がない＝「名前を奪われた人」。仮面の額の“空白の名札”が正体の伏線。コートの裾は破れた帳簿のページのように割れ、動くとページがめくれるように揺れる。

---

## 6. ツバメ — Tsubame（12, スリ／情報屋）

**Silhouette key**: smallest human in the cast; huge oversized hoodie swallowing her hands, with two swallow-tail points on the hood; bare skinny legs and oversized sneakers.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 4 expressions (mischievous grin, panic, pouting, proud), original anime character, clean anime cel-shading, crisp ink lineart, plain light background.
12-year-old girl, tiny and quick, crouched ready-to-run posture, 138 cm.
Hair: messy short chestnut hair (#6B3A1F) sticking out from under the hood, one long braid over the shoulder.
Eyes: big bright hazel eyes (#A8B83A), gap-toothed grin, band-aid on the nose.
Outfit: hugely oversized moss-green hoodie (#7FAE2E) reaching mid-thigh, sleeves covering her hands, hood with two pointed swallow-tail tips at the back, patched denim shorts (#3D5A80), mismatched socks, oversized sneakers; dozens of stolen keys and coins jingling on a string.
Ledger mark: on the LEFT wrist, small Gale Lime (#B8F03C) mark with a single ruled line (rank D) and a swallow-tail crest.
Palette: Moss Hoodie #7FAE2E, Patch Denim #3D5A80, Gale Lime #B8F03C, skin Sun Peach #EDB98F, hair #6B3A1F.
```

**Negative**: 共通ネガ + `adult proportions, sexualized, makeup, long legs model pose, school uniform`

> **設計メモ（JP）**：大きなパーカーで「逆三角形の頭でっかち」シルエット。フードの燕尾2本が名前（ツバメ）の記号。子どもなので性的な強調は一切しない（全媒体で厳守）。

---

## 7. 九条 レイジ — Kujō Reiji（30代, 取引所頭取／S1黒幕）

**Silhouette key**: tall, elegant; tall stovepipe hat + long tailcoat tails; long silver hair in a low ponytail; cane topped with a gold scale.

```
Character design sheet, full-body turnaround (front, three-quarter, side, back) plus 3 expressions (gentle smile, eyes-open cold smile, contempt), original anime character, clean anime cel-shading, crisp ink lineart, plain dark background with faint gold ledger grid.
Man in his mid-30s, tall and slender, graceful relaxed posture, 185 cm.
Hair: long straight silver-white hair (#E6E2DA) tied in a low ponytail reaching the waist, neat side-parted bangs.
Eyes: usually closed in a smile; when open, champagne-gold eyes (#D8B76A) with thin ring pupils.
Outfit: onyx black tailcoat (#1C1A22) with very long split tails, gold brocade lapels and buttons in Bourse Gold (#C9A24A), black waistcoat with a gold pocket-watch chain shaped like a ledger column, white gloves, tall black stovepipe hat with a gold band.
Prop: slim black cane topped with a small golden balance scale.
Ledger mark: on the LEFT wrist, Harvest Gold (#FFD23F) mark with many ornate ruled lines (AAA), mostly hidden by the white glove, light leaking through the seams.
Palette: Tailcoat Onyx #1C1A22, Bourse Gold #C9A24A, Harvest Gold #FFD23F, skin Pale Ivory #EFD9C3, hair #E6E2DA.
```

**Negative**: 共通ネガ + `monster villain, scars, armor, short hair, red eyes, cape, magician props`

> **設計メモ（JP）**：シルクハット＋燕尾の「縦に長い長方形＋尾」。笑顔が基本で、目を開く瞬間を“本性”の演出に取っておく。金はすべて Bourse Gold（くすんだ金属）、能力発動時だけ Harvest Gold で発光。

---

## 8. ハザマ — Hazama（ゼロの貸主）

**Silhouette key**: a small floating childlike figure made of red ink; round head, no legs — the body tapers into dripping ink tendrils; two hollow eye-holes and a crescent mouth-hole.

```
Creature/character design sheet, 4 views (front, three-quarter, side, back) plus 4 expression variants (curious, giggling, sulking, terrifying wide grin), original anime character, clean anime cel-shading, crisp ink lineart, plain cream ledger-paper background.
A small floating childlike being made entirely of glossy red ink, about the size of a 5-year-old child's upper body, hovering at shoulder height.
Head: large round head with two short horn-like ink drips, no hair, two hollow black eye-holes (#0E0B10) and a crescent hollow mouth that can stretch unnaturally wide.
Body: tiny torso with small stubby arms, no legs; the lower body melts into 3–5 dripping ink tendrils that leave ruled red lines in the air; scraps of old ledger paper (#E9E1CF) float around it, some stuck to its body like a collar.
Material: wet glossy red ink (#E5172F) with dark dried-ink outlines (#7A0614) and pink wet highlights (#FF6B7A), slightly translucent at the edges.
Ledger mark: its whole body IS the mark; a hollow "zero" ring floats over its head like a halo.
Palette: Ledger Red #E5172F, Dried Ink #7A0614, Wet Highlight #FF6B7A, Ink Black #0E0B10, Ribcage Bone #E9E1CF.
```

**Negative**: 共通ネガ + `human child, realistic blood, gore, demon horns large, wings, cute mascot plush, legs, feet`

> **設計メモ（JP）**：可愛さと不気味さの境界線。普段は丸い“子どもの影”、本気の時だけ口が裂ける。ジンの手首を通してしか声が届かないため、作画上は常に「ジンの左腕から細いインクの糸でつながっている」こと。

---

# Key Visuals（キービジュアル）

## KV1 — Main Poster「I'm not paying.」

**Aspect**: 2:3 vertical master (2048×3072)、16:9 派生 (3840×2160) は人物を右1/3に寄せて再構成。

```
Original anime key visual, vertical poster composition, clean anime cel-shading with dramatic painted background, high contrast, cinematic low-angle.
Foreground: a 16-year-old boy with spiky black hair and an extremely long tattered crimson scarf (#C8102E) whipping in the wind, seen from a low three-quarter back angle, raising his LEFT arm straight up toward the sky, fist clenched; his forearm glows with Ledger Red (#E5172F) ruled lines spiraling from wrist to elbow, red ink droplets rising upward from it; a small floating figure made of red ink peeks over his shoulder.
Background: a colossal vertical city built on the giant fossilized ribcage of a dead god, curved bone-white ribs (#E9E1CF) rising hundreds of stories, slums with teal-gray haze (#3E5A5C) clinging to the lowest ribs, rusted mid-tier towers (#8A4B32), and a golden stock-exchange palace (#C9A24A) at the very top with giant glowing rating boards.
Sky: night sky of ink black (#0E0B10) to deep vault blue (#1B1F2E), a huge blood-red moon behind the summit, horizontal red ledger lines ruled across the sky as if the world is written on accounting paper.
Lighting: strong red rim light on the boy from his own arm, cold gold light from the summit.
Leave the top 15% and bottom 20% clear for title and tagline.
```

**Negative**: 共通ネガ + `text, title lettering, daytime, blue sky, cute, crowd, multiple boys, right arm raised`

> 構図メモ：主人公を下1/3に大きく、腕と肋骨の曲線で視線を「赤い月→頂のバース」へ導く。タイトル「RED LEDGER / 赤い帳簿」は上部、タグライン *Everything is borrowed. He's not paying.* は下部。

## KV2 — Cast Ensemble

**Aspect**: 16:9 (3840×2160)。

```
Original anime ensemble key visual, 16:9, clean anime cel-shading, painted background, layered composition by power hierarchy.
Center-front: spiky-haired boy with long crimson scarf and red glowing left forearm, grinning, fist forward toward the viewer.
Left-front: girl with ash-lilac bob, indigo ankle-length coat and a violet monocle lens, holding a calculating fan, cool smirk.
Right-front: tiny girl in an oversized moss-green hoodie with swallow-tail hood, grinning, juggling stolen coins.
Mid-left: sturdy woman in her 40s with topknot bun, long canvas apron and noodle strainer, arms crossed.
Mid-right: tall young priest in iron-gray vestment with a very high white collar and iron staff, glaring at the boy.
Back-left: masked collector in floor-length slate coat with a bone-white oval mask with blue eye slit, debt hook on chain.
Back-top, largest and furthest: elegant man in black tailcoat, silver long hair, stovepipe hat, gold-topped cane, smiling with closed eyes, framed by a golden exchange building.
Floating above the boy's shoulder: a small childlike figure made of dripping red ink with hollow eyes.
Each character's left wrist glows in their lender color: red #E5172F, violet #A77BFF, lime #B8F03C, orange #FF7A1A (faded), slate-blue #9FB4C8, electric blue #3FA9F5, gold #FFD23F.
Background: the vertical city on a giant ribcage, red ledger lines across a night sky.
```

**Negative**: 共通ネガ + `text, all characters same height, lineup flat, chibi, mismatched colors`

## KV3 — Streaming Thumbnail（配信サービス用サムネイル）

**Aspect**: 16:9 (1920×1080)。**Title-safe**：左40%をロゴ・タイトル用に空ける（Ink Black のグラデーションで沈める）。右上と下端 8% はサービス側 UI（バッジ・プログレスバー）が重なるため顔・手を置かない。中央の 1:1 クロップ（840–1080px幅）と 2:3 クロップでも主人公の顔と赤い腕が残る位置に配置。

```
Original anime streaming thumbnail, 16:9, bold and readable at small sizes, clean anime cel-shading, extreme close-up.
Right 55% of the frame: tight close-up of a 16-year-old boy's face, spiky black hair, amber eyes (#F2A33A), defiant crooked grin, his LEFT forearm raised in front of his chin with glowing Ledger Red (#E5172F) ruled lines and a hollow zero ring on the back of the hand, red ink splashing outward; a long crimson scarf (#C8102E) slicing diagonally across the frame.
Left 40%: dark negative space fading to ink black (#0E0B10) with faint red ledger grid lines, kept empty for title logo.
Simple high-contrast lighting, strong red rim light, no small details, readable at 320x180.
```

**Negative**: 共通ネガ + `text, logo, busy background, multiple characters, face in left half, face at frame bottom`

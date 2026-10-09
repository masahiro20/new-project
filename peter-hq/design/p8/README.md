# P8 GRANDSTRIDE — 宣伝素材（Otto 作）

| ファイル | 用途 | サイズ |
|---|---|---|
| `itch-banner-960x300.svg` / `.png` | itch.io のバナー | 960×300 |
| `x-header-1500x500.svg` / `.png` | X のヘッダー。左下はプロフィール画像に隠れるので文字を置いていない | 1500×500 |
| `short-titlecard-1080x1920.svg` / `.png` | 縦型ショート動画のタイトルカード。下端約300pxはアプリの字幕やボタンが重なるので静かにしてある | 1080×1920 |
| `build.mjs` | 上の SVG を作り直すスクリプト。`--png` で PNG も出す（playwright が必要） | — |

- 見た目は `mech-game/store/`（カバー・スクリーンショット）と `docs/game-design.md` に合わせています。舞台は夜の汀都 SHORE CITY 2091、機体は全高28mの四脚機 HEKATON TYPE-04 です。色はシアン #5ff2e8 と琥珀 #ffb547、書体はゲームと同じ Chakra Petch と Share Tech Mono を使っています。
- 文言はストア原稿のタグライン（EN: "Ride a 28m quadruped war machine. Feel every step." ／ JA: 「全高28mの四脚戦機に乗り込め。」）から取りました。価格・配信日など、まだ決まっていないことは書いていません。
- SVG は Google Fonts を読み込まない環境では代わりの書体で表示されます。投稿にはフォント込みで描画した PNG を使ってください。
- 作り直す: `CHROMIUM_PATH=... node build.mjs --png`（`HTTPS_PROXY` があればそれ経由でフォントを取得します）

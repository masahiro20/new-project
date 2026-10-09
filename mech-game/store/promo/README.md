# P8 GRANDSTRIDE — 宣伝素材（Otto 作）

| ファイル | 用途 | サイズ |
|---|---|---|
| `itch-banner-960x300.svg` / `.png` | itch.io のバナー | 960×300 |
| `x-header-1500x500.svg` / `.png` | X のヘッダー。左下はプロフィール画像に隠れるので文字を置いていない | 1500×500 |
| `short-titlecard-1080x1920.svg` / `.png` | 縦型ショート動画のタイトルカード。下端約300pxはアプリの字幕やボタンが重なるので静かにしてある | 1080×1920 |
| （作り直し用の `build.mjs` は `peter/hq-office` の `peter-hq/design/p8/` にあります） | — | — |

- 見た目は `mech-game/store/`（カバー・スクリーンショット）と `docs/game-design.md` に合わせています。舞台は夜の汀都 SHORE CITY 2091、機体は全高28mの四脚機 HEKATON TYPE-04 です。色はシアン #5ff2e8 と琥珀 #ffb547、書体は英字がゲームと同じ Chakra Petch と Share Tech Mono、和文は Zen Kaku Gothic New（無い環境では Noto Sans JP）を指定しています（いずれも SIL OFL 1.1）。
- 文言はストア原稿のタグライン（EN: "Ride a 28m quadruped war machine. Feel every step." ／ JA: 「全高28mの四脚戦機に乗り込め。」）から取りました。価格・配信日など、まだ決まっていないことは書いていません。
- SVG はフォントを埋め込んでも読み込んでもいないので、これらの書体が入っていない環境では代わりの書体で表示されます。投稿にはフォント込みで描画した PNG を使ってください。
- 作り直す: `peter/hq-office` ブランチの `peter-hq/design/p8/build.mjs` を使う（`CHROMIUM_PATH=... node build.mjs --png`）

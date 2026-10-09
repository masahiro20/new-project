# P7 LEDGERBREAKER 帳簿破り — 宣伝素材（Otto 作）

| ファイル | 用途 | サイズ |
|---|---|---|
| `logo-en.svg` / `.png` | 英語ロゴ。LEDGER／BREAKER の2段、LEDGER を赤い裂け目が横切る（背景透明） | 1200×520 |
| `logo-ja.svg` / `.png` | 日本語ロゴ。『帳簿破り』、ルビはレジャーブレイカー、「破」だけ赤（背景透明） | 1100×500 |
| `keyvisual-1920x1080.svg` / `.png` | 横長キービジュアル | 1920×1080 |
| `keyvisual-1080x1920.svg` / `.png` | 縦長キービジュアル | 1080×1920 |
| `booth-thumb-1200x1200.svg` / `.png` | BOOTH のサムネイル（1:1） | 1200×1200 |
| `kofi-banner-1500x500.svg` / `.png` | Ko-fi のバナー | 1500×500 |
| `build.mjs` | 作り直し用。`node build.mjs --art <peter/p7-anime の anime/book/art> --png` | — |

- 絵は P7 チームの既存の絵（`anime/book/art` の表紙と、ジン・ハザマ・九条・ツバメの立ち絵）をそのまま使い、背景だけ外して組み直しました。各 SVG は絵を内部に持っているので単体で開けます。
- 色と書体は `anime/launch` のサムネイルに合わせています（墨 #0E0B10、赤 #E5172F、生成り #F5EEDD、金 #C9A24A。Dela Gothic One、Zen Kaku Gothic New、IBM Plex Mono）。
- キャッチは決め台詞「払わねえよ。／I'm not paying.」。ブランド資産として残すと `docs/title-alternatives.md` にあるものです。
- BOOTH と Ko-fi の素材には、今のサムネイルと同じ「AI使用・作者監修 / Made with AI assistance」を入れています。BOOTH の商品名と価格は改題後に決まっていないので、「設定資料集 PDF」とだけ書きました。
- 注意：`docs/title-alternatives.md` §4 では、「LEDGER」を含む商標（Ledger SAS、第9・16類）との関係が「要判断」のままです。外に出す前に確認してください。
- SVG は Google Fonts を読み込めない環境では代わりの書体で表示されます。投稿には PNG を使ってください。

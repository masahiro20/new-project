# P0 減算ゼロ — デザイン素材（Otto 作）

Mina のチームが `peter/p0-genzan-zero` に取り込むための素材です。このフォルダのファイルは P0 のリポジトリをまだ変更していません。

## 1. 解説ページの OGP 画像（1200×630）

| ファイル | 役割 |
|---|---|
| `og-template.svg` | テンプレート。`{{EYEBROW}}` `{{TITLE_TSPANS}}` などの差し込み口がある |
| `generate-og.mjs` | `guides.json` から解説ページごとの SVG（と PNG）を作る Node スクリプト。依存なし（PNG だけ playwright を使う） |
| `extract-guides.mjs` | `lib/guides.ts` と `lib/guide-pages/*.ts` から slug・タイトル・サービス種別を抜き出して JSON にする |
| `guides.json` | 2026-10-09 時点の 19 ページ分（上のスクリプトで作成） |

使い方（P0 リポジトリのルートで、このフォルダを `scripts/og/` などに置いた場合）:

```sh
node scripts/og/extract-guides.mjs . > scripts/og/guides.json
node scripts/og/generate-og.mjs --in scripts/og/guides.json --out public/og --png
```

- タイトルは「？」「｜」「【…】」で主題と補足に分け、主題を大きく、補足を小さく出します。長い主題は自動で文字を小さくし、行の長さをそろえて折り返します。
- X や Facebook は SVG の og:image を読まないので、公開には PNG を使ってください（`--png`。playwright と Google Fonts の Zen Kaku Gothic New を使って描画）。
- 静的書き出し（`npm run export:pages`）でも動きます。`public/og/<slug>.png` はそのまま `out/og/` にコピーされます。各ページの `generateMetadata` で `openGraph.images` に `${basePath}/og/${slug}.png` を指定してください。ビルド前に生成するなら `export:pages` の先頭で上の2行を実行します。

## 2. トップページのヒーロー（`hero.svg`）

- 1200×680。職員と車いすの利用者が机を囲んで、チェック済みの書類を一緒に確認している場面です。後ろに事業所の建物、左上に年間予定（研修・委員会）のカレンダーを置いています。
- 色はサイトの既存色（緑 #1d6f5f、薄緑 #e5f2ee、生成り #fbfaf7、茶 #9a4a12）だけを使っています。
- `<title>` と `<desc>` 付き。`<img src="/hero.svg" alt="">` で装飾として置くか、インラインで使ってください。

# 解説ページの OGP 画像

Otto 作の素材（`peter/hq-office` の `peter-hq/design/p0/`）を取り込んだもの。`public/og/<slug>.png` を作る。
画像はリポジトリにコミットしてあるので、ビルドや静的書き出しのたびに作り直す必要はない。**解説ページを追加したとき、またはタイトルを変えたときだけ** 次を実行する。

```sh
npm i --no-save playwright            # PNG の描画に使う（ブラウザは既存の Chromium を使う）
npm run og:generate                   # 環境によっては CHROMIUM_PATH=/path/to/chrome を付ける
```

- タイトルは「？」「｜」「【…】」で主題と補足に分ける。改行は文節の切れ目（ひらがな・句読点の後）で行い、収まらないときは文字を小さくする。
- 画像がないページは、共通の `public/og.png` を使う（`lib/og.ts` の `guideOgImage`）。

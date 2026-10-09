# 生成の品質チェック（有料化の判断基準①）

有料版を出す前に、AI が作る書類を4種別×会議メモの有無（8ケース×3セット＝24件）で自動採点する。キーを入れたら、まずこれを回す。

## 採点の基準（`lib/quality.ts`）

| 判定 | 項目 |
|---|---|
| ×（出してはいけない） | 途中で止まった（拒否・文字数上限・エラー）／書類が足りない／必須の項目がない（5類型・通報・市町村・3要件・指針・議事録など）／古い制度の記述（「1日5単位」「経過措置中」）／会議メモがないのに議事録が様式でも「記入例」でもない（会議の捏造）／Word に変換できない |
| △（人が確認） | 【要記入】がない／事業所名が入っていない／個人名らしき表記／議事録に入力にない日付 |

見本（`lib/samples.ts`）がこの基準を満たすことを `npm test` で確認している。

## 回し方

1. API の Worker を **デモ決済** で動かす（本番の Worker なら `PAYMENTS_MODE` は `demo` のまま。ローカルなら下のコマンド）。テストの間だけ `DEMO_GENERATE_PER_HOUR=100`（既定は6＝2セット/時/IP）にする。
   ```bash
   npx wrangler dev -c worker/wrangler.jsonc --var PAYMENTS_MODE:demo --var DEMO_SIGNING_SECRET:test \
     --var DEMO_GENERATE_PER_HOUR:100 --var ALLOWED_ORIGINS:http://localhost:8099
   # キーがない予行演習は --var AI_MOCK:1 を付ける。本番の AI で回すときは ANTHROPIC_API_KEY を .dev.vars（worker/）に入れる
   ```
2. `npm run quality`（別の API なら `QUALITY_API=https://… npm run quality`）
3. `.quality/report.md` に、ケースごとの判定・所要時間・文字数・指摘が出る。× が1件でもあれば終了コード1。
4. 費用：実行の前後で Anthropic Console の使用量を見て、24で割る（＝1セットあたり）。

## 2026-10-09 の予行演習（AI モック）
24件すべて ○（API・デモ決済・採点・Word 変換の経路が動くことの確認。AI の品質の確認ではない）。

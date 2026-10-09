# P3 Pitch — ブラウザ版デモ（ステージ2、社内プロトタイプ）

日本語の単語に **が** を付けて言ってください。このページは声の高さ（F0）を追跡し、発話をモーラに
区切り、辞書のアクセント型と重ねて表示して、声の高さが正しい位置で下がっているか（下がり目、downstep）を判定します。

単体で動きます。ルートのアプリには一切手を触れません（減算ゼロ）。素の ES モジュールで、バンドラーは使いません。

## 実行方法

```sh
cd pitch
npm install          # dev deps: pitchy, onnxruntime-web/node (for vendoring + tests)
npm run vendor       # copies pitchy, fft.js and ONNX Runtime Web into vendor/
npm run serve        # http://localhost:5173/  (mic needs localhost or https)
npm test
```

`vendor/pitchy.js`、`vendor/fft.js` と SwiftF0 のモデルはコミット済みです。14 MB ある
ONNX Runtime の wasm はコミットしていません（`npm run vendor` で再生成されます）。これがなくても既定の
pitchy エンジンは動きます。必要なのは任意の SwiftF0 エンジンだけです。

## 1ファイル版デモページ（`dist/pitch-demo.html`）

日本語のファイルアップロード版デモ（マイクなし。「〜が」のボイスメモを選びます）は、スクリプト・辞書データ・
ライセンス文などすべてを埋め込んだ、単独で完結する HTML ファイル1つです。

```sh
npm run build:demo                                   # 2,000 words (data/lexicon-2000.json)
node scripts/build-demo.mjs --lexicon 200            # the old 266-word page
node scripts/demo-sanity.mjs                         # synthetic correct/wrong sample of every shipped word
node scripts/qa-demo.mjs [--words 266]               # Playwright end-to-end QA
```

ビルドでは辞書データをコンパクトな配列形式で埋め込みます（`demo/lexicon.js` が復元します。
モーラと型はかなとアクセントから算出）。2,000語で約82 KB、ページ全体で約135 KB です。
ネイティブの確認待ちの語（`data/needs-review-*.tsv`）は決して含めません。
単語選択には、検索（漢字・ひらがな・カタカナ・英語の訳語）、型による絞り込み、
代表的な同音語セット（箸・橋・端、雨・飴、花・鼻、神・紙・髪、柿・牡蠣）のクイック選択があります。
合成サンプルでは、2,000語のうち14語が *正しい* サンプルで不合格になります。次のモーラが母音だけ、または っ で
アクセントが 3 か 1 の語（曜日の語、案内、材料、北極 …）で、区切り方の限界によるものです。詳しくは
`demo-sanity.mjs` の出力を見てください。

## オフライン PWA（`site/app/`）

同じページを、インストールでき、オフラインでも動く Web アプリにしたものです。任意の静的ホストに置けます（URL は
すべて相対パスなので、どのサブパスでも動きます。ランディングページからは `./app/` としてリンクしています）。

```sh
npm run build:pwa        # build-demo content → site/app/{index.html, manifest.webmanifest, sw.js, icons/}
npm run serve:site       # http://localhost:5174/app/  (serves site/; SW needs localhost or https)
node scripts/qa-make-fixtures.mjs /tmp/pitch-fx    # once: synthetic .wav fixtures (outside the repo)
node scripts/qa-pwa.mjs --fixtures /tmp/pitch-fx   # Playwright: install criteria, SW, offline judge
```

- `build-pwa.mjs` は `build-demo.mjs` をそのまま実行して一時ファイルに出力し、それを完全な HTML
  文書で包みます（`lang="ja"`、`viewport-fit=cover`、ライト／ダークの `theme-color`、manifest、
  apple-touch-icon、iOS の Web アプリ用 meta）。Artifact 用のビルド（`dist/pitch-demo.html`）は
  Service Worker を含まず、バイト単位で同一のままです。
- `sw.js` はページ・manifest・アイコンを、内容のハッシュで名付けたキャッシュに事前キャッシュします
  （再ビルドすると新しいキャッシュになり、古いものは activate 時に削除）。事前キャッシュしたファイルはキャッシュ優先です。
  アプリのフォルダ内のページ遷移は、オフラインではキャッシュしたページを返します。他オリジンのものや
  音声は一切キャッシュしません（ファイルはページ内でデコードします）。`sw.js` は `no-cache` で配信してください。
- アイコンはコードで描画しており（`scripts/pwa-icons.mjs`、毎回同じ結果）、コミット済みです。
- 「ホーム画面に追加」の案内：Chrome／Android ではインストールボタン（`beforeinstallprompt`）、
  iOS では「共有 → ホーム画面に追加」の説明を表示します。すでにスタンドアロンで開いている場合や閉じた場合は表示しません。
  引き続きファイル選択のみです（マイクなし）。
- オフラインの手動確認：`/app/` を開いて一度再読み込みし、DevTools → Network → Offline にする（または
  サーバーを止める）と、再読み込みしてもページ・サンプル・ファイルのアップロードが動き続けます。

## 評価協力モード（`demo/evalmode.js`）

ネイティブ話者や学習者に判定精度の検証を手伝ってもらうためのモードです。Artifact 版と PWA の両方にあります。

- **既定はオフ**。「オンにする…」を押すと、保存するもの・保存しないもの・保存場所・消し方が表示され、
  チェックを入れて同意したときだけオンになります。オンはそのページを開いている間だけです。
- オンの間、**録音ファイルで判定したときだけ**（判定画面と「最小対で練習」の言い分け）、判定に使った部分の音声
  （16 kHz・モノラルの wav、最長約4秒）と判定結果（合否・検出した k・理由・モーラごとの時刻と高さ・間引いた F0 列）、
  単語、アプリのビルド番号、日時を、このブラウザの IndexedDB に保存します。合成音声のサンプルは保存しません。
- 任意で選べる情報：話者の区分（日本語ネイティブ／学習者のレベル）、出身地域（東京方言圏／それ以外／答えない）、
  どの型で言ったつもりか（辞書どおり／違う型＋k／わからない）。氏名・メール・元のファイル・ファイル名は保存しません。
- 一覧で件数と各件の単語・判定を確認でき、1件ずつ、または（ページ内で確認して）すべて削除できます。
- 「zip で書き出す」で `Pitch-eval-YYYYMMDD.zip` を保存します（Artifact では downloads 機能、PWA ではダウンロード）。
  中身は `README.txt`（説明・録音の権利は話者にあること・開発者に渡す場合の同意文）、`manifest.json`、
  録音ごとの `rec-NNN-wXXXX.wav` と `.json`。ページから送信することはなく、渡すかどうか・渡し方は本人が決めます。
- 受け取った zip の wav と JSON（`word`、`intended.k`）から、`scripts/eval-real.mjs` 用のマニフェストを作れます。

```sh
node --test test/evalmode.test.js                              # zip の構造・CRC（unzip -t）、manifest、保存レコード
node scripts/qa-evalmode.mjs --fixtures /tmp/pitch-fx          # Playwright: 同意 → 2件保存 → 削除 → 書き出し（両方の版）
```

設計の判断：`docs/decisions.md`（評価協力モード）。

## 判定のしくみ（`src/judge.js`）

1. 10 ms のフレームごとに F0 を求め（pitchy/MPM、または 16 ms の SwiftF0）、信頼できないフレームを捨て、
   オクターブの跳びを折り返し、メディアンフィルタをかけ、半音（semitone）に変換します。
2. 発話の範囲は有声区間です。信号のエネルギーから無声化したモーラ（した の し）があるとわかる場合は、
   最大1モーラ分だけ延長します。
3. 範囲を n + 1 個のモーラ枠（単語の n モーラ ＋ が）に区切ります。モーラがわかっているので、
   どの境界に子音の手がかり（有声の途切れ＝無声子音や っ、またはエネルギーの低下＝鼻音・有声破裂音・はじき音）が
   出るはずかもわかります。小さな動的計画法で、モーラ長をほぼ等しく保ちながら（日本語は
   モーラ拍のリズム）境界をそれらの手がかりに合わせます。母音で始まるモーラは長さの事前分布だけに頼ります。有声の途切れは、
   その前後でエネルギーが落ちている程度に応じてのみ子音の手がかりとして数えます（1 dB 未満なら数えず、
   3 dB 以上で満点）。ピッチ追跡器は F0 が速く上下するとき、つまりまさにアクセントの位置で、母音の *途中* で
   追跡を失うことがよくあり、そうした途切れが子音境界を下がり目の上に引き寄せてはいけないからです。
   `segmentation: 'equal'` を指定すると以前の等分割になります。各枠にはそのフレームの
   ピッチの中央値を割り当てます。っ には割り当てません（無音の閉鎖なので、その枠にある F0 は
   追跡器の窓によってにじんできた隣のモーラのものです）。
4. H/L のテンプレート k = 0…n（0 = 平板）それぞれを、`a + b·template + c·mora` の形で
   当てはめます（下がり傾向（downdrift）の傾き c には上下限あり）。H/L の差がはっきりある（b ≥ 1.2 半音）中で
   最もよく当てはまったものを、検出した下がり目とします。どれにも差がなければ、平板に話したと判定します。
   F0 のないモーラ（っ、無声化したモーラ）でしか違わないテンプレートは、聞こえる音の形が同じになるため、
   同じ答えとして扱います（`equivalentK`）。例えば ごっこ の っ の前で下がるか後で下がるか、です。
5. 合格 = 検出した k（または同等とみなす k）が、辞書が認める k のいずれかであること。
   そうでなければ、下がるのが早すぎる、遅すぎる、下がっていない、下がるべきでない、のどれかを返します。

既知の限界：母音で始まるモーラの前の境界（すいようび の よ|う、おとうと の お|う、
ー）には、今も分節上の手がかりがなく、長さの事前分布に頼っています。F0 の動きそのものを境界の手がかりに
使うことは意図的に避けています（試したところ、合成データでは精度の明確な向上がなく、
実際の音声では F0 の変わり目がモーラ境界より遅れるため、判定が話者の言い方に
引きずられてしまいます）。「っ で下がる」は耳で聞き分けられないので、そのような読みは
っ の前で下がるのと同じに判定されます。それで聞こえる H がまったくなくなる場合（筆者 ひっしゃ
を k = 2 で言った場合）は、単調な発話と同じになり、平板と判定されます。とても短いモーラ（速い
発話、約120 ms）で破裂音で始まるものは有声フレームがわずかしか残らず、残っている誤りの主な原因です。
きしみ声（creaky voice）や強い無声化も、使えるフレームを減らします。

## 評価

- `node scripts/eval-segmentation.mjs [--swiftf0]` — 子音と不均一なタイミングを含む合成音声で、
  等分割と手がかりによる区切りを比較します。結果：`docs/eval-results.md`。
- `node scripts/eval-real.mjs manifest.json [--swiftf0] [--csv out.csv]` — 実際の録音で評価します。
- 人の声での評価手順（録音者が見つかるまで保留）：`docs/eval-plan.md`、
  語のリストは `docs/eval-words.tsv`。ウェイトリスト用 LP の原稿：`docs/lp.md`。

## データ

| ファイル | 内容 |
|---|---|
| `data/words-seed-200.tsv` | デモ用の自作の語リスト（表記・読み・英語の訳語） |
| `data/words-candidates-2000.tsv` | 2,000語版ビルド用の、より大きな候補リスト |
| `data/lexicon-200.json` | 266語の辞書データ（アクセントは UniDic から）。開発用ページ（`index.html`）が読み込みます |
| `data/lexicon-2000.json` | 同じスクリプトで作った2,000語の辞書データ。`dist/pitch-demo.html` に埋め込まれます |

UniDic で再生成する方法（BSD ライセンスを選択、unidic-lite 経由）：

```sh
python3 -m venv .venv && .venv/bin/pip install fugashi unidic-lite
.venv/bin/python scripts/build_lexicon.py data/words-seed-200.tsv data/lexicon-200.json
.venv/bin/python scripts/build_lexicon.py data/words-candidates-2000.tsv data/lexicon-2000.json --limit 2000
```

指定した読みで UniDic が知らない語は除外され、一覧表示されます。手本の音声は、ライセンス確認済みの
ネイティブ録音ができるまで、合成のピッチ線（`src/synth.js`）です。
ライセンスと出典：`licenses.html`。

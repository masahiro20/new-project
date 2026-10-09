# 第1話 絵コンテ アニマティック（社外秘）

**公開・投稿は禁止です。** ピッチ資料とオーナーの保管用の社内資料です。SNS や動画サイト、販売ページには載せません（外部公開は本部判断事項）。

## 動画
| ファイル | 内容 | 尺 | 容量 |
|---|---|---|---|
| `ep01-animatic-full.mp4` | 全225カットを実尺で再生。作画カットは線画フレーム、文字コンテは暗いカード（カット番号・青字のサイズ／カメラ・画面内容）で表示 | 22:10（1330秒） | 約14.8MB |
| `ep01-animatic-drawn.mp4` | 作画カットのみ（アバン C1–32／覚醒 C130–151／タグ C216–225）。冒頭にタイトルカード、各パートの前にセクションカード | 6:45（405秒） | 約11.5MB |

- 共通：1920×1080・24fps・H.264（yuv420p）・音声なし。
- 1カットに複数フレームがある場合は、カットの尺を均等に割って順に表示します（`index.html` のプレイヤーと同じ）。
- カメラ指示に PAN / T.U. / T.B. があるカットだけ、ゆっくりした Ken Burns（寄り・引き 10%、PAN は 10% 拡大して移動）を付けています。TILT・FOLLOW・SHAKE などは止め絵です。
- 左上にカット番号（通し番号＋範囲内の番号）、右上にエピソード上のタイムコード（分:秒）。drawn 版でもタイムコードは本編の位置を示します。
- 台詞は下部に字幕（日本語、その下に英語）。話者ごとに1行ずつ表示します。

## 作り直し方
```
node anime/storyboard/ep01/animatic/build-animatic.js        # 両方
node anime/storyboard/ep01/animatic/build-animatic.js full    # 全編のみ
node anime/storyboard/ep01/animatic/build-animatic.js drawn   # 作画カットのみ
```
- 入力は `../data.js` と `../frames/*.svg`。カット表を直したら、そのまま再実行すれば反映されます。
- 必要なもの：Node 22、Playwright（`/opt/node22/lib/node_modules/playwright`）、ffmpeg。フォント（Zen Kaku Gothic New・Dela Gothic One・IBM Plex Mono）は初回に Google Fonts から取得してキャッシュします。
- 手順：Playwright で「フレーム・状態ごとに1枚」の静止画を描く → ffmpeg でセグメントごとに尺を付ける（移動は zoompan、タイムコードは drawtext） → concat demuxer で連結し `+faststart` で書き出し。
- 中間ファイルは scratchpad の `animatic/`（`ANIMATIC_SCRATCH` で変更可）。静止画はキャッシュされるので、字幕やカードの見た目を変えたときは `ANIMATIC_FORCE=1` を付けて描き直してください。
- 画質：基準は crf 23 ですが、15MB 未満に収めるため full は crf 31、drawn は crf 28 にしています（`ANIMATIC_CRF` で上書き可）。所要時間は 4 コアで両方あわせて約12分。

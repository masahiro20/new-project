# 日本語原作＋英訳がある、自由ライセンスのゲーム・ノベル素材の探索（2026-10-09）

目的：Kotomark の本来の用途（日本語原作の台本 → 英訳）で、実データの評価に使える素材を探す。条件は次のとおり。

- **日本語が原作**で、英訳が存在する（英語原作の日本語訳は除外）
- ライセンスが CC-BY / CC-BY-SA / CC0 / MIT / GPL・LGPL / Apache / zlib などの自由ライセンス。**非営利限定（CC-BY-NC 等）は除外**（HQ 決定 d20）。フリーウェアの独自規約も除外
- 台本（セリフ・話者）が取り出せる形式で公開されている

作業時間は約 25 分。GitHub のコード検索 API はこの環境では使えないため、Web 検索、`raw.githubusercontent.com`、itch.io のページを使った。取得した生データは `/tmp/claude-0/eval/jaorig/`（リポジトリ外、合計 約 380KB）にだけ置いた。

## 結論

**条件をすべて満たす「日本語原作のゲーム台本＋英訳」は見つからなかった。** 前回の探索（`eval/misskey/source.md`）と同じ結論。

ゲーム以外まで広げると、使える可能性がある候補が 1 件ある。**SCP 財団日本支部（SCP-JP）の記事と、その公式英訳（CC BY-SA 3.0）**。日本語原作であること、ライセンス、英訳の存在はどれも確認できた。ただし、ゲームの台本ではない（報告書形式の散文。インタビュー記録の中には話者付きの対話がある）。また、段落単位の対応付けは手作業になる。

## 候補一覧

| # | 候補 | URL | ライセンスの根拠（原文の引用） | 原作言語の根拠 | 形式・規模 | 判定 |
|---|---|---|---|---|---|---|
| 1 | **SCP 財団日本支部（SCP-JP）の記事＋英訳**（例：SCP-040-JP「ねこですよろしくおねがいします」） | JA: https://scp-jp.wikidot.com/scp-040-jp / EN: https://scp-wiki.wikidot.com/scp-040-jp （翻訳アーカイブ: https://scp-int.wikidot.com/scp-040-jp ） | JA サイトのフッター：「特に指定がない限り、このサイトのすべてのコンテンツはクリエイティブ・コモンズ 表示 - 継承3.0ライセンス の元で利用可能です。」 EN 側のフッター：「Creative Commons Attribution-ShareAlike 3.0 License」。例外（SCP-173 の画像、旧 SCP-1926 など）は https://scp-jp.wikidot.com/licensing-guide に記載。テキストは対象外ではない | 記事番号の `-JP` 接尾辞は日本支部の原作を意味する。JA 版のクレジットに「著者: ©︎Ikr_4185 / 作成年: 2014」。EN 版は後から訳されたもの | wikidot の HTML。1 記事あたり JA 約 44KB の HTML（本文は数千字）。`-JP` 記事は数千件あり、英訳はそのうち一部 | **条件付きで使える**（ゲームではない。CC BY-SA の表示・継承義務がある。記事ごとに訳者と版がばらばらで、用語集や話者のプロフィールは自作が必要。話者付きの行はインタビュー記録の部分に限られる） |
| 2 | 『転生してない悪役令嬢はまだビンタが足りない』（The Villainess Slap, Klast Halc / 倉下） | https://klast-halc.itch.io/the-villainess-slap （ライセンス追加の告知: https://klast-halc.itch.io/the-villainess-slap/devlog/428711/add-license-to-source-code- ） | `rpy_files.zip` 内の `License.txt`：「This source code is released under the MIT license.」「このソースコードはMITライセンスのもとで公開されています。」。一方、ゲームページには「Redistribution is prohibited.」とある | ページに「Language: Japanese(original), English」 | Ren'Py の `.rpy`、zip 29KB（中身は 112KB）。セリフはほぼなく、クリッカー型のミニゲーム。英語は `if` で分けた数か所だけで、`tl/english` の翻訳ファイルは**同梱されていない** | **却下**：MIT の範囲に英訳の台本が入っていない。テキスト量も数十行しかない |
| 3 | 『転生してない悪役令嬢はまだ運命を知らない』（The Villainess Fate, 同作者） | https://klast-halc.itch.io/villainess-fate | ライセンスの記載なし。「Tobiishikikaku and crAsm manage all copyright of this program.」「Redistribution is prohibited.」 | 「Japanese(original), English, German, Russian」 | ビルド済みの配布物のみ（31〜37MB） | **却下**：自由ライセンスではない |
| 4 | Suika3 エンジンのサンプルゲーム（Awe Morris / SCHOLA SUIKAE。Suika2 の後継） | https://github.com/awemorris/suika3 （`game/start.novel`） | `LICENSE`：「zlib license / (C) 2026 Awe Morris / SCHOLA SUIKAE」 | 不明。作者は日本人だが、サンプルの既定テキスト（`text=`）は英語で、`text-en=` と英語の内容が同じ。`text-ja=` と `text-zh-cn=` が並ぶ形 | NovelML（`.novel`）、7.5KB。セリフは 10 行程度 | **却下**：原作言語を確定できない。テキスト量が少なすぎる。多言語の行を 1 ファイルに並べる形式は、取り込みのテストにだけ使えそう |
| 5 | Suika2 本体・サンプル | （配布終了。旧リポジトリ `suika2engine/suika2` は 404） | 旧版は MIT とされていた（Wikipedia のミラー） | — | — | **却下**：取得できない |
| 6 | ティラノスクリプトのサンプルゲーム | https://github.com/ShikemokuMK/tyranoscript （`data/scenario/*.ks`） | `LICENCE.txt`：「ティラノスクリプトは無料でご利用いただけます。商用利用にも制限はありません。」「■禁止事項■・ティラノスクリプト自体の再配布」 | 日本語原作 | `.ks`、`scene1.ks` 15KB | **却下**：独自規約で、再配布が禁止されている（MIT ではない）。英語版は別人のフォーク（EvanBurchard/tyranoscript）で、サンプルの訳は公式の対訳ではない |
| 7 | OpenTaiko / TJAPlayer3（太鼓系のリズムゲーム） | https://github.com/0auBSQ/OpenTaiko , https://github.com/twopointzero/TJAPlayer3 | `LICENSE`：「MIT License / Copyright (c) 2021 0auBSQ」。TJAPlayer3 の README：「TJAPlayer3 source code and media assets are licensed under the MIT License.」 | 系譜は日本発（AioiLight/TJAPlayer3）。ただし現行の TJAPlayer3 は「the official language of the TJAPlayer3 project is English」 | UI 文字列のみ | **却下**：台本（セリフ・話者）がない。原作言語も混在している |
| 8 | 『坊っちゃん』（夏目漱石）＋ Project Gutenberg の英訳（Yasotaro Morri 訳、1918） | 青空文庫（JA）/ https://www.gutenberg.org/ebooks/8868 （EN） | 原文はパブリックドメイン（漱石は 1916 年没）。英訳は Gutenberg の表記で「public domain in the USA」 | 日本語原作 | 小説（台詞の多い一人称の散文）。あだ名（赤シャツ・山嵐・うらなり・野だいこ）と呼び方の一貫性を見る題材になる | **参考（ゲームではない）**：訳者は 1959 年没で、日本での保護期間を確認していない。訳が古く意訳が多いため、行の対応付けがほぼ不可能 |
| 9 | Narcissu（stage-nana） | https://en.wikipedia.org/wiki/Narcissu | フリーウェア。英訳は作者が個別に許可したもの。自由ライセンスの記載は見つからない | 日本語原作 | — | **却下**：フリーウェアの独自規約 |
| 10 | 洞窟物語（Cave Story）＋英訳パッチ、および CSE2 などの逆コンパイル | — | ゲームデータはフリーウェア。英訳は Aeon Genesis のファンパッチ | 日本語原作 | — | **却下**：フリーウェアとファン翻訳で、自由ライセンスではない |
| 11 | Ren'Py のチュートリアル、"The Question" | renpy.org | MIT 等 | **英語原作**（日本語は翻訳） | — | **却下**：言語の方向が逆 |
| 12 | Z.A.T.O. // I Love the World and Everything In It の日本語訳（gemmaro） | https://codeberg.org/gemmaro/ZATO-ja | 訳は CC BY 4.0 と記載 | **英語原作** | Ren'Py の `tl/ja` | **却下**：言語の方向が逆（英→日の評価には使える可能性がある） |
| 13 | Misskey（参考：前回すでに評価済み） | `eval/misskey/` | AGPL-3.0 | 日本語原作 | YAML の UI 文字列 | 前回、UI 文字列として評価済み。台本ではない |

## SCP-JP を使う場合の注意（次の担当者向け）

- **CC BY-SA 3.0 の表示義務**：作者名、ページ URL、ライセンス名、改変の有無を記録する。評価用の派生データ（CSV 化したもの）にも BY-SA が継承される。公開リポジトリに置くなら `eval/` 内で表示を整える必要がある。生データはリポジトリに入れない方が安全。
- **英訳は記事ごとに別の訳者**で、日本支部の公式翻訳でないものもある。用語（オブジェクトクラス、サイト番号、要注意団体名）の訳揺れは「本物の揺れ」として評価に使えるが、正解データは手で作る必要がある。
- 話者付きの対話は「インタビュー記録」「実験記録」の部分にある（`インタビュアー: 〜博士` / `Interviewer: Dr. 〜`）。台本の評価としては、この部分だけを抜き出して行単位で対応付けるのが現実的。
- wikidot の利用規約上、大量のスクレイピングは避ける。数記事から十数記事を手で選ぶ程度にとどめる。

## 探索の限界

- GitHub のコード検索 API とリポジトリ API が使えないため、`license:cc-by-sa-4.0 renpy tl/english` のような横断検索ができていない。Ren'Py の `game/tl/english/` を含む日本人作者の小規模リポジトリは、この方法でしか見つからない可能性が高い。次の候補探しでは、GitHub 検索が使える環境で `path:game/tl/english language:"Ren'Py"` と LICENSE の組み合わせを試す価値がある。
- itch.io のライセンスフィルタ（Creative Commons）とノベルゲームのタグの組み合わせは、ページの取得に時間がかかるため実施していない。
- ノベルゲームコミュニティ（novelgame.jp）とふりーむ！は、作品ごとの規約がフリーウェア型で、自由ライセンスの例は見つからなかった（検索結果にも現れなかった）。

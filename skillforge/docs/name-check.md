# 名前の衝突チェック（自己調査メモ）

> **ご注意（必ずお読みください）**
> - これは弁護士・弁理士による調査ではありません。無料で見られる公開情報を、自分で調べただけのメモです。
> - 商標登録できるかどうか、他人の権利を侵害していないかどうかは**保証しません**。
> - 名前を正式に使う前に、専門家（弁理士など）に確認するか、正式な商標調査をしてください。
> - 調査日：2026-10-08
> - 対象の区分：第9類（ソフトウェア）、第42類（SaaS・ソフトウェア関連サービス）

## まとめ

| 名前 | 対象 | 結論 | 一言の理由 |
|---|---|---|---|
| Yuragi（揺らぎ／ゆらぎ） | P1（現在の仮名） | 要注意 | ふつうの日本語で識別力が弱い。漫画・ゲーム「ゆらぎ荘の幽奈さん」や大学のYLPFなど同名の使用が多い。登録簿は未確認。 |
| Honorifix | P1 代替案 | 使える（暫定） | 同名の製品・リポジトリは見つからない。ただし「honorific」に近く説明的。登録簿は未確認。 |
| Kotomark | P1 代替案 | 使える（暫定） | 同名の製品・リポジトリは見つからない。似た名前（KO MARK アプリ）は分野が遠い。登録簿は未確認。 |
| YureLint | P1 代替案 | 使える（暫定） | 同名は見つからない。「表記ゆれ＋lint」で意味が伝わる。登録簿は未確認。 |
| Collector Lens | P4 | 要注意 | 同名のGitHubプロジェクト（収集品の査定AI、デモ公開あり）がある。「Lens」はGoogle Lensなど有名商標と重なる。 |

「使える（暫定）」は「ネット検索では衝突が見つからなかった」という意味です。J-PlatPat などの登録簿は検索できていないので、**登録簿の確認はまだ残っています**。

## 使った情報源（使えたもの／使えなかったもの）

| 情報源 | 結果 |
|---|---|
| J-PlatPat（https://www.j-platpat.inpit.go.jp/） | **使えず**。JavaScriptで動く画面で、取得できたのは「Loading...」だけ。 |
| WIPO Global Brand Database（https://branddb.wipo.int/） | **使えず**。ボット確認（ALTCHA）の画面で止まる。 |
| USPTO 商標検索（https://tmsearch.uspto.gov/） | **使えず**。画面は空、API も拒否された。 |
| TMview（https://www.tmview.org/） | **使えず**。503 エラー。 |
| EUIPO eSearch（https://euipo.europa.eu/eSearch/） | **使えず**。トップ画面だけで結果は出ない。 |
| Justia Trademarks（USPTO データの転載サイト） | 一部だけ。検索結果の一覧には出たが、詳細ページは 403。 |
| 一般のウェブ検索 | 使えた。 |
| GitHub リポジトリ検索（ウェブ画面） | 使えた。 |
| Chrome ウェブストア検索 | 一部だけ。検索結果の一覧は取れたが、個別ページは中身が取れないことがあった。 |

つまり、**どの名前も公式の商標登録簿では確認できていません**。

---

## 1. Yuragi（P1 の現在の仮名）

**調べたこと**
- ウェブ検索：「Yuragi software app」「"Yuragi" trademark」「yuragi github localization」「株式会社ゆらぎ／ゆらぎ アプリ 商標」
- GitHub リポジトリ検索：「yuragi」
- J-PlatPat、WIPO、USPTO、TMview、EUIPO（すべて取得できず）

**見つかったこと**
- 米国で「YURAGI」の出願がある（シリアル番号 97855438、2023年出願）。ただし第11類（空気清浄機・加湿器など）で、ソフトウェアではない。
  https://trademarks.justia.com/978/55/yuragi-97855438.html
- 似た登録商標「KAYURAGI」（日本香堂）。お香の分野で、ソフトウェアではない。
  https://www.trademarkelite.com/trademark/trademark-detail/76573702/KAYURAGI
- 漫画・アニメ「ゆらぎ荘の幽奈さん」（集英社）と、そのゲーム化作品がある。**ゲーム分野で同じ言葉が使われている**ので、ゲームのローカライズ向けツールとしては気になる点。（第9類のゲームソフトで「ゆらぎ荘」が登録されている可能性あり。未確認。）
- GitHub に「yuragi」を含むリポジトリが 56 件。大阪大学の「Yuragi Learning Platform（YLPF）」、フォント演出ツール lawvs/yuragi など。どれも翻訳QAではない。
  https://github.com/search?q=yuragi&type=repositories
- 家具ブランド Blomus の「YURAGI」シリーズ、音楽グループ「揺らぎ」など、他分野での使用も多い。
- 「1/fゆらぎ」のように、日本語ではふつうの言葉。**識別力が弱く、登録が難しい・他人も自由に使う**可能性がある。

**確認できなかったこと**
- 日本の登録簿（J-PlatPat）で「ユラギ」の称呼、第9類・第42類。
- WIPO・EU・米国の登録簿で第9類・第42類の「YURAGI」。

**結論：要注意**
ソフトウェア分野で同じ名前の強い先行例は見つかりませんでした。ただし、ふつうの日本語で識別力が弱いこと、ゲーム分野に有名作品があること、登録簿を見られていないことから「要注意」とします。

---

## 2. P1 の代替案

### 候補の洗い出し（約8案）

| 候補 | ざっくり検索の結果 | 判断 |
|---|---|---|
| SanCheck | 同名製品は見つからず。ただし「SANチェック」はTRPG（クトゥルフ神話TRPG）の有名な用語で、ゲーム分野と重なる。 | 落選 |
| Hyoki（表記） | 計測機器メーカー「Hioki（日置電機）」と音が近く、第9類で衝突しやすい。 | 落選 |
| LocLint | 似た名前の「LocaLint」「locale-lint（Weblate）」が既にある。 | 落選 |
| Yakugo（訳語） | 「Yakutori」（日本語ゲームの翻訳ツール、Steam）、「YarakuZen」（翻訳サービス）と似ている。 | 落選 |
| ScriptDrift | GitHub に同名の小さなリポジトリあり。「Drift」は有名なチャットSaaS。 | 落選 |
| Honorifix | 何も見つからない。 | **採用** |
| Kotomark | 何も見つからない（似た「KO MARK」アプリは分野が遠い）。 | **採用** |
| YureLint | 何も見つからない。 | **採用** |

### 2-1. Honorifix

- 意味：honorific（敬称）＋ fix。敬称の揺れを直すイメージ。
- 調べたこと：ウェブ検索「"Honorifix"」「Honorifix app translation Japanese honorifics tool」、GitHub 検索。
- 見つかったこと：同名の製品・会社・リポジトリはなし（GitHub 0件）。近い分野に「Japanese Honorific Converter」（iOSアプリ）や「Web Honorifics API」（Firefox拡張）があるが、名前は別物。
  - https://github.com/search?q=honorifix&type=repositories
  - https://apps.apple.com/app/id1541240975
- 弱い点：「honorific」に近く、**説明的**。商標として強くない（他人の似た名前を止めにくい）。また、敬称だけのツールに見える。
- 確認できなかったこと：全登録簿（J-PlatPat の「オノリフィックス」等、WIPO、USPTO、EUIPO）。
- **結論：使える（暫定）**

### 2-2. Kotomark

- 意味：言（こと）＋ mark。言葉の印・用語の目印。
- 調べたこと：ウェブ検索「"Kotomark" OR "Koto Mark" software」「Kotomark／コトマーク／ことまーく」、GitHub 検索。
- 見つかったこと：同名はなし（GitHub 0件）。似た名前に「KO MARK」（現場チーム向けの写真報告アプリ）、「Kotopro」（建設の記録サービス）があるが、分野は遠い。
  - https://github.com/search?q=kotomark&type=repositories
  - https://mwm.ai/apps/ko-mark/6741153521
- 弱い点：「Koto」を含む名前は世の中に多い。意味がすぐ伝わりにくい。
- 確認できなかったこと：全登録簿（J-PlatPat の称呼「コトマーク」等）。
- **結論：使える（暫定）**

### 2-3. YureLint

- 意味：表記ゆれ（yure）＋ lint（コードの検査ツールの意味）。機能がそのまま伝わる。
- 調べたこと：ウェブ検索「Yurelint／YureLint／yure-lint」「ユレリント」、GitHub 検索。
- 見つかったこと：同名はなし（GitHub 0件）。「lint」を含む検査ツールは多い（yamllint など）が、名前全体は別物。
  - https://github.com/search?q=yurelint&type=repositories
- 弱い点：英語話者には「yure」の意味が伝わらない。「lint」部分は一般的な言葉なので、商標としての強さは「Yure」部分に頼る。
- 確認できなかったこと：全登録簿（J-PlatPat の称呼「ユレリント」等）。
- **結論：使える（暫定）**

---

## 3. Collector Lens（P4：海外コレクター向け Chrome 拡張）

**調べたこと**
- ウェブ検索：「"Collector Lens" app OR extension」「"Collector Lens" Chrome extension Mercari Yahoo Auctions」「Collectors Lens／CollectorLens／Collector's Lens」
- GitHub 検索、Chrome ウェブストア検索
- Google Lens の商標について

**見つかったこと**
- **同名のプロジェクトがある**：GitHub「Nixphantomz/Collector-Lens」。写真から収集品を特定し、市場価格を推定するAIツール（ハッカソン作品）。デモ公開あり（collector-lens.vercel.app）。**コレクター向けという点で分野が近い**。
  - https://github.com/Nixphantomz/Collector-Lens
- Chrome ウェブストアで「collector lens」を検索すると「Lens」という拡張が1件出た（詳細は取得できず）。
- **Google Lens** は有名な商標。カナダでは「画像で検索するソフトウェア」として出願されている。しかも Google Lens は「収集品の価値を調べる」用途でよく紹介されている。「Lens」を含むと、画像検索系の製品と誤解される心配がある。
  - https://mobilesyrup.com/2017/08/15/google-files-trademark-lens-canada/
  - https://www.wilx.com/2025/04/16/what-tech-find-out-how-much-your-collectibles-are-worth-with-google-lens/
- 同じ分野（メルカリ・ヤフオク向け拡張）には「StampExplorer」「Japan Shopping Assistant」「My Deal Verifier」などがあるが、名前は別物。
  - https://chromeboard.com/extension/japan-shopping-assistant-offhfbhncggfenilnddefmobjebkmdph
- 「collector lens」は光学（顕微鏡）の一般用語でもある。**説明的で、商標として弱い**。

**確認できなかったこと**
- 全登録簿（J-PlatPat の称呼「コレクターレンズ」、WIPO、USPTO、EUIPO）。
- Chrome ウェブストアの「Lens」拡張の中身。

**結論：要注意**
同じ「コレクター向け」の分野に同名プロジェクトがあり、「Lens」は Google Lens と重なります。別名を検討するのが無難です。Chrome 拡張の名前に「Mercari」「Yahoo」など他社の名前を入れるのも避けてください。

---

## 次にやること（オーナー向け）

### J-PlatPat での手動検索（無料）

1. https://www.j-platpat.inpit.go.jp/ をブラウザで開く。
2. 上のメニューで「商標」→「商標検索」を選ぶ。
3. 検索の種類で「称呼（単純）」を選び、称呼を入力する。
   - Yuragi → `ユラギ`
   - Honorifix → `オノリフィックス` と `ホノリフィックス`
   - Kotomark → `コトマーク`
   - YureLint → `ユレリント` と `ユレ`
   - Collector Lens → `コレクターレンズ`
4. 「類似群コード」または「区分」で `09` と `42` を指定する（区分欄に「09 42」）。
5. 検索して、ヒットした商標の「指定商品・役務」と「権利者」「存続か消滅か」を見る。
6. 念のため「文字（商標）」での検索もする（例：`ゆらぎ`、`揺らぎ`、`YURAGI`、`COLLECTOR LENS`）。
7. 称呼は似た音も拾うために「称呼（類似）」でも試す。

### 海外も使う場合

- WIPO Global Brand Database（https://branddb.wipo.int/）で名前を入れ、Nice 区分 9・42 で絞る。
- 米国：USPTO の商標検索（https://tmsearch.uspto.gov/）。
- EU：TMview（https://www.tmview.org/）または EUIPO eSearch。
- どれもブラウザで人が操作すれば無料で使えます。

### 誰に聞くか

- **弁理士**（商標が専門の人）。日本弁理士会の「弁理士ナビ」で探せます。
- 無料相談：各都道府県の **INPIT 知財総合支援窓口**（電話番号は INPIT の公式サイトで確認してください）。中小企業・個人事業向けで、商標の相談もできます。
- 名前を決めたら、正式な商標調査と出願を弁理士に依頼するのが確実です。

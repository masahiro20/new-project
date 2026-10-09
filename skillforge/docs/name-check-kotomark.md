# 名前の衝突チェック：Kotomark（自己調査メモ）

> **ご注意（必ずお読みください）**
> - これは弁護士・弁理士による調査ではありません。無料で見られる公開情報を、自分で調べただけのメモです。法的な助言ではありません。
> - 商標登録できるかどうか、他人の権利を侵害していないかどうかは**保証しません**。
> - **公式の商標登録簿（J-PlatPat・WIPO・USPTO・EUIPO）は、今回も自動では検索できませんでした。登録簿の確認は未完了です。**
> - 名前を正式に使う前に、下の「オーナーが手で行う J-PlatPat の確認手順」を実施するか、弁理士に相談してください。
> - 調査日：2026-10-09
> - 対象の区分：第9類（ソフトウェア）、第42類（SaaS・ソフトウェア関連サービス）
> - 前回の調査（[name-check.md](name-check.md)、2026-10-08）の続きです。

## まとめ

| 名前 | 対象 | 結論 | 理由 |
|---|---|---|---|
| Kotomark | P1 製品名（仮名） | 使える（暫定） | npm・PyPI・crates.io は空き。GitHub に同名のリポジトリ・ユーザーなし。ウェブ検索でも同名の製品・会社・商標は見つからない。kotomark.com などのドメインも未登録らしい。登録簿は未確認。 |
| kotomark-action | GitHub Action のリポジトリ名 | 使える（暫定） | GitHub に同名リポジトリなし、Marketplace に「kotomark」の結果 0 件。npm も空き。 |
| YureLint | P1 代替案1 | 使える（暫定） | npm・PyPI・crates.io・GitHub すべて空き。ウェブ検索で同名なし。yurelint.com も未登録らしい。登録簿は未確認。 |
| Honorifix | P1 代替案2 | 使える（暫定） | npm・PyPI・crates.io・GitHub すべて空き。ウェブ検索で同名なし。ただし英単語「honorific」に近く説明的で、商標としては弱い可能性。登録簿は未確認。 |

「使える（暫定）」は「無料で見られる範囲では衝突が見つからなかった」という意味です。**登録簿の確認が残っています。**

### 似た名前で気になるもの（いずれも「避ける」ほどではないと判断）

| 似た名前 | 分野 | 評価 |
|---|---|---|
| コトバンク（kotobank.jp、日本語の辞書サイト） | 辞書・ことばのウェブサービス | 「コト」で始まる点だけ共通。称呼は「コトバンク」と「コトマーク」で後半（バンク／マーク）がはっきり違い、意味も違う。混同の恐れは低いと見るが、分野（ことば関連のウェブサービス）が近いので J-PlatPat で類似称呼を確認したい。 |
| Kotozna（コトズナ、東京の多言語チャット翻訳アプリ） | 翻訳ソフト（第9類・第42類に近い） | **分野が最も近い**。ただし後半（ズナ／マーク）が違い、別の語として読める。混同の恐れは低いと見るが要確認。 |
| KOTO（Koto Studio、ロンドンのブランディング会社。米国で「KOTO」出願 88070272、マーケティング系役務） | ブランド・デザイン | ソフトウェア製品ではない。「KOTO」単体と「KOTOMARK」は外観・称呼ともに違う。 |
| Koto（プログラミング言語 koto-lang）、楽器の「箏（koto）」関連の会社 | プログラミング言語・楽器 | 「koto」は一般的な語。Kotomark とは別の語。 |
| KOTOTSUGI（WordPress の Markdown 取り込みプラグイン） | ソフトウェア | 「Koto＋Markdown」の連想は近いが、名前は別。 |
| KOTOM（米国出願 98172400、第24類 布製品） | 布製品 | 分野が遠い。 |
| KO MARK アプリ（前回調査） | 分野が遠い | 前回同様、問題なしと判断。 |

---

## 調べたことと証拠

### 1. パッケージ登録所（2026-10-09、curl で確認）

| 確認先 | 結果 |
|---|---|
| https://registry.npmjs.org/kotomark | 404（空き） |
| https://registry.npmjs.org/kotomark-action | 404（空き） |
| https://registry.npmjs.org/kotomark-cli | 404（空き） |
| https://registry.npmjs.org/yurelint ・ /honorifix | どちらも 404（空き） |
| npm 検索 `https://registry.npmjs.org/-/v1/search?text=kotomark` | 0 件（`@kotomark/*` スコープのパッケージも見当たらない） |
| https://pypi.org/pypi/kotomark/json ・ kotomark-action ・ yurelint ・ honorifix | すべて 404（空き） |
| https://crates.io/api/v1/crates/kotomark ・ yurelint ・ honorifix | すべて 404（空き） |

※ npm のスコープ（`@kotomark`）は、組織名が空いているかを API で直接は確認できません。npm に組織を作るときに分かります（アカウントが必要なので今回は未実施）。

### 2. GitHub

| 確認先 | 結果 |
|---|---|
| https://github.com/kotomark | 404（ユーザー・組織とも存在しない） |
| https://github.com/search?q=kotomark&type=repositories | 0 件 |
| https://github.com/search?q=kotomark-action&type=repositories | 0 件 |
| https://github.com/search?q=yurelint&type=repositories | 0 件 |
| https://github.com/search?q=honorifix&type=repositories | 0 件 |
| ウェブ検索「kotomark github」 | 同名のリポジトリは見つからず |

※ GitHub API（`api.github.com/users/...`、`gh api search/...`）はこの作業環境では使えませんでした（環境の制限で 403）。ウェブ画面の検索で代わりに確認しました。yurelint・honorifix のユーザー名ページ（github.com/yurelint など）は未確認です。

### 3. GitHub Marketplace

| 確認先 | 結果 |
|---|---|
| https://github.com/marketplace?query=kotomark | 0 件（Actions・アプリとも） |

### 4. 商標の登録簿

| 確認先 | 結果 |
|---|---|
| J-PlatPat（https://www.j-platpat.inpit.go.jp/t0100） | **使えず**。「Loading...」だけの画面（JavaScript で動く）。 |
| WIPO Global Brand Database | **使えず**。ボット確認（ALTCHA）の画面で止まる。 |
| USPTO（https://tmsearch.uspto.gov/） | **使えず**。中身のない画面だけが返る。 |
| EUIPO eSearch | **使えず**。トップ画面だけで結果は出ない。 |
| TMview | **使えず**。接続できない。 |
| Justia Trademarks 検索 | **使えず**。403。 |
| ウェブ検索「"KOTOMARK" trademark」 | 同名の記録は見つからず。近いのは KOTOM（米国、第24類）、KOTOWERS（インド、第15類）、KOTARC（米国、電池関連）。いずれも分野が遠い。 https://trademark.justia.com/981/72/kotom-98172400.html |

### 5. ウェブ・ドメイン

**ウェブ検索**（「"Kotomark"」「"コトマーク"」「Kotomarc / Koto Mark / Coto Mark software」「"YureLint" OR "Honorifix"」「Koto 翻訳ツール」など）
- 「Kotomark」「コトマーク」と完全に同じ名前の製品・会社・アプリは見つからず。
- 似た名前：
  - Kotozna（翻訳アプリ） https://www.capterra.co.uk/software/1041279/kotozna
  - Koto Studio（ブランディング会社）の商標 https://trademarks.justia.com/owners/koto-studio-limited-3904620
  - KOTOTSUGI（WordPress プラグイン） https://wordpress.org/plugins/kototsugi/
  - コトバンク https://kotobank.jp/
- YureLint・Honorifix は同名の使用が見つからず（「honorific」の辞書ページだけが出る）。

**ドメイン**（DNS は `getent hosts`、登録状況は RDAP で確認。比較用に google.com は RDAP 200、DNS 応答ありを確認済み）

| ドメイン | DNS | RDAP（登録記録） | 判断 |
|---|---|---|---|
| kotomark.com | なし | 404（記録なし） | 未登録らしい |
| kotomarc.com | — | 404 | 未登録らしい |
| kotomark.dev | なし | 404 | 未登録らしい |
| kotomark.app | なし | 404 | 未登録らしい |
| kotomark.io | なし | 確認不可（.io は RDAP 非対応） | DNS なし。未登録の可能性が高いが未確定 |
| kotomark.jp | なし | 未確認（JPRS WHOIS は未実施） | DNS なし。未確定 |
| yurelint.com | なし | 404 | 未登録らしい |
| honorifix.com | なし | 404 | 未登録らしい |

※ ドメインは誰かが今この瞬間に取ることもあります。取得する場合は早めに。

---

## 確認できなかったこと

- **日本・海外の公式商標登録簿（J-PlatPat、WIPO、USPTO、EUIPO、TMview）。** すべて自動では見られませんでした。
- 「コトマーク」の**類似称呼**（例：コトマルク、コドマーク、ことまーく）での登録・出願。
- コトバンク・Kotozna が第9類・第42類でどんな商標を持っているか。
- npm の組織名 `@kotomark` が空いているか（作成時にしか分からない）。
- kotomark.jp・kotomark.io の正式な登録状況。
- GitHub のユーザー名 yurelint・honorifix が空いているか。

---

## オーナーが手で行う J-PlatPat の確認手順

所要時間：10〜15分ほど。無料・アカウント不要です。

1. ブラウザで https://www.j-platpat.inpit.go.jp/ を開く。
2. 上のメニューから「商標」→「商標検索」を選ぶ。
3. **称呼で調べる（いちばん大事）**
   1. 検索項目で「称呼（類似検索）」を選び、「コトマーク」と入力する。
   2. 検索項目を追加して「区分」を選び、「09 42」と入力する（半角スペース区切り）。
   3. 「検索」を押す。似た読みの商標（例：コトマルク など）も出てきます。
   4. 次に「称呼（単純文字列検索）」でも「コトマーク」を同じ区分で検索する。
4. **文字で調べる**
   1. 検索項目で「商標（検索用）」を選び、「KOTOMARK」と入力 → 区分「09 42」で検索。
   2. 同じく「Kotomark」「コトマーク」「ことまーく」でも検索する。
5. **区分を外してもう一度**：区分を空にして「コトマーク」「KOTOMARK」で検索し、他の分野で有名な商標がないか見る。
6. **気になる先の商標を見る**：「コトバンク」「Kotozna／コトズナ」を称呼で検索し、指定区分に 09・42 があるか確認する。
7. **結果の見方**
   - 0 件、または分野が遠いものだけ → 「使える（暫定）」のまま。
   - 第9類・第42類で読みが同じ・非常に近い商標が「登録」または「出願中」→ その名前は避け、代替案（YureLint、Honorifix）で同じ手順を行う。
   - 判断に迷うもの → 画面を保存して弁理士に相談。
8. 代替案を使う場合は、称呼「ユレリント」「オノリフィックス」、文字「YURELINT」「HONORIFIX」で同じ手順を行う。
9. 結果（日付・件数・気になった番号）を、この文書の末尾に書き足す。

海外でも売る予定があれば、WIPO Global Brand Database（https://branddb.wipo.int/）と USPTO（https://tmsearch.uspto.gov/）でも「KOTOMARK」を区分 9・42 で検索してください（どちらもブラウザでは使えます）。

---

## 推奨

1. **Kotomark を P1 の製品名として、kotomark-action を GitHub Action のリポジトリ名として、暫定で使い続けてよい。** 無料で見られる範囲（パッケージ登録所・GitHub・Marketplace・ウェブ・ドメイン）では衝突は見つかりませんでした。
2. ただし**正式公開（有料販売・ロゴ作成・ドメイン購入）の前に、オーナーが上の J-PlatPat 手順を行うこと**。特に「コトマーク」の類似称呼と、同じ分野に近いコトバンク・Kotozna の区分を見てください。
3. 名前を押さえたいなら、費用のかからないもの（GitHub の組織名 `kotomark`、npm の `kotomark` パッケージ名）は早めに確保を検討する（アカウント操作が必要なので、オーナーが判断）。kotomark.com は有料なので、J-PlatPat 確認後に。
4. Kotomark が使えないと分かった場合の代替案は、**1番目 YureLint**（意味が伝わり、同名なし）、**2番目 Honorifix**（同名なしだが説明的で商標として弱い可能性）。

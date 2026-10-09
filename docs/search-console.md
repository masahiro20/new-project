# Google Search Console の登録（オーナー作業・約10分）

公開URL：`https://masahiro20.github.io/new-project/`（GitHub Pages）
Search Console のアカウントは**オーナーの Google アカウント**で作ります。Mina・ピーターはログインしません。

## どの方法で所有確認するか

GitHub Pages のプロジェクトサイト（`/new-project/` の下）は、ドメイン全体（`masahiro20.github.io`）の DNS を変えられません。そのため **「URL プレフィックス」プロパティ** を使い、次のどちらかで確認します。

| 方法 | オーナーの作業 | サイト側の作業 | おすすめ |
|---|---|---|---|
| A. HTML タグ | 表示された `content="…"` の値を本部に伝える | 環境変数 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` に入れて書き出し直す（全ページの `<head>` に `<meta name="google-site-verification">` が入る） | ◎（ファイルを増やさない） |
| B. HTML ファイル | ダウンロードした `googleXXXXXXXX.html` を本部に渡す | そのファイルを `public/` にそのまま置いて書き出し直す（`https://masahiro20.github.io/new-project/googleXXXXXXXX.html` で開ける） | ○ |

どちらの値も**秘密情報ではありません**（公開ページに載るもの）。チャットやコミットに含めてかまいません。

## 手順

1. https://search.google.com/search-console を開き、オーナーの Google アカウントでログインする
2. 「プロパティを追加」→ **URL プレフィックス** を選び、`https://masahiro20.github.io/new-project/` を入力する（末尾の `/` まで入れる）
3. 確認方法の一覧から **HTML タグ**（方法A）を開き、`<meta name="google-site-verification" content="ここの値">` の **content の値**をコピーして本部に送る
   - 方法B にする場合は **HTML ファイル** を開き、ファイルをダウンロードして本部に送る
4. 本部（ピーター）が次のどちらかで書き出し直し、再公開する
   - 方法A：`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<値> npm run export:pages`
   - 方法B：`public/googleXXXXXXXX.html` に置いてから `npm run export:pages`
5. 再公開できたら、Search Console の画面に戻って **「確認」** を押す
   - 確認後も、タグやファイルは消さない（消すと所有権が外れる）
6. 左のメニュー「サイトマップ」で `sitemap.xml` を追加する（`https://masahiro20.github.io/new-project/sitemap.xml`）

## 補足

- `https://masahiro20.github.io/new-project/robots.txt` は検索エンジンに読まれません（robots.txt はドメインの直下だけが有効）。サイトマップは手順6で直接登録します。
- 書き出したページの確認方法：`out/index.html` を開き、`google-site-verification` を検索する（方法A）、または `out/googleXXXXXXXX.html` があることを確認する（方法B）。
- 独自ドメインに移したときは、新しいURLでプロパティを追加し直します。

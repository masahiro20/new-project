# bg/ — Budget Guard の機能紹介ページ（静的）

Budget Guard の英語の機能紹介ページ（1 ページの LP）。GitHub Pages で配信するための静的ファイルで、ビルド手順・依存パッケージ・バックエンドはない。`calc/` と同じ方式。

公開予定 URL：https://masahiro20.github.io/new-project/bg/

アプリ本体（`signal-lab/budget-guard/`）とは別物で、アプリのコードは一切読み込まない。本文の一次情報は `signal-lab/budget-guard/docs/lp.md` の英語本文。

## ファイル

| ファイル | 説明 |
|---|---|
| `index.html` | ページ本体。CSS と JS はすべてインライン。構成：Hero（80%／100% の流れを示す手描きの SVG 図つき）、問題、使い方 3 ステップ、3 社の「止める」と戻し方の表、安全策、組み込みの仕組みとの比較、通知、FAQ、Coming later、最終 CTA（待機リストのダミー）、計算機への相互リンク。 |
| `favicon.svg` | ファビコン。 |
| `og.png` | 1200×630 の SNS プレビュー画像。 |
| `og-template.html` | `og.png` の元ファイル。サイトからはリンクしていない。 |
| `README.md` | このファイル。 |

### 方針

- **外部への通信はしない。** CSP は `calc/index.html` と同じ（`default-src 'none'`、`connect-src` なし、`form-action 'self'`）。フォントも画像も外から読み込まない。
- 外部リンクは lp.md にある引用元だけ（Hacker News の 2 件、Vercel・OpenAI・Anthropic の公式ドキュメント）。`target="_blank" rel="noopener noreferrer"`、`referrer` は `no-referrer`。リンクは遷移するだけで、ページの読み込み時には通信しない。
- アセットはすべて相対パス。絶対 URL は `canonical`、`og:url`、`og:image`、`twitter:image` の 4 つだけ（クローラーが絶対 URL を求めるため）。公開 URL が変わったらこの 4 つを直す。
- **待機リストはダミー。** 形式をローカルで確かめて「The waitlist isn't open yet, so nothing was sent or saved.」と出すだけ。送信も保存もしない（Cookie・localStorage なども使わない）。メール欄には `name` を付けていないので、JS なしで送信しても値は載らない。本物につなぐのは本部の承認後。
- **体験デモへのリンクは張らない**（アーティファクトが非公開のため）。代わりにページ内の静的な SVG 図で 80% と 100% の流れを見せる。
- **料金は載せない**（リーダー判断）。lp.md の金額は「案・承認待ち」なので、ページには「Pricing will be announced.」とだけ書く。
- 実績の数字・利用者の声・ロゴは載せない（lp.md のルールと同じ）。
- デザインのトークンは `calc/index.html` と同じ値。ライト／ダーク（OS 設定、`data-theme` での上書き）に対応。360px 幅でも横スクロールを出さない（表は 760px 以下でカード状に積む）。フォーカスは `:focus-visible` で見える。`prefers-reduced-motion` でスムーズスクロールを止める。
- 計算機との相互リンク：このページから `../calc/`、`calc/index.html` の Budget Guard ブロックから `../bg/`。

## GitHub Pages への公開手順

1. Pages が公開するブランチ（例：`main`）のルートに `bg/` があることを確かめる。`calc/` と同じ設定（**Settings → Pages → Deploy from a branch**、フォルダ **`/ (root)`**）なら、追加の設定はいらない。
   - Pages が別のフォルダや別ブランチ（例：`gh-pages`）を公開している場合は、そこへ `bg/` をコピーする。`calc/` も同じ場所にあること（相互リンクが相対パスのため）。URL が変わる場合は上の 4 つの絶対 URL を直す。
2. デプロイ後、`…/bg/`、`…/bg/og.png`、`…/bg/favicon.svg` が開くこと、`…/bg/` ⇄ `…/calc/` の相互リンクが動くことを確かめる。
3. カード検証ツール（例：opengraph.xyz）に URL を通してプレビューを確かめる。

### og.png の描き直し

文言を変えたら `og-template.html` を直してから描き直す（Playwright と `/opt/pw-browsers` の Chromium）：

```js
// PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node og.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto('file:///home/user/new-project/bg/og-template.html');
  await p.screenshot({ path: '/home/user/new-project/bg/og.png' });
  await b.close();
})();
```

## lp.md と食い違わないように保つ方法

**lp.md が正。** ページの英語本文は lp.md の英語本文をほぼそのまま写している。新しい主張はページで先に書かず、lp.md（とその出典：`README.md`、`product.config.ts`、`lib/guard/info.ts`、`docs/provider-apis.md`）を先に直してから写す。

- `index.html` の各セクションには、元になった lp.md の見出しをコメントで書いてある（例：`<!-- 安全策：lp.md「Safety」 -->`）。lp.md の節が変わったら、同じコメントの節を直す。
- ページで lp.md と変えてよいのは次だけ：
  - 見出しやカードに分けるための区切り方・強調。
  - SVG 図と og.png の短い言い換え（中身は lp.md の Hero／How it works／Safety／FAQ の範囲）。
  - 料金の節を載せないこと、「Pricing will be announced.」、待機リストがダミーである旨、計算機の紹介、フッターの「Not affiliated…」。
- 機能が実装されたら、lp.md の「Coming later」から外して本文へ移し、そのあとでページも同じように直す。とくに「one-click undo」は FAQ（How do I undo a stop?）と図の「You undo it yourself」にも出てくるので、3 か所そろえて直す。
- 料金が承認されたら、lp.md の「draft, pending approval」を外してから、ページに料金の節を足す。
- 各社の挙動（Vercel の一時停止の範囲、OpenAI の上限が即時でないこと、Anthropic の Priority Tier、読み取り専用キーがないこと）は変わりうる。lp.md の日付（2026-10-08）を更新したときは、ページの「honest caveat」の日付も合わせる。

### 突き合わせのやり方（目安）

ページの本文を文単位に分けて、lp.md に同じ文があるかを機械的に調べ、見つからない文だけを目で確かめる。

1. `bg/` と `calc/` を同じ親（`…/new-project/`）の下に置いてローカル配信する（例：作業用ディレクトリにコピーして `python3 -m http.server`）。
2. Playwright でページを開き、`details` をすべて開いてから `main`・`footer`・SVG の `text` の文字列を取り出す。
3. 引用符と空白を正規化し、lp.md（Markdown の記号とリンク先 URL を除く）に含まれない文を一覧にする。
4. 一覧に残るのは、表の区切りで文がつながったもの・図の短い言い換え・上の「変えてよいもの」だけのはず。それ以外が出たら、lp.md に合わせて直す。

## 確認済みの項目

Playwright（Chromium）で、`/new-project/bg/` の下に配信して、1280px のライトと 360px のダークで確認した。

- 読み込みエラー・コンソールエラーがない。ページ自身のオリジン以外へのリクエストがない。横スクロールがない。
- `../calc/` へのリンクで計算機が開き、計算機の `../bg/` リンクで戻れる。
- 待機リストのダミー：不正な形式ではエラー文、正しい形式では「nothing was sent or saved」を表示。GET 以外のリクエストなし、URL も変わらず、storage と Cookie は空。
- lp.md との突き合わせ（上のやり方）。

# アクセス計測（Cookie なし・サーバーなし）

## 結論
**GoatCounter（https://www.goatcounter.com）を使う。** コードは組み込み済みで、オーナーがアカウントを作ってサイトコードを渡せば、書き出し直すだけで計測が始まる。未設定のあいだは何も読み込まない。

| 候補 | 費用 | Cookie | サーバー不要 | 独自イベント | 判断 |
|---|---|---|---|---|---|
| **GoatCounter** | 無料（「個人サイトや中小規模の事業での利用は問題ない」と明記。1日数百万PVは不可） | 使わない | ○（スクリプト1つ） | ○（`event: true`） | **採用** |
| Cloudflare Web Analytics | 無料 | 使わない | ○ | ×（ページビューのみ。独自イベントなし） | 診断の完了数が測れないので次点 |
| Google Analytics 4 | 無料 | 使う | ○ | ○ | Cookie を使い、同意バナーとプライバシー記載が重くなるので見送り |
| Plausible / Fathom | 有料 | 使わない | ○ | ○ | 費用がかかるので見送り |

GoatCounter は、IP アドレスや User-Agent をそのまま保存せず、集計した値だけを保存すると説明している（https://www.goatcounter.com/help/gdpr）。

## 数えるもの

| 名前（GoatCounter 上のパス） | いつ | 集客計画の指標 |
|---|---|---|
| 各ページのパス | ページを開いたとき（画面遷移ごと） | サイト訪問 |
| `check-start` | 診断で最初にチェックを入れたとき（または未チェックで結果を見たとき） | 診断の開始 |
| `check-complete` | 「診断結果を見る」を押したとき | **無料診断の完了数**（有料化の判断基準：累計30件） |
| `sample-download-committee` / `-training` / `-restraint` | 書類サンプルの「Wordで保存」が成功したとき | **見本の保存数** |
| `demo-purchase-complete` | デモ購入が完了したとき（デモを表示している場合のみ） | — |

- 診断の**回答内容は送らない**。送るのはイベント名だけ。
- X からの流入は、GoatCounter の参照元（Referrer）で見る。

## オーナーの作業（約5分）

1. https://www.goatcounter.com/signup でアカウントを作る（メールアドレスとパスワード。無料）
2. 「Code」に `genzan-zero` など好きな英数字を入れる → ダッシュボードは `https://genzan-zero.goatcounter.com` になる
3. 設定（Settings）で次をおすすめ：
   - 「Ignore IPs」に自分の IP を入れる（自分のアクセスを数えない）
4. 決めた **Code** を本部に伝える（秘密情報ではない）

## 本部の作業

```sh
NEXT_PUBLIC_GOATCOUNTER_CODE=genzan-zero npm run export:pages   # その後 gh-pages に再公開
```

- 書き出した `out/index.html` に `gc.zgo.at/count.js` が含まれていれば有効。
- プライバシーポリシーには、コードを設定したときだけ「アクセス解析：GoatCounter（Cookie を使わない）」の項目が自動で表示される。
- 広告ブロッカーを使う人の分は数えられない（実際より少なく出る）。

## 実装

- `lib/analytics.ts`：`trackPageview` / `trackEvent`。count.js の読み込みを最大5秒待ち、読めなければ何もしない。
- `app/Analytics.tsx`：`no_onload` で count.js を読み込み、App Router の画面遷移ごとにページビューを送る（count.js だけだと最初の1ページしか数えないため）。
- イベントの呼び出し：`app/check/CheckClient.tsx`、`app/samples/SampleDownload.tsx`、`app/checkout/demo/DemoCheckoutClient.tsx`。

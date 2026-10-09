# 創設サポーターキーの運用手順

## オーナー向けの3行（販売開始のときに1回だけ）

1. **オーナーの端末で鍵を作る**（§2-1 のコマンドを1つ実行。ネットにつながっていなくてよい）。
2. **公開鍵のファイル（`…pub.pem`）だけをリーダーに渡す**（秘密鍵 `…pem` は渡さない。チャット・メール・リポジトリに貼らない）。
3. **秘密鍵を安全に保管する**（パスワード管理ツールなどに1つ、オフラインの予備に1つ。なくすと新しいキーを出せず、漏れたら全員に出し直し）。

---

対象：P3 Pitch の「創設サポーター」（買い切り $19・30日返金。本部の決定 d31・d32）。購入は Ko-fi、キーは手作業で送ります。
キーは Ed25519 の署名つきの文字列で、ページに埋め込んだ公開鍵だけで、端末の中で（オフラインで）確かめます。
設計は Atlas のセキュリティレビュー（`peter-hq/qa/p3-security/REPORT.md` §5）の要件どおりです。

- 公開鍵の一覧・外した kid・失効した lid：`demo/supporter-pubkey.js`（公開してよい値だけ）
- 検証：`demo/supporter.js`（形式・失効・保存）と `demo/ed25519.js`（WebCrypto の Ed25519、使えなければ `vendor/noble-ed25519.js`）
- 価格・返金日数・Ko-fi の URL・無料枠の数字：`demo/supporter.js` の `PLAN`（ここだけ）
- このリポジトリの道具 `scripts/supporter-key.mjs` は **テスト用の鍵の生成・発行と、公開してよい値の確認だけ**。
  **本番の秘密鍵を読む道具・本番のキーを発行する道具はこのリポジトリに置きません**（`docs/decisions.md`）。

## 1. 販売を始める条件（本部の決定 d32）

| 項目 | いまの値 | 場所 |
|---|---|---|
| 配信元 | 共有の `masahiro20.github.io`。**専用のオリジン（Cloudflare Pages）に移るまで販売しない**（共有オリジンでは他のページからキーを読まれる。REPORT B-01） | 配信の構成 |
| 本番の鍵 | 未作成（`SUPPORTER_KEYS = []`、キー入力欄は「準備中」、どのキーも何も解除しない） | `demo/supporter-pubkey.js` |
| 価格 | `$19`（買い切り）— 決定 | `PLAN.price`, `PLAN.priceNote` |
| 返金 | 30日以内なら理由を問わず — 決定 | `PLAN.refundDays` |
| Ko-fi の商品ページの URL | 空（画面は「購入ページは準備中です」）— TODO（オーナー） | `PLAN.kofiUrl` |
| 無料枠 | 1日20語・最小対5組・記録7日 — 確定（Kana、ルール3） | `PLAN.free*` |
| 無料枠の適用 | 販売開始まで適用しない（`false`）。販売開始時に `true` | `PLAN.freeLimitsActive` |
| プライバシーポリシー | 草案 `docs/privacy-policy-draft.md`（専門家の確認前） | 法務 |
| lid と注文の対応表の保管期限 | 案：購入から60日（返金の30日＋30日）— TODO（オーナー） | 非公開の台帳 |

## 2. 販売開始のとき（1回だけ）

### 2-1. オーナー：鍵を作る（オーナーの端末で）

どちらか1つ。秘密鍵はこの端末の外に出しません（このリポジトリにも、Claude のセッションにも置かない）。

```sh
# A. OpenSSL 1.1.1 以降（macOS は brew install openssl@3 の openssl）
umask 077 && mkdir -p ~/pitch-supporter && cd ~/pitch-supporter
openssl genpkey -algorithm ed25519 -out supporter-kid1.pem
openssl pkey -in supporter-kid1.pem -pubout -out supporter-kid1.pub.pem

# B. Node 20 以降
umask 077 && mkdir -p ~/pitch-supporter && cd ~/pitch-supporter
node -e "const c=require('crypto'),f=require('fs');const k=c.generateKeyPairSync('ed25519');f.writeFileSync('supporter-kid1.pem',k.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});f.writeFileSync('supporter-kid1.pub.pem',k.publicKey.export({type:'spki',format:'pem'}),{flag:'wx'})"
```

- `supporter-kid1.pub.pem`（`-----BEGIN PUBLIC KEY-----`）だけをリーダーに渡す。
- `supporter-kid1.pem`（`-----BEGIN PRIVATE KEY-----`）は、パスワード管理ツールとオフラインの予備に保管する。
- 照合用に、公開鍵の指紋を手元で計算してリーダーに伝える（kid が 1 の場合）：

  ```sh
  printf '1:%s' "$(openssl pkey -pubin -in supporter-kid1.pub.pem -outform DER | tail -c 32 | od -An -tx1 | tr -d ' \n')" | shasum -a 256
  ```

### 2-2. リーダー：公開鍵をページに入れる

```sh
cd pitch
node scripts/supporter-key.mjs pubkey-hex supporter-kid1.pub.pem   # → 64桁の16進（秘密鍵の PEM は読まずに拒否）
```

1. `demo/supporter-pubkey.js` の `SUPPORTER_KEYS` に `{ kid: 1, pub: '<16進>', added: 'YYYY-MM-DD' }` を足す
   （kid は 1〜239。240〜254 はテスト用で、本番の一覧には入れられない）。
2. `node scripts/supporter-key.mjs fingerprint` の値が、オーナーが計算した指紋と一致することを確かめる。
3. `PLAN.kofiUrl` に Ko-fi の URL、`PLAN.freeLimitsActive` を `true` にする。
4. 指紋を付けてビルドする（一致しなければ失敗する）：
   `SUPPORTER_KEYS_SHA256=<指紋> npm run build:demo && SUPPORTER_KEYS_SHA256=<指紋> npm run build:pwa`
5. 専用のオリジンに公開する。

## 3. キーの形式（発行の道具を作るとき・問い合わせの確認に）

| 項目 | 値 |
|---|---|
| 署名 | Ed25519（RFC 8032）。署名の対象は `"pitch-supporter-v1\0"`（UTF-8、末尾に NUL 1バイト）‖ ペイロード |
| ペイロード（21バイト） | `v`(1) = 1、`kid`(1)、`lid`(16・128ビットの乱数)、`plan`(1) = 1（創設サポーター）、`iat`(2・ビッグエンディアン・2024-01-01 からの日数) |
| キー | ペイロード ‖ 署名(64) の85バイトを Crockford base32（`0-9A-Z` から I・L・O・U を除く32文字、読み替えなし）で136文字にし、先頭に `PITCH1-`。8文字ごとにハイフン |
| 入力の正規化 | 空白（改行を含む）・大文字小文字・ASCII のハイフンだけ。全角や O→0 などの読み替えはしない。入力は512文字まで |
| 個人情報 | 入れない（氏名・メールアドレス・Ko-fi の注文番号は入れない） |
| 期限 | なし（買い切り。端末の時計に頼らない） |

本番の発行の道具（例 `issue.mjs`）は、オーナーの **非公開のリポジトリ** に置きます（販売開始時にリーダーが用意する）。
中身は上の表どおりの署名で、このリポジトリの `scripts/supporter-sign.mjs`（テスト用）と同じ処理に、秘密鍵の読み込み
（オーナーの端末の PEM）と台帳への追記を足したものです。発行したキーは、このリポジトリの
`node scripts/supporter-key.mjs verify "<キー>"` で確かめられます（公開鍵だけを使う）。

## 4. 購入されたら（1件ごと・手作業）

1. Ko-fi の通知（または管理画面の注文）を確かめる。
2. オーナーの端末の発行の道具でキーを作る（lid は毎回新しい乱数）。
3. `node scripts/supporter-key.mjs verify "<キー>"` → `OK kid=1 lid=… plan=1 iat=… short=#XXXX`。
4. **非公開の台帳** に1行：lid・短い表示（#XXXX）・発行日・Ko-fi の注文番号・送付日・返金の有無。
   メールアドレスは Ko-fi 側に残るので台帳には書かない。この対応表は §1 の保管期限が来たら消す。
5. Ko-fi のメッセージ（または購入者のメール）で送る。文面の例：

   > 創設サポーターへのご購入、ありがとうございます。サポーターキーは次のとおりです。
   >
   > PITCH1-…（キー）
   >
   > 次のリンクを開くと、その端末で解除されます：https://<専用のオリジン>/app/#key=PITCH1-…
   > （または、ページ下の「創設サポーター」の欄にキーを貼り付けて「キーを確認して解除」）
   > 使う端末（スマホ・PC）ごとに必要です。キーは他の人と共有しないでください。広く共有されたキーは使えなくなります。
   > ブラウザのデータを消したときは、このメールのキーをもう一度お使いください。
   > 判定はベータで調整中で、精度を約束するものではありません。
   > 購入から30日以内なら、理由を問わず返金します（このメッセージにご返信ください）。

- `#key=…` のリンクは、ページが読んだらすぐに URL から消します（履歴にも残しません）。ハッシュはサーバーに送られません。
- 画面には「サポーター #A7K3」のような短い表示だけを出し、キーそのものは出しません。

## 5. 失効（返金・流出）

1. 台帳で lid を探す（流出したキーなら `verify` で lid がわかる）。
2. `demo/supporter-pubkey.js` の `REVOKED_LIDS` に lid（32桁の16進）を **手で** 足し、レビューを受けてコミットする。
3. 公開用のページを作り直して公開する（`npm run build:demo && npm run build:pwa`、§2-2 の指紋付きで）。
4. 流出の場合、正規の購入者には新しい lid のキーを出し直す。
5. 台帳に失効日と理由を書く。

- 保存済みのキーもページを開くたびに検証し直すので、公開し直したページを開いた端末から効きます。
  更新しない端末（古い PWA のキャッシュのままオフラインで使う端末）には効きません。これは受け入れています（REPORT §5-7）。
- 購入画面にも「返金したキーや、広く共有されたキーは、次の版から使えなくなります」と書いてあります。

## 6. 署名鍵が漏れた・なくしたとき

1. オーナーが新しい鍵を作る（§2-1、ファイル名は `supporter-kid2.pem` など）。
2. `SUPPORTER_KEYS` から古い kid の項目を消し、その kid を `RETIRED_KIDS` に入れ、新しい kid を足す。
   古い kid のキーには「使えなくなりました。新しいキーをお送りします」と表示されます。
3. 台帳の有効なキー（返金・失効を除く）を、新しい kid・新しい lid で出し直し、購入者に送り直す。
4. 公開用のページを作り直して公開する。

## 7. 問い合わせ

- 「通らない」：`node scripts/supporter-key.mjs verify "<キー>"` で理由を見る。正しいキーなら同じキーを送り直す（新しい lid は不要）。
- 理由の文はページと同じ（`REASON_TEXT`）。キーの文字列はコンソール・エラーの文・評価協力の書き出し・Anki・共有カードに出ません。

## 8. テスト

```sh
node --test test/supporter.test.js                    # RFC 8032 のベクタ（2経路）、REPORT §5-9 の偽造パターン、保存・#key=、漏らさないこと、無料枠、CLI、公開物の検査
node scripts/qa-supporter.mjs --out <scratch のフォルダ> # Playwright：テスト鍵のビルドで 21語目のブロック→解除→削除、#key=、Ed25519 なし、本番ビルドは「準備中」
```

テストは毎回その場でテスト用の鍵（kid 240〜254）を作ります。テスト用の一覧を差し込んだビルド（`SUPPORTER_PUBKEY=…`）は、
`build-demo.mjs` / `build-pwa.mjs` が `dist/` と `site/` への書き込みを拒否し、テスト用の kid 以外が入った一覧も拒否します。
公開物に `PRIVATE KEY` の形（PEM・JWK の `d`）があれば、ビルドが失敗します。

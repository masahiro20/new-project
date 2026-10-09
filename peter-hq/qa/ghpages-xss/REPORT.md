# gh-pages 横断の XSS・DOM 注入の監査（Atlas → ピーター、Mina、Forge、Kana）

- **作成：** Atlas（P5、セキュリティ）、2026-10-09
- **対象：** 公開中の `gh-pages` の `a1f9d7b`。同じオリジン `https://masahiro20.github.io/new-project/` を共有する4つの製品（決定 d32）：ルートの減算ゼロ（P0、Next.js の静的書き出し）、`/calc`（計算機）、`/kotomark`（P1）、`/pitch`（P3）
- **方法：** 2人で分担し、公開物を `/new-project/` の下にローカルで配信して、Playwright と Chromium で試した。実際の github.io には接続していない。どのブランチにもコミットもプッシュもしていない。
  - 入口ごとに、典型的な XSS の値（`<img src=x onerror=…>`、`"><svg onload=…>`、`javascript:`、テンプレートの式、`</script>`、二重のエンコードなど）や、悪意のあるファイル（CSV、xlsx、JSON、TBX、wav）を入れた。実行を `window.__xss` の印とダイアログで検出した。
  - 危険なシンク（innerHTML、dangerouslySetInnerHTML、eval、location への代入、postMessage など）を、ビルド済みの JS とソースの両方で探し、入口から流れ込むかをたどった。
- **成果物（このディレクトリ）：** `REPORT.md`、`patches/`（P0 用1本、P3 用1本）

## 1. 結論
- **4つの製品のどれにも、実行される XSS や DOM 注入は見つからなかった。** 減算ゼロと /calc は 167通り、/kotomark と /pitch は約30通りの入力を試し、`window.__xss` が立ったものは0件、ダイアログは0件、外部への通信も0件だった。
- 利用者の値の描画は、どの製品も安全だった：/calc と Kotomark のデモは innerHTML の前にすべて `esc()` を通す。減算ゼロは React のテキストで描画し、JSON-LD は `<` を置き換えている（公開物の44個すべてを確認）。Pitch は textContent と createElement で描画する。
- **critical と high は0件。** 指摘は medium 1、low 4、info 数件。いちばん大きいのは **同じオリジンを共有する構造そのもの**で、どこか1か所に将来 XSS が入れば、/pitch の録音（IndexedDB）とサポーターキー（localStorage）、/kotomark の値を読み出せる。今は入口が無いので実害は無いが、防ぐ層が薄い。
- **公開物はソースの最新のビルドと一致していた。** /kotomark は c461679、/pitch は da4257c の `pitch/site/` とバイト単位で一致。減算ゼロは 424e16d の書き出し。

## 2. 指摘
| ID | 重大度 | 製品 | 内容 | 修正 |
|---|---|---|---|---|
| X-1 | **medium** | 減算ゼロ（オリジンの大部分） | CSP もセキュリティヘッダーも無い。`_headers` は GitHub Pages では効かない（中身も Cache-Control だけ）。将来1か所でも XSS が入れば、送信先の制限（connect-src）も無いので、同じオリジンの /pitch・/kotomark のデータを読んで外へ送れる | 静的書き出しのときだけ `app/layout.tsx` で meta CSP を出す（例：`default-src 'self'; script-src 'self' 'unsafe-inline' https://gc.zgo.at; connect-src 'self' https://*.goatcounter.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'`。Next のインラインのスクリプトのため `'unsafe-inline'` が要る）。ビルドでの確認が要るのでパッチは作っていない |
| X-2 | low | Pitch | **ほかのパスから、Pitch の Service Worker のキャッシュを汚染できる。** SW は index.html を SHA-256 で確かめるが、manifest とアイコンは確かめずに返す。CacheStorage はオリジン全体で共有されるので、/kotomark のページから Pitch のキャッシュに偽の manifest（`start_url` を別のパスに向けたもの）を書き込むと、Pitch のページの manifest が差し替わった（再現。index.html の差し替えはハッシュの照合で拒まれた） | `patches/p3-0001-sw-verify-all-precache.patch`：キャッシュにある項目すべてをハッシュで確かめ、一致しなければネットワークから取る。da4257c と今の先頭（c9e4bbd）の両方に当たる。反映には build-pwa の実行が要る |
| X-3 | low | 減算ゼロ | 決済の戻り先 URL を検証せずに開いている（`GenerateClient.tsx:185-188` で `/` で始まらない URL を `window.location.href` に入れる。`//evil.example` は `/` で始まるので `router.push` で外部へ移動する。`DemoCheckoutClient.tsx:46` も同じ）。公開版は AI がオフなので届かないが、有料モードで API の応答が `{"url":"javascript:…"}` や `{"url":"//evil"}` になると、XSS か外部への転送になる | `patches/p0-0001-checkout-return-url.patch`：アプリ内のパス（`//` と `/\` で始まるものを除く）と `https://checkout.stripe.com/` だけを許す。eceabab、公開版の元の 424e16d、今の先頭（ead3105）のどれにも当たる |
| X-4 | low | Kotomark | 信頼できないファイルを読み込んで innerHTML で描画するデモページに、CSP が無い（今の escape は漏れなく効いているが、ほかに防ぐ層が無い） | Pitch と同じく、ビルド時に inline script の sha256 を計算して meta CSP を入れる（`default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`） |
| X-5 | low〜info | Kotomark | 「Markdown をコピー」の出力に、ファイル名、グループ名、メッセージ（台本の文）がエスケープされずに入る。HTML をそのまま描画する Markdown ビューアに貼ると注入できる（GitHub は無害化する） | `src/core/report.ts` の renderMarkdown で、インラインの値の `<>[]|` と `` ` `` をエスケープする |
| X-6 | info | 全体 | 同じオリジンを共有する影響（下の §3） | オリジンを分ける（d32 の見直し） |
| X-7 | info | 全体 | frame-ancestors を指定できず、どの製品も他のサイトに iframe で埋め込める（クリックジャッキング）。meta CSP では効かず、GitHub Pages はヘッダーを付けられない | ヘッダーを付けられる配信（Cloudflare Pages など）に移す |
| X-8 | info | /kotomark・/pitch | 存在しないパスで減算ゼロの 404 が出る（パスは表示しないので注入は無い） | 製品ごとの 404 を置く |
| X-9 | info | 減算ゼロ | GoatCounter と Turnstile のスクリプトはチャンクに入っているが、今は描画されていない（設定が無い、AI がオフ）。有効にするときは SRI を付けられないので、CSP で取得先を限る | X-1 の CSP に含める |

## 3. 同じオリジンを共有することの影響（X-6）
`/new-project/` の下のどこか1か所で XSS が起きれば、次のことができる（/kotomark のページから実際に読み出せることを確かめた）。
- /pitch の localStorage（`pitch:supporter:v1` のサポーターキー、リスト、履歴）を読む。
- IndexedDB `p3pitch-eval`（評価協力の録音）を読む。
- Pitch の CacheStorage を読み書きする（X-2）、SW の登録を解除する。
- /pitch/app/ を iframe で開き、DOM を操作する。
- Kotomark の `kotomark.demo.*`（試用モードの判定、コメント、既知の指摘のメモ）を読む。

Pitch の meta CSP は自分のページの中の注入しか防がない。GitHub Pages は Service-Worker-Allowed を付けられないので、外部の攻撃者がオリジン全体を覆う SW を登録することはできない。ただし、gh-pages にプッシュできる人が `/new-project/sw.js` を置けば、すべての製品の通信を横取りできる。

**勧め：** P3 の録音の収集とサポーターキーの販売を始める前に、製品ごとにオリジンを分ける（P3 のレビューの B-01 と同じ）。それまでは、X-1（減算ゼロの CSP）を入れて、オリジンの大部分に防ぐ層を足す。

## 4. 入口ごとの試験の結果
| 製品 | 入口 | 結果 |
|---|---|---|
| /calc | 共有リンク `#s=`（値をそのまま／正しい base64url の JSON に値を入れる）、hashchange、CSV・JSON の貼り付け、`?q=` | 実行されない。model id は許可リストと照合、数値は上限で切る、長さ8000文字・件数200まで。表示は `esc()` か textContent |
| 減算ゼロ | check/ の `#r=` と途中保存（localStorage）、templates/ の `#s=&p=` と localStorage、generate/ の `?session_id=`、checkout/demo/ の `?token=`、404 のパス、トップ・guide・samples・privacy のクエリとハッシュ | 実行されない。正規表現・型の検査・許可リストで除かれるか、React のテキストとして出るか、使われない |
| Kotomark | CSV のセル、ファイル名、xlsx のシート名・共有文字列・OOXML エスケープ・zip の中のパス・不正なコードポイント、用語集の JSON と TBX（内部エンティティ、外部エンティティ）、エラー表示、貼り付け欄、試用モード、英語の画面 | 実行されない。文字として表示。zip の中のパスは読まれず、外部エンティティは解決されない |
| Pitch | `?word=`、`#key=`、`#w=`、localStorage の悪意のある値、語彙の検索、リスト名、録音ファイルの名前、Anki の書き出し | 実行されない。`#key=` は URL から消える。meta CSP は効いていて、読み込み時の違反は0件、注入した inline script とイベントハンドラは CSP が止めた |

## 5. 危険なシンクと外部資源
- **innerHTML：** /calc（約25か所）と Kotomark のデモ（約12か所）は、利用者の値をすべて `esc()`（`& < > " '` を置換）に通している。`esc()` を通らないのは数値と内部の辞書の文字列だけ。Pitch の innerHTML は固定の文字列か、esc を通したラベルだけ。
- **dangerouslySetInnerHTML（減算ゼロ5か所）：** すべて JSON-LD で、`</script>` で脱出できない。中身はビルド時に決まる値だけ。
- **location・href・src への代入：** 減算ゼロの決済の戻り先（X-3）以外は、固定の値、blob の URL、canvas の dataURL だけ。
- **eval、new Function、document.write、message の受け手：** 入口から届く場所には無い（docx 関連の互換コードに `Function(""+t)` があるが、外から届く経路は無い）。
- **Markdown：** 減算ゼロの変換は HTML を生成しない（見出し、段落、表、引用、リスト、太字だけを React の要素として描画）。
- **外部資源：** 配信されている HTML の `<script>` と `<link>` は、すべて同じオリジンのもの。外部の CDN、iframe、ONNX や WASM の外部取得は無い。外部へのリンク（出典、GitHub、ライセンス、Ko-fi）は https で、`target=_blank` には noopener が付いている。

## 6. パッチ
| ファイル | 対象 | 確認 |
|---|---|---|
| `patches/p0-0001-checkout-return-url.patch` | P0：`app/generate/GenerateClient.tsx`、`app/checkout/demo/DemoCheckoutClient.tsx` | eceabab、424e16d、ead3105（今の先頭）のどれにも `git apply --check` が通る |
| `patches/p3-0001-sw-verify-all-precache.patch` | P3：`pitch/scripts/build-pwa.mjs` | da4257c と c9e4bbd（今の先頭）に当たる。生成した sw.js に同じ変更を入れて、汚染が防がれることを確かめた。反映には build-pwa の実行が要る |

## 7. 確認できなかった点
- 実際の github.io と CDN での挙動（ローカルの配信で代用した）。
- 減算ゼロの CSP（X-1）を入れたときに、Next の実行時が壊れないか（ビルドでの確認が要る）。

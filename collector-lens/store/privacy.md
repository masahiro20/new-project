<!-- Chrome Web Store "Privacy practices" tab draft + privacy policy text. NOT submitted. -->
# Privacy practices — Tanuki Scout (provisional)

> **オーナー向けの説明（日本語）：** Chrome Web Store の「プライバシーへの取り組み」欄への回答案と、プライバシーポリシーの本文案です（未提出）。ストアの入力欄とポリシーは英語で出すため、本文は英語のままです。
> - **単一目的：** 開いている出品ページの日本語の状態・ランク・返品の表記を英語で解説し、危険な表記に印を付けること。
> - **権限：** Chrome API の権限は `storage` の1つだけ（2026-10-09 本部承認）。用途は「Estimated total（総額の目安）」欄の設定（宛先国・配送方法・代行業者・国内送料の帯・為替レート）を、利用者の端末内（`chrome.storage.local`）に保存することだけ。出品の文字・価格・入札額・重量・ページの URL・閲覧履歴は保存しない。同期（`storage.sync`）も使わない。`storage` はインストール時の警告文に出ない権限。読み取るのは対応する4サイトだけ（理由を表に記載）。外部のコードは読み込まない。
> - **データ：** 個人情報・閲覧履歴などは一切集めない。出品の文字は画面上で読むだけで、外部に送らず保存もしない。端末内に残るのは上の設定だけで、外部には送らない（CWS の定義では「収集」に当たらない）。
> - **プライバシーポリシー：** 何も収集・送信しないこと、端末内に保存するのは総額欄の設定だけであることを明記した本文。公開 URL に置く必要がある（オーナー作業）。
> - **提出前にオーナーがすること：** 名前の最終決定と商標確認、開発者アカウント（$5）と連絡先メール、ポリシーの公開、ヤフオク規約8.3の弁護士確認。

## Single purpose
Explain the Japanese condition, grade and return wording on the marketplace listing the user is viewing, in English, and flag risky terms.

## Permission justifications
| Permission | Justification |
|---|---|
| `storage` | Saves the user's own choices for the optional "Estimated total" section of the panel (destination country, shipping method, proxy service, domestic-shipping band and exchange rate) on the device with `chrome.storage.local`, so they do not have to be re-entered on every listing. Nothing from the listing is stored: no listing text, prices, bids, weights, page URLs or browsing history. Nothing is synced or sent anywhere. |
| Host permission `https://page.auctions.yahoo.co.jp/*` | Read the open Yahoo! Auctions Japan item page to explain its condition and return terms. |
| Host permission `https://jp.mercari.com/*` | Read the open Mercari item page. Mercari is a single-page app, so the script matches the whole site and only runs on `/item/` and `/shops/product/` pages. |
| Host permission `https://item.fril.jp/*` | Read the open Rakuma item page. |
| Host permission `https://order.mandarake.co.jp/*` | Read the open Mandarake item page. |
| Remote code | No. All code, the glossary and the rate tables ship inside the package. No `eval`, no remote scripts. |

## Data usage (answers for the form)
- Collects none of: personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content.
  - Note: the extension *reads* the listing text on screen to explain it, but this text never leaves the browser and is not stored. Under the CWS definitions this is not collection.
  - Note: the user's own "Estimated total" settings (destination, shipping method, proxy, domestic-shipping band, exchange rate) are saved with `chrome.storage.local` on the device only. They are never transmitted, so this is not collection either.
- Certifications (all true):
  - I do not sell or transfer user data to third parties, outside of the approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy (text to host at the privacy policy URL)

**Tanuki Scout privacy policy** — effective on first publication.

Tanuki Scout does not collect, sell or share any personal data.

- The extension runs only on item pages of Yahoo! Auctions Japan, Mercari, Rakuma and Mandarake.
- On those pages it reads the listing text shown in your current tab and analyzes it inside your browser using a glossary that ships with the extension.
- It makes no network requests. It has no server, no analytics, no account and no cookies.
- The only thing it stores is your settings for the "Estimated total" section (destination country, shipping method, proxy service, domestic-shipping band and exchange rate). They are kept in your browser's extension storage on this device, are never sent anywhere, and are removed when you uninstall the extension. It never stores listing text, prices, page addresses or your browsing history.
- It does not access other tabs, your history or any other site.
- It adds its own panel to the page and does not change the listing.

If this policy changes, the new version will be published at this address before the change takes effect. Contact: *owner to provide*.

## Before submission (owner)
- Final name and trademark search (see `docs/naming.md`).
- Developer account ($5 one-time) and a contact email.
- Host this privacy policy at a public URL and add a homepage / support URL.
- Lawyer check on Yahoo! Auctions terms 8.3 ("alteration") and the panel overlay, as already requested.

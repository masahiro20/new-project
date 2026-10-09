<!-- Chrome Web Store listing draft. NOT submitted. Provisional name — see docs/naming.md. -->
# Store listing draft — Tanuki Scout (provisional)

> **オーナー向けの説明（日本語）：** Chrome Web Store の掲載情報の下書きです（未提出）。ストアの本文はお客様向けなので英語のままです。
> - 貼り付け用の本文は `store/description-en.txt`。下の「Detailed description」は以前の下書きで、レビュー用に残しています。
> - 表の内容：拡張の名前、短い説明（132文字以内）、カテゴリ（ツール）、言語（英語）、提出用 zip、アイコン、スクリーンショット、小プロモタイル。ホームページ・サポートの URL はオーナーが用意する必要があります。
> - 名前は仮（Tanuki Scout）。商標の確認状況は `docs/naming.md`。

| Field | Value |
|---|---|
| Name (manifest) | Tanuki Scout — Japan Listing Decoder |
| Short name | Tanuki Scout |
| Summary (≤132 chars, from manifest) | Explains Japanese condition notes, shop grades and return terms on camera and watch listings in English, and flags risky wording. |
| Category | Tools |
| Language | English |
| Version | 0.1.0 |
| Package | `store/tanuki-scout-0.1.0.zip` (build: `npm run package:store`) |
| Icon | `icons/icon128.png` (128×128, placeholder artwork) |
| Screenshots | `store/screenshots/*.png` (1280×800, mock listing pages) |
| Small promo tile | `store/promo-small-440x280.png` |
| Homepage / support URL | *Owner to provide (no site yet)* |

## Detailed description

Paste-ready plain text for the store form: `store/description-en.txt` (the canonical version; the text below is an earlier draft kept for review).

Read the Japanese fine print before you bid.

Tanuki Scout is for overseas collectors of vintage cameras, lenses, film cameras and watches who buy from Japanese marketplaces. Open a listing and a small panel appears in the corner. It explains the seller's condition notes, shop grades and return terms in plain English, and flags wording that usually means trouble.

What it explains
• Condition: platform grades such as 目立った傷や汚れなし ("no noticeable marks") and what they leave out.
• Grade: shop ranks (S / A / AB / B …) and exporter grades (Mint, Exc+++).
• Returns: 返品不可, ノークレームノーリターン (no claims, no returns) and similar terms.
• Lenses and film cameras: cleaning marks, coating wear, aperture and focus problems, light leaks, light seals, meter and rangefinder faults, and service notes such as "haze cleaned" or "seals replaced".
• Warnings: junk, untested, authenticity unknown, redial, parts watch, fungus, haze, balsam separation, shutter-curtain holes and more, plus risky combinations such as "untested + no returns".
• Seller states: reassurances such as "no fungus or haze" are listed separately and never raised as warnings.

Works on
Yahoo! Auctions Japan, Mercari, Rakuma and Mandarake item pages. Use it alongside your usual proxy service.

Privacy
• Reads only the listing in the tab you have open.
• Everything runs in your browser. No server, no network requests, no account, no tracking.
• Stores only your estimate settings on your device (destination, shipping method and exchange rate). It never stores the listing, the page address or your browsing.
• Requests one Chrome API permission, "storage", for those settings. Otherwise it only asks to read the four supported marketplace sites.
• Adds its own panel and leaves the listing unchanged.

Limitations
• It is not an appraisal or an authenticity check. It explains what the seller wrote.
• It is rule-based. Wording it does not know will not be flagged, so a clean panel does not mean the item is safe.
• Cameras, lenses, film cameras and watches come first; other categories are thinner.

Tanuki Scout is independent and is not affiliated with or endorsed by any marketplace or proxy service. Marketplace names are trademarks of their owners and are used only to describe compatibility.

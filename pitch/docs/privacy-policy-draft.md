# Privacy policy（草案）— P3 Pitch

> **草案です。専門家（法務）の確認の前で、まだ公開しません。** LP（`site/index.html`）からリンクする想定の、お客様向けの本文（英語）と、
> 社内向けの日本語の要約です。`TODO` はオーナーの判断・記入が必要な箇所です。本文の各文は、2026-10-09 時点の実装
> （`demo/`、`scripts/build-pwa.mjs`）と運用の手順（`docs/eval-data-policy.md`、`docs/supporter-ops.md`）に合わせてあります。
> 実装や運用を変えたら、この本文も同じ変更で直します。

---

## English (customer-facing)

**Pitch — Privacy Policy (DRAFT, not yet reviewed by a legal professional)**
Last updated: TODO (date of publication)

Pitch is a free web app that checks your Japanese pitch accent. It runs in your browser. This policy explains what
happens to your data. In short: **your voice is analysed on your device, and the app does not send your recordings,
your practice data or your supporter key anywhere.**

### 1. Your recordings

- When you check a word, the audio is analysed inside your browser on your device. In normal use the app does
  **not save** the audio and does **not send** it to us or to anyone else.
- The only exception is the optional **evaluation mode** (section 2), which is off by default and which you switch on yourself.

### 2. Evaluation mode (optional, off by default)

Evaluation mode helps us measure how accurate Pitch is. It only starts after you read an explanation and tick a consent box,
and it stays on only while the page is open.

- **What is saved, and where:** for each recording you check while it is on, the part of the audio that was analysed
  (a 16 kHz mono WAV, about 4 seconds at most), the word, the result, the optional answers you choose (speaker group,
  region, which accent you meant to say), the app build number and the date and time. It is saved **only in your browser
  on your device** (IndexedDB). Your original file, its file name, your name and your email address are not saved.
- **How long it stays on your device:** there is **no automatic expiry**. The clips stay until you delete them, even if you
  switch the mode off or stop using the app. You can delete them one by one or all at once in the app, or by clearing
  this site's data in your browser. We cannot delete them for you.
- **Nothing is sent automatically.** You can export your clips as a zip file. Whether you give that file to us, and how,
  is your choice.
- **If you send us your export:** we use it only to test and improve Pitch's accuracy. We do not publish it or give it to
  anyone else. We delete it, including any working copies and backups, **90 days after we receive it**. If you ask us to
  delete it sooner, we delete it **within 7 days of your request**. Please quote the export ID (`exportId`) shown in the
  zip's `README.txt` / `manifest.json` so we can find it.
- Your voice can identify you. Please choose carefully whom you share your export with.

### 3. Founding Supporter purchases (Ko-fi)

The Founding Supporter plan is a one-time purchase made on **Ko-fi** (ko-fi.com), not in the app.
*(Sales have not started yet. This section applies once they do.)*

- **Ko-fi** handles the order and payment (through its payment providers). Ko-fi's own privacy policy applies to the
  information you give Ko-fi. We do not receive your card or bank details.
- **What we receive from Ko-fi:** your email address and the order details Ko-fi shows us (such as the name you entered,
  order number, amount and date). We use them only to send you your supporter key, to handle refunds (30 days) and to
  answer your questions. We do not use them for marketing and do not share them. TODO (owner): how long order emails are kept on our side.
- **Your supporter key contains no personal information.** It holds a random ID, the plan and the issue date, signed by us.
  It does not contain your name, your email address or your Ko-fi order number.
- **Linking the key to your order:** we keep a private record that links the key's random ID to your Ko-fi order, so we can
  handle refunds and keys that have been shared publicly. We delete this link 60 days after purchase (30-day refund window plus 30 days).
  the 30-day refund period plus 30 days). Ko-fi keeps its own order records under its own policy.
- **Checking the key:** the app checks your key on your device, offline. The key is never sent to us or anyone else.
  If a key is refunded or shared widely, it is listed in a later version of the app and stops working there.

### 4. Data stored on your device

The app stores the following **in your browser on your device only**. None of it is sent to us. You can remove all of it
by clearing this site's data in your browser settings.

| What | Where | Why |
|---|---|---|
| Your supporter key (if you enter one) | localStorage | To keep supporter features unlocked. It is re-checked every time the app opens |
| Today's count of checked words (word IDs, reset each day) | localStorage | Daily free limit (applies only once supporter sales start) |
| Your word lists | localStorage | Your saved lists |
| Practice history (per day and per accent type: number of checks and passes; no audio, no word names) | localStorage | Your progress view |
| "Don't show the install hint again" | localStorage | Remembers that you closed the hint |
| Evaluation-mode clips (only if you switch it on) | IndexedDB | See section 2 |
| The app's own files (page, icons, manifest) | Service Worker cache | So the app works offline. Contains no personal data |

When you save a key, the app asks your browser to keep this data (`navigator.storage.persist()`). Some browsers may still
clear it (for example Safari after a period of not using the site). If your key disappears, enter it again from your purchase email.

### 5. No analytics, no cookies, no tracking

- The app and this website use **no analytics, no advertising, no tracking pixels and no cookies**.
- The pages load nothing from other websites (no external fonts, scripts or CDNs).
- Like any website, the hosting service that delivers the pages (currently GitHub Pages; planned: Cloudflare Pages)
  receives standard technical information such as your IP address and browser type in order to deliver them.
  We do not use it to track you. TODO (owner): confirm the hosting provider and that no analytics are enabled in its settings.

### 6. Your choices and rights

- You can use Pitch without giving us any personal information.
- You can delete everything stored on your device at any time (section 4).
- You can ask us to delete an evaluation export you sent us (section 2), or ask what we hold about your Ko-fi order
  and ask us to delete it (we may need to keep some order records where the law requires).
- TODO (legal): rights under applicable law (e.g. GDPR / UK GDPR, Japan's APPI), legal basis, international transfers,
  minimum age.

### 7. Contact

TODO (owner): contact address for privacy questions, evaluation-export deletion requests and supporter support.

### 8. Changes to this policy

If we change this policy, we will update the date above and describe the change on this page. TODO (owner): whether
supporters are also told by email.

---

## 日本語の要約（社内向け）

- **通常の利用：** 音声は端末のブラウザ内で解析し、保存も送信もしない。
- **評価協力モード（任意・既定はオフ）：** 同意したあと、判定に使った部分の音声（16 kHz の wav・最長約4秒）・単語・結果・任意の回答・
  ビルド番号・日時を **端末内（IndexedDB）だけ** に保存。端末内には **期限がなく自動では消えない**（本人が消す）。送信はしない。
  本人が zip に書き出し、提出するかどうかを決める。**提出分は受領から90日で削除、依頼があれば7日以内に削除**（作業用の
  コピー・派生データ・バックアップを含む）。依頼には exportId を使う。手順は `docs/eval-data-policy.md`。
- **創設サポーター（Ko-fi）：** 支払いは Ko-fi（と決済会社）が扱い、カード情報は受け取らない。私たちが受け取るのは
  **メールアドレスと注文の情報**（入力された名前・注文番号・金額・日時）で、キーの送付・返金（30日）・問い合わせにだけ使う。
  **キーに個人情報は入らない**（乱数の lid・plan・発行日だけ）。**lid と注文の対応表**は非公開の台帳に置き、
  **保管期限は購入から60日（30日の返金期間＋30日）。本部決定**。キーは端末内でオフラインで確かめ、送信しない。
  販売はまだ始まっていない（専用のオリジンに移ってから。d32）。
- **端末に保存するもの：** localStorage（サポーターキー、今日判定した語の ID、単語リスト、練習の記録の集計、インストールの案内を閉じた印）、
  IndexedDB（評価協力モードの録音だけ）、Service Worker のキャッシュ（アプリのファイルだけ。個人情報なし）。
  キーの保存時に `persist()` を要求する。
- **アクセス解析なし・Cookie なし・外部の読み込みなし。** 配信元（いまは GitHub Pages、予定は Cloudflare Pages）は、
  ページを届けるために IP アドレスなどの通常の技術情報を受け取る（TODO：配信元の設定で解析が無効であることを確認）。
- **連絡先：未定（収集開始時に決定）。** 法令上の権利・法的根拠・国外移転・年齢は TODO（法務）。
- 公開の前に：専門家の確認、TODO の記入、LP からのリンク、同意欄・README.txt の連絡先と同じ値にそろえること。

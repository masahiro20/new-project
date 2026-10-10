# itch.io アップロード手順（オーナー向け）

鋼脚戦機 GRANDSTRIDE を itch.io に出すための手順です。所要時間は約30分です。アカウントの作成、税と受け取りの設定、アップロード、公開の操作は、オーナーが行ってください（本部の判断 d31）。

## 0. 事前に必要なもの

- itch.io のアカウント（開発者として登録）
- 受け取りの設定: 「Payouts（itch がまとめて受け取る）」を推奨します。海外の付加価値税（VAT）を自分で処理しなくて済みます（Midas の公開計画）。
- 税の質問票（tax interview）。**納税者番号を入れないと、30% が源泉徴収されます。** マイナンバーを使うかどうかなど、日本の番号の書き方は本部と一緒に確認してから入力してください。
- このフォルダ（`mech-game/release/itch/`）のファイル一式

## 1. 新しいプロジェクトを作る（Dashboard → Create new project）

| 欄 | 入れる値 |
|---|---|
| Title | `GRANDSTRIDE 鋼脚戦機` |
| Project URL | `grandstride`（使われていたら `grandstride-mech` など） |
| Short description or tagline | `Pilot a 28m four-legged war machine. 3 missions, 3 bosses, upgrades. Free.` |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Prototype |
| Pricing | **$0 or donate**（無料＋投げ銭）。Suggested donation: **$3.00** |
| Uploads | `grandstride-itch.zip` をアップロードし、「**This file will be played in the browser**」にチェック |
| Embed options → Viewport dimensions | **1280 × 720** |
| Embed options → Fullscreen button | 有効 |
| Embed options → Mobile friendly | 有効。Orientation は **Landscape** |
| Embed options → Automatically start on page load | 無効（音とマウスの固定はクリックで始まるため） |
| Embed options → Enable scrollbars | 無効 |
| Embed options → SharedArrayBuffer support | 無効 |
| Description | `page-en.md` の本文を貼る（英語が主。日本語を併記する場合は `page-ja.md` を下に続ける） |
| Genre | Action |
| Tags（10個まで） | `mechs` `robots` `first-person` `3d` `singleplayer` `sci-fi` `shooter` `boss-battle` `arcade` `upgrades`（入力時に候補に出ないものは、`atmospheric` `fps` `post-apocalyptic` と差し替える） |
| AI generation disclosure | **使用している（Yes）** を選び、**Code・Text・Graphics** にチェック。説明欄に `ai-disclosure-en.txt` の内容を貼る（本部の方針は「控えめより正確に」） |
| Cover image | `cover-630x500.png` |
| Screenshots | `screenshots/` の 01〜09（番号順） |
| Banner（Edit theme から） | `banner-960x300.png`（任意） |
| Languages | English, Japanese |
| Inputs | Keyboard, Mouse, Touchscreen |
| Average session | A few minutes |
| Community | Comments を有効 |
| Visibility | まず **Draft** で保存する |

## 2. 公開前の確認（Draft の状態で）

ページを開き、次の環境で「出撃 → MISSION 01 クリア（または敗北）→ リザルト」まで遊んでください。

- [ ] PC の Chrome（または Edge）
- [ ] PC の Safari（Mac がある場合）
- [ ] スマホ（横向き、全画面ボタン）
- [ ] 音が鳴る（最初のクリック・タップの後）
- [ ] マウスで視点が動く（ゲーム画面を1回クリック、`Esc` で解除）
- [ ] 重い場合は、タイトルの画質を「低」にすると改善する

おかしな点があれば、内容と端末・ブラウザ名を本部に知らせてください。P8 が直して zip を作り直します。

## 3. 公開

- 公開日の案: **10/13（火）19:00 JST**（Midas の公開計画）
- Visibility を **Public** に切り替える

## 4. 公開後に本部へ知らせること

- 公開したページの URL
- 確認で気づいたこと

X での告知文の案は `mech-game/store/store-page.md` の §6 にあります（投稿はオーナーの承認後）。

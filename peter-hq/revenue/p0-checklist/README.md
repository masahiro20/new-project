# 無料配布資料「運営指導の前に見直す書類チェックリスト（放課後等デイサービス・児童発達支援版）」

作成：Midas（2026-10-09）　発行名義：減算ゼロ運営事務局

## ファイル
| ファイル | 内容 |
|---|---|
| `unei-shidou-checklist-jidou.pdf` | 配布用の PDF（A4・3ページ）。最後のページに、無料診断の QR コードと URL がある |
| `unei-shidou-checklist-jidou.docx` | 事業所が書き換えて使える Word 版（PDF と同じ内容） |
| `checklist.json` | **元データ**。文言を直すときはここだけを編集する |
| `build.py` | `checklist.json` から `checklist.html` と `.docx` を作る（python-docx、reportlab を使用） |
| `render-pdf.cjs` | `checklist.html` を Playwright の Chromium で A4 の PDF にする |
| `checklist.html` | 中間生成物（PDF の元） |

作り直す手順：`python3 build.py && node render-pdf.cjs`
- 日本語フォントは IPA P ゴシック。なければ Hiragino・游ゴシック・メイリオの順に使う。
- QR コードは reportlab で URL から作った。読み取りの実機確認はまだなので、掲載前にスマホで1回読む。

## サイトの /samples に載せる手順（Mina 向け）
1. `unei-shidou-checklist-jidou.pdf` と `.docx` を、`peter/p0-genzan-zero` の `public/downloads/` にコピーする。
   - 公開後の URL は `/new-project/downloads/unei-shidou-checklist-jidou.pdf`。
2. `app/samples/page.tsx` に「運営指導の前に見直す書類チェックリスト（PDF・Word）」の項目を追加する。
   - リンクは basePath 付きの通常の `<a>` にする。Ren の QA で、llms.txt を next/link で開くと404になった件と同じ扱い。
3. ダウンロードの回数を数える仕組みがあれば、ボタンに付ける（`p0-first10.md` §2）。
4. 解説 `unei-shidou-junbi` と `unei-shidou-shiteki-jidou` の末尾から、このページへリンクする。

## 制度の記述と QA の対応
Ren の QA（`peter/p4-collector-lens` の `peter-hq/qa/p0-genzan-zero/qa-report.md`）で「中」とされた誤りを、このチェックリストに入れていないことを確認した。

| QA の指摘 | このチェックリストでの書き方 |
|---|---|
| 虐待防止・身体拘束の減算を「事実が生じた月の翌月から」とし、さかのぼるように読める | 「基準を満たしていない状況が**確認された月の翌月から**、改善が認められた月まで。さかのぼっては適用されない」と書いた。BCP と情報公表は「さかのぼって適用される」と書き分けた |
| 身体拘束の減算を全サービスに当てはめている（相談支援などは対象外） | 対象を「放課後等デイサービス・児童発達支援は1%」と明記した。対象外のサービスは扱わない |
| 委員会・研修を「今年度」で数えている | 「1年に1回以上」とし、「直近1年以内」で数える自治体があるので指定権者に確認するよう注記した |
| 減算に直結する体制から、情報公表未報告減算が抜けている | 「4. 公表と報告」に、情報公表（5%）と支援プログラム未公表（85%で算定）を入れた |
| 新規採用時の研修を「望ましい」としている | 解釈通知に合わせて「新規採用時には必ず研修を行うことが重要」とした |
| 出典に検討日程の資料（令和9年度改定の報告）を使っている | 使っていない。主な根拠は、改定の概要、留意事項通知・解釈通知、Q&A、運営指導マニュアル |
| BCP 減算の「その日が月の初日なら当月」の但し書き（障害児の通知にはない） | 書いていない |
| （低）減算の事由に「結果の周知」を入れている | 減算の事由は3つ（委員会・研修・担当者）と書き、周知は運営基準上の義務として分けた |

**サイト本文との差**
- 2026-10-09 時点の `peter/p0-genzan-zero`（`89cebf9`）では、上の QA 指摘の多くが未修正（例：`houkago-day.ts` の「新規採用時にも実施することが望ましい」）。
- このチェックリストは **QA に合わせた正しい書き方**を優先した。サイト本文を QA どおりに直せば、両者は一致する。

## 同時に直したもの（Midas の下書き）
同じ誤りが、Midas の下書きにもあったので直した。
- `peter-hq/x-drafts/p0-genzan-zero-ja.md` と `p0-schedule.csv`
  - 6日目（10/15）：減算の期間
  - 8日目（10/17）：新規採用時の研修
- `peter-hq/revenue/p0-first10.md`：note 記事1の同じ2か所

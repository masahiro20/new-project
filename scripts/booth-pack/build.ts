// 「減算ゼロ 虐待防止・身体拘束適正化 書類パック」（BOOTH 用）を作る。AI・Stripe は使わない。
// 公開済みの無料テンプレート（lib/templates）と同じ文章を、全サービス種別ぶん、
// ①記入例つき PDF（記入例＋記入用の白紙様式）②記入用 Word ③運営指導チェックリスト（本編＋追加編）④使い方1枚 にまとめ、zip にする。
//
// 使い方：
//   npx esbuild scripts/booth-pack/build.ts --bundle --platform=node --format=esm --outfile=.booth/build.mjs --log-level=warning
//   PLAYWRIGHT_MODULE=<playwright の index.mjs> OUT_DIR=<出力先> node .booth/build.mjs
// PDF は Chromium（Playwright）で作る。日本語フォントは IPAGothic など、システムのものを使う。

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Packer } from "docx";
import { SERVICE_TYPES } from "../../lib/form";
import { buildDocx } from "../../lib/docx-export";
import { inlineRuns, parseBlocks } from "../../lib/markdown";
import { buildTemplate, templateContext, templateParts } from "../../lib/templates";
import type { ServiceType } from "../../lib/templates";
import { exampleFacilityName, exampleInputs, makeExample } from "./example";

const OUT = path.resolve(process.env.OUT_DIR ?? ".booth/out");
const PACK = "減算ゼロ書類パック";
const ZIP_NAME = "減算ゼロ_書類パック_2026年10月版.zip";
const typeDir = (t: string) => t.replace(/[（）]/g, "");
const PACK_DIR = path.join(OUT, PACK);
const SITE = "https://masahiro20.github.io/new-project";
const EDITION = "2026年10月版";
const SELLER = "ヒルフェクリエイト";
const COPYRIGHT = `© 2026 ${SELLER}`;
const PACK_TITLE = "減算ゼロ 虐待防止・身体拘束適正化 書類パック";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (t: string) =>
  inlineRuns(t)
    .map((r) => (r.bold ? `<strong>${esc(r.text)}</strong>` : esc(r.text)))
    .join("")
    .replace(/\n/g, "<br>");

const CSS = `
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "IPAexGothic", "IPAGothic", "IPA Pゴシック", sans-serif; font-size: 10pt; line-height: 1.65; color: #1c2b2b; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 8px; padding: 4px 0 4px 10px; border-left: 6px solid #1d6f5f; break-after: avoid; }
h2 { font-size: 12.5pt; margin: 18px 0 6px; padding-bottom: 2px; border-bottom: 1.5px solid #b9d6cf; break-after: avoid; }
h3 { font-size: 11pt; margin: 12px 0 4px; break-after: avoid; }
p { margin: 6px 0; }
ul, ol { margin: 6px 0; padding-left: 22px; }
li { margin: 2px 0; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #9db3ae; padding: 4px 6px; vertical-align: top; }
th { background: #e8f1ef; text-align: left; }
blockquote { margin: 8px 0; padding: 6px 10px; background: #f4f7f6; border-left: 4px solid #8fb5ab; font-size: 9pt; }
.tag { display: inline-block; font-size: 8.5pt; padding: 1px 8px; border: 1px solid #1d6f5f; color: #1d6f5f; border-radius: 10px; margin-bottom: 4px; }
.pb { break-after: page; }
.doc { break-before: page; }
.doc:first-child { break-before: auto; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 19pt; border-left-width: 10px; }
.cover .sub { font-size: 13pt; margin: 6px 0 20px 16px; }
.cover table { font-size: 10pt; }
.small { font-size: 8.5pt; color: #4b5d5a; }
.chk th:nth-child(1), .chk td:nth-child(1) { width: 9mm; text-align: center; }
.chk th:nth-child(3), .chk td:nth-child(3) { width: 24mm; }
.compact { font-size: 8.6pt; line-height: 1.5; }
.compact h1 { font-size: 14pt; }
.compact h2 { font-size: 10.5pt; margin: 9px 0 3px; }
.compact table { font-size: 8pt; margin: 4px 0; }
.compact th, .compact td { padding: 2px 5px; }
.compact p, .compact li { margin: 2px 0; }
`;

function blocksToHtml(md: string, tag?: string): string {
  const parts: string[] = [];
  for (const b of parseBlocks(md)) {
    switch (b.type) {
      case "heading":
        if (b.level === 1) parts.push(`<div class="doc">${tag ? `<span class="tag">${esc(tag)}</span>` : ""}<h1>${inline(b.text)}</h1></div>`);
        else parts.push(`<h${b.level}>${inline(b.text)}</h${b.level}>`);
        break;
      case "paragraph":
        parts.push(`<p>${inline(b.text)}</p>`);
        break;
      case "list":
        parts.push(`<${b.ordered ? "ol" : "ul"}>${b.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${b.ordered ? "ol" : "ul"}>`);
        break;
      case "table": {
        const [head, ...rows] = b.rows;
        const chk = head[0] === "確認" && head.includes("保管場所");
        parts.push(
          `<table${chk ? ' class="chk"' : ""}><thead><tr>${head.map((c) => `<th${c.length <= 4 ? ' style="white-space:nowrap"' : ""}>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
        );
        break;
      }
      case "quote":
        parts.push(`<blockquote>${inline(b.text)}</blockquote>`);
        break;
      case "rule":
        break; // 書類の区切り。次の # 見出しで改ページする
    }
  }
  return parts.join("\n");
}

function htmlPage(title: string, body: string, compact = false): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body${compact ? ' class="compact"' : ""}>${body}</body></html>`;
}

// ---- 固定の文章 ---------------------------------------------------------------------------------

const NOTICE_PACK =
  "このパックの書類は、法的助言ではありません。2026年10月時点の告示・通知に基づく一般的な雛形です。実際に行った委員会・研修・支援の事実だけを記録してください。開いていない会議の議事録、行っていない研修の実施記録を作ってはいけません。制度の取扱いは、指定権者（都道府県・市町村）の通知で確認してください。";

function coverHtml(type: ServiceType, partsLabel: string[]): string {
  return `<div class="cover">
<span class="tag">${EDITION}</span>
<h1>減算ゼロ 虐待防止・身体拘束適正化 書類パック</h1>
<p class="sub">${esc(type)}　記入例つき・まとめて印刷</p>
<table>
<tr><th style="width:22%">この冊子の中身</th><td><strong>A　記入例（架空の事業所）</strong>：書き方の見本。氏名・日付・会議の内容はすべて架空です。<br><strong>B　記入用の白紙様式</strong>：そのまま印刷して手書きできます（Word 版は「記入用.docx」）。</td></tr>
<tr><th>含まれる書類</th><td>${partsLabel.map((l) => esc(l)).join("<br>")}</td></tr>
<tr><th>使い方</th><td>① 記入例（A）を見て、書く内容をつかむ → ② 白紙様式（B）または Word 版に、実際に行ったことを記入 → ③ 運営指導チェックリストで、書類がそろっているか確認。<br>詳しくは「00_はじめに.pdf」をご覧ください。</td></tr>
</table>
<blockquote>${esc(NOTICE_PACK)}</blockquote>
<p class="small">減算ゼロ 虐待防止・身体拘束適正化 書類パック ${EDITION}　販売：${SELLER}　${COPYRIGHT}<br>公開中の無料テンプレート・解説：${SITE}/</p>
</div>`;
}

const HOWTO_MD = `# 減算ゼロ 虐待防止・身体拘束適正化 書類パック　はじめに（使い方1枚）

${EDITION}　販売：${SELLER}　${COPYRIGHT}

## このパックでできること
虐待防止委員会・研修・身体拘束等の適正化の書類（年間計画、議事次第、議事録様式、研修資料と理解度テスト、研修実施記録、指針、記録様式）を、**13のサービス種別ごと**に、**記入例つき**で、**すぐ印刷・すぐ編集**できる形でまとめています。運営指導の前に書類がそろっているかを確認するチェックリスト（放課後等デイサービス・児童発達支援向け）も入っています。**運営指導で確認される書類のすべてが入っているわけではありません。**

## フォルダの中身
| ファイル | 中身 |
| --- | --- |
| 00_はじめに.pdf | このページ |
| 01_運営指導チェックリスト.pdf / .docx | 本編6章＋追加編（人員・個別支援会議・加算の記録）。PDF は記入式、Word は編集用 |
| 02_サービス種別ごと / 自分の種別 / 書類まとめ.pdf | **A 記入例**（架空）＋ **B 記入用の白紙様式**。13種別 |
| 02_サービス種別ごと / 自分の種別 / 記入用.docx | 白紙様式の Word 版。【要記入】を埋めて使う |

## 使い方（3ステップ）
1. **「02_サービス種別ごと」の中の、自分のサービス種別のフォルダを開く**。「書類まとめ.pdf」の「A 記入例」で、書く内容と分量をつかむ。
2. **実際にあったことを記入する**。「記入用.docx」の【要記入】を埋めるか、PDFの「B 記入用」を印刷して手書きする。記入例の文章は、そのまま写さない。
3. **チェックリストで確認する**。委員会・研修・指針・記録がそろっているか、保管場所を書き込む。

## 使うときの大切な約束
- **記録は、実際に行ったことだけ**。開いていない会議の議事録、行っていない研修の実施記録は作らない。
- **記入例は架空**。事業所名・氏名・会議の内容はすべて架空で、公式の様式や記載例ではありません。
- **身体拘束等の記録様式は、実際に行った場合だけ使う**。行っていない事業所は、様式を用意しておくだけでかまいません。記入例（実際の事案の例）は載せていません。
- **指定権者の指示が優先**。様式、数え方（年度か直近1年か）、届出の方法は自治体で異なることがあります。迷うときは指定権者に確認してください。

## 無料版とのちがい
| | 無料（公開サイト） | このパック |
| --- | --- | --- |
| 記入例 | 放課後等デイサービスの見本のみ | **13種別すべて**に記入例つき |
| 印刷 | サイトで事業所名を入れて、1種別ずつ Word 保存 | **まとめて印刷できる PDF**＋Word を最初から用意 |
| チェックリスト | 放課後等デイサービス・児童発達支援向けの本編 | 本編に、**人員・個別支援会議・加算の記録の追加編**を足した記入式 |
| すぐ使える | 入力と保存の手間がある | ダウンロードしてすぐ開ける。ネット環境も不要 |

## 制度の確認について
書類の根拠は、基準省令（厚生労働省令）、解釈通知、留意事項通知、こども家庭庁のガイドラインなどです。2026年10月時点の内容で、断定できない点は断定せず「指定権者に確認」としています。根拠となる解説は、公開サイトの「解説」で読めます。${SITE}/guide/

## お問い合わせ
BOOTH のメッセージ機能からご連絡ください（販売者：${SELLER}）。制度の個別の判断や、法的な助言はできません。

${COPYRIGHT}
`;

const ADDENDUM_MD = `# 運営指導チェックリスト　追加編：人員と記録の確認（放課後等デイサービス・児童発達支援）

減算ゼロ 虐待防止・身体拘束適正化 書類パック ${EDITION} 限定
事業所名：＿＿＿＿＿＿＿＿＿＿　確認日：　　年　　月　　日　確認者：＿＿＿＿＿＿

書類が見つかったら □ に印を付け、「保管場所」に書き込んでください。本編（1〜6章）に続く追加編です。条文は、児童発達支援は基準省令第5条、放課後等デイサービスは第66条です。

## 7. 人員と勤務形態一覧表　［減算］

人員欠如減算（児童指導員・保育士）：減算が適用される月から3月未満は所定単位数の100分の70、連続して3月以上は100分の50。児童発達支援管理責任者の欠如は、5月未満が100分の70、連続して5月以上が100分の50。減算の対象は、欠如に当たるサービス提供単位の障害児全員で、加算を含めない所定単位数が元になります（留意事項通知、令和8年5月28日改正後）。

| 確認 | 書類・体制 | 保管場所 | 根拠・メモ |
| --- | --- | --- | --- |
| □ | 児童発達支援管理責任者が1人以上いて、専任かつ常勤になっている（欠けている期間がない） | 　 | 基準省令 第5条第8項（児発）、第66条第8項（放デイ） |
| □ | 児童指導員又は保育士が、サービスの単位ごとに、提供時間帯を通じて基準の人数以上いる（障害児10人までは2人以上。10人を超えるときは、5人又はその端数を増すごとに1人を加えた数以上） | 　 | 第5条第1項、第66条第1項。解釈通知 |
| □ | 児童指導員又は保育士のうち1人以上が常勤になっている | 　 | 第5条第6項、第66条第6項 |
| □ | 勤務形態一覧表の時間が、月ごとの勤務表と一致している。1人の算入時間が、常勤の従業者が勤務すべき時間数を超えていない | 　 | 解釈通知（勤務延べ時間数。勤務表は原則として月ごと） |
| □ | 常勤換算の合計だけでなく、時間帯ごとの人数を確認している（常勤換算で足りても、時間帯の人数が足りない日がないか） | 　 | 解釈通知（「提供を行う時間帯を通じて」） |
| □ | 人が欠けたとき、欠けた職種・程度（必要な員数から1割を超えるか）・月を記録し、指定権者に連絡する手順を決めている | 　 | 減算の始まり：1割を超える→翌月から。1割の範囲内→翌々月から（翌月末日に基準を満たせば除く）。児童発達支援管理責任者の欠如など→翌々月から |
| □ | 令和8年6月からの特例（突発的で想定が困難な事象・1割の範囲内・ハローワーク等での求人など）を使う場合は、欠如の発生月の翌月までに都道府県知事へ報告し、有効な求人票の写しを添付する手順を知っている | 　 | 留意事項通知（令和8年5月28日改正後）。1年に1回。児童発達支援管理責任者の欠如は、文言上は対象外と読めるため指定権者に確認 |

## 8. 個別支援会議と加算の記録

| 確認 | 書類・体制 | 保管場所 | 根拠・メモ |
| --- | --- | --- | --- |
| □ | 個別支援計画の原案について、担当者等を招集した会議を開いた記録がある（日時、出席者、本人・保護者の意見の聴き方、原案の変更点）。様式は定められていない | 　 | 基準省令 第27条第5項、解釈通知 |
| □ | 本人と保護者の意見を聴いている（会議への参加、会議前に担当者が会う、など）。言葉で表しにくいこどもは、表情や動き、発声も観察している | 　 | 解釈通知 |
| □ | 計画を見直すときも会議を開き、見直しの内容について保護者等の同意を得ている | 　 | 第27条第10項、解釈通知 |
| □ | 会議 → 説明と文書による同意 → 交付の順になっている（同意の日付が、会議より後で、支援開始より前） | 　 | 第27条第5項〜第7項 |
| □ | 欠席時対応加算：連絡が前々日・前日・当日で、電話等で状況を確認し、利用を促すなどの相談援助をして、連絡の日時・状況・相談内容・次回の利用を記録している | 　 | 留意事項通知（直接の面会や訪問は不要） |
| □ | 欠席時対応加算の単位数・回数の上限を、報酬告示と指定権者の案内で確認している | 　 | 告示の本文で確認 |

根拠の解説ページ（公開サイト）：人員欠如減算 ${SITE}/guide/jinin-ketsujo-gensan-jidou ／ 勤務形態一覧表 ${SITE}/guide/kinmu-keitai-ichiran ／ 個別支援会議の議事録 ${SITE}/guide/kobetsu-shien-kaigi-gijiroku ／ 欠席時対応加算の記録 ${SITE}/guide/kesseki-taiou-kasan-kiroku

このチェックリストは一般的な確認項目です。指定権者（都道府県・市町村）の集団指導資料や運営指導の通知とあわせて使ってください。
`;

const RESTRAINT_NOTE =
  "> 【記入のポイント】この様式の記入例は載せていません。実際の身体拘束等の事案を想定した例は、誤った使い方につながるおそれがあるためです。行った場合は、態様を具体的に書き、3要件（切迫性・非代替性・一時性）はそれぞれ根拠を書き、複数の職員での判断、保護者への説明、委員会での検証まで記録します。行っていない場合、この様式は使いません。";

// ---- 実行 ---------------------------------------------------------------------------------------

async function main() {
  if (!process.env.ONLY_FREE) {
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(path.join(PACK_DIR, "02_サービス種別ごと"), { recursive: true });
  }
  const pwPath = process.env.PLAYWRIGHT_MODULE ?? "playwright";
  // Playwright は package.json の依存に入れていない（ビルド時だけ使う）。型は最小限だけ書く。
  type Page = { setContent(html: string, o: object): Promise<void>; pdf(o: object): Promise<unknown> };
  const { chromium } = (await import(pwPath.startsWith("/") ? pathToFileURL(pwPath).href : pwPath)) as { chromium: { launch(o?: object): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }> } };
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();

  async function pdf(file: string, html: string, footer: string) {
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: file,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:7pt;width:100%;text-align:center;color:#6b7b78;font-family:IPAGothic,sans-serif">${esc(footer)}　<span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  }

  const log: string[] = [];

  // 公開中の無料版チェックリスト（public/downloads）を、パックの本編と同じ内容に作り直す（FREE_CHECKLIST=1 のとき。ONLY_FREE=1 ならこれだけ）
  if (process.env.FREE_CHECKLIST || process.env.ONLY_FREE) {
    const main = readFileSync("scripts/booth-pack/checklist-main.md", "utf8");
    await pdf("public/downloads/unei-shidou-checklist-jidou.pdf", htmlPage("運営指導の前に見直す書類チェックリスト（放課後等デイサービス・児童発達支援版）", blocksToHtml(main)), `減算ゼロ運営事務局　運営指導チェックリスト ${EDITION}`);
    writeFileSync("public/downloads/unei-shidou-checklist-jidou.docx", await Packer.toBuffer(buildDocx(main)));
    if (process.env.ONLY_FREE) {
      await browser.close();
      return;
    }
  }

  // 00 使い方
  await pdf(path.join(PACK_DIR, "00_はじめに.pdf"), htmlPage("はじめに", blocksToHtml(HOWTO_MD), true), `減算ゼロ 虐待防止・身体拘束適正化 書類パック ${EDITION}　はじめに　${COPYRIGHT}`);

  // 01 チェックリスト：本編（公開済みの無料版を元に、scripts/booth-pack/checklist-main.md に起こしたもの）＋追加編
  const CHECKLIST_MAIN_MD = readFileSync("scripts/booth-pack/checklist-main.md", "utf8");
  await pdf(path.join(PACK_DIR, "01_運営指導チェックリスト.pdf"), htmlPage("運営指導チェックリスト", blocksToHtml(CHECKLIST_MAIN_MD) + blocksToHtml(ADDENDUM_MD)), `運営指導チェックリスト ${EDITION}　${COPYRIGHT}`);
  writeFileSync(path.join(PACK_DIR, "01_運営指導チェックリスト.docx"), await Packer.toBuffer(buildDocx(`${CHECKLIST_MAIN_MD}\n${ADDENDUM_MD}\n${COPYRIGHT}\n`)));

  // 02 / 03 サービス種別ごと
  for (const type of SERVICE_TYPES) {
    const ctxEx = templateContext(exampleInputs(type));
    const ctxBlank = templateContext({ serviceType: type, facilityName: "", staffCount: null, reiwaYear: 8, meetingDate: "", committeeMembers: "", officerRole: "" });
    const parts = templateParts(ctxEx);
    const example = parts
      .map((p) => makeExample(buildTemplate(p, ctxEx), ctxEx))
      .join("\n\n---\n\n")
      .replace(/(# やむを得ず身体拘束等を行う場合の記録様式\n)/, `$1\n${RESTRAINT_NOTE}\n`)
      .replace(/(# 身体拘束等に関するご説明書\n)/, `$1\n${RESTRAINT_NOTE}\n`)
      .replace(/^> 無料テンプレート（定型文）です。[^\n]*\n\n?/gm, "");
    const blank = parts.map((p) => buildTemplate(p, ctxBlank)).join("\n\n---\n\n").replace(/^> 無料テンプレート（定型文）です。[^\n]*\n\n?/gm, "");

    // 記入例に【要記入】が残っていないか（白紙のままにする理解度テストの回答欄、記録様式は除く）
    const leftover = example
      .split(/\n(?=# )/)
      .filter((d) => !/^# (虐待防止研修 理解度テスト|やむを得ず身体拘束|身体拘束等に関するご説明書)/.test(d))
      .flatMap((d) => d.split("\n").filter((l) => l.includes("【要記入")));
    if (leftover.length) log.push(`${type}: 記入例に【要記入】が ${leftover.length} 行残っている\n  ` + leftover.slice(0, 4).join("\n  "));

    const partsLabel = parts.map((p) => ({ committee: "虐待防止委員会セット（年間実施計画表・議事次第・議事録様式）", training: "虐待防止研修セット（研修資料・理解度テスト・実施記録）", restraint: "身体拘束等適正化セット（指針・委員会確認チェックリスト・記録様式・ご説明書）" })[p]);
    const body =
      coverHtml(type, partsLabel) +
      `<div class="doc"><span class="tag">A　記入例（架空の事業所「${esc(exampleFacilityName(type))}」）</span><h1>A　記入例</h1><p>氏名・日付・会議の内容・事業所名はすべて架空です。書く内容と分量をつかむための見本で、公式の様式や記載例ではありません。そのまま写さず、実際に行ったことを書いてください。</p></div>` +
      blocksToHtml(example, "記入例（架空）") +
      `<div class="doc"><span class="tag">B　記入用の白紙様式</span><h1>B　記入用の白紙様式</h1><p>【要記入】を、実際に行ったことで埋めてください。印刷して手書きしても、Word 版（03_Word（記入用））に入力してもかまいません。</p></div>` +
      blocksToHtml(blank, "記入用");
    const dir = path.join(PACK_DIR, "02_サービス種別ごと", typeDir(type));
    mkdirSync(dir, { recursive: true });
    await pdf(path.join(dir, "書類まとめ.pdf"), htmlPage(`${type} 書類まとめ`, body), `${PACK_TITLE} ${EDITION}　${type}　${COPYRIGHT}`);
    writeFileSync(path.join(dir, "記入用.docx"), await Packer.toBuffer(buildDocx(`${blank}\n${COPYRIGHT}　${PACK_TITLE}\n`)));
    console.log(`done ${type}`);
  }
  await browser.close();

  writeFileSync(
    path.join(PACK_DIR, "README.txt"),
    `減算ゼロ 虐待防止・身体拘束適正化 書類パック ${EDITION}\n販売：${SELLER}\n\n00_はじめに（使い方1枚）.pdf から読んでください。\n書類は法的助言ではありません。記録は、実際に行ったことだけを書いてください。\nご利用条件は、BOOTH の商品ページに記載しています。\n${COPYRIGHT}\n`,
  );
  if (log.length) console.log("\n[確認が必要]\n" + log.join("\n"));
  else console.log("\n記入例に【要記入】の残りなし（白紙のままにする様式を除く）");
  execFileSync("python3", ["-I", path.resolve("scripts/booth-pack/make-zip.py"), OUT, PACK, path.join(OUT, ZIP_NAME)], { stdio: "inherit" });
}

void main();

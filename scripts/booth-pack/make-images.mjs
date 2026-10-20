// BOOTH 商品画像（差し替え版）を作る。使い方：
//   PLAYWRIGHT_MODULE=<playwright の index.mjs> CHROMIUM_PATH=<chromium> node scripts/booth-pack/make-images.mjs
// 出力：docs/booth-pack/images/v2_*.png（1200×1200）
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const outDir = path.resolve("docs/booth-pack/images");
const sample = fs.readFileSync(path.join(outDir, "02_記入例.png")).toString("base64");

const css = `
*{box-sizing:border-box;margin:0}
body{width:1200px;height:1200px;font-family:"IPAPGothic","IPAGothic","Noto Sans CJK JP",sans-serif;color:#17302b;background:#f4f8f6;padding:64px;position:relative}
.tag{display:inline-block;border:3px solid #1f7a68;color:#1f7a68;border-radius:40px;padding:8px 26px;font-size:30px;font-weight:700;background:#fff}
h1{font-size:76px;line-height:1.25;margin:28px 0 0;border-left:20px solid #1f7a68;padding-left:30px}
h2{font-size:56px;line-height:1.3;border-left:16px solid #1f7a68;padding-left:26px}
.sub{font-size:38px;line-height:1.5;margin-top:26px}
.row{display:flex;gap:22px;margin-top:34px}
.chip{flex:1;background:#fff;border:3px solid #cfe0da;border-radius:18px;padding:22px 16px;text-align:center}
.chip b{display:block;white-space:nowrap;font-size:50px;color:#1f7a68;line-height:1.1}
.chip span{font-size:26px;white-space:nowrap}
.foot{position:absolute;left:64px;right:64px;bottom:44px;font-size:25px;color:#4a615b;line-height:1.5}
.price{position:absolute;right:64px;bottom:120px;background:#1f7a68;color:#fff;border-radius:22px;padding:18px 40px;font-size:54px;font-weight:700}
.price small{font-size:26px;font-weight:400;display:block}
table{border-collapse:collapse;width:100%;margin-top:34px;font-size:30px;background:#fff}
th,td{border:3px solid #cfe0da;padding:16px 18px;text-align:left;vertical-align:top;line-height:1.4}
th{background:#e4efeb}
li{font-size:34px;line-height:1.5;margin:0 0 14px 40px}
.box{background:#fff;border:3px solid #cfe0da;border-radius:18px;padding:26px 30px;margin-top:26px;font-size:32px;line-height:1.55}
.mono{font-family:monospace;font-size:30px;line-height:1.7;white-space:pre}
`;
const foot = `販売：ヒルフェクリエイト　© 2026 ヒルフェクリエイト　／　記入例はすべて架空です。法的助言ではありません。`;
const pages = {
  "v2_01_サムネイル": `
<span class="tag">2026年10月版　ダウンロード商品</span>
<h1>運営指導の前に。<br>虐待防止・身体拘束適正化の<br>書類パック</h1>
<p class="sub">放課後等デイサービス・児童発達支援ほか<b>13種別</b>。記入例つき、印刷してすぐ使えます。</p>
<div class="row" style="margin-top:60px">
<div class="chip"><b>13</b><span>サービス種別</span></div>
<div class="chip"><b>30〜50</b><span>ページ（種別ごと）</span></div>
<div class="chip"><b>Word付</b><span>編集用ファイル</span></div>
<div class="chip"><b>追加編</b><span>チェックリスト</span></div>
</div>
<div class="price">¥1,980<small>税込・1事業所1購入</small></div>
<div class="foot">${foot}</div>`,
  "v2_02_何が入っているか": `
<h2>何が入っているか（zip 1つ・全30ファイル）</h2>
<div class="box mono">減算ゼロ書類パック/
 ├ 00_はじめに.pdf（使い方・1ページ）
 ├ 01_運営指導チェックリスト（PDF／Word）
 │    本編6章＋追加編（人員・個別支援会議・加算の記録）
 └ 02_サービス種別ごと/
      ├ 放課後等デイサービス/
      │    ├ 書類まとめ.pdf（記入例＋白紙様式）
      │    └ 記入用.docx
      ├ 児童発達支援/ …
      └ 全13種別（自分の種別のフォルダを開く）</div>
<div class="box">書類まとめ.pdf ＝ <b>A 記入例（架空の事業所）</b>＋<b>B 記入用の白紙様式</b>。<br>虐待防止委員会・虐待防止研修・身体拘束等の適正化の各セット。</div>
<div class="foot">${foot}</div>`,
  "v2_03_無料版との違い": `
<h2>無料版との違い</h2>
<table><tr><th></th><th>無料（公開サイト）</th><th>このパック</th></tr>
<tr><th>記入例</th><td>放課後等デイサービスの見本のみ</td><td><b>13種別すべて</b>に記入例</td></tr>
<tr><th>印刷</th><td>1種別ずつ入力して Word 保存</td><td><b>まとめて印刷できるPDF</b>＋編集用Word</td></tr>
<tr><th>チェックリスト</th><td>本編6章</td><td>本編＋<b>追加編</b>（人員・個別支援会議・加算の記録）</td></tr>
<tr><th>使い始め</th><td>入力と保存の手間がある</td><td>ダウンロードしてすぐ開ける</td></tr></table>
<div class="box">無料のテンプレートと解説を元にした、有料のまとめ版です。無料版だけでも使えます。</div>
<div class="foot">${foot}</div>`,
  "v2_04_記入例": `
<h2>記入例は、こんな見本です（架空の事業所）</h2>
<div style="margin-top:24px;display:flex;gap:30px;align-items:flex-start">
<div style="width:640px;border:3px solid #cfe0da;background:#fff;height:860px;overflow:hidden"><img src="data:image/png;base64,${sample}" style="width:640px"></div>
<div style="flex:1;font-size:32px;line-height:1.6"><p><b>議事録の記入例</b></p><p style="margin-top:14px">日時・出席者・議題・出た意見まで、書き方の見本つき。</p><p style="margin-top:14px">放課後等デイサービスの書類まとめは<b>49ページ</b>（記入例＋白紙様式）。</p><p style="margin-top:14px">事業所名・氏名・内容はすべて架空です。</p></div></div>
<div class="foot">${foot}</div>`,
  "v2_05_購入前の確認": `
<h2>ご購入前にご確認ください</h2>
<ul style="margin-top:30px">
<li>書類は<b>一般的な雛形</b>で、法的助言ではありません。制度の取扱いは、指定権者（都道府県・市町村）の通知で確認してください。</li>
<li><b>記録は、実際に行ったことだけ</b>を書いてください。</li>
<li>書類をそろえるだけでは、減算の回避は保証できません。取組を行い、記録を残すことが必要です。</li>
<li><b>1つの購入につき1事業所</b>でお使いいただけます（事業所ごとにご購入ください）。</li>
<li>運営指導で確認される書類のすべてが入っているわけではありません。</li>
<li>ダウンロード商品のため、お客様都合の返品・返金はできません。</li>
</ul>
<div class="foot">${foot}</div>`,
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
for (const [name, body] of Object.entries(pages)) {
  await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();

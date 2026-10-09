import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbList, jsonLdHtml } from "@/lib/jsonld";
import { pageUrl } from "@/lib/site";
import TemplateClient from "./TemplateClient";

const TITLE = "虐待防止・身体拘束適正化の書類テンプレート（無料・Word）";
const DESCRIPTION =
  "事業所名・サービス種別・委員会の日付を入れるだけで、虐待防止委員会の年間計画・議事次第・議事録様式、研修資料と理解度テスト、身体拘束等適正化の指針と記録様式の雛形を、Wordで無料作成できます。登録不要、入力はブラウザの外に送られません。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/templates" },
};

export default function TemplatesPage() {
  const jsonLd = [
    breadcrumbList([
      { name: "ホーム", url: pageUrl() },
      { name: "書類テンプレート（無料）", url: pageUrl("/templates") },
    ]),
  ];
  return (
    <section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <div className="wrap narrow">
        <nav className="breadcrumb" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link> › 書類テンプレート（無料）
        </nav>
        <p className="eyebrow">無料・登録不要</p>
        <h1>{TITLE}</h1>
        <p className="lead">
          事業所の基本情報を入れると、減算を避けるために必要な書類の雛形ができあがります。
          中身は制度に沿った定型文です。【要記入】を埋め、事業所の実情に合わせて直してから使ってください。
        </p>

        <TemplateClient />

        <h2 style={{ marginTop: 48 }}>無料テンプレートと有料版（AI）の違い</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="無料テンプレートと有料版の違い（横にスクロールできます）">
          <table className="compare">
            <thead>
              <tr>
                <th><span className="visually-hidden">項目</span></th>
                <th>無料テンプレート（このページ）</th>
                <th>有料版（AI・近日公開）</th>
              </tr>
            </thead>
            <tbody>
              <tr><th>文章</th><td>どの事業所にも使える定型文</td><td>サービス種別・利用者の特性・最近の課題に合わせて AI が書き分ける</td></tr>
              <tr><th>議事録</th><td>空欄の様式</td><td>実際の会議メモを清書した議事録（メモにないことは書かない）</td></tr>
              <tr><th>研修資料</th><td>共通のスライド原稿と、サービス種別ごとの事例</td><td>事業所で起きたヒヤリハットを事例検討に反映</td></tr>
              <tr><th>指針</th><td>解釈通知の項目に沿った雛形</td><td>事業所の体制や身体拘束の実施状況に合わせた文案</td></tr>
              <tr><th>Word 保存</th><td>できる</td><td>できる</td></tr>
              <tr><th>料金</th><td>無料</td><td>1事業所・年間セット（価格は公開時にお知らせ）</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3>有料版（AI）は近日公開です</h3>
          <p>公開のお知らせの登録受付は準備中です。公開したら、このサイトでお知らせします。</p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3>あわせて確認</h3>
          <div className="actions">
            <Link href="/check" className="btn">減算リスクを無料診断</Link>
            <Link href="/samples" className="btn secondary">完成イメージ（書類サンプル）</Link>
            <Link href="/guide" className="btn secondary">解説を読む</Link>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>
          このテンプレートは一般的な書類の雛形で、法的な助言ではありません。制度の取扱いは指定権者（都道府県・市町村）の通知を確認してください。
        </p>
      </div>
    </section>
  );
}

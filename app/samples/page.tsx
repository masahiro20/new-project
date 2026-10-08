import type { Metadata } from "next";
import Link from "next/link";
import MarkdownView from "@/app/MarkdownView";
import SampleDownload from "./SampleDownload";
import { breadcrumbList, jsonLdHtml } from "@/lib/jsonld";
import { aiEnabled } from "@/lib/launch";
import { PARTS, PART_LABELS } from "@/lib/parts";
import { SAMPLE_FACILITY, SAMPLE_UPDATED, SAMPLES } from "@/lib/samples";
import { siteUrl, SITE_NAME } from "@/lib/site";

const TITLE = "虐待防止委員会の議事録・研修資料・身体拘束適正化指針の書類サンプル（無料）";
const DESCRIPTION =
  "障害福祉サービスの虐待防止委員会の議事録、虐待防止研修の資料と理解度テスト、身体拘束等適正化の指針と記録様式の見本を無料で公開しています。架空の放課後等デイサービスで作成した、減算ゼロの出力サンプルです。";

// The H1 is long; keep the <title> short enough not to be truncated in search results (plus the "｜減算ゼロ" template).
const META_TITLE = "虐待防止委員会の議事録・研修資料・身体拘束適正化指針のサンプル";

export const metadata: Metadata = {
  title: META_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/samples" },
  openGraph: { type: "article", siteName: SITE_NAME, locale: "ja_JP", title: META_TITLE, description: DESCRIPTION, url: "/samples" },
};

const ANCHORS: Record<(typeof PARTS)[number], string> = {
  committee: "committee",
  training: "training",
  restraint: "restraint",
};

export default function SamplesPage() {
  const base = siteUrl();
  const org = { "@type": "Organization", name: SITE_NAME, url: base };
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: TITLE,
      description: DESCRIPTION,
      datePublished: SAMPLE_UPDATED,
      dateModified: SAMPLE_UPDATED,
      inLanguage: "ja",
      mainEntityOfPage: `${base}/samples`,
      author: org,
      publisher: org,
      hasPart: PARTS.map((p) => ({ "@type": "CreativeWork", name: PART_LABELS[p], url: `${base}/samples#${ANCHORS[p]}` })),
    },
    breadcrumbList([
      { name: "ホーム", url: base },
      { name: "書類サンプル", url: `${base}/samples` },
    ]),
  ];

  const f = SAMPLE_FACILITY;

  return (
    <section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <div className="wrap narrow prose">
        <nav className="breadcrumb" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link> › 書類サンプル
        </nav>
        <p className="eyebrow">書類サンプル（無料）　最終更新：{SAMPLE_UPDATED}</p>
        <h1>{TITLE}</h1>
        <p className="lead">
          減算ゼロで作成できる3つの書類セットの見本です。架空の事業所の情報と会議メモから作成した例で、
          実際の出力と同じ形式です。Wordで保存して、様式づくりの参考にお使いいただけます。
        </p>
        <p className="notice">
          事業所名・会議の内容はすべて架空です。議事録は実際に開催した委員会の記録として使うことはできません。
          【要記入】の箇所は、事業所の実際の内容を記入してください。
        </p>

        <h2>サンプルの前提（架空の事業所）</h2>
        <div className="table-wrap">
          <table className="sample-meta">
            <tbody>
              <tr><th>サービス種別</th><td>{f.serviceType}</td></tr>
              <tr><th>事業所名</th><td>{f.facilityName}</td></tr>
              <tr><th>職員数</th><td>{f.staffCount}名</td></tr>
              <tr><th>利用者の特性</th><td>{f.userCharacteristics}</td></tr>
              <tr><th>委員会の開催日</th><td>{f.meetingDate}</td></tr>
              <tr><th>委員会の構成</th><td>{f.committeeMembers}</td></tr>
              <tr><th>身体拘束の実施</th><td>{f.useRestraint}</td></tr>
            </tbody>
          </table>
        </div>
        <details>
          <summary>入力した会議メモ（架空）</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{f.meetingNotes}</p>
        </details>

        <h2>目次</h2>
        <ul>
          {PARTS.map((p) => (
            <li key={p}><a href={`#${ANCHORS[p]}`}>{PART_LABELS[p]}</a></li>
          ))}
        </ul>

        {PARTS.map((p) => (
          <div key={p} id={ANCHORS[p]} className="result-part">
            <div className="result-head">
              <h2 style={{ margin: 0 }}>{PART_LABELS[p]}</h2>
              <div className="actions no-print" style={{ marginTop: 0 }}>
                <SampleDownload markdown={SAMPLES[p]} filename={`サンプル_${PART_LABELS[p].replace(/（.*$/, "")}.docx`} />
              </div>
            </div>
            <MarkdownView markdown={SAMPLES[p]} />
          </div>
        ))}

        <div className="card" style={{ marginTop: 40 }}>
          <h3>あなたの事業所に合わせて作成する</h3>
          <p>
            サービス種別、職員数、利用者の特性、実際の会議メモを入力すると、このサンプルと同じ形式で事業所専用の書類を作成します。
            {aiEnabled() ? "年間実施計画は無料で作成できます。" : "AIによる作成機能は準備中です。"}
          </p>
          <div className="actions">
            <Link href="/check" className="btn">減算リスクを無料診断</Link>
            {aiEnabled() && <Link href="/generate" className="btn secondary">無料で年間計画を作る</Link>}
            <Link href="/guide" className="btn secondary">サービス種別ごとの解説</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

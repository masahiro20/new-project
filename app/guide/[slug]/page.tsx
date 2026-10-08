import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarkdownView from "@/app/MarkdownView";
import { GUIDES, SERVICE_GUIDES, TOPIC_GUIDES, getGuide } from "@/lib/guides";
import { breadcrumbList, jsonLdHtml } from "@/lib/jsonld";
import { siteUrl, SITE_NAME } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  return guide
    ? {
        title: guide.title,
        description: guide.description,
        alternates: { canonical: `/guide/${guide.slug}` },
        // openGraph is shallow-merged with the layout's, so siteName/locale must be repeated here.
        openGraph: {
          type: "article",
          siteName: SITE_NAME,
          locale: "ja_JP",
          title: guide.title,
          description: guide.description,
          url: `/guide/${guide.slug}`,
          publishedTime: guide.published ?? guide.updated,
          modifiedTime: guide.updated,
        },
      }
    : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  const base = siteUrl();
  const url = `${base}/guide/${guide.slug}`;
  const org = { "@type": "Organization", name: SITE_NAME, url: base };
  const jsonLd: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.title,
      description: guide.description,
      datePublished: guide.published ?? guide.updated,
      dateModified: guide.updated,
      inLanguage: "ja",
      mainEntityOfPage: url,
      author: org,
      publisher: org,
      ...(guide.serviceType ? { about: { "@type": "Thing", name: guide.serviceType } } : {}),
      citation: guide.sources.map((s) => s.url),
    },
    breadcrumbList([
      { name: "ホーム", url: base },
      { name: "減算と書類の解説", url: `${base}/guide` },
      { name: guide.title, url },
    ]),
  ];
  if (guide.faq?.length) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }

  // Neighbouring service guides (cyclic) so every page links to a different set instead of always the first three.
  const idx = SERVICE_GUIDES.findIndex((g) => g.slug === guide.slug);
  const related =
    idx >= 0
      ? [...TOPIC_GUIDES.slice(0, 2), ...[1, 2, 3].map((d) => SERVICE_GUIDES[(idx + d) % SERVICE_GUIDES.length])]
      : SERVICE_GUIDES.slice(0, 5);
  // 相談支援 has no 身体拘束 obligations, so don't advertise the restraint documents there.
  const noRestraint = guide.serviceType?.includes("相談支援") ?? false;

  return (
    <section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <article className="wrap narrow prose">
        <nav className="breadcrumb" aria-label="パンくずリスト">
          <Link href="/">ホーム</Link> › <Link href="/guide">減算と書類の解説</Link>
        </nav>
        <p className="eyebrow">
          {guide.serviceType ? `${guide.serviceType}の解説` : "解説"}　最終更新：{guide.updated}
        </p>
        <h1>{guide.title}</h1>
        <p className="ok">{guide.summary}</p>

        <div className="card cta-inline">
          <p>
            <strong>まず1分で確認：</strong>
            あなたの事業所に減算のリスクがあるか、チェックリストで無料診断できます。
          </p>
          <div className="actions">
            <Link href="/check" className="btn">減算リスクを無料診断</Link>
            <Link href="/samples" className="btn secondary">書類サンプルを見る</Link>
          </div>
        </div>

        <MarkdownView markdown={guide.body} headingOffset={0} />

        {guide.faq?.length ? (
          <>
            <h2>よくある質問</h2>
            {guide.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </>
        ) : null}

        <h2>出典・参考</h2>
        <ul>
          {guide.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} rel="noopener noreferrer" target="_blank">
                {s.label}
                <span className="visually-hidden">（新しいタブで開きます）</span>
              </a>
            </li>
          ))}
        </ul>

        <div className="card" style={{ marginTop: 32 }}>
          <h3>{guide.serviceType ? `${guide.serviceType}の書類をAIでまとめて作成` : "必要な書類をAIでまとめて作成"}</h3>
          <p>
            {noRestraint
              ? "虐待防止委員会の議事録、研修資料と理解度テストを、"
              : "虐待防止委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針まで、"}
            {guide.serviceType ? `${guide.serviceType}の現場に合わせて` : "事業所に合わせて"}作成します。
            まずは無料の減算リスク診断と、完成イメージがわかる書類サンプルをご覧ください。
          </p>
          <div className="actions">
            <Link href="/check" className="btn">減算リスクを無料診断</Link>
            <Link href="/samples" className="btn secondary">書類サンプル（無料）</Link>
            <Link href="/generate" className="btn secondary">無料で年間計画を作る</Link>
          </div>
        </div>

        <h2>関連する解説</h2>
        <ul>
          {related.map((g) => (
            <li key={g.slug}>
              <Link href={`/guide/${g.slug}`}>{g.title}</Link>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

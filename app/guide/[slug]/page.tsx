import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MarkdownView from "@/app/MarkdownView";
import { GUIDES, getGuide } from "@/lib/guides";
import { siteUrl, SITE_NAME } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  return guide ? { title: guide.title, description: guide.description, alternates: { canonical: `/guide/${guide.slug}` } } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    dateModified: guide.updated,
    mainEntityOfPage: `${siteUrl()}/guide/${guide.slug}`,
    publisher: { "@type": "Organization", name: SITE_NAME },
  };

  return (
    <section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="wrap narrow prose">
        <p className="eyebrow">解説　最終更新：{guide.updated}</p>
        <h1>{guide.title}</h1>
        <p className="ok">{guide.summary}</p>
        <MarkdownView markdown={guide.body} />
        <h2>出典・参考</h2>
        <ul>
          {guide.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} rel="noopener" target="_blank">{s.label}</a>
            </li>
          ))}
        </ul>
        <div className="card" style={{ marginTop: 32 }}>
          <h3>必要な書類をAIでまとめて作成</h3>
          <p>虐待防止委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針まで、事業所に合わせて作成します。</p>
          <div className="actions">
            <Link href="/generate" className="btn">無料で年間計画を作る</Link>
            <Link href="/check" className="btn secondary">減算リスク診断</Link>
          </div>
        </div>
      </article>
    </section>
  );
}

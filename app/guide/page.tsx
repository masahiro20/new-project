import type { Metadata } from "next";
import Link from "next/link";
import { GUIDE_CATEGORIES } from "@/lib/guide-categories";
import { GUIDES, SERVICE_GUIDES, getGuide } from "@/lib/guides";
import { breadcrumbList, jsonLdHtml } from "@/lib/jsonld";
import { ogImage } from "@/lib/og";
import { pageUrl, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "減算と書類の解説",
  description:
    "障害福祉サービスの虐待防止・身体拘束等適正化・業務継続計画の減算と必要書類を、放課後等デイサービス、就労継続支援、生活介護、グループホームなどサービス種別ごとに解説します。",
  alternates: { canonical: "/guide" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ja_JP",
    title: "減算と書類の解説",
    description:
      "障害福祉サービスの虐待防止・身体拘束等適正化・業務継続計画の減算と必要書類を、サービス種別ごとに解説します。",
    url: "/guide",
    images: [ogImage()],
  },
};

export default function GuideIndex() {
  const jsonLd = [
    breadcrumbList([
      { name: "ホーム", url: pageUrl() },
      { name: "減算と書類の解説", url: pageUrl("/guide") },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: pageUrl(`/guide/${g.slug}`), name: g.title })),
    },
  ];

  return (
    <section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <div className="wrap narrow">
        <p className="eyebrow">解説</p>
        <h1>減算と書類の解説</h1>
        <p className="lead">
          令和6年度報酬改定で新設・見直しされた減算と、運営指導で確認される書類を解説します。
          自分の事業所に当てはまるかは<Link href="/check">無料の減算リスク診断</Link>で、書類の完成イメージは
          <Link href="/samples">書類サンプル</Link>で確認できます。
        </p>

        {GUIDE_CATEGORIES.map((c) => (
          <div key={c.id}>
            <h2 style={{ marginTop: 32 }}>{c.name}</h2>
            {c.slugs.map((slug) => getGuide(slug)).filter((g) => g !== undefined).map((g) => (
              <div key={g.slug} className="card" style={{ marginBottom: 12 }}>
                <h3><Link href={`/guide/${g.slug}`}>{g.title}</Link></h3>
                <p>{g.description}</p>
              </div>
            ))}
          </div>
        ))}

        <h2 style={{ marginTop: 32 }}>サービス種別ごとの解説</h2>
        <div className="grid">
          {SERVICE_GUIDES.map((g) => (
            <div key={g.slug} className="card">
              <p className="eyebrow" style={{ margin: 0 }}>{g.serviceType}</p>
              <h3><Link href={`/guide/${g.slug}`}>{g.title}</Link></h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

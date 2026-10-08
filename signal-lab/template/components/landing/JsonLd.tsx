import { config, toMajorUnits } from "@/lib/config";
import { siteUrl } from "@/lib/site";

/** SoftwareApplication + FAQPage structured data. */
export function JsonLd() {
  const graph: object[] = [
    {
      "@type": "SoftwareApplication",
      name: config.name,
      description: config.description,
      url: siteUrl(),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: config.pricing.plans.map((p) => ({
        "@type": "Offer",
        name: p.label,
        price: String(toMajorUnits(p.amount)),
        priceCurrency: config.pricing.currency.toUpperCase(),
      })),
    },
  ];
  if (config.landing.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: config.landing.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  }
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

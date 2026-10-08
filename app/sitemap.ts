import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { SAMPLE_UPDATED } from "@/lib/samples";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/check`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/generate`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guide`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/samples`, lastModified: SAMPLE_UPDATED, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    ...GUIDES.map((g) => ({ url: `${base}/guide/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const, priority: g.serviceType ? 0.6 : 0.7 })),
  ];
}

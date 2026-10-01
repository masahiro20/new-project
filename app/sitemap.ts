import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/check`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/generate`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guide`, changeFrequency: "weekly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: `${base}/guide/${g.slug}`, lastModified: g.updated, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}

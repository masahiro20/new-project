import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    ...["tokushoho", "privacy", "terms"].map((p) => ({ url: `${base}/legal/${p}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

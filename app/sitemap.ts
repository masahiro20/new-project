import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { aiEnabled } from "@/lib/launch";
import { SAMPLE_UPDATED } from "@/lib/samples";
import { pageUrl } from "@/lib/site";

// Static so it also works in the GitHub Pages export (output: "export").
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // YYYY-MM-DD strings compare correctly as text.
  const guidesUpdated = GUIDES.map((g) => g.updated).reduce((a, b) => (a > b ? a : b));
  return [
    { url: pageUrl(), changeFrequency: "weekly", priority: 1 },
    { url: pageUrl("/check"), changeFrequency: "monthly", priority: 0.8 },
    // Only list the form when it works; on the static site it is a "準備中" page.
    ...(aiEnabled() ? [{ url: pageUrl("/generate"), changeFrequency: "monthly" as const, priority: 0.8 }] : []),
    { url: pageUrl("/guide"), lastModified: guidesUpdated, changeFrequency: "weekly", priority: 0.7 },
    { url: pageUrl("/templates"), changeFrequency: "monthly", priority: 0.9 },
    { url: pageUrl("/samples"), lastModified: SAMPLE_UPDATED, changeFrequency: "monthly", priority: 0.8 },
    { url: pageUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: pageUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    ...GUIDES.map((g) => ({ url: pageUrl(`/guide/${g.slug}`), lastModified: g.updated, changeFrequency: "monthly" as const, priority: g.serviceType ? 0.6 : 0.7 })),
  ];
}

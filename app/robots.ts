import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // Paths must include any base path (e.g. /new-project on GitHub Pages).
  const prefix = new URL(base).pathname.replace(/\/$/, "");
  // AI crawlers are welcome: being cited in AI answers is the main acquisition channel.
  return { rules: [{ userAgent: "*", allow: `${prefix}/`, disallow: `${prefix}/api/` }], sitemap: `${base}/sitemap.xml` };
}

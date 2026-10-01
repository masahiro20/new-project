import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // AI crawlers are welcome: being cited in AI answers is the main acquisition channel.
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }], sitemap: `${siteUrl()}/sitemap.xml` };
}

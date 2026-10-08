import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // AI crawlers are welcome: being cited in AI answers is an acquisition channel.
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/app", "/success", "/access"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

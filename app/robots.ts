import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// Static so it also works in the GitHub Pages export (output: "export").
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  // AI crawlers are welcome: being cited in AI answers is the main acquisition channel.
  return { rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }], sitemap: `${siteUrl()}/sitemap.xml` };
}

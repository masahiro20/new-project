import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/chosa", "/types", "/yougo", "/about"].map((p) => ({ url: `${SITE_URL}${p}` }));
}

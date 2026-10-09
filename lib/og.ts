import fs from "node:fs";
import path from "node:path";
import { siteUrl } from "./site";

/**
 * Shared Open Graph image. An absolute URL built from siteUrl() (which carries any
 * base path such as /new-project), because a file-convention image gets the base
 * path applied twice when metadataBase also contains it.
 */
export function ogImage() {
  return {
    url: `${siteUrl()}/og.png`,
    width: 1200,
    height: 630,
    alt: "減算ゼロ：障害福祉サービス事業所向けに、虐待防止・身体拘束適正化の書類を運営指導の前にそろえる",
  };
}

/**
 * Per-guide Open Graph image (public/og/<slug>.png, made by scripts/og/generate-og.mjs).
 * Falls back to the shared image when a guide has no generated file yet.
 */
export function guideOgImage(slug: string, title: string) {
  // Evaluated at build time for these SSG pages, where the project files are on disk.
  const hasFile = fs.existsSync(path.join(process.cwd(), "public", "og", `${slug}.png`));
  return hasFile ? { url: `${siteUrl()}/og/${slug}.png`, width: 1200, height: 630, alt: title } : ogImage();
}

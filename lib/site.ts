export const SITE_NAME = "減算ゼロ";

/**
 * Public origin for canonical URLs, the sitemap and JSON-LD. Falls back to the
 * Vercel production domain (set automatically, without a scheme) so a deploy
 * without a custom domain never advertises localhost.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

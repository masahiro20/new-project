export const SITE_NAME = "主従研究所";
export const SITE_TAGLINE = "猫様と下僕の関係を、大真面目に調べています";
export const HASHTAG = "#主従研究所";

/**
 * 公開URL。NEXT_PUBLIC_SITE_URL を優先し、なければVercelが渡す本番ドメインを使う。
 * OG画像やサイトマップの絶対URLに使うので、localhost のままだとSNSのプレビューが出ない。
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

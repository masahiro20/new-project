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

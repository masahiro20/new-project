import { GUIDES } from "@/lib/guides";
import { siteUrl, SITE_NAME } from "@/lib/site";
import { priceJpy } from "@/lib/stripe";

// llms.txt: a plain-text map of the site for AI assistants and AI search crawlers.
export function GET() {
  const base = siteUrl();
  const body = `# ${SITE_NAME}

> 障害福祉サービス事業所向けに、虐待防止・身体拘束等適正化の年間書類（委員会の議事録、研修資料と理解度テスト、適正化の指針、記録様式）をAIで作成するWebサービス。価格は1事業所・年間セット${priceJpy().toLocaleString()}円（税込）。年間実施計画は無料で作成できる。

## サービス
- [書類を作成する](${base}/generate): 事業所情報を入力して書類を作成
- [減算リスク無料診断](${base}/check): 虐待防止・身体拘束・BCPの減算リスクを1分でチェック

## 解説
${GUIDES.map((g) => `- [${g.title}](${base}/guide/${g.slug}): ${g.summary}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

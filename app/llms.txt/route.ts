import { SERVICE_GUIDES, TOPIC_GUIDES } from "@/lib/guides";
import { PARTS, PART_LABELS } from "@/lib/parts";
import { pageUrl, SITE_NAME } from "@/lib/site";
import { aiEnabled, liveBilling } from "@/lib/launch";
import { priceJpy } from "@/lib/stripe";

// Prerendered at build time (no per-request CPU on Workers Free).
export const dynamic = "force-static";

// llms.txt: a plain-text map of the site for AI assistants and AI search crawlers.
export function GET() {
  const offer = liveBilling()
    ? `価格は1事業所・年間セット${priceJpy().toLocaleString()}円（税込）。年間実施計画は無料で作成できる。`
    : `減算リスク診断・解説・書類サンプルは無料。有料版（書類セットの一括作成）は準備中${aiEnabled() ? "。年間実施計画は無料で作成できる" : "、AIによる作成機能も準備中"}。`;
  const generate = aiEnabled() ? `- [書類を作成する](${pageUrl("/generate")}): 事業所情報を入力して書類を作成\n` : "";
  const body = `# ${SITE_NAME}

> 障害福祉サービス事業所向けに、虐待防止・身体拘束等適正化の年間書類（委員会の議事録、研修資料と理解度テスト、適正化の指針、記録様式）をAIで作成するWebサービス。${offer}

## サービス
${generate}- [減算リスク無料診断](${pageUrl("/check")}): 虐待防止・身体拘束・BCPの減算リスクを1分でチェック
- [書類サンプル（無料）](${pageUrl("/samples")}): 架空の放課後等デイサービスで作成した出力見本。${PARTS.map((p) => PART_LABELS[p]).join("、")}

## 解説（制度の基本）
${TOPIC_GUIDES.map((g) => `- [${g.title}](${pageUrl(`/guide/${g.slug}`)}): ${g.summary}`).join("\n")}

## 解説（サービス種別ごと）
${SERVICE_GUIDES.map((g) => `- [${g.title}](${pageUrl(`/guide/${g.slug}`)}): ${g.summary}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

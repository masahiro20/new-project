import type { Metadata } from "next";
import { config, formatAmount, hasSubscription } from "@/lib/config";

// Always Japanese, even for en launches (特定商取引法 applies to sales to Japan).
export const metadata: Metadata = { title: "特定商取引法に基づく表記", robots: { index: false } };

const L = config.legal;
// Only plans for sale now (a "coming soon" plan has no price to state yet).
const prices = config.pricing.plans
  .filter((p) => !p.comingSoon)
  .map((p) => `${p.label}：${formatAmount(p.amount, config.pricing.currency, "ja")}${p.interval ? (p.interval === "month" ? "／月" : "／年") : ""}（税込）`)
  .join("\n");

// 【要記入】は product.config.ts の legal で埋めてください（特定商取引法第11条）。
const ROWS: [string, string][] = [
  ["販売事業者", L.sellerName],
  ["運営責任者", L.representative],
  ["所在地", L.address],
  ["電話番号", L.phone],
  ["メールアドレス", L.email],
  ["販売価格", prices],
  ["商品代金以外の必要料金", L.extraFees],
  ["支払方法", "クレジットカード（Stripe）"],
  ["支払時期", L.paymentTiming],
  ["提供時期", L.deliveryTiming],
  ["返品・キャンセル", L.refundPolicy],
  ...(hasSubscription()
    ? ([
        ["契約の自動更新", "サブスクリプションは、解約されるまで同じ期間・同じ料金で自動更新されます。"],
        ["解約方法", L.cancellationPolicy],
      ] satisfies [string, string][])
    : []),
];

export default function TokushohoPage() {
  return (
    <section>
      <div className="wrap narrow prose" lang="ja">
        <h1>特定商取引法に基づく表記</h1>
        <table>
          <tbody>
            {ROWS.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td style={{ whiteSpace: "pre-line" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

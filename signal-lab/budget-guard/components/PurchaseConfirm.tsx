import Link from "next/link";
import { config, formatAmount, type Plan } from "@/lib/config";
import { t } from "@/lib/i18n";

/**
 * 最終確認画面の表示事項（改正特商法 第12条の6）. Render directly above the buy
 * button: price, payment timing, delivery timing, auto-renewal, cancellation, refund.
 */
export function PurchaseConfirm({ plan }: { plan: Plan }) {
  const c = t.confirm;
  const sub = plan.mode === "subscription" && plan.interval;
  const rows: [string, string][] = [
    [c.price, `${formatAmount(plan.amount)}${sub ? t.price[plan.interval!] : ""}${t.price.taxIncl}`],
    [c.paymentTiming, config.legal.paymentTiming],
    [c.deliveryTiming, config.legal.deliveryTiming],
    [c.renewal, sub ? c.renewalYes(plan.interval!) : c.renewalNo],
    [c.cancellation, sub ? config.legal.cancellationPolicy : c.cancellationOneTime],
    [c.refund, config.legal.refundPolicy],
  ];
  return (
    <div className="confirm">
      <h3>{c.title}</h3>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        {c.agree} <Link href="/legal/terms">{t.footer.terms}</Link> / <Link href="/legal/tokushoho">{t.footer.tokushoho}</Link>
      </p>
    </div>
  );
}

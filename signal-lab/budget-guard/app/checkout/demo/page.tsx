import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { DemoCardForm } from "@/components/DemoCardForm";
import { config, formatAmount, getPlan } from "@/lib/config";
import { t } from "@/lib/i18n";
import { getDemoCheckout } from "@/lib/payments/demo";
import { isDemoMode } from "@/lib/payments/mode";
import { getKV } from "@/lib/redis";

export const metadata: Metadata = { title: "デモ決済 / Demo checkout", robots: { index: false } };

// In-app stand-in for Stripe Checkout while PAYMENTS_MODE=demo. 404-equivalent
// message in stripe mode, so demo_ links stop working once billing is live.
export default async function DemoCheckoutPage(props: PageProps<"/checkout/demo">) {
  const { id } = await props.searchParams;
  const checkoutId = typeof id === "string" ? id : "";
  const checkout = isDemoMode() ? await getDemoCheckout(getKV(), checkoutId) : null;
  const plan = checkout && getPlan(checkout.planId);

  if (!checkout || !plan) {
    return (
      <section>
        <div className="wrap narrow">
          <p className="notice">{isDemoMode() ? "このデモ決済は見つからないか、有効期限（1時間）が切れました。" : "デモ決済は無効です。"} <Link href="/pricing">{t.sections.pricing}</Link></p>
        </div>
      </section>
    );
  }
  if (checkout.status !== "pending") {
    return (
      <section>
        <div className="wrap narrow">
          <p className="notice">この決済は完了しています。 <Link href={`/success?session_id=${checkout.id}`}>{t.success.open}</Link></p>
        </div>
      </section>
    );
  }

  const sub = plan.mode === "subscription" && plan.interval;
  const amountLabel = `${formatAmount(plan.amount)}${sub ? t.price[plan.interval!] : ""}`;
  return (
    <section>
      <div className="wrap narrow">
        <DemoBanner inline />
        <h1>デモ決済 / Demo checkout</h1>
        <p className="lead">{config.name} — {plan.label}: <strong>{amountLabel}</strong></p>
        <p className="hint">これはデモです。カード情報は保存・送信されず、請求も発生しません（保存するのは末尾4桁のみ）。</p>
        <DemoCardForm checkoutId={checkout.id} amountLabel={amountLabel} />
        <p className="hint" style={{ marginTop: 16 }}><Link href="/pricing?canceled=1">キャンセルして料金ページに戻る / Cancel</Link></p>
      </div>
    </section>
  );
}

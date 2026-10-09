import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { aiEnabled, apiBase, demoPurchase } from "@/lib/launch";
import { DEMO_BANNER } from "@/lib/payments/mode";
import { PRODUCT_NAME } from "@/lib/purchase";
import { priceJpy } from "@/lib/stripe";
import DemoCheckoutClient from "./DemoCheckoutClient";

export const metadata: Metadata = { title: "デモ決済", robots: { index: false } };

// In-app stand-in for Stripe Checkout while PAYMENTS_MODE resolves to demo.
// Static-safe: with an AI server it completes a signed demo token via /api/checkout/demo;
// on a static host (no AI) the whole flow stays in the browser and ends at the samples.
export default function DemoCheckoutPage() {
  if (!demoPurchase()) {
    return (
      <section>
        <div className="wrap narrow">
          <h1>デモ決済は無効です</h1>
          <p>
            <Link href="/">トップページへ戻る</Link>
          </p>
        </div>
      </section>
    );
  }
  const amountLabel = `${priceJpy().toLocaleString()}円（税込）`;
  return (
    <section>
      <div className="wrap narrow">
        <p className="notice">{DEMO_BANNER}</p>
        <h1>デモ決済</h1>
        <p className="lead">
          {PRODUCT_NAME}：<strong>{amountLabel}</strong>
        </p>
        <p className="hint">
          これはデモです。カード情報はブラウザの中で形式を確認するだけで、送信も保存もしません。請求も発生しません。
        </p>
        <Suspense fallback={<p className="spinner">読み込み中…</p>}>
          <DemoCheckoutClient amountLabel={amountLabel} ai={aiEnabled()} apiBase={apiBase()} />
        </Suspense>
      </div>
    </section>
  );
}

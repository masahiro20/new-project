import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { aiEnabled, COMING_SOON, demoPurchase, salesEnabled } from "@/lib/launch";
import { priceJpy } from "@/lib/stripe";
import GenerateClient from "./GenerateClient";

export const metadata: Metadata = {
  alternates: { canonical: "/generate" },
  title: "書類を作成する",
  description: "事業所の情報を入力すると、虐待防止・身体拘束等適正化の年間書類セットをAIが作成します。年間実施計画は無料でお試しできます。",
};

export default function GeneratePage() {
  if (!aiEnabled()) {
    return (
      <section>
        <div className="wrap narrow">
          <p className="eyebrow">書類を作成する</p>
          <h1>AIによる書類作成は準備中です</h1>
          <p className="lead">{COMING_SOON.ai}</p>
          <p>それまでのあいだ、次の機能を無料でお使いいただけます。</p>
          <div className="grid" style={{ marginTop: 16 }}>
            <div className="card">
              <h2 className="h3"><Link href="/check">減算リスク診断</Link></h2>
              <p>虐待防止・身体拘束・BCPの体制を、チェックリストで1分で確認できます。</p>
            </div>
            <div className="card">
              <h2 className="h3"><Link href="/samples">書類サンプル</Link></h2>
              <p>委員会の議事録、研修資料と理解度テスト、身体拘束等適正化の指針の見本です。Wordで保存できます。</p>
            </div>
            <div className="card">
              <h2 className="h3"><Link href="/guide">サービス種別ごとの解説</Link></h2>
              <p>減算の要件、必要な書類、運営指導でよくある指摘をまとめています。</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const sales = salesEnabled();
  return (
    <section>
      <div className="wrap narrow">
        <p className="eyebrow">書類を作成する</p>
        <h1>事業所の情報を入力してください</h1>
        <p className="lead">入力は3分ほどです。年間実施計画は無料で作成できます。</p>
        {!sales && <p className="notice">{COMING_SOON.paid}</p>}
        <Suspense fallback={<p className="spinner">読み込み中…</p>}>
          <GenerateClient
            price={priceJpy()}
            sales={sales}
            demo={demoPurchase()}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined}
          />
        </Suspense>
      </div>
    </section>
  );
}

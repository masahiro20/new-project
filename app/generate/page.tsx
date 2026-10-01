import type { Metadata } from "next";
import { Suspense } from "react";
import { priceJpy } from "@/lib/stripe";
import GenerateClient from "./GenerateClient";

export const metadata: Metadata = {
  title: "書類を作成する",
  description: "事業所の情報を入力すると、虐待防止・身体拘束等適正化の年間書類セットをAIが作成します。年間実施計画は無料でお試しできます。",
};

export default function GeneratePage() {
  return (
    <section>
      <div className="wrap narrow">
        <p className="eyebrow">書類を作成する</p>
        <h1>事業所の情報を入力してください</h1>
        <p className="lead">入力は3分ほどです。年間実施計画は無料で作成できます。</p>
        <Suspense fallback={<p className="spinner">読み込み中…</p>}>
          <GenerateClient price={priceJpy()} />
        </Suspense>
      </div>
    </section>
  );
}

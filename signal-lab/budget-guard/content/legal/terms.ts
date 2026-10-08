import type { LegalDoc } from "./types";

// 雛形（弁護士レビュー前）。製品の性質（AI 出力、データの扱いなど）に合わせて調整してください。
export const terms: Record<"ja" | "en", LegalDoc> = {
  ja: (c) => ({
    title: "利用規約",
    sections: [
      { heading: "適用", body: [`本規約は、${c.legal.sellerName}（以下「当方」）が提供する ${c.name}（以下「本サービス」）の利用に適用されます。購入または利用をもって、本規約に同意したものとみなします。`] },
      { heading: "ライセンス", body: ["購入者には、本サービスを自ら利用するための非独占的・譲渡不能な権利を付与します。ライセンスキーを第三者と共有・転売することはできません。"] },
      { heading: "料金と支払い", body: [`料金は料金ページに表示するとおりです。${c.legal.paymentTiming}`] },
      { heading: "サブスクリプションの更新と解約", body: ["サブスクリプションは解約しない限り自動で更新されます。", c.legal.cancellationPolicy] },
      { heading: "返金", body: [c.legal.refundPolicy] },
      { heading: "禁止事項", body: ["法令に違反する行為、本サービスの運営を妨げる行為、リバースエンジニアリング、不正アクセスを禁止します。"] },
      { heading: "免責", body: ["本サービスは現状有姿で提供されます。当方の故意または重過失による場合を除き、当方の責任は、損害発生前12か月間に購入者が支払った金額を上限とします。"] },
      { heading: "サービスの変更・終了", body: ["当方は事前に通知のうえ、本サービスの内容を変更し、または提供を終了することがあります。買い切りで購入された場合、終了の30日前までにお知らせします。"] },
      { heading: "準拠法・管轄", body: ["本規約は日本法に準拠し、紛争は当方の所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。"] },
      { heading: "制定日", body: [c.legal.effectiveDate] },
    ],
  }),
  en: (c) => ({
    title: "Terms of Service",
    sections: [
      { heading: "Scope", body: [`These terms govern your use of ${c.name} ("the Service") provided by ${c.legal.sellerName} ("we"). By purchasing or using the Service you agree to them.`] },
      { heading: "License", body: ["You get a non-exclusive, non-transferable right to use the Service yourself. License keys may not be shared or resold."] },
      { heading: "Pricing and payment", body: [`Prices are as shown on the pricing page. ${c.legal.paymentTiming}`] },
      { heading: "Subscriptions", body: ["Subscriptions renew automatically until canceled.", c.legal.cancellationPolicy] },
      { heading: "Refunds", body: [c.legal.refundPolicy] },
      { heading: "Prohibited use", body: ["No unlawful use, disruption of the Service, reverse engineering or unauthorized access."] },
      { heading: "Disclaimer", body: ["The Service is provided as is. Except for willful misconduct or gross negligence, our liability is limited to the amount you paid in the 12 months before the claim."] },
      { heading: "Changes and shutdown", body: ["We may change or discontinue the Service with notice. One-time purchasers get at least 30 days' notice before shutdown."] },
      { heading: "Governing law", body: ["These terms are governed by the laws of Japan; the district court with jurisdiction over our location has exclusive first-instance jurisdiction."] },
      { heading: "Effective date", body: [c.legal.effectiveDate] },
    ],
  }),
};

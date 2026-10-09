import { REVIEW_MARK as R, type LegalDoc } from "./types";

// 雛形（弁護士レビュー前）。製品の性質（AI 出力、データの扱いなど）に合わせて調整してください。
// 【要専門家確認】の付いた段落は 2026-10-09 の修正案。根拠と専門家への問いは docs/legal-changes.md。
// 公開前に【要専門家確認】をすべて外す（docs/legal-changes.md の「公開前のチェックリスト」）。
export const terms: Record<"ja" | "en", LegalDoc> = {
  ja: (c) => ({
    title: "利用規約",
    sections: [
      { heading: "適用", body: [`本規約は、${c.legal.sellerName}（以下「当方」）が提供する ${c.name}（以下「本サービス」）の利用に適用されます。購入または利用をもって、本規約に同意したものとみなします。`] },
      {
        heading: "対象となる利用者",
        body: [
          `${R}本サービスは、事業者および開発者による業務での利用（以下「業務利用」）を対象とします。事業者である利用者には「責任の制限（事業者の利用者）」を適用します。ただし、利用者が消費者（事業として、または事業のために契約の当事者となる場合を除く個人）に当たる場合は、「責任の制限（消費者の利用者）」を適用します。`,
        ],
      },
      { heading: "ライセンス", body: ["購入者には、本サービスを自ら利用するための非独占的・譲渡不能な権利を付与します。ライセンスキーを第三者と共有・転売することはできません。"] },
      { heading: "料金と支払い", body: [`料金は料金ページに表示するとおりです。${c.legal.paymentTiming}`] },
      { heading: "サブスクリプションの更新と解約", body: ["サブスクリプションは解約しない限り自動で更新されます。", c.legal.cancellationPolicy] },
      { heading: "返金", body: [c.legal.refundPolicy] },
      { heading: "禁止事項", body: ["法令に違反する行為、本サービスの運営を妨げる行為、リバースエンジニアリング、不正アクセスを禁止します。"] },
      {
        heading: "停止アクションの性質",
        body: [
          `${R}本サービスの通知と停止アクションは、ベストエフォートで提供します。当方は、利用額が予算を超える前に、または超えた直後に、停止が必ず実行されることを保証しません。主な理由は次のとおりです。`,
          `${R}①各社（Vercel、OpenAI、Anthropic）は利用額を日単位で集計し、反映に遅れがあります。本サービスが読み取る当日の額は途中経過で、各社の画面より数時間遅れることがあります。②本サービスは利用額を毎時確認します。監視する接続の総数が増えると、確認の間隔を最長12時間まで延ばします。そのため、予算の80%・100%を超えてから気づくまで、最大で「確認の間隔＋約30分」かかることがあります。③停止は、100%以上を確認した最初の確認（毎時の確認、利用者による「Check now」、または Vercel の Spend Management webhook の受信）で実行し、接続ごとに月1回までです。④OpenAI は、プロジェクトの支出上限が即時には効かず、記録される支出が設定額をわずかに超えることがあるとしています。⑤Vercel の一時停止は本番のデプロイメントだけに効き、AI Gateway と v0 の利用は止まりません。Anthropic の Priority Tier の費用は同社のコストレポートに含まれないため、本サービスは数えられません。⑥API トークンの失効や各社の障害・仕様変更により、利用額の取得や停止に失敗することがあります。失敗は記録して通知し、次の確認で再試行します。`,
          `${R}停止を元に戻す操作（Vercel のプロジェクトの再開、OpenAI の上限の削除、Anthropic のキーの再有効化）は、利用者が各社の画面または API で行います。本サービスは、各社の標準の上限機能の代わりになるものではありません。`,
          `${R}停止が実行されなかったこと、遅れたこと、または停止によって利用者のサービスが止まったことにより生じた損害についての当方の責任は、「責任の制限（事業者の利用者）」または「責任の制限（消費者の利用者）」に従います。`,
        ],
      },
      {
        heading: "責任の制限（事業者の利用者）",
        body: [
          `${R}当方は、本サービスが利用者の特定の目的に適合すること、および停止アクションが必ず実行されることを保証しません。`,
          `${R}当方の故意または重大な過失により利用者に生じた損害については、当方は法令に従って賠償し、次の上限を適用しません。`,
          `${R}それ以外の場合、当方が賠償する損害は、利用者に現実に生じた直接かつ通常の損害に限り、損害の原因となった事由が生じた日から遡って12か月の間に当方が利用者から受け取った利用料金の総額を上限とします。逸失利益その他の間接的な損害は含みません。`,
        ],
      },
      {
        heading: "責任の制限（消費者の利用者）",
        body: [
          `${R}当方の故意または重大な過失により消費者である利用者に生じた損害については、当方は法令に従って賠償し、次の上限を適用しません。`,
          `${R}当方の過失（重大な過失を除きます）による場合に限り、当方が賠償する損害は、利用者に現実に生じた通常の損害とし、その額は、損害の原因となった事由が生じた日から遡って12か月の間に当方が利用者から受け取った利用料金の総額、または一定額（金額は要確認）のいずれか高い額を上限とします。無償の試用・デモで利用料金の支払いがない場合も、この一定額を上限として賠償します。`,
        ],
      },
      {
        heading: "デモと試用",
        body: [
          `${R}デモモード（「デモ：実際の請求はありません」と表示している状態）では、本サービスの料金は請求されず、入力されたカードに請求することもありません。ただし、デモモードでも、利用者が接続した各社のアカウントへの利用額の読み取りと停止アクションは実際に行われます。`,
          `${R}試用の期間は30日間です。試用の終了後、またはデモモードの終了後は、デモで作成したアカウントの監視は止まります。保存したデータは終了から30日間保存し、その後に削除します（プライバシーポリシーの「保存期間と削除」）。それ以前でも、削除をご依頼いただければ7日以内に削除します。`,
          `${R}接続はすべてテストモードで始まります。テストモードでは、100%に達しても、送るはずのリクエストを記録するだけで、各社には何も送りません。本番のキーを使う前に、止まっても困らない捨ててよいプロジェクト（ワークスペース）と、本サービス専用に発行したキーで試すことを強くお勧めします。`,
          `${R}停止を live（実際に停止する状態）に切り替えるかどうか、および停止の対象と予算額は、利用者が自らの判断で選びます。live への切り替えには、送るリクエストの一覧の確認と接続ラベルの入力が必要です。利用者が live に切り替えた後、利用者の設定どおりに停止が実行されたことによって利用者のサービスが止まった場合、その影響は利用者の責任となります。ただし、当方の故意または過失により、設定と異なる対象を停止した場合などは、「責任の制限（事業者の利用者）」または「責任の制限（消費者の利用者）」に従って当方が責任を負います。`,
        ],
      },
      { heading: "サービスの変更・終了", body: ["当方は事前に通知のうえ、本サービスの内容を変更し、または提供を終了することがあります。買い切りで購入された場合、終了の30日前までにお知らせします。"] },
      { heading: "準拠法・管轄", body: ["本規約は日本法に準拠し、紛争は当方の所在地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。"] },
      { heading: "制定日", body: [c.legal.effectiveDate] },
    ],
  }),
  en: (c) => ({
    title: "Terms of Service",
    sections: [
      { heading: "Scope", body: [`These terms govern your use of ${c.name} ("the Service") provided by ${c.legal.sellerName} ("we"). By purchasing or using the Service you agree to them.`] },
      {
        heading: "Who the Service is for",
        body: [
          `${R}The Service is intended for businesses and developers using it for business purposes ("business use"). "Limitation of liability (business users)" applies to business users. If you are a consumer (an individual who is not entering into these terms as a business or for business purposes), "Limitation of liability (consumers)" applies instead.`,
        ],
      },
      { heading: "License", body: ["You get a non-exclusive, non-transferable right to use the Service yourself. License keys may not be shared or resold."] },
      { heading: "Pricing and payment", body: [`Prices are as shown on the pricing page. ${c.legal.paymentTiming}`] },
      { heading: "Subscriptions", body: ["Subscriptions renew automatically until canceled.", c.legal.cancellationPolicy] },
      { heading: "Refunds", body: [c.legal.refundPolicy] },
      { heading: "Prohibited use", body: ["No unlawful use, disruption of the Service, reverse engineering or unauthorized access."] },
      {
        heading: "Nature of stop actions",
        body: [
          `${R}Alerts and stop actions are provided on a best-effort basis. We do not guarantee that a stop will run before, or immediately after, your spend exceeds your budget. The main reasons are:`,
          `${R}(1) The providers (Vercel, OpenAI, Anthropic) report cost per day, with a delay. Today's figure that the Service reads is a partial total and can lag the provider's own dashboard by a few hours. (2) The Service checks spend every hour. As the total number of monitored connections grows, the interval is extended, up to 12 hours, so it can take up to "the interval plus about 30 minutes" to notice that 80% or 100% has been crossed. (3) A stop runs on the first check that sees 100% or more (the scheduled check, your "Check now", or a Vercel Spend Management webhook), at most once per month per connection. (4) OpenAI states that its project spend limit is not instantaneous and recorded spend can slightly exceed the amount set. (5) A Vercel pause affects production deployments only; AI Gateway and v0 usage are not paused. Anthropic Priority Tier costs are not included in Anthropic's cost report, so the Service cannot count them. (6) Reading spend or stopping can fail because a token was revoked or because of a provider outage or change. Failures are logged and notified, and retried on the next check.`,
          `${R}Undoing a stop (unpausing a Vercel project, deleting an OpenAI limit, reactivating Anthropic keys) is done by you in the provider's dashboard or API. The Service is not a replacement for the providers' own limits.`,
          `${R}Our liability for any loss caused by a stop that did not run, ran late, or stopped your service is governed by "Limitation of liability (business users)" or "Limitation of liability (consumers)" below.`,
        ],
      },
      {
        heading: "Limitation of liability (business users)",
        body: [
          `${R}We do not warrant that the Service is fit for your particular purpose or that a stop action will always run.`,
          `${R}If loss is caused by our willful misconduct or gross negligence, we are liable for it as provided by law, and the cap below does not apply.`,
          `${R}In all other cases, our liability is limited to the direct and ordinary loss you actually suffer, up to the total fees we received from you in the 12 months before the event giving rise to the claim. Lost profits and other indirect loss are excluded.`,
        ],
      },
      {
        heading: "Limitation of liability (consumers)",
        body: [
          `${R}If loss is caused to a consumer by our willful misconduct or gross negligence, we are liable for it as provided by law, and the cap below does not apply.`,
          `${R}Only where loss is caused by our negligence other than gross negligence, our liability is limited to the ordinary loss you actually suffer, up to the higher of the total fees we received from you in the 12 months before the event giving rise to the claim and a fixed amount (amount to be confirmed). This fixed amount also applies where you have paid no fees, including free trials and demo use.`,
        ],
      },
      {
        heading: "Demo and trial",
        body: [
          `${R}In demo mode (while "Demo mode: no real charges" is shown), you are not charged for the Service and the card you enter is never charged. Even in demo mode, however, reading spend from, and running stop actions on, the provider accounts you connect are real.`,
          `${R}The trial period is 30 days. When a trial or demo mode ends, monitoring of accounts created in demo mode stops. Stored data is kept for 30 days after the end and then deleted (see "Retention and deletion" in the Privacy Policy). You can ask us to delete it sooner; we do so within 7 days of your request.`,
          `${R}Every connection starts in test mode. In test mode, reaching 100% only records the requests that would be sent; nothing is sent to the provider. Before using production keys, we strongly recommend trying the Service with a throwaway project (or workspace) that is safe to stop and a key issued only for the Service.`,
          `${R}You decide whether to switch a stop to live (actually stopping), and you choose its targets and budget. Going live requires reviewing the list of requests and typing the connection's label. Once you switch to live, the effects of a stop that runs as you configured it, such as your service being stopped, are your responsibility. However, if we stop something other than what you configured, or the stop otherwise goes wrong through our willful misconduct or negligence, we are liable as set out in "Limitation of liability (business users)" or "Limitation of liability (consumers)".`,
        ],
      },
      { heading: "Changes and shutdown", body: ["We may change or discontinue the Service with notice. One-time purchasers get at least 30 days' notice before shutdown."] },
      { heading: "Governing law", body: ["These terms are governed by the laws of Japan; the district court with jurisdiction over our location has exclusive first-instance jurisdiction."] },
      { heading: "Effective date", body: [c.legal.effectiveDate] },
    ],
  }),
};

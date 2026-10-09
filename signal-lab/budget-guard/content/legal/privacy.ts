import { hostingProvider } from "@/lib/site";
import type { LegalDoc } from "./types";

// 雛形（弁護士レビュー前）。取得情報や外部送信先が変わる製品では必ず書き換えてください。
export const privacy: Record<"ja" | "en", LegalDoc> = {
  ja: (c) => ({
    title: "プライバシーポリシー",
    sections: [
      { heading: "取得する情報", body: [`${c.name}（以下「本サービス」）は、待機リストへの登録時のメールアドレス、購入時に決済代行事業者から提供されるメールアドレスと購入情報、ライセンスキーを取り扱います。`] },
      { heading: "利用目的", body: ["本サービスの提供、ライセンスキーやログインリンクの送付、お問い合わせへの対応、公開のお知らせのために利用します。"] },
      { heading: "決済情報", body: ["クレジットカード情報は決済代行事業者（Stripe）が管理し、本サービスでは保持しません。"] },
      { heading: "外部サービス", body: [`データの保存に Upstash、メール送信に Resend、ホスティングに ${hostingProvider()} を利用します。これらの事業者は国外に所在する場合があります。`] },
      { heading: "アクセス解析", body: ["ページの閲覧数などを日ごとに集計しますが、個人を識別する情報は記録しません。ログイン状態の保持にのみ Cookie を使用します。"] },
      { heading: "開示・削除の請求", body: [`ご本人からの開示・訂正・削除のご請求には、${c.links.supportEmail} にて対応します。`] },
      { heading: "制定日", body: [c.legal.effectiveDate] },
    ],
  }),
  en: (c) => ({
    title: "Privacy Policy",
    sections: [
      { heading: "What we collect", body: [`${c.name} ("the Service") handles the email you give when joining the waitlist, the email and purchase details provided by our payment processor, and your license key.`] },
      { heading: "Why", body: ["To provide the Service, send license keys and sign-in links, answer support requests, and announce the launch."] },
      { heading: "Payments", body: ["Card details are handled by Stripe and never stored by the Service."] },
      { heading: "Processors", body: [`We use Upstash (storage), Resend (email) and ${hostingProvider()} (hosting), which may be located outside your country.`] },
      { heading: "Analytics", body: ["We count page views per day without identifying individuals. Cookies are used only to keep you signed in."] },
      { heading: "Your rights", body: [`To access or delete your data, contact ${c.links.supportEmail}.`] },
      { heading: "Effective date", body: [c.legal.effectiveDate] },
    ],
  }),
};

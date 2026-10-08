import type { ProductConfigInput } from "./lib/config";

// ★ The only file you change per launch (plus .env). Validated by lib/config.ts:
// an invalid value fails `next build`. Amounts are in the smallest currency unit.
const product = {
  slug: "signal-demo",
  name: "Signal Demo",
  tagline: "48時間で作って、売って、確かめる。",
  description: "Signal Lab の48時間ローンチテンプレートのデモ製品です。product.config.ts を書き換えると LP・決済・法務ページがすべて切り替わります。",
  locale: "ja",
  brand: { color: "#1d6f5f" },
  links: { supportEmail: "support@example.com" },

  // waitlist: 待機リストのみ / presale: 先行販売 / live: 通常販売
  launch: { mode: "live" },

  pricing: {
    currency: "jpy",
    plans: [
      {
        id: "lifetime",
        label: "買い切り",
        amount: 2980,
        mode: "payment",
        features: ["すべての機能", "今後のアップデート"],
        highlight: true,
      },
      {
        id: "monthly",
        label: "月額",
        amount: 480,
        mode: "subscription",
        interval: "month",
        features: ["すべての機能", "いつでも解約可能"],
      },
    ],
  },

  access: { gate: "license", magicLink: true, sessionDays: 30 },

  landing: {
    hero: {
      eyebrow: "Signal Lab",
      headline: "アイデアを48時間で、売れるかどうか確かめる。",
      sub: "LP、決済、待機リスト、法務ページ、アクセス制御まで揃ったテンプレート。本体の機能づくりに集中できます。",
    },
    problem: {
      title: "毎回ゼロから作ると、本体に手が回らない",
      points: ["決済とWebhookの実装に半日かかる", "特商法・規約ページを毎回書き直す", "売れるか分かる前に疲れてしまう"],
    },
    features: [
      { title: "設定ファイル1つ", body: "product.config.ts を書き換えるだけで LP と価格が切り替わります。" },
      { title: "Stripe 決済", body: "買い切りとサブスクに対応。Webhook と返金・解約も反映します。" },
      { title: "ライセンスキー", body: "認証基盤なしで、キーとマジックリンクで本体へ入れます。" },
    ],
    faq: [
      { q: "返金はできますか？", a: "特定商取引法に基づく表記の「返品・キャンセル」をご確認ください。" },
      { q: "サブスクはいつでも解約できますか？", a: "はい。アプリ内の「お支払い管理」から、次回更新日の前日までに解約できます。" },
    ],
    socialProof: [],
  },

  // OG image text must be Latin/ASCII (ImageResponse has no Japanese font bundled).
  og: { title: "Signal Demo", subtitle: "Build, sell and validate in 48 hours." },

  // 特定商取引法に基づく表記。【要記入】のまま本番ビルドすると警告が出ます。
  legal: {
    sellerName: "【要記入：氏名または法人名】",
    representative: "【要記入】",
    address: "【要記入：請求があった場合に遅滞なく開示します、の記載も可】",
    phone: "【要記入：請求があった場合に遅滞なく開示します、の記載も可】",
    email: "support@example.com",
    paymentTiming: "ご注文時にクレジットカードで決済されます。サブスクリプションは以後、各更新日に自動で決済されます。",
    deliveryTiming: "決済完了後、直ちにご利用いただけます。",
    refundPolicy: "デジタルコンテンツの性質上、提供開始後の返金はお受けしておりません。ただし、当方の不具合でご利用いただけない場合は全額返金します。",
    cancellationPolicy: "アプリ内の「お支払い管理」からいつでも解約できます。解約後も期間末日までご利用いただけ、日割りでの返金はありません。",
    effectiveDate: "2026-10-08",
  },
} satisfies ProductConfigInput;

export default product;

import type { ProductConfigInput } from "./lib/config";
import { checkCadence } from "./lib/guard/schedule";

// Budget Guard. Prices are a stage-2 proposal and still need owner approval.
const product = {
  slug: "budget-guard",
  name: "Budget Guard",
  tagline: "Hard spend caps for Vercel, OpenAI and Anthropic.",
  description:
    "Budget Guard checks your Vercel, OpenAI and Anthropic spend every hour, emails you at 80% of your budget, and at 100% runs the stop action you armed: pause the Vercel project, cap the OpenAI project, or deactivate Anthropic keys.",
  locale: "en",
  brand: { color: "#b4232c" },
  links: { supportEmail: "support@example.com" },

  launch: { mode: "live" },

  pricing: {
    currency: "usd",
    plans: [
      {
        id: "monthly",
        label: "Monthly",
        amount: 900,
        mode: "subscription",
        interval: "month",
        // The check interval stretches with the total number of connections (lib/guard/schedule.ts).
        features: ["Up to 3 monitored connections", checkCadence(), "80% alert + 100% stop action", "Test mode for every stop"],
        highlight: true,
      },
      {
        id: "yearly",
        label: "Yearly",
        amount: 7900,
        mode: "subscription",
        interval: "year",
        // Not sold yet: Stripe yearly billing has never been tried end to end (no account yet).
        // Owner's rule: keep only what really works. /api/checkout and the demo checkout refuse it.
        comingSoon: true,
        features: ["Everything in Monthly"],
      },
    ],
  },

  access: { gate: "license", magicLink: true, sessionDays: 30 },

  landing: {
    hero: {
      eyebrow: "Budget Guard",
      headline: "Alerts tell you. Budget Guard stops it.",
      sub: "One place to cap Vercel, OpenAI and Anthropic spend. Email at 80%, a stop action you tested in advance at 100%.",
    },
    problem: {
      title: "A runaway loop or an AI crawler can cost $4,000 overnight",
      points: [
        "Usage-based platforms send alerts, but most don't stop anything on their own.",
        "Each provider has its own dashboard, units and limits.",
        "By the time you read the alert in the morning, the bill is already there.",
      ],
    },
    features: [
      { title: "Three providers, one budget view", body: "Vercel billing charges, OpenAI organization costs and Anthropic cost reports, checked every hour." },
      { title: "Stop actions you can undo", body: "Pause a Vercel project, set an OpenAI project hard limit, or set Anthropic keys to inactive. Each one is reversible." },
      { title: "Test mode first", body: "Every stop starts in test mode: you see the exact requests it would send. Going live takes a typed confirmation." },
      { title: "Encrypted tokens", body: "Admin tokens are stored with AES-256-GCM and never shown again. We tell you the narrowest token each provider allows." },
    ],
    faq: [
      {
        q: "Which keys do you need?",
        a: "A Vercel team token, an OpenAI Admin key and an Anthropic Admin key. None of the three providers offers a read-only key for cost data, so the same key reads spend and runs the stop. Use a dedicated key you can revoke at any time.",
      },
      {
        q: "How fresh is the data?",
        a: "All three providers report cost per day. Budget Guard polls hourly, so today's figure is partial and may lag the provider by a few hours.",
      },
      { q: "Can I just get alerts?", a: "Yes. Leave the stop action off or in test mode and you only get emails." },
    ],
    socialProof: [],
  },

  og: { title: "Budget Guard", subtitle: "Hard spend caps for Vercel, OpenAI and Anthropic." },

  legal: {
    sellerName: "【要記入：氏名または法人名】",
    representative: "【要記入】",
    address: "【要記入：請求があった場合に遅滞なく開示します、の記載も可】",
    phone: "【要記入：請求があった場合に遅滞なく開示します、の記載も可】",
    email: "support@example.com",
    paymentTiming: "ご注文時にクレジットカードで決済され、以後、各更新日に自動で決済されます。",
    deliveryTiming: "決済完了後、直ちにご利用いただけます。",
    refundPolicy: "提供開始後の返金はお受けしておりません。ただし、当方の不具合でご利用いただけない場合は全額返金します。",
    cancellationPolicy: "ダッシュボード上部の「Manage billing」からいつでも解約できます。解約後も期間末日までご利用いただけ、日割りでの返金はありません。",
    effectiveDate: "2026-10-08",
  },
} satisfies ProductConfigInput;

export default product;

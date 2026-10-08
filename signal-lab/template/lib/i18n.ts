import { config } from "./config";

// Fixed UI strings only. Product copy lives in product.config.ts and is not translated.
const ja = {
  nav: { pricing: "料金", signIn: "ログイン", openApp: "アプリを開く" },
  footer: { tokushoho: "特定商取引法に基づく表記", privacy: "プライバシーポリシー", terms: "利用規約" },
  cta: { joinWaitlist: "待機リストに登録", buy: "購入する", preorder: "先行購入する", seePricing: "料金を見る", presaleBadge: "先行販売中" },
  sections: { features: "できること", faq: "よくある質問", voices: "利用者の声", pricing: "料金" },
  waitlist: {
    email: "メールアドレス",
    submit: "登録する",
    pending: "登録中…",
    done: "登録しました。公開時にメールでお知らせします。",
    invalid: "メールアドレスを確認してください。",
    limited: "しばらく時間をおいてから再度お試しください。",
  },
  price: { oneTime: "買い切り", month: "/月", year: "/年", popular: "おすすめ", taxIncl: "（税込）" },
  confirm: {
    title: "ご購入前の最終確認",
    price: "価格",
    paymentTiming: "支払時期",
    deliveryTiming: "提供時期",
    renewal: "自動更新",
    renewalYes: (interval: "month" | "year") => `あり（${interval === "month" ? "毎月" : "毎年"}自動で更新・決済されます）`,
    renewalNo: "なし（1回限りのお支払いです）",
    cancellation: "解約方法",
    cancellationOneTime: "1回限りのお支払いのため、解約の手続きはありません。",
    refund: "返金条件",
    agree: "購入ボタンを押すと、利用規約とプライバシーポリシーに同意したものとみなします。",
  },
  buy: { pending: "決済ページへ移動中…", error: "決済ページを開けませんでした。時間をおいて再度お試しください。", dev: "開発モード：Stripe を使わずにアクセスを付与します" },
  success: {
    title: "ご購入ありがとうございます",
    notPaid: "お支払いを確認できませんでした。決済が完了している場合は、しばらくしてからこのページを再読み込みしてください。",
    key: "ライセンスキー",
    keep: "このキーは別の端末でログインするときに使います。同じ内容をメールでもお送りしました。",
    open: "アプリを開く",
  },
  access: {
    title: "ログイン",
    licenseLabel: "ライセンスキー",
    redeem: "キーでログイン",
    invalidLicense: "ライセンスキーが見つからないか、無効になっています。",
    magicTitle: "メールでログイン",
    magicSend: "ログインリンクを送る",
    magicSent: "ご購入済みのメールアドレスであれば、ログインリンクを送信しました（15分間有効）。",
    tokenTitle: "ログインを続ける",
    tokenContinue: "このブラウザでログイン",
    invalidToken: "リンクの有効期限が切れているか、すでに使用されています。もう一度お試しください。",
    signOut: "ログアウト",
    billing: "お支払い管理",
  },
  mail: {
    licenseSubject: (name: string) => `${name} のライセンスキー`,
    licenseBody: (name: string, key: string, url: string) =>
      `${name} をご購入いただきありがとうございます。\n\nライセンスキー：${key}\n\n${url} でこのキーを入力するとログインできます。\nこのメールは大切に保管してください。`,
    magicSubject: (name: string) => `${name} へのログインリンク`,
    magicBody: (name: string, url: string) =>
      `${name} へのログインリンクです（15分間有効・1回限り）。\n\n${url}\n\nお心当たりがない場合は、このメールを破棄してください。`,
    waitlistSubject: (name: string) => `${name} の待機リストに登録しました`,
    waitlistBody: (name: string, url: string) => `${name} の待機リストにご登録いただきありがとうございます。\n公開したらこのアドレスにお知らせします。\n\n${url}`,
  },
};

type Dict = typeof ja;

const en: Dict = {
  nav: { pricing: "Pricing", signIn: "Sign in", openApp: "Open app" },
  footer: { tokushoho: "Legal notice (Japan)", privacy: "Privacy", terms: "Terms" },
  cta: { joinWaitlist: "Join the waitlist", buy: "Buy now", preorder: "Pre-order", seePricing: "See pricing", presaleBadge: "Pre-sale" },
  sections: { features: "Features", faq: "FAQ", voices: "What people say", pricing: "Pricing" },
  waitlist: {
    email: "Email",
    submit: "Join",
    pending: "Joining…",
    done: "You're on the list. We'll email you at launch.",
    invalid: "Please check your email address.",
    limited: "Too many attempts. Please try again later.",
  },
  price: { oneTime: "one-time", month: "/mo", year: "/yr", popular: "Popular", taxIncl: "" },
  confirm: {
    title: "Before you buy",
    price: "Price",
    paymentTiming: "When you pay",
    deliveryTiming: "When you get access",
    renewal: "Auto-renewal",
    renewalYes: (interval) => `Yes — renews and is charged every ${interval}`,
    renewalNo: "No — one-time payment",
    cancellation: "How to cancel",
    cancellationOneTime: "One-time payment; nothing to cancel.",
    refund: "Refunds",
    agree: "By purchasing you agree to the Terms and Privacy Policy.",
  },
  buy: { pending: "Opening checkout…", error: "Couldn't open checkout. Please try again.", dev: "Dev mode: grants access without Stripe" },
  success: {
    title: "Thanks for your purchase",
    notPaid: "We couldn't confirm your payment yet. If you were charged, reload this page in a moment.",
    key: "License key",
    keep: "Use this key to sign in on other devices. We've emailed it to you too.",
    open: "Open the app",
  },
  access: {
    title: "Sign in",
    licenseLabel: "License key",
    redeem: "Sign in with key",
    invalidLicense: "That license key wasn't found or is no longer active.",
    magicTitle: "Sign in by email",
    magicSend: "Email me a sign-in link",
    magicSent: "If that address has a purchase, a sign-in link is on its way (valid for 15 minutes).",
    tokenTitle: "Continue signing in",
    tokenContinue: "Sign in on this browser",
    invalidToken: "This link has expired or was already used. Please request a new one.",
    signOut: "Sign out",
    billing: "Manage billing",
  },
  mail: {
    licenseSubject: (name) => `Your ${name} license key`,
    licenseBody: (name, key, url) => `Thanks for buying ${name}.\n\nLicense key: ${key}\n\nSign in at ${url} with this key. Keep this email safe.`,
    magicSubject: (name) => `Sign in to ${name}`,
    magicBody: (name, url) => `Here's your sign-in link for ${name} (valid 15 minutes, single use):\n\n${url}\n\nIf you didn't request this, ignore this email.`,
    waitlistSubject: (name) => `You're on the ${name} waitlist`,
    waitlistBody: (name, url) => `Thanks for joining the ${name} waitlist. We'll email you when it launches.\n\n${url}`,
  },
};

export const dictionaries = { ja, en };
export const t: Dict = dictionaries[config.locale];

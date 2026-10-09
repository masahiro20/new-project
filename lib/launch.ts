import { isDemoMode } from "./payments/mode";

// Launch modes. LAUNCH_MODE=free runs the site without paid features: no checkout,
// no seller details, and AI generation only when an Anthropic key is configured.
// PAYMENTS_MODE (lib/payments/mode.ts) decides whether a purchase is demo or real.
// Read on the server only; static pages pick these up at build time.

export function isFreeLaunch(): boolean {
  return process.env.LAUNCH_MODE === "free";
}

/** The purchase flow is shown (demo or real). Off in free mode, whatever Stripe settings exist. */
export function salesEnabled(): boolean {
  return !isFreeLaunch();
}

/** Real money changes hands: purchase flow on and PAYMENTS_MODE resolves to stripe. */
export function liveBilling(): boolean {
  return salesEnabled() && !isDemoMode();
}

/** The demo purchase flow is shown (no real charges). */
export function demoPurchase(): boolean {
  return salesEnabled() && isDemoMode();
}

/** Static export (GitHub Pages): no server, so nothing may call /api/*. */
export function isStaticExport(): boolean {
  return process.env.STATIC_EXPORT === "1";
}

/** AI generation is possible (an Anthropic key is set and there is a server to call). */
export function aiEnabled(): boolean {
  return !isStaticExport() && Boolean(process.env.ANTHROPIC_API_KEY);
}

export const COMING_SOON = {
  paid: "有料版（3つの書類セットの一括作成）は準備中です。公開したら、このサイトでお知らせします。",
  ai: "AIによる書類作成は準備中です。公開したら、このサイトでお知らせします。",
} as const;

/** Operator details shown on the terms and privacy pages. Seller placeholders appear only with live billing. */
export function operator(): { name: string; contact: string; established: string; court: string } {
  return !liveBilling()
    ? {
        name: "減算ゼロ運営事務局",
        contact: "準備中",
        established: "2026年10月8日",
        court: "運営者の所在地を管轄する地方裁判所",
      }
    : {
        name: "【要記入：運営者の氏名または法人名】",
        contact: "【要記入：連絡先メールアドレス】",
        established: "【要記入：公開日】",
        court: "【要記入：裁判所名】",
      };
}

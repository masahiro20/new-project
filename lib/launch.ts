import { isDemoMode } from "./payments/mode";

// Launch modes. LAUNCH_MODE=free runs the site without paid features: no checkout,
// no seller details, and AI generation only when an Anthropic key is configured.
// PAYMENTS_MODE (lib/payments/mode.ts) decides whether a purchase is demo or real.
// Read on the server only; static pages pick these up at build time.

export function isFreeLaunch(): boolean {
  return process.env.LAUNCH_MODE === "free";
}

/**
 * Base URL of the separate paid/AI API (the Cloudflare Worker in worker/) for the static site.
 * This is the single switch that turns the purchase flow on for GitHub Pages.
 */
export function paidApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_PAID_API_URL?.trim().replace(/\/$/, "") || undefined;
}

/** Prefix for client-side fetches to the API: the Worker on the static site, same origin otherwise. */
export function apiBase(): string {
  return isStaticExport() ? (paidApiUrl() ?? "") : "";
}

/** The purchase flow is shown (demo or real). Off in free mode, and on the static site until the API is set. */
export function salesEnabled(): boolean {
  if (isFreeLaunch()) return false;
  return !isStaticExport() || Boolean(paidApiUrl());
}

/**
 * Demo or real payments. The server reads PAYMENTS_MODE/STRIPE_SECRET_KEY (lib/payments/mode.ts);
 * the static site has no keys, so it is told the Worker's mode via NEXT_PUBLIC_PAYMENTS_MODE.
 */
function paymentsAreDemo(): boolean {
  if (isStaticExport()) return (process.env.NEXT_PUBLIC_PAYMENTS_MODE ?? "demo").trim().toLowerCase() !== "stripe";
  return isDemoMode();
}

/** Real money changes hands: purchase flow on and payments are live (stripe). */
export function liveBilling(): boolean {
  return salesEnabled() && !paymentsAreDemo();
}

/** The demo purchase flow is shown (no real charges). */
export function demoPurchase(): boolean {
  return salesEnabled() && paymentsAreDemo();
}

/** Static export (GitHub Pages): no server, so nothing may call /api/*. */
export function isStaticExport(): boolean {
  return process.env.STATIC_EXPORT === "1";
}

/** Fixed mock output instead of Claude (tests only): AI_MOCK=1 and no Anthropic key. */
export function aiMock(): boolean {
  return process.env.AI_MOCK === "1" && !process.env.ANTHROPIC_API_KEY;
}

/** AI generation is possible: a key (or the test mock) on this server, or the Worker API for the static site. */
export function aiEnabled(): boolean {
  if (isStaticExport()) return Boolean(paidApiUrl());
  return Boolean(process.env.ANTHROPIC_API_KEY) || aiMock();
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

// Which payment provider is live. Pure (reads only the env object you pass) and
// import-free, so tests can load it directly. Ported from Budget Guard
// (peter/p2-signal-lab: signal-lab/budget-guard/docs/demo-payments.md).
//
//   PAYMENTS_MODE   STRIPE_SECRET_KEY   →  mode
//   (unset)         (unset)                demo
//   (unset)         set                    stripe
//   demo            any                    demo     (explicit; also in production)
//   stripe          set                    stripe
//   stripe          (unset)                error    (PaymentsConfigError)
//   anything else   any                    error
//
// Always set PAYMENTS_MODE explicitly in a deployment ("stripe" in production). The unset rows
// exist for local dev only: losing the Stripe key would otherwise silently turn purchases free
// (demo). The Worker (worker/src/index.ts) refuses every request while PAYMENTS_MODE is unset.

export type PaymentsMode = "demo" | "stripe";
type Env = Record<string, string | undefined>;

export class PaymentsConfigError extends Error {
  override name = "PaymentsConfigError";
}

/** The active mode. Throws PaymentsConfigError for an invalid or unsatisfiable PAYMENTS_MODE. */
export function getPaymentsMode(env: Env = process.env): PaymentsMode {
  const raw = env.PAYMENTS_MODE?.trim().toLowerCase() || undefined;
  const hasKey = !!env.STRIPE_SECRET_KEY?.trim();
  if (raw === undefined) return hasKey ? "stripe" : "demo";
  if (raw === "demo") return "demo";
  if (raw === "stripe") {
    if (!hasKey) throw new PaymentsConfigError("PAYMENTS_MODE=stripe but STRIPE_SECRET_KEY is not set. Set the key, or use PAYMENTS_MODE=demo.");
    return "stripe";
  }
  throw new PaymentsConfigError(`PAYMENTS_MODE must be "demo" or "stripe" (or unset), got "${env.PAYMENTS_MODE}".`);
}

/** Non-throwing: true only when the mode resolves to demo. A misconfigured env is never demo. */
export function isDemoMode(env: Env = process.env): boolean {
  try {
    return getPaymentsMode(env) === "demo";
  } catch {
    return false;
  }
}

export const DEMO_BANNER = "デモ：実際の請求はありません（Demo mode: no real charges）";

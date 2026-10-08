import type { PaymentsMode } from "./types";

// Which payment provider is live. Pure (reads only the env object you pass), no
// imports, so it is safe from anywhere: redis.ts, instrumentation.ts, tests.
//
//   PAYMENTS_MODE   STRIPE_SECRET_KEY   →  mode
//   (unset)         (unset)                demo
//   (unset)         set                    stripe
//   demo            any                    demo     (explicit; also in production)
//   stripe          set                    stripe
//   stripe          (unset)                error    (PaymentsConfigError)
//   anything else   any                    error
//
// So going live is: put the Stripe keys into env and leave PAYMENTS_MODE unset
// (or set it to "stripe"). No code changes.

type Env = Record<string, string | undefined>;

export const PAYMENTS_MODES = ["demo", "stripe"] as const satisfies readonly PaymentsMode[];

export class PaymentsConfigError extends Error {
  override name = "PaymentsConfigError";
}

const explicitMode = (env: Env) => env.PAYMENTS_MODE?.trim().toLowerCase() || undefined;

/** The active mode. Throws PaymentsConfigError for an invalid / unsatisfiable PAYMENTS_MODE. */
export function getPaymentsMode(env: Env = process.env): PaymentsMode {
  const raw = explicitMode(env);
  const hasKey = !!env.STRIPE_SECRET_KEY?.trim();
  if (raw === undefined) return hasKey ? "stripe" : "demo";
  if (raw === "demo") return "demo";
  if (raw === "stripe") {
    if (!hasKey) throw new PaymentsConfigError("PAYMENTS_MODE=stripe but STRIPE_SECRET_KEY is not set. Set the key, or use PAYMENTS_MODE=demo.");
    return "stripe";
  }
  throw new PaymentsConfigError(`PAYMENTS_MODE must be "demo" or "stripe" (or unset), got "${env.PAYMENTS_MODE}".`);
}

/** True only when PAYMENTS_MODE=demo is written out (not the auto fallback). */
export const isExplicitDemo = (env: Env = process.env) => explicitMode(env) === "demo";

/** Non-throwing: true only when the mode resolves to demo. A misconfigured env is never demo. */
export function isDemoMode(env: Env = process.env): boolean {
  try {
    return getPaymentsMode(env) === "demo";
  } catch {
    return false;
  }
}

/** The "no real charges" banner is shown exactly when demo mode is active. */
export const showDemoBanner = isDemoMode;

export const DEMO_BANNER = { ja: "デモ：実際の請求はありません", en: "Demo mode: no real charges" } as const;

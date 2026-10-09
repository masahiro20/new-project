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

// ---------- build-time mode (static pages) ----------
//
// Public pages are prerendered, so the banner is decided when `next build` runs, not
// per request. next.config.ts bakes the mode into BUDGET_GUARD_BUILD_PAYMENTS_MODE.
// The build only needs to know the MODE (Cloudflare secrets such as STRIPE_SECRET_KEY
// are not present at build time), so an explicit PAYMENTS_MODE wins; otherwise the
// presence of STRIPE_SECRET_KEY decides, exactly like getPaymentsMode().
//
// Safety net: if the runtime mode differs from the build (e.g. Stripe keys added to a
// demo build without rebuilding, which would leave a stale "no real charges" banner on
// a site that charges), assertBuildModeMatches() makes checkout fail closed until the
// site is rebuilt. See getPaymentProvider().

/** Mode to bake into a build. Throws on an invalid PAYMENTS_MODE (fails `next build`). */
export function resolveBuildPaymentsMode(env: Env = process.env): PaymentsMode {
  const raw = explicitMode(env);
  if (raw === "demo" || raw === "stripe") return raw;
  if (raw === undefined) return env.STRIPE_SECRET_KEY?.trim() ? "stripe" : "demo";
  throw new PaymentsConfigError(`PAYMENTS_MODE must be "demo" or "stripe" (or unset), got "${env.PAYMENTS_MODE}".`);
}

/** The mode this build was made for; undefined outside a Next build (vitest). */
export function builtPaymentsMode(): PaymentsMode | undefined {
  const v = process.env.BUDGET_GUARD_BUILD_PAYMENTS_MODE;
  return v === "demo" || v === "stripe" ? v : undefined;
}

/** Banner decision for prerendered pages: the build's mode (falls back to the env in tests). */
export function showDemoBannerAtBuild(env: Env = process.env, built: PaymentsMode | undefined = builtPaymentsMode()): boolean {
  return built ? built === "demo" : isDemoMode(env);
}

/** Throws PaymentsConfigError when the running mode differs from the one the pages were built for. */
export function assertBuildModeMatches(runtime: PaymentsMode, built: PaymentsMode | undefined = builtPaymentsMode()): void {
  if (built && built !== runtime) {
    throw new PaymentsConfigError(
      `This build was made for PAYMENTS_MODE=${built} but the server runs in ${runtime} mode. Rebuild and redeploy (the static pages' demo banner is decided at build time).`,
    );
  }
}

/** Demo checkout/portal may run: demo at runtime AND the pages were built for demo (banner present). */
export function demoCheckoutEnabled(env: Env = process.env, built: PaymentsMode | undefined = builtPaymentsMode()): boolean {
  return isDemoMode(env) && (built === undefined || built === "demo");
}

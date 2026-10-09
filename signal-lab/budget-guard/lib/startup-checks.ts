import { assertBuildModeMatches, getPaymentsMode } from "./payments/mode";
import { isDevEnv, secretProblems } from "./secrets";

type Env = Record<string, string | undefined>;

/**
 * Configuration checks run at server start (instrumentation.ts) and, on Cloudflare Workers, once per
 * isolate before the first request or cron run (cf-worker.ts). Throws on a setup that can't work or
 * isn't safe — the message names the variables and the reason, never a value:
 *   - PAYMENTS_MODE invalid (e.g. stripe without STRIPE_SECRET_KEY), or not written out in
 *     production (no silent fallback to demo: Atlas R2-06)
 *   - any server secret empty, too short, non-random, a placeholder or a published example value
 *     (lib/secrets.ts; production only)
 */
export function runStartupChecks(env: Env = process.env): { mode: "demo" | "stripe" } {
  const problems: string[] = [];
  let mode: "demo" | "stripe" = "demo";
  try {
    mode = getPaymentsMode(env); // throws PaymentsConfigError
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  if (!isDevEnv(env) && !env.PAYMENTS_MODE?.trim()) problems.push("PAYMENTS_MODE is not set: write out demo or stripe (no automatic choice in production)");
  problems.push(...secretProblems(env));
  if (problems.length) throw new Error(`Server configuration refused: ${problems.join("; ")}`);
  console.info(mode === "demo" ? "[payments] mode=demo — no real charges (デモ：実際の請求はありません)" : "[payments] mode=stripe");
  try {
    assertBuildModeMatches(mode);
  } catch (e) {
    // Not fatal for the whole site; checkout refuses to start until it is rebuilt.
    console.error(`[payments] ${e instanceof Error ? e.message : e}`);
  }
  return { mode };
}

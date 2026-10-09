// Runs once when a server instance starts. Fails fast on an invalid payments
// setup (e.g. PAYMENTS_MODE=stripe without STRIPE_SECRET_KEY) instead of
// letting the first checkout find out.
export async function register() {
  const { assertBuildModeMatches, getPaymentsMode } = await import("./lib/payments/mode");
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const mode = getPaymentsMode(process.env); // throws PaymentsConfigError
  console.info(mode === "demo" ? "[payments] mode=demo — no real charges (デモ：実際の請求はありません)" : "[payments] mode=stripe");
  try {
    assertBuildModeMatches(mode);
  } catch (e) {
    // Not fatal for the whole site; checkout refuses to start until it is rebuilt.
    console.error(`[payments] ${e instanceof Error ? e.message : e}`);
  }
}

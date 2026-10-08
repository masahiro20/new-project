// Runs once when a server instance starts. Fails fast on an invalid payments
// setup (e.g. PAYMENTS_MODE=stripe without STRIPE_SECRET_KEY) instead of
// letting the first checkout find out.
export async function register() {
  const { getPaymentsMode } = await import("./lib/payments/mode");
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const mode = getPaymentsMode(process.env); // throws PaymentsConfigError
  console.info(mode === "demo" ? "[payments] mode=demo — no real charges (デモ：実際の請求はありません)" : "[payments] mode=stripe");
}

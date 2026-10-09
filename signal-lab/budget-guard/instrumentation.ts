// Runs once when a server instance starts (Node / Vercel, and on Cloudflare Workers at isolate
// startup — cf-worker.ts imports the server early, see cf-prelude.ts). Fails fast on a setup that
// can't work, instead of letting the first checkout or sign-in find out:
//   - PAYMENTS_MODE=stripe without STRIPE_SECRET_KEY (or another invalid PAYMENTS_MODE)
//   - ACCESS_SECRET missing (outside development / test) or the published example value
//   - TOKEN_ENCRYPTION_KEY missing, malformed or the published example value
// A throw here makes Next.js answer every request with 500 (fail closed). The same checks also run
// on the first request that needs them (lib/startup-checks.ts), for runtimes where this hook can't.
export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { runStartupChecks } = await import("./lib/startup-checks");
  runStartupChecks(process.env);
}

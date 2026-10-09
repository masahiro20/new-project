export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Where this build is hosted, for the privacy policy (a static page, so decided at build
 * time): `npm run build:cf` sets BUDGET_GUARD_HOSTING=cloudflare; anything else is Vercel.
 */
export function hostingProvider(env: Record<string, string | undefined> = process.env): "Cloudflare" | "Vercel" {
  return env.BUDGET_GUARD_HOSTING?.toLowerCase() === "cloudflare" ? "Cloudflare" : "Vercel";
}

/** True while `next build` runs (prerendering), where missing runtime secrets are expected. */
export const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

const warned = new Set<string>();
/** console.warn once per process for a given key (dev fallback notices). */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const isProduction = () => process.env.NODE_ENV === "production";

/** True while `next build` runs (prerendering), where missing runtime secrets are expected. */
export const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

const warned = new Set<string>();
/** console.warn once per process for a given key (dev fallback notices). */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

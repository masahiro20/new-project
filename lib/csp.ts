import { paidApiUrl } from "./launch";

// Content-Security-Policy for the static site (GitHub Pages can't send headers, so it goes in a <meta>).
// The origin is shared with other products (/pitch, /kotomark, /calc), so even an injected script
// must not be able to send their data elsewhere: connect-src lists every host this site talks to.
// Next's static pages carry inline bootstrap scripts with no nonce, hence 'unsafe-inline' for scripts.
// frame-ancestors and report-uri are ignored in a meta tag (security review X-1, X-7).

/** Origin of a URL, or null if it isn't a valid http(s) URL. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function staticCsp(env: { goatcounter?: string; turnstile?: boolean; paidApi?: string } = {}): string {
  const goatcounter = env.goatcounter ? `https://${env.goatcounter}.goatcounter.com` : null;
  const api = originOf(env.paidApi);
  const turnstile = env.turnstile ? "https://challenges.cloudflare.com" : null;
  const list = (...xs: (string | null)[]) => xs.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src ${list("'self'", "'unsafe-inline'", goatcounter && "https://gc.zgo.at", turnstile)}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${list("'self'", "data:", "blob:", goatcounter)}`,
    "font-src 'self'",
    `connect-src ${list("'self'", goatcounter, api, turnstile)}`,
    `frame-src ${turnstile ?? "'none'"}`,
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/** The policy for this build, from the same env vars that switch the features on. */
export function siteCsp(): string {
  return staticCsp({
    goatcounter: process.env.NEXT_PUBLIC_GOATCOUNTER_CODE || undefined,
    turnstile: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    paidApi: paidApiUrl(),
  });
}

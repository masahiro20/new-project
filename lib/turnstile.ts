// Cloudflare Turnstile (bot check) for the free preview. Without TURNSTILE_SECRET_KEY the
// check is skipped only while no real AI is configured (local dev, AI_MOCK); once
// ANTHROPIC_API_KEY is set the free preview spends real money, so a missing secret fails closed.
// Use Cloudflare's always-pass test keys for local dev with a real Anthropic key.

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.ANTHROPIC_API_KEY) console.error("TURNSTILE_SECRET_KEY is not set; refusing the free preview");
    return !process.env.ANTHROPIC_API_KEY;
  }
  if (!token) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") form.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean; hostname?: string };
    if (data.success !== true) return false;
    // A token solved on another site that shares the sitekey (or a test hostname) is not ours.
    const expected = (process.env.TURNSTILE_EXPECTED_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return expected.length === 0 || (!!data.hostname && expected.includes(data.hostname));
  } catch (error) {
    console.error("turnstile verification failed", error);
    return false;
  }
}

import { z } from "zod";
import { CONSENT_REQUIRED_ERROR, newConsent } from "@/lib/consent";
import { forbiddenOrigin, sameOrigin } from "@/lib/api";
import { track } from "@/lib/analytics";
import { config, getPlan } from "@/lib/config";
import { getPaymentProvider, PaymentsConfigError } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

const schema = z.object({ plan: z.string().max(32), email: z.email().max(254).optional(), consent: z.literal(true).optional() });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  if (config.launch.mode === "waitlist") return Response.json({ error: "not on sale yet" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const plan = parsed.success ? getPlan(parsed.data.plan) : undefined;
  if (!parsed.success || !plan) return Response.json({ error: "invalid plan" }, { status: 400 });
  // Privacy Policy (incl. transfer abroad) + Terms: the checkbox next to the buy button.
  if (parsed.data.consent !== true) return Response.json({ error: CONSENT_REQUIRED_ERROR, consentRequired: true }, { status: 400 });

  const kv = getKV();
  if (!(await rateLimit(kv, `checkout:${clientIp(request.headers)}`, 10, 600))) {
    return Response.json({ error: "too many requests" }, { status: 429 });
  }
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (error) {
    if (!(error instanceof PaymentsConfigError)) throw error;
    console.error(`[checkout] payments misconfigured: ${error.message}`);
    return Response.json({ error: "payments misconfigured", detail: error.message }, { status: 503 });
  }
  try {
    const url = await provider.createCheckout(plan, { email: parsed.data.email, consent: newConsent("checkout") });
    await track(kv, "checkout_start");
    return Response.json({ url });
  } catch (error) {
    console.error("[checkout] failed", error);
    return Response.json({ error: "checkout unavailable" }, { status: 502 });
  }
}

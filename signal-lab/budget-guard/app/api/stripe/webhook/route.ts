import { after } from "next/server";
import { processStripeEvent } from "@/lib/payments/stripe-webhook";
import { getKV } from "@/lib/redis";
import { getStripe } from "@/lib/payments/stripe";
import { usableSecret } from "@/lib/secrets";

// Node runtime (no `runtime` export). The raw body is needed for signature verification.
export async function POST(request: Request) {
  const secret = usableSecret("STRIPE_WEBHOOK_SECRET"); // unset, or malformed in production → not configured
  if (!secret || !process.env.STRIPE_SECRET_KEY) return Response.json({ error: "webhook not configured" }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event;
  try {
    // Async variant: uses Web Crypto where Node crypto isn't available (Cloudflare Workers build of stripe).
    event = await getStripe().webhooks.constructEventAsync(body, signature, secret);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event, { kv: getKV(), after });
    return Response.json({ received: true, result });
  } catch (error) {
    console.error(`[webhook] ${event.type} ${event.id} failed`, error);
    return Response.json({ error: "handler failed" }, { status: 500 }); // Stripe retries
  }
}

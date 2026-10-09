import Stripe from "stripe";
import { PRODUCT_NAME } from "./purchase";
import { siteUrl } from "./site";

// A paid session may regenerate its set (e.g. after a network drop) for this long.
const SESSION_VALID_SECONDS = 7 * 24 * 60 * 60;

export function priceJpy(): number {
  const price = Number(process.env.PRICE_JPY ?? 2980);
  return Number.isInteger(price) && price > 0 ? price : 2980;
}

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  // Fetch-based client works on both Node (Vercel) and Cloudflare Workers.
  stripe ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return stripe;
}

export async function createCheckoutUrl(inputHash: string): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          unit_amount: priceJpy(),
          product_data: { name: PRODUCT_NAME },
        },
        quantity: 1,
      },
    ],
    metadata: { inputHash },
    success_url: `${siteUrl()}/generate?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/generate?canceled=1`,
    locale: "ja",
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

/** True when the session is paid, recent, and was bought for exactly this input. */
export async function isPaidFor(sessionId: string, inputHash: string): Promise<boolean> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const fresh = Date.now() / 1000 - session.created < SESSION_VALID_SECONDS;
  return session.payment_status === "paid" && fresh && session.metadata?.inputHash === inputHash;
}

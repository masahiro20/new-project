import { createCheckoutUrl, isPaidFor } from "../stripe";
import { createDemoCheckout, isDemoPaidFor, isDemoToken } from "./demo";
import { getPaymentsMode } from "./mode";

// The only place that picks a payment provider. Stripe mode refuses every demo_ id,
// so no free entitlement survives once billing is live.

export async function createCheckout(inputHash: string): Promise<string> {
  return getPaymentsMode() === "demo" ? createDemoCheckout(inputHash) : createCheckoutUrl(inputHash);
}

export async function isPaid(checkoutId: string, inputHash: string): Promise<boolean> {
  if (getPaymentsMode() === "demo") return isDemoToken(checkoutId) && isDemoPaidFor(checkoutId, inputHash);
  return !isDemoToken(checkoutId) && isPaidFor(checkoutId, inputHash);
}

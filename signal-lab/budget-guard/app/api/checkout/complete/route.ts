import { after } from "next/server";
import { badRequest, forbiddenOrigin, json, readJson, sameOrigin } from "@/lib/api";
import { getPlan } from "@/lib/config";
import { isActive } from "@/lib/entitlements";
import { fulfillCheckout, onNewEntitlement, providerForCheckout } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

/**
 * POST (JSON {session_id}) from the static /success page: confirm payment with the
 * provider (no need to wait for the webhook) and issue the entitlement (idempotent).
 * Returns the license key — the checkout id is the buyer's capability, as before.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const body = await readJson(request);
  if (!body) return badRequest();
  const kv = getKV();
  if (!(await rateLimit(kv, `complete:${clientIp(request.headers)}`, 30, 600))) return json({ error: "too many requests" }, 429);
  const id = String(body.session_id ?? "");
  const provider = providerForCheckout(id);
  const checkout = provider
    ? await provider.getCompletedCheckout(id).catch((e) => {
        console.error("[success] could not retrieve checkout", e);
        return null;
      })
    : null;
  if (!provider || !checkout || checkout.status === "refunded") return json({ paid: false }, 404);

  const { entitlement, created } = await fulfillCheckout(kv, checkout, provider.name);
  if (created) after(() => onNewEntitlement(kv, entitlement, provider));
  return json({
    paid: true,
    id: entitlement.id,
    demo: provider.name === "demo",
    planLabel: getPlan(entitlement.plan)?.label ?? entitlement.plan,
    active: isActive(entitlement),
    licenseKey: isActive(entitlement) ? entitlement.licenseKey : null,
  });
}

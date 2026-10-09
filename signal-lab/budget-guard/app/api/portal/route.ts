import { NextResponse, type NextRequest } from "next/server";
import { accountFrom, forbiddenOrigin, sameOrigin } from "@/lib/api";
import { providerForCheckout } from "@/lib/payments";
import { getKV } from "@/lib/redis";

/** POST (form from the /app bar): opens the billing portal to cancel / update the card. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const account = await accountFrom(request, getKV());
  if (!account) return NextResponse.redirect(new URL("/access", request.url), 303);
  const provider = providerForCheckout(account.entitlement.id);
  if (!provider) return Response.json({ error: "billing unavailable" }, { status: 503 });
  try {
    return NextResponse.redirect(new URL(await provider.createPortalUrl(account.entitlement), request.url), 303);
  } catch (error) {
    console.error("[portal] failed", error);
    return Response.json({ error: "billing unavailable" }, { status: 502 });
  }
}

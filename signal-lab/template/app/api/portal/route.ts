import { NextResponse, type NextRequest } from "next/server";
import { providerForCheckout } from "@/lib/payments";
import { getAccess } from "@/lib/session";

/** POST (form from /app): opens the billing portal to cancel / update the card. */
export async function POST(request: NextRequest) {
  const access = await getAccess();
  if (!access?.entitlement) return NextResponse.redirect(new URL("/access", request.url), 303);
  const provider = providerForCheckout(access.entitlement.id);
  if (!provider) return Response.json({ error: "billing unavailable" }, { status: 503 });
  try {
    return NextResponse.redirect(new URL(await provider.createPortalUrl(access.entitlement), request.url), 303);
  } catch (error) {
    console.error("[portal] failed", error);
    return Response.json({ error: "billing unavailable" }, { status: 502 });
  }
}

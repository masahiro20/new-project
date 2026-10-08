import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, config as product } from "@/lib/config";

// Optimistic check only: is there an access cookie at all? The signature and the
// entitlement are verified by requireAccess() in the /app layout, actions and routes.
export function proxy(request: NextRequest) {
  if (product.access.gate === "none" || request.cookies.has(ACCESS_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/access", request.url));
}

export const config = { matcher: ["/app", "/app/:path*"] };

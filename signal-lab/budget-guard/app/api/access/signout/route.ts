import { NextResponse } from "next/server";
import { forbiddenOrigin, sameOrigin } from "@/lib/api";
import { ACCESS_COOKIE } from "@/lib/access";

/** POST: clear the access cookie. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const res = NextResponse.json({ ok: true, redirect: "/" }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}

import { NextResponse } from "next/server";
import { forbiddenOrigin, readCookie, sameOrigin } from "@/lib/api";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access";
import { config } from "@/lib/config";
import { revokeSessions } from "@/lib/entitlements";
import { getKV } from "@/lib/redis";

/** POST: revoke this account's access cookies server side (all devices) and clear ours. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  const claims = await verifyAccessToken(readCookie(request, ACCESS_COOKIE));
  if (claims) await revokeSessions(getKV(), claims.sub, config.access.sessionDays);
  const res = NextResponse.json({ ok: true, redirect: "/" }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}

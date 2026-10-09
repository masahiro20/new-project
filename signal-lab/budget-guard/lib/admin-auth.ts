import { timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer $ADMIN_TOKEN` (constant-time). Callers answer 404 when false. */
export function adminAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

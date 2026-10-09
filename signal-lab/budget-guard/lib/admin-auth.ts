import { createHash, timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer $ADMIN_TOKEN` (constant-time). Callers answer 404 when false. */
export function adminAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected) return false;
  // Compare fixed-length digests: no length leak, and no throw on non-ASCII input (byte length ≠ string length).
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

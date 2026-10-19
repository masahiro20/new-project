// Optional shared password for in-house deployment. When ACCESS_PASSWORD is set,
// API routes require the header `x-access-key` to match. Leave it unset for
// local development or when the host (e.g. Vercel) already restricts access.

export function accessRequired(): boolean {
  return Boolean(process.env.ACCESS_PASSWORD);
}

/** The key may come as `x-access-key`, `Authorization: Bearer <key>`, or `?key=` (for connectors that only take a URL). */
export function accessKeyFrom(request: Request): string {
  const header = request.headers.get("x-access-key");
  if (header) return header;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get("key") ?? "";
}

export function hasAccess(request: Request): boolean {
  const expected = process.env.ACCESS_PASSWORD;
  if (!expected) return true;
  const given = accessKeyFrom(request);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function checkAccess(request: Request): Response | null {
  if (hasAccess(request)) return null;
  return Response.json({ error: "アクセスキーが違います。" }, { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

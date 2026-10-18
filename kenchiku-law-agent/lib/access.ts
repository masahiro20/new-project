// Optional shared password for in-house deployment. When ACCESS_PASSWORD is set,
// API routes require the header `x-access-key` to match. Leave it unset for
// local development or when the host (e.g. Vercel) already restricts access.

export function accessRequired(): boolean {
  return Boolean(process.env.ACCESS_PASSWORD);
}

export function checkAccess(request: Request): Response | null {
  const expected = process.env.ACCESS_PASSWORD;
  if (!expected) return null;
  const given = request.headers.get("x-access-key") ?? "";
  if (given.length === expected.length && timingSafeEqual(given, expected)) return null;
  return Response.json({ error: "アクセスキーが違います。" }, { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

import { after } from "next/server";
import { z } from "zod";
import { badRequest, forbiddenOrigin, json, readJson, sameOrigin } from "@/lib/api";
import { requestMagicLink } from "@/lib/access";
import { config } from "@/lib/config";
import { t } from "@/lib/i18n";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getKV } from "@/lib/redis";

const emailSchema = z.email().max(254);

/** POST (JSON {email}): email a sign-in link. Same answer for known and unknown addresses. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbiddenOrigin();
  if (!config.access.magicLink) return badRequest(t.access.invalidToken);
  const body = await readJson(request);
  const parsed = emailSchema.safeParse(String(body?.email ?? "").trim().toLowerCase());
  if (!parsed.success) return badRequest(t.waitlist.invalid);
  const kv = getKV();
  if (!(await rateLimit(kv, `magic:${clientIp(request.headers)}`, 5, 600))) return json({ error: t.access.limited }, 429);
  // Lookup + send happen after the response, so known and unknown emails look identical.
  after(() => requestMagicLink(kv, parsed.data).then(() => undefined, (e) => console.error("[access] magic link failed", e)));
  return json({ ok: true, message: t.access.magicSent });
}

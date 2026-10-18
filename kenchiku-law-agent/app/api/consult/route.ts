import { consultStream } from "@/lib/agent";
import { planSchema } from "@/lib/plan";
import { allow, clientIp } from "@/lib/ratelimit";
import { checkAccess } from "@/lib/access";

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;

  const limit = Number(process.env.CONSULT_RATE_LIMIT ?? 20);
  if (!allow(`consult:${clientIp(request)}`, limit, 60 * 60 * 1000)) {
    return Response.json({ error: `利用が集中しています。1時間あたり${limit}回までです。` }, { status: 429 });
  }
  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  return new Response(consultStream(parsed.data), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

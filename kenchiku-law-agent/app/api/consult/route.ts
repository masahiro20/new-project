import { consultStream } from "@/lib/agent";
import { planSchema } from "@/lib/plan";
import { allow, clientIp } from "@/lib/ratelimit";
import { checkAccess } from "@/lib/access";
import { uploadSchema } from "@/lib/documents";

export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = checkAccess(request);
  if (denied) return denied;

  const limit = Number(process.env.CONSULT_RATE_LIMIT ?? 20);
  if (!allow(`consult:${clientIp(request)}`, limit, 60 * 60 * 1000)) {
    return Response.json({ error: `利用が集中しています。1時間あたり${limit}回までです。` }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const docs = uploadSchema.safeParse(body?.documents ?? []);
  if (!docs.success) {
    return Response.json({ error: docs.error.issues[0]?.message ?? "添付資料を確認してください（PDF・JPEG・PNG、合計約3MBまで）。" }, { status: 400 });
  }
  return new Response(consultStream(parsed.data, docs.data), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

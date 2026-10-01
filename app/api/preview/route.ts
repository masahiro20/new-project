import { streamDocuments } from "@/lib/claude";
import { facilitySchema } from "@/lib/form";
import { allow, clientIp } from "@/lib/ratelimit";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!allow(`preview:${clientIp(request)}`, 3, 60 * 60 * 1000)) {
    return Response.json({ error: "無料お試しは1時間に3回までです。" }, { status: 429 });
  }
  const parsed = facilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  return new Response(streamDocuments("preview", parsed.data), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

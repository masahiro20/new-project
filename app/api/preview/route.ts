import { z } from "zod";
import { streamDocuments } from "@/lib/claude";
import { facilitySchema } from "@/lib/form";
import { aiEnabled, COMING_SOON } from "@/lib/launch";
import { allow, clientIp, ipKey } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";

export const maxDuration = 300;

const bodySchema = z.object({
  input: facilitySchema,
  turnstileToken: z.string().max(4096).optional(),
});

export async function POST(request: Request) {
  if (!aiEnabled()) {
    return Response.json({ error: COMING_SOON.ai }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  if (!(await verifyTurnstile(parsed.data.turnstileToken, clientIp(request)))) {
    return Response.json({ error: "ロボットでないことの確認ができませんでした。もう一度お試しください。" }, { status: 403 });
  }
  if (!(await allow(`preview:${ipKey(request)}`, 3, 60 * 60 * 1000))) {
    return Response.json({ error: "無料お試しは1時間に3回までです。" }, { status: 429 });
  }
  return new Response(streamDocuments("preview", parsed.data.input), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

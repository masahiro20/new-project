import { z } from "zod";
import { streamDocuments } from "@/lib/claude";
import { facilitySchema } from "@/lib/form";
import { hashInput } from "@/lib/hash";
import { aiEnabled, COMING_SOON, salesEnabled } from "@/lib/launch";
import { PARTS } from "@/lib/parts";
import { REGENERATE_PER_DAY } from "@/lib/purchase";
import { allow } from "@/lib/ratelimit";
import { isPaidFor, paymentDisabled } from "@/lib/stripe";

export const maxDuration = 300;

const bodySchema = z.object({
  sessionId: z.string().max(200),
  part: z.enum(PARTS),
  input: facilitySchema,
});

export async function POST(request: Request) {
  if (!salesEnabled()) {
    return Response.json({ error: COMING_SOON.paid }, { status: 503 });
  }
  if (!aiEnabled()) {
    return Response.json({ error: COMING_SOON.ai }, { status: 503 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力内容を確認してください。" }, { status: 400 });
  }
  const { sessionId, part, input } = parsed.data;

  if (!paymentDisabled()) {
    const paid = await isPaidFor(sessionId, hashInput(input)).catch((error) => {
      console.error("payment check failed", error);
      return false;
    });
    if (!paid) {
      return Response.json(
        { error: "お支払いを確認できませんでした。購入時と同じ入力内容でお試しください。" },
        { status: 402 },
      );
    }
  }

  // A paid session may regenerate for 7 days; cap it so one payment can't run up unbounded API cost.
  if (!(await allow(`generate:${sessionId}:${part}`, REGENERATE_PER_DAY, 24 * 60 * 60 * 1000))) {
    return Response.json({ error: "再作成の上限に達しました。時間をおいて再度お試しください。" }, { status: 429 });
  }

  return new Response(streamDocuments(part, input), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
